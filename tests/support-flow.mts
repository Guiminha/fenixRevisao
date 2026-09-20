import assert from 'node:assert/strict';
import express from 'express';
import { testDatabase } from './support-records.mjs';
import { chromium } from 'playwright';
process.env.FENIX_AUTOSTART = '0';
process.env.NODE_ENV = 'test';
process.env.SUPABASE_ONLY = '1';
process.env.SUPABASE_URL = 'https://supabase.invalid';
process.env.SUPABASE_ANON_KEY = 'synthetic-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service';
process.env.JWT_SECRET = 'synthetic-support-flow-test-secret-12345678';
process.env.TRUST_PROXY = '0';
const { pg, action } = await testDatabase();
const originalFetch = globalThis.fetch;
const staffId = '11111111-1111-4111-8111-111111111111';
const staff = { id: staffId, email: 'support@example.test', app_metadata: {}, user_metadata: {}, updated_at: '2026-09-01T00:00:00Z', aud: 'authenticated' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let failNextCreate = false;
globalThis.fetch = async (input: any, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === '127.0.0.1') return originalFetch(input, init);
  assert.equal(url.hostname, 'supabase.invalid', 'Unexpected external request');
  if (url.pathname === '/rest/v1/fenix_metric_events') return json(null);
  if (url.pathname === '/rest/v1/rpc/fenix_support_action') {
    const { p_action, p_data } = JSON.parse(String(init?.body));
    if (failNextCreate && p_action === 'create') { failNextCreate = false; return json({ code: 'P0001', message: 'synthetic outage' }, 400); }
    try { return json(await action(p_action, p_data)); }
    catch (error: any) { return json({ code: error.code, message: error.message }, 400); }
  }
  if (url.pathname === '/auth/v1/token') return json({ user: staff, access_token: 'fake', refresh_token: 'fake', token_type: 'bearer', expires_in: 3600 });
  if (url.pathname === `/auth/v1/admin/users/${staffId}`) return json(staff);
  if (url.pathname === '/rest/v1/config' && url.searchParams.get('key') === 'eq.supportUsers')
    return json({ value: [{ email: staff.email, nome: 'Atendente', ativo: true, mustChangePassword: false }] });
  throw new Error(`Unmocked endpoint ${url.pathname}`);
};
const { dbService } = await import('../src/server/db.ts');
const db = dbService as any;
db.isSupabaseReady = async () => true;
db.validateDICode = async (code: string) => ({ valid: ['1234','5678'].includes(code), name: `Membro ${code}`, role: 'user', userCode: code });
db.addAuditLog = async () => {};
db.recordAuditLog = async () => {};
db.getCategoriasMateriais = async () => [];
db.getOuvidoriaMessages = async () => [];
db.getData = async () => ({
  leaderBio: {}, novidades: [], materiais: [], banners: [], tecnologias: [], categoriasMateriais: [],
  cursos: [{ id: 'test-course', titulo: 'Curso Teste Suporte', descricao: 'Curso de testes', categoria: 'Teste', nivel: 'Iniciante',
    imagem: '', duracao: '10 min', createdAt: '2026-09-19T00:00:00Z', secao: 'cursos',
    modulos: [{ id: 'module', titulo: 'Módulo de Teste', aulas: [
      { id: 'lesson1', titulo: 'Aula 1', videoUrl: '', duracao: '5 min' }, { id: 'lesson2', titulo: 'Aula 2', videoUrl: '', duracao: '5 min' }
    ] }] }]
});
const { app } = await import('../server.ts');
app.use(express.static(process.env.FENIX_TEST_DIST || 'dist'));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const api = async (route: string, body?: unknown, cookie?: string) => originalFetch(base + route, {
  method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body)
});
try {
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('#nav-escola-fenix').first().click();
  await page.locator('#login-code-input').fill('1234');
  await page.locator('#login-submit-btn').click();
  await page.getByText('Curso Teste Suporte', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Falar com o suporte' }).click();
  await page.getByLabel('Assunto', { exact: true }).fill('Cancelar teste');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: 'Falar com o suporte' }).click();
  assert.equal(await page.getByLabel('Assunto', { exact: true }).inputValue(), '');
  await page.getByLabel('Assunto', { exact: true }).fill('Ajuda pelo curso');
  await page.getByLabel('Mensagem', { exact: true }).fill('Mensagem enviada pelo modal de teste.');
  failNextCreate = true;
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Mensagem', { exact: true }).inputValue(), 'Mensagem enviada pelo modal de teste.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByRole('status').filter({ hasText: 'enviado ao suporte' }).waitFor();
  const created = (await action('list')).filter((t: any) => t.assunto === 'Ajuda pelo curso');
  assert.equal(created.length, 1);
  assert.equal(created[0].criadoPor, '1234');
  const staffLogin = await api('/api/auth/login', { email: staff.email, password: 'Synthetic123!' });
  assert.equal(staffLogin.status, 200);
  const staffCookie = staffLogin.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const inbox = await api('/api/support/tickets', undefined, staffCookie);
  assert.equal(inbox.status, 200);
  assert.ok((await inbox.json()).tickets.some((t: any) => t.id === created[0].id));
  const reply = await api(`/api/support/tickets/${created[0].id}/mensagens`, { texto: 'Resposta do suporte' }, staffCookie);
  assert.equal(reply.status, 200);
  const otherLogin = await api('/api/auth/login', { code: '5678' });
  const otherCookie = otherLogin.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  assert.equal((await api(`/api/support/tickets/${created[0].id}`, undefined, otherCookie)).status, 403);
  assert.deepEqual(errors, []);
  console.log('PASS browser/API: cancel, validation, error preserves text, send once, protocol, support inbox/reply, other D.I. denied, no page errors.');
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  globalThis.fetch = originalFetch; await pg.close();
}
