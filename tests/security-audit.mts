import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
process.env.FENIX_AUTOSTART='0';process.env.NODE_ENV='production';
process.env.SUPABASE_ONLY='1';process.env.SUPABASE_URL='https://supabase.invalid';
process.env.SUPABASE_ANON_KEY='synthetic-anon';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service';
process.env.JWT_SECRET='synthetic-security-audit-secret-123456789';process.env.TRUST_PROXY='0';process.env.PUBLIC_BASE_DOMAIN='';
const realFetch=globalThis.fetch;
const admin={id:'11111111-1111-4111-8111-111111111111',email:'admin@example.test',app_metadata:{role:'admin'},updated_at:'2026-09-01T00:00:00Z'};
let lookups=0;
globalThis.fetch=async(input:any,init?:RequestInit)=>{
 const u=new URL(String(input));if(u.hostname==='127.0.0.1')return realFetch(input,init);
 assert.equal(u.hostname,'supabase.invalid','Não acessar integrações reais');
 const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
 if(u.pathname==='/auth/v1/token')return JSON.parse(String(init?.body)).password==='test-password' ? json({user:admin,access_token:'fake',refresh_token:'fake',token_type:'bearer',expires_in:3600}) : json({msg:'Invalid credentials'},400);
 if(u.pathname.includes('/auth/v1/admin/users/'))return json(admin);
 if(u.pathname.startsWith('/storage/'))return new Response('PRIVATE_TEST_FILE',{headers:{'content-length':'17'}});
 if(u.pathname.includes('/rpc/fenix_di_login_guard'))return json({message:'Mock without persistence'},503);
 return json([]);
};
const {dbService}=await import('../src/server/db.ts');const db=dbService as any;
db.isSupabaseReady=async()=>true;db.recordAuditLog=async()=>{};
db.validateDICode=async(code:string)=>{lookups++;return {valid:code==='1234',name:'Teste',role:'user',userCode:code};};
db.getData=async()=>({cursos:[],materiais:[],banners:[],novidades:[],tecnologias:[],categoriasMateriais:[],leaderBio:{}});
const {app}=await import('../server.ts');const server=app.listen(0,'127.0.0.1');
await new Promise<void>(r=>server.once('listening',r));const port=(server.address() as any).port;
const api=(path:string,method='GET',body?:any,cookie='',extra:Record<string,string>={}):Promise<Response>=>new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{host:`adminfenix.localhost:${port}`,'content-type':'application/json',...(body===undefined?{}:{'content-length':String(Buffer.byteLength(JSON.stringify(body)))}),cookie,...extra}},res=>{
  const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const headers=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)headers.append(res.rawHeaders[i],res.rawHeaders[i+1]);resolve(new Response(res.statusCode===204?null:Buffer.concat(chunks),{status:res.statusCode,headers}));});
 });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
});
const cookies=(r:Response)=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const results:any[]=[];
async function check(name:string,fn:()=>Promise<void>){try{await fn();results.push({name,ok:true});}catch(e:any){results.push({name,ok:false,error:e.message});}}
try {
 const login=await api('/api/auth/login','POST',{code:'1234'});assert.equal(login.status,200);const member=cookies(login);
 const staff=await api('/api/auth/login','POST',{email:admin.email,password:'test-password'});assert.equal(staff.status,200);const adminCookie=cookies(staff);
 await check('Cookie seguro, HttpOnly e SameSite',async()=>{for(const c of staff.headers.getSetCookie()){assert.match(c,/HttpOnly/);assert.match(c,/Secure/);assert.match(c,/SameSite=Strict/);}});
 const routes=[...fs.readFileSync('server.ts','utf8').matchAll(/app\.(get|post|put|delete)\(["'](\/api\/(?:admin\/|fenix-social\/admin\/)[^"']*)["']/g)].map(m=>({method:m[1].toUpperCase(),path:m[2].replace(/:[a-zA-Z]+/g,'audit-nonexistent')}));
 await check(`Permissões: ${routes.length} rotas administrativas sem login e com D.I.`,async()=>{for(const r of routes)for(const cookie of ['',member]){const resp=await api(r.path,r.method,r.method==='GET'?undefined:{},cookie);assert.ok([401,403].includes(resp.status),`${r.method} ${r.path}: ${resp.status}`);}});
 await check('Proteção CSRF: origem externa',async()=>{assert.equal((await api('/api/auth/logout','POST',{},adminCookie,{origin:'https://evil.invalid'})).status,403);assert.equal((await api('/api/auth/me','GET',undefined,adminCookie)).status,200);});
 await check('JWT forjado não autoriza acesso',async()=>{const token=Buffer.from('{"alg":"none"}').toString('base64url')+'.'+Buffer.from('{"role":"admin","exp":9999999999}').toString('base64url')+'.';assert.equal((await api('/api/admin/dis','GET',undefined,`access_token=${token}`)).status,401);});
 await check('Presença no host administrativo',async()=>{assert.equal((await api('/api/auth/presence','POST',{tabId:crypto.randomUUID()},adminCookie)).status,204);});
 await check('Presença no host de suporte',async()=>{assert.equal((await api('/api/auth/presence','POST',{tabId:crypto.randomUUID()},adminCookie,{host:`suporte.localhost:${port}`})).status,204);});
 await check('Arquivos internos da sincronização bloqueados para D.I.',async()=>{for(const mode of ['preview','stream'])for(const key of ['nipponflex/backups/BASE-ANTES-test.json','nipponflex/test.json','backup-suporte/test.zip','suporte-anexos/test.pdf'])assert.equal((await api(`/api/storage/${mode}/${key}`,'GET',undefined,member)).status,404,key);});
 await check('Travessia de diretórios e codificação dupla',async()=>{for(const key of ['%252e%252e%252f.env','a%5c..%5c.env','a%00.txt'])assert.equal((await api(`/api/storage/preview/${key}`,'GET',undefined,member)).status,400);});
 await check('Cursos protegidos sem autenticação',async()=>{assert.equal((await api('/api/content/restricted')).status,401);assert.equal((await api('/api/storage/stream/cursos/videos/test.mp4')).status,404);});
 await check('Upload executável recusado',async()=>{const form=new FormData();form.append('file',new Blob(['<svg onload="alert(1)"></svg>'],{type:'image/svg+xml'}),'audit.svg');const r=await realFetch(`http://127.0.0.1:${port}/api/storage/upload`,{method:'POST',headers:{host:`adminfenix.localhost:${port}`,cookie:adminCookie},body:form});assert.equal(r.status,400);});
 await check('Logout invalida replay do cookie',async()=>{assert.equal((await api('/api/auth/logout','POST',{},member)).status,200);assert.equal((await api('/api/content/restricted','GET',undefined,member)).status,401);});
 await check('Injeção SQL e objetos não chegam à consulta de D.I.',async()=>{const before=lookups;for(const code of ["1234' OR '1'='1",{ $ne:null },'1234;DROP TABLE dis_fenix','１２３４'])assert.equal((await api('/api/auth/login','POST',{code})).status,400);assert.equal(lookups,before);});
 await check('Força bruta: bloqueio e tentativa de troca de IP por cabeçalho',async()=>{await api('/api/auth/login','POST',{code:'9999'});for(let i=0;i<60;i++){const r=await api('/api/auth/login','POST',{code:'1234'},'',{'x-forwarded-for':`192.0.2.${i+1}`});assert.equal(r.status,429);assert.ok(Number(r.headers.get('retry-after'))>0);}});
 await check('Força bruta administrativa',async()=>{for(let i=0;i<3;i++)assert.ok([401,429].includes((await api('/api/auth/login','POST',{email:admin.email,password:'bad'})).status));assert.equal((await api('/api/auth/login','POST',{email:admin.email,password:'test-password'})).status,429);});
 console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.ok),'Falhas na auditoria');
} finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));globalThis.fetch=realFetch;}
