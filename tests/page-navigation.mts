import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = 'http://localhost:3001';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const routes = [
    ['grupo-fenix', '/grupo-fenix'], ['tecnologias', '/tecnologias'],
    ['elite-milionario', '/elite-milionaria'], ['fenix-social', '/fenix-social'],
  ];
  await page.goto(base);
  await page.locator('#nav-inicio').waitFor();
  for (const [view, path] of routes) {
    await page.locator(`#nav-${view}`).click();
    await page.waitForURL(base + path);
    await page.waitForFunction(id => document.getElementById(`nav-${id}`)?.className.includes('bg-[#d12a62]/10'), view);
    await page.reload();
    await page.locator(`#nav-${view}`).waitFor();
    await page.waitForFunction(id => document.getElementById(`nav-${id}`)?.className.includes('bg-[#d12a62]/10'), view);
  }
  await page.locator('#nav-grupo-fenix').click();
  await page.locator('#nav-tecnologias').click();
  await page.goBack();
  await page.waitForURL(base + '/grupo-fenix');
  await page.waitForFunction(() => document.getElementById('nav-grupo-fenix')?.className.includes('bg-[#d12a62]/10'));
  await page.goForward();
  await page.waitForURL(base + '/tecnologias');
  await page.waitForFunction(() => document.getElementById('nav-tecnologias')?.className.includes('bg-[#d12a62]/10'));
  for (const path of ['/escola-fenix', '/materiais', '/suporte']) {
    const response = await page.goto(base + path);
    assert.equal(response?.status(), 200);
    if (path === '/suporte') await page.getByRole('button', { name: 'Entrar com código D.I.' }).click();
    await page.locator('#login-dialog-container').waitFor();
    assert.equal(new URL(page.url()).pathname, path);
    await page.reload();
    if (path === '/suporte') await page.getByRole('button', { name: 'Entrar com código D.I.' }).click();
    await page.locator('#login-dialog-container').waitFor();
  }
  await page.goto(base + '/?view=conteudos&material=teste-link');
  await page.locator('#login-dialog-container').waitFor();
  assert.equal(new URL(page.url()).pathname, '/materiais');
  assert.equal(new URL(page.url()).searchParams.get('material'), 'teste-link');
  // Simulação isolada de sessão: nenhum login ou registro real é criado.
  const member = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await member.route('**/api/auth/me', route => route.fulfill({ json: { loggedIn: true, user: { role: 'user', name: 'Teste de navegação', code: '999999' } } }));
  await member.route('**/api/content/restricted', route => route.fulfill({ json: { cursos: [], materiais: [] } }));
  const loggedPage = await member.newPage();
  loggedPage.on('pageerror', error => errors.push(error.message));
  await loggedPage.goto(base + '/escola-fenix');
  await loggedPage.locator('#nav-escola-fenix').waitFor();
  assert.equal(await loggedPage.locator('#login-dialog-container').count(), 0);
  await loggedPage.locator('#nav-conteudos').click();
  await loggedPage.waitForURL(base + '/materiais');
  await loggedPage.reload();
  await loggedPage.locator('#nav-conteudos').waitFor();
  assert.equal(await loggedPage.locator('#login-dialog-container').count(), 0);
  for (const host of ['adminfenix.localhost', 'suporte.localhost']) {
    await page.goto(`http://${host}:3001/`);
    await page.locator('input[type="password"]').first().waitFor();
    assert.equal(await page.locator('#nav-inicio').count(), 0);
  }
  const protectedResponse = await context.request.get(base + '/api/content/restricted');
  assert.equal(protectedResponse.status(), 401);
  assert.deepEqual(errors, []);
  console.log('OK: menus, links diretos, atualização, voltar/avançar, links antigos, páginas protegidas, sessão simulada e subdomínios. Nenhum erro JavaScript.');
} finally {
  await browser.close();
}
