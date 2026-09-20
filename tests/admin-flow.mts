import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { chromium } from 'playwright';
import { metricsDatabase } from './admin-metrics.mjs';
process.env.FENIX_AUTOSTART = '0'; process.env.NODE_ENV = 'test'; process.env.SUPABASE_ONLY = '1';
process.env.SUPABASE_URL = 'https://supabase.invalid'; process.env.SUPABASE_ANON_KEY = 'synthetic-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service'; process.env.JWT_SECRET = 'synthetic-admin-metrics-secret-12345678';
process.env.NIPPONFLEX_BASE_URL = 'https://nipponflex.invalid'; process.env.TRUST_PROXY = '0';
process.env.PUBLIC_BASE_DOMAIN = ''; process.env.ADMIN_HOSTS = 'adminfenix.localhost'; process.env.ADMIN_HOST_PREFIX = 'adminfenix.';
const pg = await metricsDatabase();
const originalFetch = globalThis.fetch;
const admin = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.test', app_metadata: { role: 'admin' }, user_metadata: {}, updated_at: '2026-09-19T00:00:00Z', aud: 'authenticated' };
const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type':'application/json' } });
let failMetrics = false;
globalThis.fetch = async (input: any, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return originalFetch(input, init);
  if (url.hostname === 'api.vimeo.com') return json({}, 503);
  if (url.hostname === 'nipponflex.invalid') return new Response(null, { status: 200 });
  assert.equal(url.hostname, 'supabase.invalid');
  if (url.pathname === '/rest/v1/fenix_metric_events') {
    if (failMetrics) return json({ message: 'synthetic failure' }, 503);
    for (const row of JSON.parse(String(init?.body))) await pg.query('INSERT INTO fenix_metric_events(id,kind,actor,entity_id,detail) VALUES($1,$2,$3,$4,$5)', [row.id,row.kind,row.actor || null,row.entity_id || null,JSON.stringify(row.detail || {})]);
    return json(null);
  }
  if (url.pathname === '/rest/v1/rpc/fenix_metrics_report') {
    const { p_days } = JSON.parse(String(init?.body));
    return json((await pg.query<{ report: unknown }>('SELECT fenix_metrics_report($1) AS report',[p_days])).rows[0].report);
  }
  if (url.pathname === '/auth/v1/token') return json({ user:admin,access_token:'fake',refresh_token:'fake',token_type:'bearer',expires_in:3600 });
  if (url.pathname === `/auth/v1/admin/users/${admin.id}`) return json(admin);
  if (url.pathname === '/rest/v1/dis_fenix') return json([{ codigo:'1234' }]);
  if (url.pathname === '/storage/v1/bucket/armazenamento') return json({ id:'armazenamento' });
  if (url.pathname === '/storage/v1/object/armazenamento/materiais/test.pdf') return new Response(init?.method === 'HEAD' ? null : 'test', { headers:{ 'Content-Length':'4' } });
  throw new Error(`Unexpected external request: ${url.pathname}`);
};
const { dbService } = await import('../src/server/db.ts');
const db = dbService as any;
db.isSupabaseReady = async () => true;
db.validateDICode = async (code: string) => ({ valid: code === '1234', name:'Pessoa um',role:'user',userCode:code });
db.recordAuditLog = async () => {};
db.getVimeoConfig = async () => ({ accessToken:'synthetic' });
db.getCursos = async () => [{ id:'course-1',titulo:'Curso real',secao:'cursos' },{ id:'training-1',titulo:'Treinamento real',secao:'treinamentos' }];
db.getMaterialById = async (id: string) => id === 'missing' ? null : { id,titulo:'Material real',fileUrl:'/api/storage/stream/materiais/test.pdf' };
const { app } = await import('../server.ts');
app.use(express.static('.admin-preview'));
const server = app.listen(0,'127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;
const api = (route: string, cookie = '', body?: unknown, adminHost = false): Promise<Response> => new Promise((resolve,reject) => {
  const request = http.request(base+route, { method: body === undefined ? 'GET' : 'POST', headers:{ 'Content-Type':'application/json', Cookie:cookie, ...(adminHost ? { Host:`adminfenix.localhost:${port}` } : {}) } }, response => {
    const chunks: Buffer[]=[]; response.on('data',chunk=>chunks.push(chunk)); response.on('end',()=>{
      const headers=new Headers(); for(let i=0;i<response.rawHeaders.length;i+=2) headers.append(response.rawHeaders[i],response.rawHeaders[i+1]);
      resolve(new Response(response.statusCode===204 ? null : Buffer.concat(chunks),{ status:response.statusCode,headers }));
    });
  }); request.on('error',reject); request.end(body === undefined ? undefined : JSON.stringify(body));
});
const cookies = (response: Response) => response.headers.getSetCookie().map(row => row.split(';')[0]).join('; ');
let browser: any;
try {
  assert.equal((await api('/api/admin/metrics','',undefined,true)).status,401);
  const login = await api('/api/auth/login','',{ code:'1234' }); assert.equal(login.status,200); const diCookie = cookies(login);
  assert.equal((await api('/api/content/course-access/course-1',diCookie,{})).status,204);
  assert.equal((await api('/api/content/course-access/training-1',diCookie,{})).status,204);
  assert.equal((await api('/api/content/course-access/missing',diCookie,{})).status,404);
  assert.equal((await api('/api/content/download/missing',diCookie,{})).status,404);
  const download = await api('/api/content/download/material-1',diCookie,{}); assert.equal(download.status,200); await download.text();
  const adminLogin = await api('/api/auth/login','',{ email:admin.email,password:'Synthetic123!' },true); assert.equal(adminLogin.status,200); const adminCookie = cookies(adminLogin);
  assert.equal((await api('/api/content/course-access/course-1',adminCookie,{},true)).status,204);
  assert.equal((await api('/api/admin/metrics',diCookie,undefined,true)).status,403);
  assert.equal((await api('/api/content/client-error','',{code:'JAVASCRIPT_ERROR',area:'Site'})).status,401);
  assert.equal((await api('/api/content/client-error',diCookie,{code:'arbitrary',area:'Site'})).status,400);
  assert.equal((await api('/api/content/client-error',diCookie,{code:'JAVASCRIPT_ERROR',area:'Site'})).status,204);
  const invalidPeriod = await api('/api/admin/metrics?days=999',adminCookie,undefined,true);
  assert.equal(invalidPeriod.status,400,await invalidPeriod.text());
  for (const route of ['backup/list','backup/restore','support/backup']) assert.equal((await api(`/api/admin/${route}`,adminCookie,route.endsWith('list') ? undefined : {},true)).status,404);
  const healthResponse = await api('/api/admin/integrations/status',adminCookie,undefined,true);
  assert.equal(healthResponse.status,200); const health = await healthResponse.json();
  assert.equal(health.services.length,4); assert.equal(health.services.find((s:any) => s.name==='Vimeo').online,false);
  let report: any;
  for (let i=0;i<10;i++) { report = await (await api('/api/admin/metrics',adminCookie,undefined,true)).json(); if (report.totals.error) break; await new Promise(r=>setTimeout(r,30)); }
  assert.equal(report.totals.login,1); assert.equal(report.totals.course,1); assert.equal(report.totals.training,1); assert.equal(report.totals.download,1);
  assert.ok(report.errors.some((e:any)=>e.detail.source==='Vimeo'));
  failMetrics=true;
  assert.equal((await api('/api/content/course-access/course-1',diCookie,{})).status,204);
  report = await (await api('/api/admin/metrics',adminCookie,undefined,true)).json();
  assert.ok(report.collection.failedWrites>0); assert.equal(report.totals.course,1); failMetrics=false;
  browser=await chromium.launch({ channel:'msedge',headless:true });
  const context=await browser.newContext(); const page=await context.newPage(); const pageErrors:string[]=[];
  page.on('pageerror',(e:any)=>pageErrors.push(e.message));
  const emptyContent={ cursos:[],materiais:[],banners:[],novidades:[],tecnologias:[],fenixPosts:[],categoriasMateriais:[],leaderBio:{} };
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if (!['adminfenix.localhost','127.0.0.1'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let result:any={ success:true,diCodes:[],links:[],posts:[] };
    if (url.pathname==='/api/auth/me') result={ loggedIn:true,user:{ role:'admin',name:'Administrador',code:admin.id } };
    else if (url.pathname==='/api/auth/login') result={ success:true,user:{ role:'admin',name:'Administrador',code:admin.id } };
    else if (url.pathname.startsWith('/api/content/')) result=emptyContent;
    else if (url.pathname==='/api/admin/metrics') result=report;
    else if (url.pathname==='/api/admin/integrations/status') result=health;
    return route.fulfill({ contentType:'application/json',body:JSON.stringify(result) });
  });
  await page.goto(`http://adminfenix.localhost:${port}`);
  await page.locator('#admin-email').fill(admin.email);
  await page.locator('#admin-password').fill('Synthetic123!');
  await page.getByRole('button',{ name:'Entrar no Painel' }).click();
  await page.getByRole('heading',{ name:'Acessos de D.I.s',exact:true }).waitFor().catch(async error => {
    console.log('Browser diagnostics:', pageErrors, (await page.locator('body').innerText()).slice(0,2500));
    throw error;
  });
  assert.equal(await page.getByText('Backup & Restauração',{ exact:true }).count(),0);
  assert.equal(await page.getByText('Registro de Auditoria',{ exact:true }).count(),0);
  await page.getByRole('heading',{ name:'Erros do sistema' }).waitFor();
  await page.getByText('Curso real',{ exact:true }).waitFor();
  const [file]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{ name:'Exportar resumo CSV' }).click()]); assert.equal(file.suggestedFilename(),'resumo.csv');
  await page.getByText('Servidores Externos',{ exact:true }).first().click();
  await page.getByText('Falha na verificação',{ exact:true }).waitFor();
  assert.equal(await page.getByRole('button',{ name:'Verificando…' }).count(),0);
  await page.screenshot({ path:'.admin-preview/servidores-test.png',fullPage:true });
  await page.getByText('Visão Geral',{ exact:true }).first().click();
  await page.getByRole('heading',{ name:'Acessos de D.I.s',exact:true }).waitFor();
  await page.screenshot({ path:'.admin-preview/visao-geral-test.png',fullPage:true });
  assert.deepEqual(pageErrors,[]);
  console.log('OK: API autorizada, login real, cursos/treinamentos, download concluído, falhas excluídas, backup removido, integrações, falha de coleta sinalizada, painel e CSV no navegador.');
} finally {
  if(browser) await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
  globalThis.fetch=originalFetch; await pg.close();
}
