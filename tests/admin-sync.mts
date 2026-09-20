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
const incoming = existing.map(row => ({ codcli: row.codigo, nomtit: row.nome, sitpen: row.situacao }));
incoming[1250].sitpen = 'P';
incoming.push({ codcli: '99999', nomtit: 'Novo D.I.', sitpen: 'I' });
const events: any[] = [];
const configs = new Map<string, any>();
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
    const offset = Number(url.searchParams.get('offset') || 0);
    // Simula um limite menor que o solicitado: ainda deve percorrer até o fim.
    return response(existing.slice().sort((a,b) => a.codigo.localeCompare(b.codigo)).slice(offset,offset+200));
  }
  if (url.pathname === '/rest/v1/fenix_metric_events') { events.push(...JSON.parse(String(init?.body))); return response(null); }
  if (url.pathname === '/rest/v1/config') {
    const row = JSON.parse(String(init?.body)); configs.set(row.key, row.value); return response(null);
  }
  if (url.pathname.startsWith('/storage/v1/object/list/')) return response([]);
  if (url.pathname.startsWith('/storage/v1/object/')) return response({ Key: 'synthetic' });
  throw new Error(`Unexpected path ${url.pathname}`);
};
(https as any).request = (opts: any, callback: any) => {
  assert.equal(opts.hostname, 'nipponflex.invalid');
  const request: any = new EventEmitter();
  request.write = () => {};
  request.end = () => queueMicrotask(() => {
    const stream: any = new EventEmitter(); stream.statusCode = 200; callback(stream);
    stream.emit('data', JSON.stringify(opts.path.includes('get-token') ? { content: { token: 'synthetic-token' } } : { dadoscadastrais: incoming }));
    stream.emit('end');
  });
  return request;
};
try {
  const nf = await import('../src/server/nipponflexService.ts');
  const first = await nf.executarSincronizacao();
  assert.equal(first.success, true);
  assert.equal(first.relatorio?.novosDetalhes.length, 1);
  assert.equal(first.relatorio?.situacoesAlteradas.length, 1);
  assert.equal(first.relatorio?.situacoesAlteradas[0].codigo, '11250');
  const previousIds = new Set(nf.getNfLogs().map(log => log.id));
  const second = await nf.executarSincronizacao();
  assert.equal(second.success, true);
  assert.equal(second.relatorio?.novosDetalhes.length, 0);
  assert.equal(second.relatorio?.situacoesAlteradas.length, 0);
  assert.ok(nf.getNfLogs().every(log => log.id && !previousIds.has(log.id)));
  assert.deepEqual(configs.get('nipponflexLogs'), nf.getNfLogs());
  assert.deepEqual(events.map(event => event.kind).sort(), ['di_new','di_status']);
  assert.equal(existing.length, 1506);
  console.log('OK: duas sincronizações, paginação completa, somente diferenças, logs substituídos e histórico sem duplicação.');
} finally { globalThis.fetch = originalFetch; https.request = originalRequest; }
