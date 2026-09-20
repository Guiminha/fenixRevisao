import type { RequestHandler } from "express";

// Express 4 does not forward rejected promises to error middleware.
export function asyncHandler(handler: (...args: any[]) => any): RequestHandler {
  return (req, res, next) => {
    try { Promise.resolve(handler(req, res, next)).catch(next); }
    catch (error) { next(error); }
  };
}

export function validLoginBody(body: unknown): body is { code?: string; email?: string; password?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const { code, email, password } = body as Record<string, unknown>;
  if (code !== undefined && (typeof code !== "string" || !/^\d{4,6}$/.test(code))) return false;
  if (email !== undefined && (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return false;
  if (password !== undefined && (typeof password !== "string" || password.length > 256 || !password.length)) return false;
  return !!((code && !email) || (email && password && !code));
}

export function storageKey(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > 500) return null;
  if (/[\\%\u0000-\u001f\u007f?#]/.test(raw)) return null;
  if (raw.split("/").some(part => !part || part === "." || part === "..")) return null;
  return raw;
}

export function keyFromMediaUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url, "https://media.invalid");
    const match = parsed.pathname.match(/^\/api\/storage\/(?:preview|stream)\/(.+)$/);
    if (match) return storageKey(decodeURIComponent(match[1]));
    if (parsed.pathname === "/api/storage/hls/master.m3u8") return storageKey(parsed.searchParams.get("key"));
  } catch { /* malformed URL */ }
  return null;
}

export function parseByteRange(value: unknown, size: number): { start: number; end: number } | null {
  if (typeof value !== "string" || !Number.isSafeInteger(size) || size < 1) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
  if (first === null) return last! > 0 ? { start: Math.max(0, size - last!), end: size - 1 } : null;
  if (first >= size || (last !== null && last < first)) return null;
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}

// Bound active work independently of the request rate.
export function concurrencyLimit(maxPerUser: number, maxTotal: number): RequestHandler {
  const active = new Map<string, number>();
  let total = 0;
  return (req: any, res, next) => {
    const key = req.user?.code || req.ip || "unknown";
    if ((active.get(key) || 0) >= maxPerUser || total >= maxTotal) {
      res.setHeader("Retry-After", "5");
      res.status(429).json({ error: "Há operações em andamento. Aguarde alguns segundos." });
      return;
    }
    active.set(key, (active.get(key) || 0) + 1);
    total++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      total--;
      const remaining = (active.get(key) || 1) - 1;
      if (remaining) active.set(key, remaining); else active.delete(key);
    };
    res.once("close", release);
    res.once("finish", release);
    next();
  };
}

export function publicPost(post: any) {
  return {
    id: post.id, titulo: post.titulo, usuarioNome: post.usuarioNome,
    usuarioRole: post.usuarioRole, tipoMedia: post.tipoMedia,
    mediaUrl: post.mediaUrl, mediaUrls: post.mediaUrls, legenda: post.legenda,
    status: post.status, likes: post.likes, createdAt: post.createdAt,
    comentarios: (post.comentarios || []).map((c: any) => ({
      id: c.id, texto: c.texto, usuarioNome: c.usuarioNome, createdAt: c.createdAt
    }))
  };
}
