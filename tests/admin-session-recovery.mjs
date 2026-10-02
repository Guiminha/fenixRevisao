import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base='http://adminfenix.localhost:3001';
const browser=await chromium.launch({headless:true});
let signedIn=false, logoutCalls=0, presenceCalls=0, statusCalls=0;
try {
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const reply=json=>route.fulfill({json});
  const user={code:'11111111-1111-4111-8111-111111111111',role:'admin',name:'Teste'};
  if(url.pathname==='/api/auth/me')return reply({loggedIn:signedIn,user});
  if(url.pathname==='/api/auth/login'){signedIn=true;return reply({success:true,user});}
  if(url.pathname==='/api/auth/logout'){logoutCalls++;signedIn=false;return reply({success:true});}
  if(url.pathname==='/api/auth/presence'){
   presenceCalls++;return presenceCalls===1 ? route.fulfill({status:401,json:{error:'Resposta antiga'}}) : route.fulfill({status:204,body:''});
  }
  if(url.pathname==='/api/admin/nipponflex/status'){
   statusCalls++;
   if(statusCalls===1)return route.fulfill({status:401,json:{error:'Resposta antiga'}});
   return reply({success:true,estado:{status:'ok',ultimaSincronizacao:'2026-10-02T14:22:57Z',modoSincronizacao:'incremental',dataBaseConsulta:'30-09-2026',removidos:2040,relatorioVersao:2,novosDetalhes:[],situacoesAlteradas:[]},metricas:{total:649,porSituacao:{A:649}},logs:[{id:'latest',ts:'02/10/2026 11:22:57',nivel:'ok',msg:'Rodada concluída'}]});
  }
  if(url.pathname==='/api/content/public'||url.pathname==='/api/content/restricted')return reply({cursos:[],materiais:[],banners:[],novidades:[],tecnologias:[],categoriasMateriais:[],leaderBio:{}});
  if(url.pathname==='/api/admin/nipponflex/dados')return reply({success:true,itens:[],total:0,totalPaginas:0});
  if(url.pathname==='/api/admin/security/di-login-blocks')return reply({persistent:true,blocks:[]});
  return reply({success:true,situacoes:['A']});
 });
 await page.clock.install();
 await page.goto(base);
 await page.locator('input[type=email]').fill('teste@example.test');
 await page.locator('input[type=password]').fill('SenhaFicticia123!');
 await page.locator('button[type=submit]').click();
 await page.getByRole('button',{name:'D.I.s Cadastrados',exact:true}).click();
 await page.getByText('D.I.s ativos na base de acesso',{exact:true}).waitFor();
 for(let i=0;i<19;i++){await page.clock.runFor(5000);await page.waitForTimeout(50);}
 await page.getByText('Incremental desde 30-09-2026',{exact:true}).waitFor();
 assert.ok(presenceCalls>=2,'Heartbeat deve continuar após a resposta antiga');
 assert.ok(statusCalls>=2,'Polling deve recuperar status');
 assert.equal(logoutCalls,0,'401 antigo não pode revogar o login confirmado');
 assert.equal(signedIn,true);
 assert.deepEqual(errors,[]);
 console.log('PASS: sessão administrativa mantida por 95s, 401 antigo recuperado, nenhum logout indevido e painel incremental visível.');
} finally {await browser.close();}
