import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  for(const path of ['/','/grupo-fenix','/tecnologias','/elite-milionaria','/fenix-social','/materiais']){
   const r=await page.goto('http://localhost:3001'+path);assert.equal(r.status(),200);
   await page.locator('#nav-inicio').first().waitFor({state:'attached'});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
   assert.equal(overflow,false,`Overflow ${width}px ${path}`);
  }
 }
 const payload='<img src=x onerror="globalThis.__xss=1">';
 await page.route('**/api/content/public*',route=>route.fulfill({json:{cursos:[],materiais:[{id:'xss-test',titulo:payload,tipo:'pdf',categoria:'Folders',thumbnail:'',isPublic:true,fileUrl:''}],novidades:[],banners:[],tecnologias:[],categoriasMateriais:['Folders'],leaderBio:{}}}));
 await page.goto('http://localhost:3001/materiais');await page.getByText(payload,{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>globalThis.__xss),undefined);assert.deepEqual(errors,[]);
 console.log('PASS: 6 páginas em celular/desktop sem overflow ou erros JavaScript; HTML malicioso exibido como texto sem execução.');
}finally{await browser.close();}
