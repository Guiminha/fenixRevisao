import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '../.support-test-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const pg=new PGlite();
try{
 await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
 await pg.exec(fs.readFileSync('supabase-login-di-protecao.sql','utf8'));
 const run=async(action,ip='192.0.2.10',id=crypto.randomUUID(),status=0,hp=false)=>(await pg.query('SELECT fenix_di_login_guard($1,$2,$3,$4,$5) AS result',[action,ip,id,status,hp])).rows[0].result;
 for(let i=0;i<5;i++){const a=await run('begin');assert.ok(a.reservationId);await run('finish','192.0.2.10',a.reservationId,401);}
 const block=await run('begin');assert.equal(block.reason,'codigos_incorretos');assert.ok(block.retryAfterSeconds>=1799);
 for(let i=0;i<50;i++)await run('begin');
 const day=await run('begin');assert.equal(day.reason,'insistencia');assert.ok(day.retryAfterSeconds>=86399);
 await run('begin','192.0.2.11',crypto.randomUUID(),0,true);
 const trap=await run('begin','192.0.2.11',crypto.randomUUID(),0,true);assert.equal(trap.reason,'honeypot');assert.ok(trap.retryAfterSeconds>=86399);
 await pg.exec("UPDATE fenix_di_login_blocks SET blocked_until=now()-interval '1 second' WHERE ip='192.0.2.10'");
 // Daily refusal history remains: isolate a normal 30-minute expiration.
 await pg.exec("UPDATE fenix_di_login_blocks SET refused='{}' WHERE ip='192.0.2.10'");
 assert.ok((await run('begin')).reservationId);
 const perms=await pg.query("SELECT has_function_privilege('anon','fenix_di_login_guard(text,text,text,integer,boolean)','EXECUTE') AS anon, has_function_privilege('authenticated','fenix_di_login_guard(text,text,text,integer,boolean)','EXECUTE') AS di");
 assert.deepEqual(perms.rows[0],{anon:false,di:false});
 console.log('PASS: SQL real em banco isolado: 5 erros/30 min, insistência/24h, honeypot/24h, expiração e permissões.');
}finally{await pg.close();}
