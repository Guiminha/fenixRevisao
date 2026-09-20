import { parseVimeoInput } from '../utils/vimeoHelper.js';

export const courseCoverPath = (id: string) => `/api/content/course-cover/${encodeURIComponent(id)}`;
export function firstVimeoVideo(modules: any[]) {
  const lesson = (modules || []).flatMap(m => Array.isArray(m?.aulas) ? m.aulas : [])[0];
  const parsed = parseVimeoInput(String(lesson?.videoUrl || ''));
  const id = String(lesson?.videoId || parsed.videoId || '');
  const hash = String(lesson?.videoHash || parsed.hash || '');
  if (!/^\d{1,20}$/.test(id) || (hash && !/^[a-zA-Z0-9]{1,64}$/.test(hash))) return null;
  return { id, hash };
}
export function vimeoPicture(data: any): string {
  const sizes = Array.isArray(data?.pictures?.sizes) ? [...data.pictures.sizes] : [];
  // A menor versão oficial a partir de 960 px atende os cards em telas Retina.
  sizes.sort((a, b) => {
    const aw = Number(a.width || 0), bw = Number(b.width || 0);
    if (aw >= 960 && bw >= 960) return aw - bw;
    if (aw >= 960) return -1;
    if (bw >= 960) return 1;
    return bw - aw;
  });
  for (const picture of sizes) {
    try {
      const url = new URL(picture.link);
      if (url.protocol === 'https:' && url.hostname === 'i.vimeocdn.com' && !url.username && !url.password) return url.href;
    } catch { /* resposta inválida */ }
  }
  return '';
}
const cache = new Map<string, { url: string; until: number }>();
const pending = new Map<string, Promise<string>>();
export async function currentVimeoCover(video: { id: string; hash: string }, token: string): Promise<string> {
  const key = `${video.id}:${video.hash}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.url;
  const underway = pending.get(key);
  if (underway) return underway;
  const request = (async () => {
    if (!token) throw new Error('Vimeo não configurado.');
    const response = await fetch(`https://api.vimeo.com/videos/${video.id}${video.hash ? ':' + video.hash : ''}?fields=pictures`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Capa do Vimeo indisponível.');
    const url = vimeoPicture(await response.json());
    if (!url) throw new Error('Vídeo sem capa disponível.');
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
    cache.set(key, { url, until: Date.now() + 300000 });
    return url;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
