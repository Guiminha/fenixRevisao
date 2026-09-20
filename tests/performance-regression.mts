import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { chromium } from 'playwright';

const base = 'http://localhost:3001';
const before = JSON.parse(await fs.readFile('.admin-preview/performance-before.json', 'utf8')).publicData;
const full = await (await fetch(base + '/api/content/public')).json();
assert.deepEqual(full, before, 'A API completa deve preservar todos os conteúdos.');
const home = await (await fetch(base + '/api/content/public?scope=home')).json();
const { paginaBiografia, paginaElite, paginaTecnologias, ...expectedHome } = full;
assert.deepEqual(home, expectedHome);
for (const [slug, expected] of Object.entries({ biografia: paginaBiografia, elite: paginaElite, tecnologias: paginaTecnologias })) {
  const response = await fetch(`${base}/api/content/page/${slug}`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).blocos, expected);
}
assert.equal((await fetch(base + '/api/content/page/__proto__')).status, 404);
const bannerUrl = home.banners[0].imagem || home.banners[0].imagemDesktop;
assert.ok(bannerUrl.startsWith('/api/storage/preview/'));
const original = Buffer.from(await (await fetch(base + bannerUrl)).arrayBuffer());
const variant = await fetch(base + bannerUrl + '?w=640&format=webp');
const variantBuffer = Buffer.from(await variant.arrayBuffer());
assert.equal(variant.status, 200);
assert.ok(variantBuffer.length < original.length);
assert.ok((await sharp(variantBuffer).metadata()).width! <= 640);
const download = await fetch(base + bannerUrl + '?w=640&format=webp&download=1');
assert.match(download.headers.get('content-disposition') || '', /attachment/);
assert.deepEqual(Buffer.from(await download.arrayBuffer()), original);
assert.equal((await fetch(base + '/api/content/restricted')).status, 401);
assert.equal((await fetch(base + '/api/storage/preview/suporte-anexos/teste.png?w=640&format=webp')).status, 404);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const errors: string[] = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => {
    const image = document.querySelector('#hero-carousel-container img') as HTMLImageElement;
    return image?.complete && image.naturalWidth > 0;
  });
  assert.ok(await page.locator('#hero-carousel-container img').count() <= 2);
  for (let i = 0; i < home.banners.length; i++) {
    await page.locator(`#hero-carousel-dot-${i}`).click();
    await page.waitForFunction(() => {
      const image = document.querySelector('#hero-carousel-container .opacity-100 img') as HTMLImageElement;
      return image?.complete && image.naturalWidth > 0;
    });
  }
  await page.screenshot({ path: '.admin-preview/performance-mobile.png' });
  for (const path of ['/grupo-fenix', '/tecnologias', '/elite-milionaria']) {
    const loaded = page.waitForResponse(response => response.url().includes('/api/content/page/') && response.status() === 200);
    await page.goto(base + path);
    await loaded;
    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      return !!main?.querySelector('img') && !main.querySelector('[role="status"]');
    });
    assert.equal(await page.getByText('Não foi possível carregar esta página.').count(), 0);
  }
  // Falha temporária tem recuperação visível, sem substituir o conteúdo do banco.
  let fail = true;
  await page.route('**/api/content/page/tecnologias', route => fail ? route.fulfill({ status: 503, json: {} }) : route.continue());
  await page.goto(base + '/tecnologias');
  await page.getByText('Não foi possível carregar esta página.').waitFor();
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.waitForFunction(() => !!document.querySelector('main img') && !document.querySelector('main [role="status"]'));
  assert.deepEqual(errors, []);
  console.log('OK: conteúdo integral idêntico, páginas sob demanda, imagens menores, downloads originais, acesso protegido, carrossel no celular e recuperação de falha.');
} finally { await browser.close(); }
