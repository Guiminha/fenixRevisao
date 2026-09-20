import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '../.support-test-runtime/node_modules/@electric-sql/pglite/dist/index.js';

export async function testDatabase() {
  const pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO service_role;
    CREATE TABLE public.config(key text PRIMARY KEY, value jsonb);`);
  const legacy = [{ id: 'legacy-ticket', numero: 42, assunto: 'Legado', status: 'aberto', criadoPor: '1234',
    criadoPorNome: 'Membro', criadoEm: '2026-09-01T00:00:00Z', atualizadoEm: '2026-09-01T00:00:00Z',
    mensagens: [{ id: 'legacy-message', tipo: 'di', autorNome: 'Membro', autorRef: '1234', texto: 'Histórico',
      criadoEm: '2026-09-01T00:00:00Z', anexos: [{ id: 'attachment', key: 'suporte-anexos/test.pdf', nome: 'test.pdf' }] }] }];
  await pg.query('INSERT INTO config VALUES ($1,$2)', ['supportTickets', JSON.stringify(legacy)]);
  const migration = fs.readFileSync('supabase-suporte-registros.sql', 'utf8');
  await pg.exec(migration);
  await pg.exec(migration); // Re-running never imports the legacy snapshot again.
  await pg.exec('SET ROLE service_role');
  const action = async (name, data = {}) => (await pg.query('SELECT public.fenix_support_action($1,$2) AS value', [name, JSON.stringify(data)])).rows[0].value;
  assert.deepEqual(await action('list'), legacy);
  const tickets = await Promise.all(Array.from({ length: 25 }, (_, i) => action('create', {
    id: `ticket-${i}`, messageId: `first-${i}`, assunto: `Concurrent ${i}`, texto: 'Test', actor: '1234', actorName: 'Membro'
  })));
  assert.equal(new Set(tickets.map(t => t.numero)).size, 25);
  assert.ok(tickets.every(t => t.numero > 42));
  await Promise.all(Array.from({ length: 30 }, (_, i) => action('message', {
    id: 'ticket-0', messageId: `message-${i}`, texto: `Parallel ${i}`, tipo: 'di', actor: '1234', actorName: 'Membro'
  })));
  assert.equal((await action('get', { id: 'ticket-0' })).mensagens.length, 31);
  await assert.rejects(action('message', { id: 'ticket-0', messageId: 'foreign', texto: 'x', tipo: 'di', actor: '5678' }), /não pertence/);
  await action('status', { id: 'ticket-0', status: 'fechado', tipo: 'di', actor: '1234', actorName: 'Membro' });
  await assert.rejects(action('message', { id: 'ticket-0', messageId: 'closed', texto: 'x', tipo: 'di', actor: '1234' }), /encerrado/);
  await action('status', { id: 'ticket-0', status: 'aberto', tipo: 'di', actor: '1234', actorName: 'Membro' });
  await action('message', { id: 'ticket-0', messageId: 'staff-response', texto: 'Resposta', tipo: 'suporte', actor: 'staff', actorName: 'Suporte' });
  assert.equal((await action('get', { id: 'ticket-0' })).status, 'aguardando_resposta');
  await assert.rejects(action('create', { id: 'rollback', messageId: 'legacy-message', assunto: 'Rollback', texto: 'Test', actor: '1234' }));
  assert.equal(await action('get', { id: 'rollback' }), null, 'ticket and first message must commit together');
  const snapshot = await action('list');
  await action('restore', { tickets: legacy, merge: true });
  assert.equal((await action('list')).length, snapshot.length);
  await action('clear');
  assert.deepEqual(await action('list'), []);
  await action('restore', { tickets: snapshot, merge: false });
  assert.deepEqual(await action('list'), snapshot);
  await pg.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(action('list'), /permission denied/);
  await assert.rejects(pg.query('SELECT * FROM fenix_support_messages'), /permission denied/);
  await pg.exec('RESET ROLE; SET ROLE authenticated');
  await assert.rejects(action('list'), /permission denied/);
  await pg.exec('RESET ROLE');
  await assert.rejects(pg.query("UPDATE config SET value='[]' WHERE key='supportTickets'"), /Suporte migrado/);
  await pg.exec('SET ROLE service_role');
  console.log('PASS SQL: migration/re-run, attachments, 25 tickets, 30 messages, ownership, close/reopen, atomic rollback, backup restore and permissions.');
  return { pg, action };
}
if (process.argv[1]?.endsWith('support-records.mjs')) {
  const { pg } = await testDatabase();
  await pg.close();
}
