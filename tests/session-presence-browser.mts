import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { chromium } from 'playwright';
import { compressedAssets } from '../src/server/assetCompression.ts';

process.env.FENIX_AUTOSTART = '0';
process.env.NODE_ENV = 'production';
process.env.SUPABASE_ONLY = '1';
process.env.SUPABASE_URL = 'https://supabase.invalid';
process.env.SUPABASE_ANON_KEY = 'synthetic-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service';
process.env.JWT_SECRET = 'synthetic-presence-browser-secret-12345678';
process.env.TRUST_PROXY = '0';
process.env.PUBLIC_BASE_DOMAIN = '';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === '127.0.0.1') return originalFetch(input, init);
  assert.equal(url.hostname, 'supabase.invalid');
  return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
};
const { dbService } = await import('../src/server/db.ts');
const db = dbService as any;
db.isSupabaseReady = async () => true;
db.validateDICode = async (code: string) => ({ valid: code === '1234', name: 'Teste', role: 'user', userCode: code });
db.recordAuditLog = async () => {};
db.getData = async () => ({ cursos: [], materiais: [], banners: [], novidades: [], tecnologias: [], categoriasMateriais: [], leaderBio: {}, hiddenHomeCardIds: [] });
const { app } = await import('../server.ts');
app.use('/assets', compressedAssets(path.resolve('dist/assets')));
app.use(express.static('dist'));
app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext();
  const errors: string[] = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const login = () => context.request.post(base + '/api/auth/login', { data: { code: '1234' } });
  // APIRequestContext does not send Secure cookies over loopback HTTP, whereas
  // Chromium treats loopback as trustworthy. Inspect server state explicitly.
  const me = async () => {
    const cookie = (await context.cookies()).map(c => `${c.name}=${c.value}`).join('; ');
    return (await originalFetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).json();
  };
  const first = await login();
  assert.equal(first.status(), 200);
  for (const cookie of first.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie')) {
    assert.match(cookie.value, /HttpOnly/);
    assert.match(cookie.value, /Secure/);
    assert.match(cookie.value, /SameSite=Strict/);
    assert.doesNotMatch(cookie.value, /Max-Age|Expires/i, 'Cookies last only for the browser session');
  }
  const page = await context.newPage();
  const presence = page.waitForResponse(r => r.url().endsWith('/api/auth/presence') && r.status() === 204);
  const home = await page.goto(base);
  assert.match(home!.headers()['content-security-policy'], /script-src 'self'/);
  await presence;
  await page.locator('#nav-inicio').waitFor();
  const nextPresence = page.waitForResponse(r => r.url().endsWith('/api/auth/presence') && r.status() === 204);
  await page.reload();
  await nextPresence;
  assert.equal((await me()).loggedIn, true);
  const second = await context.newPage();
  const secondPresence = second.waitForResponse(r => r.url().endsWith('/api/auth/presence') && r.status() === 204);
  await second.goto(base);
  await secondPresence;
  // Navigating away emits the same pagehide event used when closing a tab.
  await page.goto('about:blank');
  await new Promise(resolve => setTimeout(resolve, 16_000));
  assert.equal((await me()).loggedIn, true, 'The second tab stays logged in');
  await second.goto('about:blank');
  await new Promise(resolve => setTimeout(resolve, 16_000));
  assert.equal((await me()).loggedIn, false, 'Last document departure ends the session');
  assert.equal((await login()).status(), 200, 'D.I. can log in again after closing');
  const blocked = await context.request.post(base + '/api/auth/presence', { data: { tabId: crypto.randomUUID() }, headers: { Origin: 'https://other.invalid' } });
  assert.equal(blocked.status(), 403);
  const visitor = await browser.newContext();
  await visitor.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const publicPage = await visitor.newPage();
  publicPage.on('pageerror', error => errors.push(error.message));
  for (const route of ['/', '/grupo-fenix', '/tecnologias', '/elite-milionaria', '/fenix-social', '/escola-fenix', '/materiais', '/suporte']) {
    assert.equal((await publicPage.goto(base + route))?.status(), 200);
    await publicPage.locator('#nav-inicio').waitFor();
    assert.equal(new URL(publicPage.url()).pathname, route);
  }
  await visitor.close();
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS browser/production: Secure session cookies, CSP, presence, reload, multiple tabs, close expiry, re-login, cross-origin rejection, eight public routes, no page errors');
} finally {
  await browser.close();
  globalThis.fetch = originalFetch;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
