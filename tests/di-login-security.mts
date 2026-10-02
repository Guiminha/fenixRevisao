import assert from 'node:assert/strict';
import { DILoginAttempts, createDILoginProtection } from '../src/server/diLoginProtection.ts';
import { safeDISearch, validLoginBody } from '../src/server/security.ts';
import express from 'express';

let now = Date.now();
const guard = new DILoginAttempts(() => now);
const ip = '192.0.2.10';
function fail(address = ip) {
  const attempt = guard.begin(address, false);
  assert.equal(attempt.retryAfterSeconds, 0);
  assert.ok(attempt.reservationId);
  guard.finish(address, attempt.reservationId, 401);
}
for (let i = 0; i < 5; i++) fail();
assert.equal(guard.begin(ip, false).retryAfterSeconds, 1800);
assert.equal(guard.list()[0].reason, 'codigos_incorretos');
// Different IP remains unaffected, even with the same DI code.
assert.equal(guard.begin('192.0.2.11', false).retryAfterSeconds, 0);
now += 30 * 60_000;
assert.equal(guard.begin(ip, false).retryAfterSeconds, 0);
guard.release(ip);

// 5 failures + 45 refused requests = 24 hours; continuing a flood doesn't
// prolong the block forever. Release by the administrator clears the state.
for (let i = 0; i < 5; i++) fail();
for (let i = 0; i < 45; i++) guard.begin(ip, false);
assert.equal(guard.begin(ip, false).retryAfterSeconds, 86400);
now += 1000;
assert.equal(guard.begin(ip, false).retryAfterSeconds, 86399);
now += 24 * 60 * 60_000;
assert.equal(guard.begin(ip, false).retryAfterSeconds, 0);
guard.release(ip);

assert.equal(guard.begin(ip, true).retryAfterSeconds, 0);
assert.equal(guard.begin(ip, true).retryAfterSeconds, 86400);
guard.release(ip);
assert.equal(guard.list().some(b => b.ip === ip), false);

// Successful authentication clears short-term typos, but not daily abuse.
for (let i = 0; i < 4; i++) fail();
const success = guard.begin(ip, false);
guard.finish(ip, success.reservationId, 200);
for (let i = 0; i < 4; i++) fail();
assert.equal(guard.begin(ip, false).retryAfterSeconds, 0);
guard.release(ip);

// Parallel requests are reserved. Server failures/session conflicts are not
// mistaken for incorrect credentials, and abandoned slots expire.
const concurrent = Array.from({ length: 5 }, () => guard.begin(ip, false));
assert.ok(concurrent.every(a => a.reservationId));
assert.equal(guard.begin(ip, false).retryAfterSeconds, 1);
for (const a of concurrent) guard.finish(ip, a.reservationId, 503);
assert.equal(guard.begin(ip, false).retryAfterSeconds, 0);
now += 120_001;
assert.equal(guard.begin(ip, false).retryAfterSeconds, 0);
guard.release(ip);
for (let i = 0; i < 10; i++) { const a = guard.begin(ip, false); guard.finish(ip, a.reservationId, 409); }
assert.equal(guard.list().length, 0);

assert.equal(safeDISearch('João da Silva 1428'), 'João da Silva 1428');
assert.equal(safeDISearch('1234%_,().\\"'), '1234');
assert.equal(safeDISearch('%%%%()'), '');
assert.equal(safeDISearch('Ana-Maria'), 'Ana-Maria');
assert.ok(safeDISearch('x'.repeat(200)).length <= 120);
assert.equal(validLoginBody({ code: '1234' }), true);
assert.equal(validLoginBody({ code: '1234 OR 1=1' }), false);
assert.equal(validLoginBody({ code: { $eq: '1234' } }), false);
assert.equal(validLoginBody({ code: '1234567' }), false);
assert.equal(validLoginBody({ email: 'staff@example.com', password: 'example' }), true);

// HTTP integration with fake credential lookup, no actual DIs/Supabase changes.
const app = express();
app.use(express.json());
const httpGuard = new DILoginAttempts();
let lookups = 0;
app.post('/login', createDILoginProtection(httpGuard, async () => null), (req, res) => {
  if (!validLoginBody(req.body)) return res.status(400).json({ error: 'invalid' });
  lookups++;
  res.status(req.body.code && req.body.code !== '2468' ? 401 : 200).json({ success: true });
});
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const port = (server.address() as { port: number }).port;
async function post(body: unknown, forwarded = '203.0.113.100') {
  return fetch(`http://127.0.0.1:${port}/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': forwarded }, body: JSON.stringify(body) });
}
try {
  assert.equal((await post({ code: '2468', _hp: '' })).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await post({ code: '9999' })).status, 401);
  const blocked = await post({ code: '2468' }, '198.51.100.200');
  assert.equal(blocked.status, 429); // Spoofed header can't evade the IP block.
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1799);
  assert.equal(lookups, 6);
  // Administrative/support email policy remains outside the DI guard.
  assert.equal((await post({ email: 'staff@example.com', password: 'example' })).status, 200);
  httpGuard.release('127.0.0.1');
  assert.equal((await post({ code: '2468', _hp: 'filled' })).status, 400);
  assert.equal((await post({ code: '2468', _hp: 'filled' })).status, 429);
  assert.equal(lookups, 7);
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
console.log('OK: bloqueios, expiração, concorrência, honeypot, falhas do servidor e busca segura.');
