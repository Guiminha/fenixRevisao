import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
process.env.SUPABASE_URL = 'https://supabase.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service';
process.env.SUPABASE_ANON_KEY = 'synthetic-anon';
process.env.SUPABASE_ONLY = '1';
process.env.NIPPONFLEX_BASE_URL = 'https://nipponflex.invalid';
const originalFetch = globalThis.fetch;
const originalRequest = https.request;
const existing = Array.from({ length: 1505 }, (_, i) => ({ codigo: String(10000+i), nome: `Pessoa ${i}`, situacao: 'A' }));
existing[5].situacao = 'I'; // migração dos registros legados, sem apagar o histórico
let incoming: any = { dadoscadastrais: [
  { codcli: '11250', nomtit: 'Pessoa 1250', sitpen: 'P', cliema: 'nao-salvar@example.test' },
  { codcli: '99999', nomtit: 'Novo ativo', sitpen: 'A' },
  { codcli: '88888', nomtit: 'Novo inativo', sitpen: 'I' },
  { codcli: '10000', nomtit: 'Nome atualizado', sitpen: 'A' },
] };
let apiStatus = 200;
const requests: string[] = [];
const files = new Map<string, string>();
const events: any[] = [];
const configs = new Map<string, any>([['nipponflexEstado', { ultimaSincronizacao: '2026-10-01T05:51:09Z', status: 'erro' }]]);
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input: any, init?: RequestInit) => {
  const url = new URL(String(input));
  assert.equal(url.hostname, 'supabase.invalid');
  if (url.pathname === '/rest/v1/dis_fenix') {
    if (init?.method === 'POST') {
      for (const row of JSON.parse(String(init.body))) {
        const index = existing.findIndex(item => item.codigo === row.codigo);
        if (index >= 0) existing[index] = row; else existing.push(row);
      }
      return response(null);
    }
    if (init?.method === 'DELETE') {
      const codes = (url.searchParams.get('codigo') || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',');
      for (let i=existing.length-1;i>=0;i--) if (codes.includes(existing[i].codigo)) existing.splice(i,1);
      return response(null);
    }
    const offset = Number(url.searchParams.get('offset') || 0);
    return response(existing.slice().sort((a,b) => a.codigo.localeCompare(b.codigo)).slice(offset,offset+200));
  }
  if (url.pathname === '/rest/v1/fenix_metric_events') { events.push(...JSON.parse(String(init?.body))); return response(null); }
  if (url.pathname === '/rest/v1/config') {
    if (init?.method === 'POST') {
      const row = JSON.parse(String(init.body)); configs.set(row.key, structuredClone(row.value)); return response(null);
    }
    const key = (url.searchParams.get('key') || '').replace(/^eq\./,'');
    return response(configs.has(key) ? { value: configs.get(key) } : null);
  }
  if (url.pathname.startsWith('/storage/v1/object/list/')) return response([]);
  if (url.pathname.startsWith('/storage/v1/object/')) { files.set(url.pathname, String(Buffer.from(init?.body as any))); return response({ Key: 'synthetic' }); }
  throw new Error(`Unexpected path ${url.pathname}`);
};
(https as any).request = (opts: any, callback: any) => {
  assert.equal(opts.hostname, 'nipponflex.invalid');
  const request: any = new EventEmitter();
  request.write = () => {};
  request.end = () => queueMicrotask(() => {
    const stream: any = new EventEmitter();
    const token = opts.path.includes('get-token');
    if (!token) requests.push(opts.path);
    stream.statusCode = token ? 200 : apiStatus; callback(stream);
    stream.emit('data', JSON.stringify(token ? { content: { token: 'synthetic-token' } } : incoming));
    stream.emit('end');
  });
  return request;
};
try {
  const nf = await import('../src/server/nipponflexService.ts');
  assert.equal(nf.dataBaseIncremental('2026-10-01T02:00:00Z'), '29-09-2026', 'Data de Brasília e margem de um dia');
  const historico = nf.normalizarUltimosNfLogs([
    { ts: '01:00:00', nivel: 'info', msg: 'Iniciando sincronização com a API Nipponflex (2026-09-30)...' },
    { ts: '23:59:58', nivel: 'info', msg: 'Iniciando sincronização com a API Nipponflex (2026-10-01)...' },
    { ts: '00:00:02', nivel: 'erro', msg: 'Falha após a meia-noite' },
  ]);
  assert.equal(historico.length, 2);
  assert.equal(historico[1].ts, '02/10/2026 00:00:02');
  await nf.carregarEstadoInicial();
  const first = await nf.executarSincronizacao();
  assert.equal(first.success, true);
  assert.ok(requests[0].includes('datbas=30-09-2026'));
  assert.equal(first.relatorio?.novosDetalhes.length, 1);
  assert.equal(first.relatorio?.situacoesAlteradas[0].codigo, '11250');
  assert.equal(first.relatorio?.removidos, 2);
  assert.ok(existing.every(e=>e.situacao==='A'));
  assert.equal(existing.find(e=>e.codigo==='10000')?.nome, 'Nome atualizado');
  assert.equal(existing.length, 1504);
  const saved = [...files.entries()];
  assert.ok(saved.some(([k,v])=>k.includes('/backups/') && JSON.parse(v).length===1505));
  assert.ok(saved.every(([k,v])=>!k.includes('/brutos/') && !v.includes('nao-salvar@example.test')));
  const previousIds = new Set(nf.getNfLogs().map(log => log.id));
  incoming = { dadoscadastrais: [] };
  const empty = await nf.executarSincronizacao();
  assert.equal(empty.success, true);
  assert.equal(existing.length, 1504, 'Resposta incremental vazia preserva todos os ativos');
  assert.ok(nf.getNfLogs().every(log => log.id && !previousIds.has(log.id)));
  incoming = { dadoscadastrais: [{ codcli: '11250', nomtit: 'Reativado', sitpen: 'A' }] };
  const reactivated = await nf.executarSincronizacao();
  assert.equal(reactivated.success, true);
  assert.equal(reactivated.relatorio?.novosDetalhes[0].codigo, '11250');
  assert.equal(existing.length, 1505);
  const checkpointBefore = configs.get('nipponflexCheckpoint');
  const databaseBefore = structuredClone(existing);
  incoming = { dadoscadastrais: [{ codcli: '11250', nomtit: 'Falha', sitpen: 'Z' }] };
  assert.equal((await nf.executarSincronizacao()).success, false);
  assert.deepEqual(existing, databaseBefore);
  assert.deepEqual(configs.get('nipponflexCheckpoint'), checkpointBefore);
  apiStatus = 403;
  const callsBefore = requests.length;
  assert.equal((await nf.executarSincronizacao()).success, false);
  assert.equal(requests.length, callsBefore+1, '403 não deve repetir consultas');
  assert.deepEqual(configs.get('nipponflexCheckpoint'), checkpointBefore);
  assert.deepEqual(configs.get('nipponflexLogs'), nf.getNfLogs());
  console.log('PASS: incremental, Brasília, backup, ativos, inativação, reativação, nome, resposta vazia, falha sem avançar referência e somente últimos logs.');
} finally { globalThis.fetch = originalFetch; https.request = originalRequest; }
