import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { compressedAssets } from '../src/server/assetCompression.ts';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fenix-assets-test-'));
const original = 'console.log("arquivo de teste");'.repeat(1000);
await fs.writeFile(path.join(root, 'test.js'), original);
const readFile = fs.readFile;
let reads = 0;
fs.readFile = ((...args: any[]) => { reads++; return (readFile as any)(...args); }) as typeof fs.readFile;
const app = express();
app.use('/assets', compressedAssets(root), express.static(root));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/assets`;
try {
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => fetch(`${base}/test.js?v=${i}`, { headers: { 'Accept-Encoding': 'gzip' } })));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    assert.match(response.headers.get('vary') || '', /Accept-Encoding/);
    assert.equal(await response.text(), original);
  }
  assert.equal(reads, 1, 'Concurrent requests and query variants share one read/compression');
  for (const name of ['a/test.js', 'b/test.js', '%2fa%2ftest.js', 'a%5ctest.js', '.hidden.js', 'missing.js']) {
    assert.equal((await fetch(`${base}/${name}`)).status, 404);
  }
  assert.equal(reads, 1, 'Invalid paths never allocate compressed cache entries');
  const raw = await fetch(`${base}/test.js`, { headers: { 'Accept-Encoding': 'gzip;q=0, identity' } });
  assert.equal(raw.headers.get('content-encoding'), null);
  assert.match(raw.headers.get('cache-control') || '', /immutable/);
  assert.equal(await raw.text(), original);
  const head = await fetch(`${base}/test.js`, { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get('content-length')) < Buffer.byteLength(original));
  assert.equal(await head.text(), '');
  console.log('PASS: single compression, concurrency, query variants, alias rejection, HEAD and encoding negotiation');
} finally {
  fs.readFile = readFile;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  // This temporary directory was created by this test and contains only its fixture.
  await fs.unlink(path.join(root, 'test.js'));
  await fs.rmdir(root);
}
