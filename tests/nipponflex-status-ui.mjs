import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Somente respostas sintéticas no navegador: nenhuma chamada de API chega ao servidor.
const base = process.env.FENIX_TEST_URL || 'http://adminfenix.localhost:3000';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let mode = 'running';
  let syncCalls = 0;
  let statusCalls = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const reply = json => route.fulfill({ json });
    if (url.pathname === '/api/admin/nipponflex/sync') {
      syncCalls++;
      return route.abort();
    }
    if (url.pathname === '/api/auth/me') return reply({ loggedIn: true, user: { role: 'admin', name: 'Teste' } });
    if (url.pathname === '/api/auth/login') return reply({ success: true, user: { role: 'admin', name: 'Teste' } });
    if (url.pathname === '/api/content/restricted') return reply({ cursos: [], materiais: [] });
    if (url.pathname === '/api/content/public') return reply({ cursos: [], materiais: [], novidades: [], banners: [], tecnologias: [], categoriasMateriais: [] });
    if (url.pathname === '/api/admin/nipponflex/status') {
      statusCalls++;
      if (mode === 'failure') return route.fulfill({ status: 503, json: { error: 'Falha simulada de conexão.' } });
      if (mode === 'hung') return; // O cliente precisa abortar a consulta após 15 segundos.
      return reply({ success: true, estado: {
        status: mode === 'running' ? 'em_andamento' : 'ok',
        ultimaSincronizacao: mode === 'running' ? null : '2026-09-25T02:54:21Z',
        relatorioVersao: 2, novosDetalhes: [], situacoesAlteradas: [],
      }, metricas: { total: 2687, porSituacao: { A: 647 } }, logs: [{ ts: '23:54:21', nivel: 'info', msg: 'Resposta simulada' }] });
    }
    if (url.pathname === '/api/admin/nipponflex/dados') return reply({ success: true, itens: [], total: 0, totalPaginas: 0 });
    return reply({ success: true, situacoes: ['A'] });
  });
  await page.goto(base);
  await page.locator('input[type="email"]').fill('teste@example.test');
  await page.locator('input[type="password"]').fill('senha-simulada');
  await page.locator('button[type="submit"]').click();
  await page.getByRole('button', { name: 'D.I.s Cadastrados', exact: true }).click();
  await page.getByRole('button', { name: 'Sincronizando...', exact: true }).waitFor();
  assert.equal(await page.locator('.nf-sync-spin').count(), 3);
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    const spin = page.locator('.nf-sync-spin').first();
    const before = await spin.evaluate(e => ({ transform: getComputedStyle(e).transform, iterations: getComputedStyle(e).animationIterationCount }));
    await page.waitForTimeout(200);
    const after = await spin.evaluate(e => getComputedStyle(e).transform);
    assert.equal(before.iterations, 'infinite');
    assert.notEqual(before.transform, after, `Setas devem girar com ${reducedMotion}`);
  }
  mode = 'failure';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('alert').filter({ hasText: 'Falha simulada' }).waitFor();
  assert.equal(await page.getByText('Ao vivo', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Aguardando confirmação do status' }).isDisabled(), true);
  mode = 'done';
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByText('Base 100% em dia', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'SINCRONIZAR DADOS', exact: true }).isEnabled(), true);
  assert.equal(await page.locator('.nf-sync-spin').count(), 0);
  mode = 'hung';
  const callsBefore = statusCalls;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('alert').filter({ hasText: '15 segundos' }).waitFor({ timeout: 19000 });
  assert.equal(statusCalls, callsBefore + 1, 'Não deve acumular consultas enquanto uma está pendente');
  mode = 'done';
  // A recuperação acontece pelo polling, sem recarregar a página.
  await page.getByRole('button', { name: 'SINCRONIZAR DADOS', exact: true }).waitFor({ timeout: 7000 });
  assert.equal(syncCalls, 0, 'Nenhuma sincronização deve ser disparada');
  assert.deepEqual(errors, []);
  console.log('OK: setas nos dois modos, erro visível, recuperação, conclusão e timeout sem consultas sobrepostas. Zero sincronizações.');
} finally {
  await browser.close();
}
