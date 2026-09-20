import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '../.support-test-runtime/node_modules/@electric-sql/pglite/dist/index.js';

export async function metricsDatabase() {
  const pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE dis_fenix(codigo text PRIMARY KEY, nome text, situacao text);
    GRANT SELECT ON dis_fenix TO service_role;
    INSERT INTO dis_fenix VALUES ('1234','Pessoa um','A'),('5678','Pessoa dois','P'),('9000','Pessoa três','X');`);
  const migration = fs.readFileSync('supabase-metricas-reais.sql', 'utf8');
  await pg.exec(migration);
  await pg.exec(migration); // Aplicação repetida preserva os registros.
  // Nesta instância isolada, service_role simula o BYPASSRLS do Supabase.
  await pg.exec('ALTER ROLE service_role BYPASSRLS');
  return pg;
}
if (process.argv[1]?.endsWith('admin-metrics.mjs')) {
  const pg = await metricsDatabase();
  try {
    await pg.exec(`INSERT INTO fenix_metric_events(id,kind,actor)
      SELECT gen_random_uuid(),'login','1234' FROM generate_series(1,1205);
      INSERT INTO fenix_metric_events(id,kind,entity_id,detail) VALUES
        (gen_random_uuid(),'download','mat-1','{"title":"Material real"}'),
        (gen_random_uuid(),'course','curso-1','{"title":"Curso real"}'),
        (gen_random_uuid(),'training','treino-1','{"title":"Treinamento real"}'),
        (gen_random_uuid(),'di_status','5678','{"previous":"A","current":"P","name":"Pessoa dois"}'),
        (gen_random_uuid(),'di_new','9000','{"current":"X","name":"Pessoa três"}');
      INSERT INTO fenix_metric_events(id,kind,occurred_at) VALUES(gen_random_uuid(),'login',now()-interval '100 days');
      SET ROLE service_role;`);
    const report = (await pg.query('SELECT fenix_metrics_report(30) AS report')).rows[0].report;
    assert.equal(report.totals.login, 1205, 'não deve truncar em mil registros');
    assert.equal(report.uniqueDIs, 1);
    assert.equal(report.access[0].count, 1205);
    assert.equal(report.totals.download, 1);
    assert.equal(report.totals.course, 1);
    assert.equal(report.totals.training, 1);
    assert.equal(report.changes.length, 2);
    assert.equal(report.situations.find(row => row.situation === 'X').count, 1);
    assert.equal(report.transitions.find(row => row.previous === 'A').current, 'P');
    for (const role of ['anon','authenticated']) {
      await pg.exec(`RESET ROLE; SET ROLE ${role}`);
      await assert.rejects(pg.query('SELECT fenix_metrics_report(30)'), /permission denied/);
      await assert.rejects(pg.query('SELECT * FROM fenix_metric_events'), /permission denied/);
    }
    console.log('OK: totais reais acima de 1.000, períodos, situações desconhecidas, migração idempotente e permissões.');
  } finally { await pg.close(); }
}
