import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Readable } from "node:stream";

// ====================================================================
// Serviço de armazenamento — Supabase Storage (SELF-HOSTED).
// Fonte única de mídia/arquivos do site. Bucket fixo: "armazenamento".
// Sem fallback em disco: se o Storage falhar, a operação falha.
// ====================================================================

export const STORAGE_BUCKET = "armazenamento";

let supabaseClient: SupabaseClient | null = null;

function storage(): SupabaseClient {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  supabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return supabaseClient;
}

// HEAD de um objeto no Supabase Storage — retorna metadados sem baixar o
// conteúdo (evita o download inteiro que estourava o timeout em arquivos
// grandes só para obter o tamanho).
async function headObject(bucket: string, key: string): Promise<{ size: number; lastModified: Date }> {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const endpoint = `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(endpoint, { method: "HEAD", headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`Object not found (${res.status})`);
  const size = Number(res.headers.get("content-length") || 0);
  const last = res.headers.get("last-modified");
  return { size, lastModified: last ? new Date(last) : new Date() };
}

export interface StorageCompatibleClient {
  putObject(bucket: string, key: string, buffer: Buffer, size?: number, meta?: any): Promise<any>;
  statObject(bucket: string, key: string): Promise<{ size: number; metaData: any; lastModified: Date }>;
  getObject(bucket: string, key: string): Promise<Readable>;
  getPartialObject(bucket: string, key: string, offset: number, length: number): Promise<Readable>;
  removeObject(bucket: string, key: string): Promise<any>;
  listObjectsV2(bucket: string, prefix?: string, recursive?: boolean): AsyncIterable<any>;
  bucketExists(bucket: string): Promise<boolean>;
  makeBucket(bucket: string, region?: string): Promise<any>;
  listBuckets(): Promise<{ name: string }[]>;
}

export function getActiveStorageClient(): StorageCompatibleClient {
  const sb = storage();
  return {
    async putObject(bucket: string, key: string, buffer: Buffer, _size?: number, meta?: any) {
      const contentType = (meta && meta["Content-Type"]) || "application/octet-stream";
      const { error } = await sb.storage.from(bucket).upload(key, buffer, { contentType, upsert: true });
      if (error) throw new Error(error.message);
      return { etag: "" };
    },
    async statObject(bucket: string, key: string) {
      const { size, lastModified } = await headObject(bucket, key);
      return { size, metaData: {}, lastModified };
    },
    async getObject(bucket: string, key: string): Promise<Readable> {
      const { data, error } = await sb.storage.from(bucket).download(key);
      if (error) throw new Error(error.message);
      const buf = Buffer.from(await data.arrayBuffer());
      return Readable.from(buf);
    },
    async getPartialObject(bucket: string, key: string, offset: number, length: number): Promise<Readable> {
      const { data, error } = await sb.storage.from(bucket).download(key);
      if (error) throw new Error(error.message);
      const buf = Buffer.from(await data.arrayBuffer());
      return Readable.from(buf.subarray(offset, offset + length));
    },
    async removeObject(bucket: string, key: string) {
      const { error } = await sb.storage.from(bucket).remove([key]);
      if (error) throw new Error(error.message);
      return {};
    },
    listObjectsV2(bucket: string, prefix?: string, recursive?: boolean): AsyncIterable<any> {
      return (async function* () {
        const { data, error } = await sb.storage.from(bucket).list(prefix || "", { limit: 10000 });
        if (error) throw new Error(error.message);
        for (const f of (data || [])) {
          if (f.metadata) {
            yield { name: (prefix ? prefix + "/" : "") + f.name, size: f.metadata.size || 0, lastModified: new Date(f.metadata.lastModified || Date.now()) };
          }
        }
      })();
    },
    async bucketExists(_bucket: string) { return true; },
    async makeBucket(_bucket: string, _region?: string) { return {}; },
    async listBuckets(): Promise<any[]> {
      const { data, error } = await sb.storage.listBuckets();
      if (error) throw new Error(error.message);
      return ((data || []) as any[]).map((b: any) => ({ name: b.name }));
    }
  };
}

export function withTimeout<T>(promise: Promise<T>, ms = 4000, errorMsg = "Tempo limite de conexão excedido"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${errorMsg} (${ms}ms)`)), ms);
    promise.then((res) => { clearTimeout(timer); resolve(res); }).catch((err) => { clearTimeout(timer); reject(err); });
  });
}

export async function ensureBucketExists(bucketName: string): Promise<{ ready: boolean; error?: string }> {
  try {
    const { data, error } = await storage().storage.listBuckets();
    if (error) return { ready: false, error: error.message };
    const names = ((data || []) as any[]).map((b: any) => b.name);
    if (!names.includes(bucketName)) {
      const { error: cErr } = await storage().storage.createBucket(bucketName, { public: false });
      if (cErr) return { ready: false, error: cErr.message };
    }
    return { ready: true };
  } catch (err: any) {
    return { ready: false, error: err?.message || String(err) };
  }
}

export async function testStorageConnection(): Promise<{ success: boolean; message: string; buckets?: string[] }> {
  try {
    const { data, error } = await storage().storage.listBuckets();
    if (error) {
      return { success: false, message: `Supabase Storage inacessível: ${error.message}` };
    }
    const names = ((data || []) as any[]).map((b: any) => b.name);
    return { success: true, message: `Storage conectado. Buckets: ${names.join(", ") || "(nenhum)"}`, buckets: names };
  } catch (err: any) {
    return { success: false, message: `Erro ao conectar ao Storage: ${err?.message || err}` };
  }
}
