import assert from 'node:assert/strict';
import { SessionService, DuplicateDISessionError, PRESENCE_TIMEOUT_MS, CLOSE_GRACE_MS } from '../src/server/sessionService.ts';

const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const identity = { code: '1234', role: 'user' as const, name: 'Teste', version: 'v1' };
const create = () => new SessionService('synthetic-session-presence-test-secret', async () => identity);
try {
  const service = create();
  const first = await service.create(identity);
  assert.equal(service.presence(first.access, first.refresh, 'tab-a'), true);
  assert.equal(service.presence(first.access, first.refresh, 'tab-b'), true);
  service.presence(first.access, first.refresh, 'tab-a', true);
  now += CLOSE_GRACE_MS + 1;
  assert.ok(await service.authenticate(first.access), 'Closing one tab preserves the other');
  service.presence(first.access, first.refresh, 'tab-b', true);
  now += CLOSE_GRACE_MS - 1;
  assert.ok(await service.authenticate(first.access));
  // A reload registers a new document during the close grace period.
  service.presence(first.access, first.refresh, 'tab-reloaded');
  service.presence(first.access, first.refresh, 'tab-b', true);
  now += CLOSE_GRACE_MS + 1;
  assert.ok(await service.authenticate(first.access), 'Late close does not close the new document');
  service.presence(first.access, first.refresh, 'tab-reloaded', true);
  now += CLOSE_GRACE_MS + 1;
  assert.equal(await service.refresh(first.refresh), null, 'Closed session cannot be refreshed');
  assert.equal(await service.authenticate(first.access), null);
  const second = await service.create(identity);
  service.presence(second.access, second.refresh, 'tab-crashed');
  now += PRESENCE_TIMEOUT_MS + 1;
  await service.create(identity); // Prunes the crashed session before checking duplicate D.I.
  assert.equal(await service.authenticate(second.access), null);
  assert.equal(await service.refresh(second.refresh), null);

  const active = create();
  const tokens = await active.create(identity);
  for (let i = 0; i < 40; i++) {
    now += 30_000;
    assert.equal(active.presence(tokens.access, tokens.refresh, 'open-tab'), true);
  }
  const rotated = await active.refresh(tokens.refresh);
  assert.ok(rotated, 'A present session survives access-token expiry');
  assert.equal(active.presence(tokens.access, tokens.refresh, 'open-tab'), true, 'Presence accepts the expired signed access token during rotation');
  assert.ok(await active.authenticate(rotated.access));
  await assert.rejects(active.create(identity), DuplicateDISessionError);
  active.logout(rotated.access, rotated.refresh);
  assert.equal(await active.authenticate(rotated.access), null);
  assert.equal(active.presence(rotated.access, rotated.refresh, 'open-tab'), false);
  const adminIdentity = { code: '11111111-1111-4111-8111-111111111111', role: 'admin' as const, name: 'Admin', version: 'v1' };
  const admin = new SessionService('synthetic-admin-secret', async () => adminIdentity);
  const adminTokens = await admin.create(adminIdentity);
  for (let i=0;i<60;i++) {
    now += 5_000;
    assert.ok(await admin.authenticate(adminTokens.access), 'Polling autenticado deve manter a presença durante uma sincronização');
  }
  admin.logout(adminTokens.access, adminTokens.refresh);
  assert.equal(await admin.authenticate(adminTokens.access), null);
  console.log('PASS: tabs, reload, late close, grace, crash, duplicate login, refresh and logout');
} finally { Date.now = realNow; }
