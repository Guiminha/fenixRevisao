import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';

process.env.FENIX_AUTOSTART = '0';
process.env.NODE_ENV = 'test';
process.env.SUPABASE_ONLY = '1';
process.env.SUPABASE_URL = 'https://supabase.invalid';
process.env.SUPABASE_ANON_KEY = 'synthetic-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service';
process.env.JWT_SECRET = 'synthetic-public-material-secret-12345678';
process.env.PUBLIC_BASE_DOMAIN = '';
process.env.TRUST_PROXY = '0';

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: RequestInit) => {
  const url = new URL(String(input));
  assert.equal(url.hostname, 'supabase.invalid');
  if (url.pathname === '/storage/v1/object/armazenamento/materiais/publico.pdf') {
    return new Response(init?.method === 'HEAD' ? null : 'PDF!', { headers: { 'Content-Length': '4' } });
  }
  throw new Error(`Unexpected request: ${url.pathname}`);
};

const { dbService } = await import('../src/server/db.ts');
const db = dbService as any;
db.getMaterialById = async (id: string) => id === 'material-publico'
  ? { id, titulo: 'Folder público', fileUrl: '/api/storage/stream/materiais/publico.pdf' }
  : null;
const { app } = await import('../server.ts');
app.use(express.static('dist'));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const port = (server.address() as any).port;
const browser = await chromium.launch({ channel: 'msedge', headless: true });

try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await context.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/content/download/material-publico') return route.continue();
    if (pathname === '/api/auth/me') return route.fulfill({ json: { loggedIn: false } });
    if (pathname === '/api/content/public') return route.fulfill({ json: {
      leaderBio: {}, novidades: [], cursos: [], banners: [], tecnologias: [],
      categoriasMateriais: ['Folders', 'Manuais'],
      materiais: [{ id: 'material-publico', titulo: 'Folder público', tipo: 'pdf', categoria: 'Folders',
        thumbnail: '', fileUrl: '/api/storage/stream/materiais/publico.pdf', downloads: 0, isPublic: true }]
    } });
    return route.fulfill({ json: {} });
  });

  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByText('Materiais de Apoio', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Materiais de Apoio' }).waitFor();
  await page.getByText('Folder público', { exact: true }).waitFor();
  assert.equal(await page.locator('#conteudos-auth-guard').count(), 0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download-btn-material-material-publico').click()
  ]);
  assert.equal(download.suggestedFilename(), 'Folder público.pdf');
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  assert.equal(Buffer.concat(chunks).toString(), 'PDF!');
  assert.deepEqual(pageErrors, []);
  console.log('OK: visitante visualiza Materiais de Apoio e baixa arquivo cadastrado sem login.');
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
  globalThis.fetch = originalFetch;
}
