import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const env = { ...process.env, NODE_ENV: 'development', FENIX_AUTOSTART: '0',
  SUPABASE_URL: 'https://supabase.invalid', SUPABASE_ANON_KEY: 'synthetic-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', JWT_SECRET: '', SUPABASE_ONLY: '1' };
const missingSecret = spawnSync(process.execPath, ['scripts/start-production.mjs'], { env, encoding: 'utf8', timeout: 15_000 });
assert.equal(missingSecret.status, 1);
assert.match(missingSecret.stderr, /JWT_SECRET não definido/);
const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
  await import('./scripts/start-production.mjs');
  if (process.env.NODE_ENV !== 'production') process.exit(2);
  console.log('PRODUCTION_OK');
  process.exit(0);
`], { env: { ...env, JWT_SECRET: 'synthetic-production-start-secret-12345678' }, encoding: 'utf8', timeout: 15_000 });
assert.equal(probe.status, 0, probe.stderr);
assert.match(probe.stdout, /PRODUCTION_OK/);
console.log('PASS: production startup overrides development mode and refuses a missing JWT secret');
