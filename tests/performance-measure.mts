import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const label = process.argv[2] || 'after';
if (!['before', 'after'].includes(label)) throw new Error('Etapa inválida.');
const base = 'http://localhost:3001';
const publicResponse = await fetch(base + '/api/content/public');
const publicData = await publicResponse.json();
await fetch(base + '/api/content/public?scope=home');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const runs: any[] = [];
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const requests = new Map<string, any>();
    cdp.on('Network.responseReceived', event => requests.set(event.requestId, {
      url: event.response.url, type: event.type, status: event.response.status, bytes: 0,
    }));
    cdp.on('Network.loadingFinished', event => {
      const request = requests.get(event.requestId);
      if (request) request.bytes = event.encodedDataLength;
    });
    await page.addInitScript(() => {
      (window as any).lastLcp = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) (window as any).lastLcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const image = document.querySelector('#hero-carousel-container img') as HTMLImageElement;
      return image?.complete && image.naturalWidth > 0;
    });
    // Janela fixa de seis segundos desde a navegação, antes da troca do banner (7 s).
    await page.waitForFunction(() => performance.now() >= 6000);
    const entries = [...requests.values()];
    const timing = await page.evaluate(() => ({
      lcpMs: Math.round((window as any).lastLcp),
      fcpMs: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
      publicMs: Math.round((performance.getEntriesByType('resource') as PerformanceResourceTiming[]).find(r => r.name.includes('/api/content/public'))?.duration || 0),
    }));
    runs.push({ ...timing, requests: entries.length,
      transferredBytes: entries.reduce((sum, r) => sum + r.bytes, 0),
      bannerCount: entries.filter(r => r.url.includes('/preview/banners')).length,
      bannerBytes: entries.filter(r => r.url.includes('/preview/banners')).reduce((sum, r) => sum + r.bytes, 0),
      entries,
    });
    if (run === 0) await page.screenshot({ path: `.admin-preview/performance-${label}.png` });
    await context.close();
  }
} finally { await browser.close(); }
await fs.mkdir('.admin-preview', { recursive: true });
await fs.writeFile(`.admin-preview/performance-${label}.json`, JSON.stringify({ publicData, runs }, null, 2));
console.log(JSON.stringify(runs.map(({ entries, ...r }) => r), null, 2));
