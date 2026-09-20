import assert from 'node:assert/strict';
import { firstVimeoVideo, vimeoPicture, currentVimeoCover, courseCoverPath } from '../src/server/vimeoCovers.ts';

const first = firstVimeoVideo([{ aulas:[{ videoUrl:'https://player.vimeo.com/video/12345?h=abc123' },{ videoId:'99999' }] }]);
assert.deepEqual(first,{ id:'12345',hash:'abc123' });
assert.equal(firstVimeoVideo([{aulas:[{ videoId:'123/../../me' }]}]),null);
assert.equal(firstVimeoVideo([]),null);
assert.equal(vimeoPicture({pictures:{sizes:[{width:500,link:'https://example.com/image.jpg'}]}}),'');
assert.equal(vimeoPicture({pictures:{sizes:[{width:500,link:'http://i.vimeocdn.com/a.jpg'}]}}),'');
const actual = 'https://i.vimeocdn.com/video/official_1920x1080.jpg';
assert.equal(vimeoPicture({pictures:{sizes:[{width:1920,link:actual},{width:100,link:'https://i.vimeocdn.com/video/small.jpg'}]}}),actual);
assert.equal(vimeoPicture({pictures:{sizes:[{width:1920,link:actual},{width:960,link:'https://i.vimeocdn.com/video/medium.jpg'},{width:640,link:'https://i.vimeocdn.com/video/small.jpg'}]}}),'https://i.vimeocdn.com/video/medium.jpg');
assert.equal(courseCoverPath('course/1'),'/api/content/course-cover/course%2F1');
const originalFetch = globalThis.fetch;
let requests=0;
globalThis.fetch=async(input:any,init?:RequestInit)=>{
  requests++;
  assert.equal(String(input),'https://api.vimeo.com/videos/12345:abc123?fields=pictures');
  assert.equal((init?.headers as any).Authorization,'Bearer synthetic');
  return new Response(JSON.stringify({pictures:{sizes:[{width:1920,link:actual}]}}));
};
try {
  const results=await Promise.all(Array.from({length:10},()=>currentVimeoCover(first!,'synthetic')));
  assert.ok(results.every(url=>url===actual)); assert.equal(requests,1);
  assert.equal(await currentVimeoCover(first!,'synthetic'),actual); assert.equal(requests,1);
  globalThis.fetch=async()=>new Response('{}',{status:403});
  await assert.rejects(currentVimeoCover({id:'9988',hash:''},'synthetic'));
  console.log('OK: primeiro vídeo, hash privado, capa oficial, bloqueio de URLs externas, cache concorrente e falhas sem foto substituta.');
} finally {globalThis.fetch=originalFetch;}
