import { getSupabaseTrustedClient, dbService } from './db.js';
import { getNfEstado } from './nipponflexService.js';
import { reportSystemError } from './metricsService.js';

class ConnectionFailure extends Error {
  constructor(public code: string, message: string) { super(message); }
}
function requireResponse(response: Response) {
  if (response.ok) return;
  if ([401,403].includes(response.status)) throw new ConnectionFailure('AUTH_DENIED', 'O serviço recusou a autenticação. Verifique as credenciais e permissões.');
  if (response.status === 404) throw new ConnectionFailure('NOT_FOUND', 'O recurso configurado não foi encontrado no serviço.');
  throw new ConnectionFailure(`HTTP_${response.status}`, `O serviço respondeu com erro HTTP ${response.status}.`);
}

async function bounded<T>(operation: Promise<T>, milliseconds = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ConnectionFailure('TIMEOUT', 'O serviço não respondeu dentro do prazo máximo de 8 segundos.')), milliseconds);
    })]);
  } finally { clearTimeout(timer!); }
}
async function check(name: string, operation: () => Promise<string>) {
  const start = Date.now();
  try {
    const message = await bounded(operation());
    return { name, online: true, message, latencyMs: Date.now() - start, lastCheckedAt: new Date().toISOString() };
  } catch (error: any) {
    const tlsError = /CERT|ISSUER|SELF_SIGNED/.test(String(error?.cause?.code || error?.code || ''));
    const code = error instanceof ConnectionFailure ? error.code : tlsError ? 'TLS_INVALID' : 'CONNECTION_FAILED';
    const message = error instanceof ConnectionFailure ? error.message : tlsError
      ? 'Não foi possível validar o certificado HTTPS do serviço. A verificação segura da conexão falhou.'
      : 'Não foi possível confirmar a conexão em até 8 segundos. Verifique a rede e as credenciais.';
    reportSystemError(name, code, message);
    return { name, online: false, message, latencyMs: Date.now() - start, lastCheckedAt: new Date().toISOString() };
  }
}
let pending: Promise<unknown> | null = null;
export function integrationStatus() {
  // Uma verificação compartilhada evita disparos simultâneos por várias abas.
  if (pending) return pending;
  pending = Promise.all([
    check('Supabase — banco de dados', async () => {
      const client = getSupabaseTrustedClient();
      if (!client) throw new Error('unavailable');
      const { error } = await client.from('dis_fenix').select('codigo').limit(1).abortSignal(AbortSignal.timeout(7500));
      if (error) throw error;
      return 'Conectado. Consulta autenticada ao banco concluída.';
    }),
    check('Supabase — armazenamento', async () => {
      const base = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!base || !key) throw new ConnectionFailure('NOT_CONFIGURED', 'A conexão não está configurada no servidor.');
      const result = await fetch(`${base.replace(/\/$/, '')}/storage/v1/bucket/armazenamento`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(7500),
      });
      requireResponse(result);
      await result.body?.cancel();
      return 'Conectado. Bucket armazenamento acessível ao servidor.';
    }),
    check('Vimeo', async () => {
      const config = await bounded(dbService.getVimeoConfig(), 2500);
      if (!config.accessToken) throw new ConnectionFailure('NOT_CONFIGURED', 'O token de acesso do Vimeo não está configurado.');
      const response = await fetch('https://api.vimeo.com/me', {
        headers: { Authorization: `Bearer ${config.accessToken.trim()}` }, signal: AbortSignal.timeout(5000),
      });
      requireResponse(response);
      await response.body?.cancel();
      return 'Conectado. API autenticada do Vimeo respondeu. A reprodução depende também das permissões de cada vídeo.';
    }),
    check('Nipponflex — disponibilidade', async () => {
      const base = process.env.NIPPONFLEX_BASE_URL;
      if (!base) throw new ConnectionFailure('NOT_CONFIGURED', 'O endereço da API Nipponflex não está configurado.');
      const response = await fetch(base, { method: 'HEAD', signal: AbortSignal.timeout(7500), redirect: 'error' });
      if (response.status >= 500) requireResponse(response);
      await response.body?.cancel();
      return `Servidor respondeu (HTTP ${response.status}). Esta consulta verifica a disponibilidade; autenticação e atualização são verificadas na sincronização.`;
    }),
  ]).then(services => ({ services, synchronization: getNfEstado(), checkedAt: new Date().toISOString() }))
    .finally(() => { pending = null; });
  return pending;
}
