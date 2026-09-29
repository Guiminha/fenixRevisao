import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_ANON_KEY = 'synthetic';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
process.env.SUPABASE_ONLY = '1';
const savedFetch = globalThis.fetch;
let requests = 0;
let publicFile = true;
let privateCourseFile = false;
globalThis.fetch = async (input: any) => {
  const url = new URL(String(input));
  assert.equal(url.hostname, 'test.invalid');
  assert.ok(['/rest/v1/materiais', '/rest/v1/cursos'].includes(url.pathname));
  requests++;
  await new Promise(resolve => setTimeout(resolve, 20));
  if (url.pathname === '/rest/v1/cursos') return Response.json(privateCourseFile ? [{ id: 'course', modulos: [{ aulas: [{ videoUrl: '/api/storage/preview/banners/private.mp4' }] }] }] : []);
  return Response.json([{ id: 'test', file_url: '/api/storage/preview/materiais/test.png', is_public: publicFile }]);
};
try {
  const { mediaPolicy } = await import('../src/server/mediaPolicy.ts');
  const results = await Promise.all(Array.from({ length: 8 }, () => mediaPolicy('materiais/test.png')));
  assert.deepEqual(results, Array(8).fill('public'));
  assert.equal(requests, 1);
  publicFile = false;
  assert.equal(await mediaPolicy('materiais/test.png'), 'public', 'Material cadastrado é público mesmo com a marcação legada is_public=false.');
  assert.equal(requests, 2, 'Uma requisição posterior deve reconsultar as permissões.');
  assert.equal(await mediaPolicy('materiais/sem-cadastro.pdf'), 'member');
  assert.equal(await mediaPolicy('cursos/videos/aula.mp4'), 'member');
  assert.equal(await mediaPolicy('suporte-anexos/test.png'), 'blocked');
  assert.equal(await mediaPolicy('banners/public.jpg'), 'public');
  privateCourseFile = true;
  assert.equal(await mediaPolicy('banners/private.mp4'), 'member', 'Referências privadas de cursos prevalecem sobre a pasta pública.');
  console.log('OK: material cadastrado público; arquivo órfão, curso e anexo protegidos; leituras simultâneas compartilhadas.');
} finally { globalThis.fetch = savedFetch; }
