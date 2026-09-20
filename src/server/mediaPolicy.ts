import { getSupabaseTrustedClient } from "./db.js";
import { keyFromMediaUrl } from "./security.js";

export type MediaPolicy = "public" | "member" | "moderator" | "blocked";
export function materialPolicy(key: string, materials: any[]): MediaPolicy | null {
  const files = materials.filter(m => keyFromMediaUrl(m.file_url ?? m.fileUrl) === key);
  if (files.some(m => !(m.is_public ?? m.isPublic))) return "member";
  if (files.length || materials.some(m => keyFromMediaUrl(m.thumbnail) === key)) return "public";
  return null;
}
const pendingRows = new Map<string, Promise<any[]>>();
function rows(table: string, columns: string, filter?: [string, string]): Promise<any[]> {
  // Só consultas simultâneas são compartilhadas; a próxima consulta após
  // a resposta volta ao banco. Nenhuma decisão de autorização é cacheada.
  const key = JSON.stringify([table, columns, filter]);
  const existing = pendingRows.get(key);
  if (existing) return existing;
  const pending = readRows(table, columns, filter).finally(() => pendingRows.delete(key));
  pendingRows.set(key, pending);
  return pending;
}
async function readRows(table: string, columns: string, filter?: [string, string]): Promise<any[]> {
  const client = getSupabaseTrustedClient();
  if (!client) throw new Error("Metadados indisponíveis.");
  const result: any[] = [];
  for (let start = 0; start < 100000; start += 1000) {
    let query = client.from(table).select(columns).order("id").range(start, start + 999);
    if (filter) query = query.eq(...filter);
    const { data, error } = await query;
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 1000) return result;
  }
  throw new Error("Limite de metadados excedido.");
}
export async function mediaPolicy(key: string): Promise<MediaPolicy> {
  if (["backups-site/", "backups-banco/", "backup-suporte/", "suporte-anexos/"].some(p => key.startsWith(p))) return "blocked";
  if (key.startsWith("fenix_social/")) {
    const posts = await rows("fenix_posts", "id,media_url,media_urls", ["status", "aprovado"]);
    return posts.some(p => [p.media_url, ...(p.media_urls || [])].some(url => keyFromMediaUrl(url) === key)) ? "public" : "moderator";
  }
  // Match actual material metadata, including legacy files outside materiais/.
  const courseLookup = !key.startsWith("materiais/") && !key.startsWith("cursos/videos/")
    ? rows("cursos", "id,modulos").then(data => ({ data, error: null }), error => ({ data: [], error }))
    : null;
  const materials = await rows("materiais", "id,file_url,thumbnail,is_public");
  const policy = materialPolicy(key, materials);
  if (policy) return policy;
  if (key.startsWith("materiais/") || key.startsWith("cursos/videos/")) return "member";
  const courseResult = await courseLookup!;
  if (courseResult.error) throw courseResult.error;
  const courses = courseResult.data;
  const referencesKey = (value: unknown): boolean => {
    if (typeof value === "string") return keyFromMediaUrl(value) === key;
    if (Array.isArray(value)) return value.some(referencesKey);
    if (value && typeof value === "object") return Object.values(value).some(referencesKey);
    return false;
  };
  if (courses.some(c => referencesKey(c.modulos))) return "member";
  // Other namespaces contain the public site's banners, covers and page media.
  const publicFolders = ["geral/", "banners/", "institucional/", "professores/", "cursos/capas/", "paginas/", "videos/", "logos/", "logo/"];
  return publicFolders.some(p => key.startsWith(p)) ? "public" : "member";
}
