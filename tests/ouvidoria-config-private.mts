import assert from 'node:assert/strict';
import fs from 'node:fs';
// @ts-ignore isolated test runtime
import { PGlite } from '../.support-test-runtime/node_modules/@electric-sql/pglite/dist/index.js';

process.env.SUPABASE_URL = 'https://supabase.invalid';
process.env.SUPABASE_ANON_KEY = 'synthetic-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service';
process.env.SUPABASE_ONLY = '1';
const config = { emailSuporte: 'support@example.test', emailParcerias: 'team@example.test',
  notifySuporteEmail: true, notifyParceriaEmail: false, autoResponderEnabled: true };
const pg = new PGlite();
const originalFetch = globalThis.fetch;
try {
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE TABLE public.config(key text PRIMARY KEY, value jsonb);
    ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.config TO anon, authenticated, service_role;
    CREATE POLICY existing_read ON public.config FOR SELECT TO anon, authenticated USING (true);`);
  await pg.query('INSERT INTO config VALUES ($1,$2),($3,$4)',
    ['ouvidoriaConfig', JSON.stringify(config), 'logoUrl', JSON.stringify('/logo.png')]);
  const sql = fs.readFileSync('supabase-ouvidoria-config-privada.sql', 'utf8');
  await pg.exec(sql);
  await pg.exec(sql);
  for (const role of ['anon', 'authenticated']) {
    await pg.exec(`SET ROLE ${role}`);
    assert.deepEqual((await pg.query('SELECT key FROM config')).rows, [{ key: 'logoUrl' }]);
    await pg.exec('RESET ROLE');
  }
  await pg.exec('SET ROLE service_role');
  assert.deepEqual((await pg.query<{ value: typeof config }>("SELECT value FROM config WHERE key='ouvidoriaConfig'")).rows[0].value, config);
  globalThis.fetch = async (input: any, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.hostname, 'supabase.invalid');
    assert.equal(url.pathname, '/rest/v1/config');
    assert.equal(url.searchParams.get('key'), 'eq.ouvidoriaConfig');
    const authorized = new Headers(init?.headers).get('authorization') === 'Bearer synthetic-service';
    return new Response(JSON.stringify(authorized ? { value: config } : null), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  const { dbService } = await import('../src/server/db.ts');
  (dbService as any).ensureInitialized = async () => true;
  assert.deepEqual(await dbService.getOuvidoriaConfig(), config);
  assert.deepEqual(await dbService.getOuvidoriaConfig('synthetic-user'), config);
  console.log('PASS: anonymous/authenticated direct reads blocked, public logo preserved, server reads preserve every notification setting, SQL repeatable.');
} finally {
  globalThis.fetch = originalFetch;
  await pg.close();
}
