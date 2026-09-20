import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base='http://localhost:3001';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext();
  const requests:string[]=[];
  context.on('request',request=>requests.push(request.url()));
  const page=await context.newPage();
  await page.goto(base);
  const card=page.locator('#content-card-c-vimeo-30485533').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{
    const image=document.querySelector('#content-card-c-vimeo-30485533 img') as HTMLImageElement;
    return image?.complete && image.naturalWidth>0;
  });
  assert.ok((await card.locator('img').first().getAttribute('src'))?.startsWith('/api/content/course-cover/'));
  assert.ok(requests.some(url=>url.startsWith('https://i.vimeocdn.com/')));
  await page.screenshot({path:'.admin-preview/vimeo-covers-browser.png'});
  const failed=await context.newPage();
  await failed.route('**/api/content/course-cover/*',route=>route.fulfill({status:502,body:''}));
  await failed.goto(base);
  const failedCard=failed.locator('#content-card-c-vimeo-30485533').first();
  await failed.waitForFunction(()=>{
    const card=document.querySelector('#content-card-c-vimeo-30485533');
    if (!card) return false;
    card.scrollIntoView();
    return card.textContent?.includes('Capa indisponível');
  });
  await failedCard.getByText('Capa indisponível',{exact:true}).waitFor();
  assert.equal(requests.filter(url=>url.includes('unsplash')).length,0);
  console.log('OK: capa oficial visível no navegador, nenhuma requisição ao Unsplash e falha mostra somente aviso neutro.');
} finally {await browser.close();}
