import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { gzipSync } from "zlib";
import { hlsPlaylist, hlsObject, hlsSegment } from "./src/server/hlsService.js";
import multer from "multer";
import helmet from "helmet";
import "dotenv/config";
import { recordMetric, metricsReport, reportSystemError } from './src/server/metricsService.js';
import { integrationStatus } from './src/server/integrationHealth.js';
import { courseCoverPath, firstVimeoVideo, currentVimeoCover } from './src/server/vimeoCovers.js';
import { previewWidth, resizePreview } from './src/server/imagePreview.js';
import { createServer as createViteServer } from "vite";
import { dbService, LeaderBio, Novidade, Curso, Material, Banner, FenixPost, supabase, getSupabaseTrustedClient, getSupabaseClient } from "./src/server/db.js";
import { 
  STORAGE_BUCKET,
  getActiveStorageClient, 
  testStorageConnection, 
  ensureBucketExists,
  withTimeout 
} from "./src/server/storageService.js";
import {
  executarSincronizacao,
  getNfEstado,
  getNfLogs,
  obterMetricasDis,
  obterDisPaginado,
  carregarEstadoInicial,
  verificarAgendador
} from "./src/server/nipponflexService.js";
import { 
  fetchMyVimeoVideos, 
  getVimeoAccountDetails, 
  constructProtectedEmbedUrl 
} from "./src/server/vimeoClient.js";
import {
globalApiRateLimiter,
loginRateLimiter,
ouvidoriaRateLimiter,
uploadRateLimiter,
fenixSocialPostRateLimiter,
fenixSocialInteractionRateLimiter,
vimeoInfoRateLimiter,
fenixModeracaoRateLimiter,
passwordChangeRateLimiter
} from "./src/server/rateLimiter.js";
import { parseDICsv, buildDITemplateCSV } from "./src/server/diImport.js";
import { getManutencaoStatus, setManutencao, collectMediaKeys, removeOrphanMedia } from "./src/server/backupService.js";
import { getSmtpStatus, sendEmail, sendTestEmail, notifyNewLeadHtml } from "./src/server/mailService.js";

import { asyncHandler, validLoginBody, storageKey, keyFromMediaUrl, parseByteRange, concurrencyLimit, publicPost } from "./src/server/security.js";
import { mediaPolicy } from "./src/server/mediaPolicy.js";
import { SessionService, DuplicateDISessionError, type Identity } from "./src/server/sessionService.js";

export const app = express();
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 500 && req.path.startsWith('/api/')) {
      reportSystemError('API', `HTTP_${res.statusCode}`, 'A solicitação falhou no servidor.', typeof req.route?.path === 'string' ? `${req.method} ${req.route.path}` : 'API');
    }
  });
  next();
});
// Arquivos arquivados nunca devem ser disponibilizados pelo site, inclusive em desenvolvimento.
app.use("/Lixo", (_req, res) => { res.status(404).end(); });
const uploadConcurrency = concurrencyLimit(2, 8);
const mediaConcurrency = concurrencyLimit(8, 64);
const PORT = Number(process.env.PORT) || 3000;

// ---------------- Compressão (gzip) + cache de resposta ----------------
// gzip para respostas de texto/API e assets hasheados (zlib nativo, sem dependência).
const COMPRESSIBLE_RE = /(^text\/|application\/json|application\/javascript|application\/xml|image\/svg\+xml)/i;
app.use((req, res, next) => {
  if (req.method === "HEAD" || !/gzip/.test((req.headers["accept-encoding"] || "").toLowerCase())) return next();
  const originalSend = res.send.bind(res);
  res.send = function (body?: any) {
    const type = String(res.get("content-type") || "");
    if (typeof body === "string" && !res.get("content-encoding") && COMPRESSIBLE_RE.test(type)) {
      try {
        const buf = gzipSync(Buffer.from(body));
        res.set("Content-Encoding", "gzip");
        res.set("Vary", "Accept-Encoding");
        res.set("Content-Length", String(buf.length));
        return originalSend(buf);
      } catch (e) {
        // corpo não comprimível: segue sem gzip
      }
    }
    return originalSend(body);
  };
  next();
});

// Cache em memória de respostas públicas pesadas (TTL curto). Qualquer escrita
// em /api/admin invalida o cache (middleware adiante).
const apiResponseCache = new Map<string, { data: string; time: number }>();
const apiResponsePending = new Map<string, Promise<string>>();
let publicCacheVersion = 0;
function cacheJsonResponse(key: string, ttlMs: number, build: () => Promise<string>): Promise<string> {
  const hit = apiResponseCache.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return Promise.resolve(hit.data);
  const existing = apiResponsePending.get(key);
  if (existing) return existing;
  const version = publicCacheVersion;
  const pending = build().then((data) => {
    if (version === publicCacheVersion) apiResponseCache.set(key, { data, time: Date.now() });
    return data;
  }).finally(() => {
    if (apiResponsePending.get(key) === pending) apiResponsePending.delete(key);
  });
  apiResponsePending.set(key, pending);
  return pending;
}
function invalidatePublicApiCache() {
  publicCacheVersion++;
  apiResponsePending.clear();
  for (const k of apiResponseCache.keys()) apiResponseCache.delete(k);
}

// Trust proxy setting: OFF by default (req.ip = direct socket IP, X-Forwarded-For ignored).
// Set TRUST_PROXY=1 in production when behind a reverse proxy (Nginx/Cloudflare/load
// balancer) so req.ip resolves the real client IP and rate limiting keys stay reliable.
// Somente valores NUMÈRICOS (nº de proxies) são aceitos: "true" confia em qualquer
// X-Forwarded-For e abre spoofing de IP nos rate limits.
const rawTrustProxy = process.env.TRUST_PROXY;
const parsedTrustProxy = Number(rawTrustProxy);
const trustProxySetting: number | false =
  Number.isInteger(parsedTrustProxy) && parsedTrustProxy >= 1 ? parsedTrustProxy : false;
app.set("trust proxy", trustProxySetting);

// Security headers (helmet). Em produção o CSP é estrito (script-src 'self' =
// bloqueia script inline/eval ‐ a principal camada pós-XSS). Em dev o Vite
// usa eval/websocket, então o CSP fica desligado para não quebrar o HMR.
const isProduction = process.env.NODE_ENV === "production";
const CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "media-src": ["'self'", "blob:", "https:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'", "ws:", "wss:", "https:"],
  "frame-src": ["'self'", "blob:", "https://player.vimeo.com", "https://vimeo.com"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'self'"]
};
app.use(helmet({
  contentSecurityPolicy: isProduction ? { useDefaults: false, directives: CSP_DIRECTIVES } : false,
  crossOriginEmbedderPolicy: false,
}));

// Availability gate for /api/* routes in strict mode (SUPABASE_ONLY=1):
// if Supabase is unreachable/missing, the API responds 503 (maintenance mode)
// instead of falling back to local data. Data never leaves the Supabase.
app.use(asyncHandler(async (req, res, next) => {
  if (!req.path.startsWith("/api/") && req.path !== "/api") return next();
  // Respostas de API não devem ser cacheadas por proxies/navegadores (dados podem
  // ser autenticados). Rotas de mídia (/api/storage/*) sobrescrevem depois.
  res.setHeader("Cache-Control", "no-store");
  if (!dbService.isStrictMode()) return next();
  const ready = await dbService.isSupabaseReady();
  if (!ready) {
    return res.status(503).json({ error: "Serviço indisponível no momento (banco de dados em manutenção)." });
  }
  next();
}));

// ---------- Validação de uploads (extensão + magic bytes) ----------
// Extensões permitidas: mídia segura + documentos de apoio. Nada executável/servível.
const ALLOWED_UPLOAD_EXT = /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|mkv|m4v|mp3|aac|wav|ogg|oga|m4a|pdf|zip|csv|json|txt|docx|xlsx|pptx)$/i;
const BLOCKED_UPLOAD_EXT = /\.(html?|htm|svg|xml|xhtml|js|mjs|cjs|wasm|sh|bat|cmd|exe|dll|php|py|rb|jar|swf)$/i;
const INLINE_MEDIA_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".mp4", ".webm", ".mov", ".mkv", ".m4v", ".mp3", ".aac", ".wav", ".ogg", ".oga", ".m4a", ".pdf"]);
const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mkv": "video/x-matroska", ".m4v": "video/mp4",
  ".mp3": "audio/mpeg", ".aac": "audio/aac", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".oga": "audio/ogg", ".m4a": "audio/mp4",
  ".pdf": "application/pdf", ".zip": "application/zip", ".csv": "text/csv",
  ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

function fileExtOf(name: string): string {
  const m = String(name || "").toLowerCase().match(/(\.[a-z0-9]{1,10})$/);
  return m ? m[1] : "";
}

function hasMagicPrefix(buffer: Buffer, hexes: string[]): boolean {
  const start = buffer.subarray(0, 16);
  return hexes.some((h) => start.subarray(0, h.length / 2).equals(Buffer.from(h, "hex")));
}

// Verifica se o conteúdo corresponde à extensão (anti-camouflage: html/JS com ext de imagem).
function magicMatches(ext: string, buffer: Buffer): boolean {
  if (ext === ".png") return hasMagicPrefix(buffer, ["89504e47"]);
  if (ext === ".jpg" || ext === ".jpeg") return hasMagicPrefix(buffer, ["ffd8ff"]);
  if (ext === ".gif") return hasMagicPrefix(buffer, ["47494638"]);
  if (ext === ".webp") return hasMagicPrefix(buffer, ["52494646"]) && buffer.subarray(8, 12).toString("latin1") === "WEBP";
  if (ext === ".zip" || ext === ".docx" || ext === ".xlsx" || ext === ".pptx") return hasMagicPrefix(buffer, ["504b0304", "504b0506", "504b0708"]);
  if (ext === ".pdf") return hasMagicPrefix(buffer, ["25504446"]);
  if (ext === ".webm") return hasMagicPrefix(buffer, ["1a45dfa3"]);
  if (ext === ".ogg" || ext === ".oga") return hasMagicPrefix(buffer, ["4f676753"]);
  if (ext === ".wav") return hasMagicPrefix(buffer, ["52494646"]) && buffer.subarray(8, 12).toString("latin1") === "WAVE";
  if (ext === ".mp3") return hasMagicPrefix(buffer, ["494433", "fff3", "fffb", "fff2"]);
  if (ext === ".mp4" || ext === ".m4v" || ext === ".m4a" || ext === ".mov" || ext === ".avif") {
    return buffer.subarray(4, 8).toString("latin1") === "ftyp";
  }
  if (ext === ".csv" || ext === ".json" || ext === ".txt") {
    if (buffer.includes(0)) return false; // binário disfarçado de texto
    return true;
  }
  // demais tipos permitidos: sem checagem estrita (evita falso negativo legítimo)
  return true;
}

// Checagem de conteúdo HTML/SVG/XML nos primeiros bytes (XSS stored).
function sniffDangerousText(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 4096).toString("latin1").toLowerCase();
  return (
    head.includes("<!doctype html") ||
    head.includes("<html") ||
    head.includes("<svg") ||
    head.includes("<script") ||
    head.includes("<iframe") ||
    head.includes("<?xml") ||
    head.includes("<img")
  );
}

function validateUploadBuffer(buffer: Buffer, filename: string): { ok: boolean; error?: string } {
  const ext = fileExtOf(filename);
  if (!ext) return { ok: false, error: "Arquivo sem extensão não é permitido." };
  if (BLOCKED_UPLOAD_EXT.test(ext)) return { ok: false, error: `Arquivos ${ext} não são permitidos.` };
  if (!ALLOWED_UPLOAD_EXT.test(ext)) return { ok: false, error: "Tipo de arquivo não suportado." };
  if (sniffDangerousText(buffer)) return { ok: false, error: "Conteúdo não permitido (HTML/SVG/XML detectado)." };
  if (!magicMatches(ext, buffer)) return { ok: false, error: "O conteúdo do arquivo não corresponde à extensão informada." };
  return { ok: true };
}

// Configure Multer for memory storage (for large file & video uploads)
const uploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024, files: 1, fields: 8, parts: 9, fieldSize: 20000, fieldNameSize: 100 }, // Up to 200 MB
  fileFilter: (req: any, file: any, cb: any) => {
    const ext = fileExtOf(file.originalname || "");
    if (!ext || BLOCKED_UPLOAD_EXT.test(ext) || !ALLOWED_UPLOAD_EXT.test(ext)) {
      return cb(null, false); // vira "Nenhum arquivo" -> 400 na rota
    }
    cb(null, true);
  }
});

// Allowlist de pastas de destino no Storage ‐ nunca aceita pastas arbitrárias do cliente
const ALLOWED_UPLOAD_FOLDERS = new Set([
  "geral",
  "banners",
  "materiais",
  "institucional",
  "professores",
  "cursos",
  "cursos/videos",
  "paginas",
  "videos",
  "fenix_social",
  "suporte-anexos"
]);

function sanitizeUploadFolder(raw: unknown, fallback = "geral"): string | null {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  const folder = raw.replace(/^\/+|\/+$/g, "").replace(/\\/g, "/");
  if (folder.length > 60 || folder.includes("..") || !ALLOWED_UPLOAD_FOLDERS.has(folder)) {
    return null;
  }
  return folder;
}



// Secret for signing JWT access tokens (must come from environment)
const envJWTSecret = process.env.JWT_SECRET;
let JWT_SECRET: string;
if (envJWTSecret) {
  JWT_SECRET = envJWTSecret;
} else if (process.env.NODE_ENV === "production") {
  console.error("JWT_SECRET não definido. Abortando inicialização em produção.");
  process.exit(1);
} else {
  JWT_SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("[Aviso] JWT_SECRET não definido. Gerado valor aleatório (sessões serão invalidadas no próximo boot).");
}

async function lookupIdentity(code: string): Promise<Identity | null> {
  if (/^\d{4,6}$/.test(code)) {
    const di = await dbService.validateDICode(code);
    return di.valid ? { code, role: "user", name: di.name || code, version: "di-v2" } : null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(code)) return null;
  const trusted = getSupabaseTrustedClient();
  if (!trusted) throw new Error("Autenticação indisponível.");
  const { data, error } = await trusted.auth.admin.getUserById(code);
  if (error) { if (error.status === 404) return null; throw error; }
  const account = data?.user;
  if (!account || ((account as any).banned_until && Date.parse((account as any).banned_until) > Date.now())) return null;
  const version = account.updated_at || account.created_at;
  if (account.app_metadata?.role === "admin") return { code, role: "admin", name: "Administrador Fênix", version };
  const { data: cfg, error: cfgError } = await trusted.from("config").select("value").eq("key", "supportUsers").maybeSingle();
  if (cfgError) throw cfgError;
  const staff = Array.isArray(cfg?.value) ? cfg.value.find((u: any) => u.email?.toLowerCase() === account.email?.toLowerCase()) : null;
  if (!staff?.ativo) return null;
  return { code, role: "support", name: staff.nome || "Suporte Fênix", version: `${version}:${staff.sessionVersion || "legacy"}`,
    mustChangePassword: staff.mustChangePassword === true };
}
const sessions = new SessionService(JWT_SECRET, lookupIdentity);
function setSessionCookies(res: any, tokens: { access: string; refresh: string }) {
  const options = { httpOnly: true, secure: isProduction, sameSite: "strict" as const, path: "/" };
  res.cookie("access_token", tokens.access, { ...options, maxAge: 15 * 60 * 1000 });
  res.cookie("refresh_token", tokens.refresh, { ...options, maxAge: 7 * 86400000 });
}
function clearSessionCookies(res: any) {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });
}
function publicIdentity(identity: Identity) {
  const { version, ...user } = identity;
  return user;
}
async function resolveUser(req: any, res: any): Promise<Identity | null> {
  if (req.authResolved) return req.user || null;
  req.authResolved = true;
  const user = await sessions.authenticate(req.cookies?.access_token);
  if (user) return (req.user = user);
  const renewed = await sessions.refresh(req.cookies?.refresh_token);
  if (renewed) {
    setSessionCookies(res, renewed);
    return (req.user = renewed.identity);
  }
  if (req.cookies?.access_token || req.cookies?.refresh_token) clearSessionCookies(res);
  return null;
}

app.use("/api", globalApiRateLimiter);

// Middlewares
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Standard lightweight Cookie Parser Middleware
app.use((req: any, res, next) => {
  const cookieHeader = req.headers.cookie || "";
  const cookies: { [key: string]: string } = {};
  cookieHeader.split(";").forEach((cookie: string) => {
    const [name, ...rest] = cookie.split("=");
    if (name) {
      cookies[name.trim()] = rest.join("=").trim();
    }
  });
  req.cookies = cookies;
  next();
});

// Serve uploaded files statically
// Serve apenas assets estáticos do app (public/uploads: fallbacks de imagem
// referenciados em código). Uploads dinâmicos ficam 100% no Supabase Storage.
// Materiais privados nunca são servidos anonimamente por aqui.
const privateUploadsCache = new Map<string, { time: number; isPrivate: boolean }>();
app.use("/uploads", asyncHandler(async (req: any, res, next) => {
  const name = (req.path || "").replace(/^\/+/, "");
  if (!name) return next();
  const cached = privateUploadsCache.get(name);
  let isPrivate = false;
  if (cached && Date.now() - cached.time < 15_000) {
    isPrivate = cached.isPrivate;
  } else {
    try {
      const mats = (await dbService.getData(undefined, true)).materiais;
      isPrivate = mats.some((m: any) => !m.isPublic && m.fileUrl === `/uploads/${name}`);
    } catch {
      return res.status(503).end();
    }
    privateUploadsCache.set(name, { time: Date.now(), isPrivate });
    if (privateUploadsCache.size > 500) privateUploadsCache.clear();
  }
  if (!isPrivate) return next();
  if (await isMaterialMediaAllowed(req, res)) return next();
  return res.status(404).end();
}));
app.use("/uploads", express.static(path.join(process.cwd(), "public/uploads")));

// Apply Global Rate Limiter to all API endpoints


// Qualquer escrita em /api/admin invalida o cache das respostas públicas.
app.use("/api/admin", (req: any, res: any, next: any) => {
  if (req.method !== "GET") {
    invalidatePublicApiCache();
    res.on('finish', invalidatePublicApiCache);
  }
  next();
});

app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "Origem não permitida." }); }
    catch { return res.status(403).json({ error: "Origem inválida." }); }
  }
  if (req.headers["sec-fetch-site"] === "cross-site") return res.status(403).json({ error: "Origem não permitida." });
  next();
});

// ---------------- HOST-BASED ISOLATION (SUBDOM�?NIO DO ADMIN) ----------------
// A área administrativa só existe em um host próprio (ex.: adminfenix.grupofenix.com).
// No host PRINCIPAL: /api/admin/* => 403 e /adminfenix => 404 (área invisível ao site).
// No host DO ADMIN (subdomínio): somente as rotas de API usadas pelo painel
// (/api/auth*, /api/admin/*, /api/content/*, /api/fenix-social/*, /api/vimeo/*,
// /api/storage/*, /api/download-status-md) existem; qualquer outro /api/* => 403.
// A raiz "/" serve a SPA (o frontend detecta o host e abre o painel de login automaticamente).
const ADMIN_HOST_PREFIX = (process.env.ADMIN_HOST_PREFIX || "adminfenix.").toLowerCase();
const ADMIN_HOSTS = (process.env.ADMIN_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const SUPPORT_HOST_PREFIX = (process.env.SUPPORT_HOST_PREFIX || "suporte.").toLowerCase();
const SUPPORT_HOSTS = (process.env.SUPPORT_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function getRequestHost(req: any): string {
  // X-Forwarded-Host só é confiável quando o trust proxy está ativo (número de
  // proxies definido). Sem isso, o header é controlado pelo cliente e não pode
  // liberar o host administrativo ‐ usa-se apenas o header Host do request.
  if (trustProxySetting) {
    const fwd = req.headers["x-forwarded-host"];
    if (typeof fwd === "string" && fwd.trim()) return String(fwd).split(",")[0].split(":")[0].trim().toLowerCase();
  }
  const raw = req.headers.host || "";
  return String(raw).split(":")[0].toLowerCase();
}

// Domínio público do site (ex.: "grupofenix.com"). Quando definido, os hosts de
// admin/suporte devem TERMINAR nele (ex.: "adminfenix.grupofenix.com") ‐ impede
// que um Host arbitrário inventado ("adminfenix.qualquercoisa") abra a área.
const APP_BASE_DOMAIN = (process.env.PUBLIC_BASE_DOMAIN || "").trim().toLowerCase().replace(/^\.+/, "");

function isAdminHost(req: any): boolean {
  const host = getRequestHost(req);
  if (!host || host.includes("..") || /\s/.test(host)) return false;
  if (ADMIN_HOSTS.includes(host)) return true;
  const prefix = ADMIN_HOST_PREFIX.replace(/\.$/, "");
  if (host === prefix) return true;
  if (host.startsWith(ADMIN_HOST_PREFIX)) {
    if (APP_BASE_DOMAIN && !host.endsWith("." + APP_BASE_DOMAIN)) return false;
    return true;
  }
  return false;
}

function isSupportHost(req: any): boolean {
  const host = getRequestHost(req);
  if (!host || host.includes("..") || /\s/.test(host)) return false;
  if (SUPPORT_HOSTS.includes(host)) return true;
  const prefix = SUPPORT_HOST_PREFIX.replace(/\.$/, "");
  if (host === prefix) return true;
  if (host.startsWith(SUPPORT_HOST_PREFIX)) {
    if (APP_BASE_DOMAIN && !host.endsWith("." + APP_BASE_DOMAIN)) return false;
    return true;
  }
  return false;
}

const ADMIN_API_WHITELIST = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/download-status-md"
];

function isAdminApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api/admin/")) return true;
  if (pathname.startsWith("/api/content/")) return true;
  if (pathname.startsWith("/api/moderacao")) return true;
  if (pathname.startsWith("/api/fenix-social/")) return true;
  if (pathname.startsWith("/api/vimeo/")) return true;
  if (pathname.startsWith("/api/storage/")) return true;
  return ADMIN_API_WHITELIST.some((w) => pathname.startsWith(w));
}

function isSupportApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api/support/")) return true;
  if (pathname.startsWith("/api/content/")) return true;
  return ADMIN_API_WHITELIST.some((w) => pathname.startsWith(w));
}

app.use((req: any, res: any, next: any) => {
  const pathname = (req.path || "/").split("?")[0];

  if (isSupportHost(req)) {
    // Subdomínio do suporte: só existe a API whitelist do suporte; o resto não existe.
    if (pathname.startsWith("/api/") && !isSupportApiPath(pathname)) {
      return res.status(403).json({ error: "Rota não disponível neste host." });
    }
    return next();
  }

  if (isAdminHost(req)) {
    // Subdomínio do admin: só existe API white-listed; o resto é "não existe".
    if (pathname.startsWith("/api/") && !isAdminApiPath(pathname)) {
      return res.status(403).json({ error: "Rota não disponível neste host." });
    }
    return next();
  }

  // Host principal (site público): área administrativa é invisível/inexistente.
  // Qualquer URL digitada que não seja uma página existente vai para a página inicial.
  if (pathname === "/adminfenix") {
    return res.redirect(302, "/");
  }
  if (pathname.startsWith("/api/admin")) {
    return res.status(403).json({ error: "Acesso restrito." });
  }
  // /api/support/* é liberado no host público porque o D.I. usa o suporte dentro do
  // site (página /suporte, login D.I.); cada rota valida autenticação e propriedade.
  return next();
});

// ---------------- VALIDAÆÂO DE URLS (SPA) ----------------
// Qualquer URL digitada sem ser uma página existente é redirecionada para a
// página inicial ("/"). Assets, API e uploads passam direto.
const PUBLIC_VALID_PATHS = new Set([
  "/",
  "/inicio",
  "/grupo-fenix",
  "/fenix-social",
  "/tecnologias",
  "/escola-fenix",
  "/conteudos",
  "/materiais",
  "/suporte",
  "/elite-milionario",
  "/elite-milionaria",
  "/moderacao-fenix",
  "/moderacao-fenix-x9k2"
]);

app.use((req: any, res: any, next: any) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const pathname = (req.path || "/").split("?")[0];

  // Nunca redirecionar: API, uploads, assets, módulos do Vite e file paths.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/uploads") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/node_modules") ||
    pathname === "/favicon.ico" ||
    pathname === "/vite.svg" ||
    pathname.includes(".")
  ) {
    return next();
  }

  const valid = isAdminHost(req) || isSupportHost(req)
    ? pathname === "/"
    : PUBLIC_VALID_PATHS.has(pathname.replace(/\/+$/, "") || "/");

  if (!valid) {
    return res.redirect(302, "/");
  }
  return next();
});

// Every protected request revalidates the identity and current permissions.
async function authenticateUser(req: any, res: any, next: () => void) {
  const user = await resolveUser(req, res);
  if (!user) return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
  if (user.mustChangePassword && !["/api/auth/me", "/api/auth/logout", "/api/support/change-password"].includes(req.path)) {
    return res.status(403).json({ error: "Defina sua própria senha para continuar.", mustChangePassword: true });
  }
  next();
}
async function optionalAuthenticateUser(req: any, res: any, next: () => void) {
  await resolveUser(req, res);
  next();
}
async function requireAdmin(req: any, res: any, next: () => void) {
  return authenticateUser(req, res, () => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Acesso restrito apenas para administradores." });
    next();
  });
}
async function requireSupportOrAdmin(req: any, res: any, next: () => void) {
  return authenticateUser(req, res, () => {
    if (!["support", "admin"].includes(req.user.role)) return res.status(403).json({ error: "Acesso restrito apenas para o suporte." });
    next();
  });
}

// ---------------- API ENDPOINTS ----------------

// Download status MD endpoint
app.get("/api/download-status-md", (req, res) => {
  const filePath = path.join(process.cwd(), "public/estado_plataforma.md");
  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="estado_plataforma_fenix.md"');
    return res.sendFile(filePath);
  }
  return res.status(404).json({ error: "Arquivo de estado não encontrado." });
});

// 1. Auth Endpoint
app.post("/api/auth/login", loginRateLimiter, asyncHandler(async (req, res) => {
  if (!validLoginBody(req.body)) return res.status(400).json({ error: "Informe um código D.I. de 4 a 6 dígitos ou e-mail e senha válidos." });
  const { code, email, password } = req.body;
  let identity: Identity | null = null;
  if (code) {
    identity = await lookupIdentity(code);
  } else {
    // One auth client per login: never mutate the shared public Supabase client.
    const client = getSupabaseClient();
    if (!client) throw new Error("Autenticação indisponível.");
    const { data, error } = await client.auth.signInWithPassword({ email: email!, password: password! });
    if (!error && data.user) identity = await lookupIdentity(data.user.id);
  }
  if (!identity) {
    return res.status(401).json({ error: "Credenciais inválidas ou acesso não permitido." });
  }
  try {
    setSessionCookies(res, await sessions.create(identity));
  } catch (error) {
    if (error instanceof DuplicateDISessionError) return res.status(409).json({ error: error.message });
    throw error;
  }
  dbService.recordAuditLog(identity.code, code ? "LOGIN_RESTRITO_DI" : "LOGIN_SISTEMA", "Acesso autenticado ao sistema.").catch(() => {});
  if (identity.role === 'user') void recordMetric({ kind: 'login', actor: identity.code });
  res.json({ success: true, user: publicIdentity(identity) });
}));
app.post("/api/auth/logout", (req: any, res) => {
  sessions.logout(req.cookies?.access_token, req.cookies?.refresh_token);
  clearSessionCookies(res);
  res.json({ success: true, message: "Sessão encerrada com sucesso." });
});
app.get("/api/auth/me", asyncHandler(async (req: any, res) => {
  const user = await resolveUser(req, res);
  res.json(user ? { loggedIn: true, user: publicIdentity(user) } : { loggedIn: false });
}));

// 2. Fetch Public Content & Teaser Data
app.post('/api/content/client-error', asyncHandler(authenticateUser), (req, res) => {
  const { code, area } = req.body || {};
  if (!['JAVASCRIPT_ERROR','UNHANDLED_PROMISE'].includes(code) || !['Administração','Suporte','Site'].includes(area)) {
    return res.status(400).end();
  }
  reportSystemError('Navegador', code, `Falha de execução relatada pelo navegador na área: ${area}.`, area);
  res.status(204).end();
});

app.get("/api/content/public", asyncHandler(async (req, res) => {
  try {
    const homeOnly = req.query.scope === 'home';
    const data = await cacheJsonResponse(homeOnly ? "content/home" : "content/public", 300000, async () => {
      const dbData = await dbService.getData(undefined, true, homeOnly ? 'home' : 'public');
      const categorias = dbData.categoriasMateriais;
      return JSON.stringify({
      leaderBio: dbData.leaderBio,
      novidades: dbData.novidades,
      cursos: dbData.cursos.map((c) => ({
        id: c.id,
        titulo: c.titulo,
        descricao: c.descricao,
        categoria: c.categoria,
        nivel: c.nivel,
        imagem: courseCoverPath(c.id),
        duracao: c.duracao,
        moduloCount: c.modulos.length,
        professorNome: c.professorNome,
        professorEspecialidade: c.professorEspecialidade,
        professorBio: c.professorBio,
        professorFoto: c.professorFoto,
        createdAt: c.createdAt,
        secao: c.secao || "cursos"
      })),
      materiais: dbData.materiais.map((m) => ({
        id: m.id,
        titulo: m.titulo,
        tipo: m.tipo,
        categoria: m.categoria,
        thumbnail: m.thumbnail,
        downloads: m.downloads,
        isPublic: m.isPublic,
        createdAt: m.createdAt
      })),
      banners: dbData.banners || [],
      tecnologias: dbData.tecnologias || [],
      categoriasMateriais: categorias,
      logoUrl: dbData.logoUrl,
      hiddenHomeCardIds: dbData.hiddenHomeCardIds || [],
      ...(homeOnly ? {} : {
        paginaTecnologias: dbData.paginaTecnologias || [],
        paginaElite: dbData.paginaElite || [],
        paginaBiografia: dbData.paginaBiografia || []
      })
      });
    });
    res.type("application/json").send(data);
  } catch (err: any) {
    console.error("Erro ao carregar conteúdo público:", err);
    res.status(500).json({ error: "Falha ao processar requisição." });
  }
}));

// 3. Fetch Restricted Content (Exige Login)
app.get('/api/content/page/:page', asyncHandler(async (req, res) => {
  const keys: Record<string, string> = { tecnologias: 'paginaTecnologias', elite: 'paginaElite', biografia: 'paginaBiografia' };
  const key = Object.hasOwn(keys, req.params.page) ? keys[req.params.page] : undefined;
  if (!key) return res.status(404).end();
  const data = await cacheJsonResponse(`page/${key}`, 300000, async () => {
    const client = getSupabaseTrustedClient();
    if (!client) throw new Error('Conteúdo indisponível.');
    const { data, error } = await client.from('config').select('value').eq('key', key)
      .abortSignal(AbortSignal.timeout(8000)).maybeSingle();
    if (error) throw error;
    return JSON.stringify({ blocos: Array.isArray(data?.value) ? data.value : [] });
  });
  res.type('application/json').send(data);
}));

app.get("/api/content/restricted", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const dbData = await dbService.getData(req.user?.supabaseToken, true);
    const categorias = dbData.categoriasMateriais;
    res.json({
      cursos: dbData.cursos.map(c => ({ ...c, imagem: courseCoverPath(c.id) })),
      materiais: dbData.materiais,
      categoriasMateriais: categorias,
      logoUrl: dbData.logoUrl
    });
  } catch (err: any) {
    console.error("Erro ao carregar conteúdo restrito:", err);
    res.status(500).json({ error: "Falha ao processar requisição." });
  }
}));

// 4. Download Material Increment & Endpoint
app.get('/api/content/course-cover/:id', asyncHandler(async (req, res) => {
  try {
    const image = await cacheJsonResponse(`cover/${req.params.id}`, 60000, async () => {
      const client = getSupabaseTrustedClient();
      if (!client) throw Object.assign(new Error('Storage indisponível.'), { coverStatus: 503 });
      const { data, error } = await client.from('cursos').select('modulos').eq('id', req.params.id)
        .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      if (error) throw Object.assign(new Error('Conteúdo indisponível.'), { coverStatus: 503 });
      const video = data && firstVimeoVideo(data.modulos);
      if (!video) throw Object.assign(new Error('Capa não encontrada.'), { coverStatus: 404 });
      const config = await dbService.getVimeoConfig();
      return currentVimeoCover(video, config.accessToken?.trim() || '');
    });
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.redirect(302, image);
  } catch (error) {
    if ((error as any)?.coverStatus) return res.status((error as any).coverStatus).end();
    reportSystemError('Vimeo', 'COVER_FAILED', 'Não foi possível obter uma capa de curso ou treinamento no Vimeo.');
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).end();
  }
}));

// Entrega o arquivo real do material (Supabase Storage) apenas para sessão
// válida, enviada pelo cliente em cookie httpOnly. MIME determinada no servidor; o
// download é sempre attachment.
app.post("/api/content/download/:id", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const material = await dbService.getMaterialById(id, req.user?.supabaseToken);
    if (!material || !material.fileUrl) {
      return res.status(404).json({ error: "Material não encontrado." });
    }
    res.once('finish', () => {
      if (res.statusCode === 200 && req.user?.role === 'user') {
        void recordMetric({ kind: 'download', actor: req.user.code, entity_id: id, detail: { title: material.titulo } });
      }
    });

    const safeTitulo = String(material.titulo || "material").replace(/[\r\n"]/g, "_");
    const fileUrl = material.fileUrl;

    try {
      if (fileUrl.startsWith("/api/storage/") && (fileUrl.includes("/preview/") || fileUrl.includes("/stream/"))) {
        const objectKey = decodeURIComponent(fileUrl.replace(/^\/api\/storage\/(preview|stream)\//, ""));
        if (!objectKey) {
          return res.status(404).json({ error: "Arquivo não encontrado." });
        }
        const client = getActiveStorageClient();
        const stat = await client.statObject(STORAGE_BUCKET, objectKey);
        const ext = fileExtOf(objectKey);
        const mime = EXT_TO_MIME[ext] || "application/octet-stream";
        const filename = `${safeTitulo}${ext || ""}`;
        res.setHeader("Content-Type", mime);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", String(stat.size));
        const stream = await client.getObject(STORAGE_BUCKET, objectKey, mediaAbortSignal(res));
        pipeMedia(stream, res);
      } else {
        return res.status(400).json({ error: "Material sem arquivo válido." });
      }
    } catch (err) {
      return res.status(404).json({ error: "Arquivo não encontrado." });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Falha ao processar download." });
  }
}));

// 4.1 Admin Material Categories Endpoint
app.post("/api/admin/categorias-materiais", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { categorias } = req.body;
    if (!categorias || !Array.isArray(categorias)) {
      return res.status(400).json({ error: "Lista de categorias inválida." });
    }
    await dbService.saveCategoriasMateriais(categorias, req.user.role, req.user?.supabaseToken);
    const updatedCats = await dbService.getCategoriasMateriais(req.user?.supabaseToken);
    res.json({ success: true, categorias: updatedCats });
  } catch (err: any) {
    res.status(500).json({ error: "Falha ao salvar categorias." });
  }
}));

// ---------------- ADMIN CRUD ENDPOINTS ----------------

// Banners da página inicial CRUD
app.post("/api/admin/banners", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const {
      id,
      titulo,
      descricao,
      imagem,
      corTitulo,
      corDescricao,
      botoesAtivos,
      btn1Texto,
      btn1Tipo,
      btn1Destino,
      btn2Texto,
      btn2Tipo,
      btn2Destino,
      ordem
    } = req.body;

    if (!titulo || !descricao || !imagem) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes: Título, Descrição e Imagem." });
    }

    const item: Banner = {
      id: id || `b-${Date.now()}`,
      titulo: cleanText(titulo),
      descricao: cleanText(descricao),
      imagem: safeLinkTarget(imagem),
      corTitulo: cleanText(corTitulo) || "#ffffff",
      corDescricao: cleanText(corDescricao) || "#ffffff",
      botoesAtivos: !!botoesAtivos,
      btn1Texto: cleanText(btn1Texto),
      btn1Tipo: btn1Tipo || "nenhum",
      btn1Destino: safeLinkTarget(btn1Destino),
      btn2Texto: cleanText(btn2Texto),
      btn2Tipo: btn2Tipo || "nenhum",
      btn2Destino: safeLinkTarget(btn2Destino),
      ordem: ordem !== undefined ? Number(ordem) : 1,
      createdAt: new Date().toISOString()
    };

    await dbService.saveBanner(item, req.user.role, req.user?.supabaseToken);
    res.json({ success: true, item });
  } catch (err: any) {
    console.error("Erro ao salvar banner:", err);
    res.status(500).json({ error: "Erro ao salvar banner." });
  }
}));

app.delete("/api/admin/banners/:id", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    let item: Banner | undefined;
    try {
      item = (await dbService.getBanners(req.user?.supabaseToken)).find((b: Banner) => b.id === id);
    } catch {}
    await dbService.deleteBanner(id, req.user.role, req.user?.supabaseToken);
    let midias = { removidas: 0, mantidas: 0 };
    if (item) {
      const chaves = collectMediaKeys(item);
      if (chaves.length > 0) {
        const r = await removeOrphanMedia(chaves, geradoPor);
        midias = { removidas: r.removidas.length, mantidas: r.mantidas.length };
      }
    }
    res.json({
      success: true,
      message: "Banner removido.",
      midias
    });
  } catch (err: any) {
    console.error("Erro ao deletar banner:", err);
    res.status(500).json({ error: "Erro ao deletar banner." });
  }
}));

// Hidden Home Cards Admin Route
app.post("/api/admin/hidden-home-cards", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { hiddenHomeCardIds } = req.body;
    if (!Array.isArray(hiddenHomeCardIds)) {
      return res.status(400).json({ error: "Parâmetro hiddenHomeCardIds deve ser uma lista de IDs." });
    }
    const updated = await dbService.saveHiddenHomeCardIds(hiddenHomeCardIds, req.user?.role || "admin");
    res.json({ success: true, hiddenHomeCardIds: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao salvar cards ocultos da tela inicial." });
  }
}));

// 5. Novidades CRUD
app.post("/api/admin/novidades", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id, titulo, descricao, categoria, imagem, isPremium, isFeatured, linkType, linkTarget } = req.body;
    if (!titulo || !descricao || !categoria) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes." });
    }

    const item: Novidade = {
      id: id || `n-${Date.now()}`,
      titulo: cleanText(titulo),
      descricao: cleanText(descricao),
      categoria: cleanText(categoria),
      imagem: safeLinkTarget(imagem),
      isPremium: !!isPremium,
      isFeatured: !!isFeatured,
      createdAt: new Date().toISOString(),
      linkType: linkType || "nenhum",
      linkTarget: safeLinkTarget(linkTarget)
    };

    await dbService.saveNovidade(item, req.user.role, req.user?.supabaseToken);
    res.json({ success: true, item });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao salvar novidade." });
  }
}));

app.delete("/api/admin/novidades/:id", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    let item: Novidade | undefined;
    try {
      item = (await dbService.getNovidades(req.user?.supabaseToken)).find((n: Novidade) => n.id === id);
    } catch {}
    await dbService.deleteNovidade(id, req.user.role, req.user?.supabaseToken);
    let midias = { removidas: 0, mantidas: 0 };
    if (item) {
      const chaves = collectMediaKeys(item);
      if (chaves.length > 0) {
        const r = await removeOrphanMedia(chaves, geradoPor);
        midias = { removidas: r.removidas.length, mantidas: r.mantidas.length };
      }
    }
    res.json({
      success: true,
      message: "Novidade removida.",
      midias
    });
  } catch (err: any) {
    console.error("Erro ao remover novidade:", err);
    res.status(500).json({ error: "Erro ao remover novidade." });
  }
}));

// 6. Cursos CRUD
app.post("/api/admin/cursos", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id, titulo, descricao, categoria, nivel, imagem, duracao, modulos, professorNome, professorEspecialidade, professorBio, professorFoto, secao, createdAt } = req.body;
    if (!titulo || !descricao || !categoria || !imagem) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes." });
    }

    // Regra 13/08: vídeos de aulas são EXCLUSIVAMENTE do Vimeo (via API Node).
    // Rejeita youtube/URL/upload legado e exige videoId/hash válidos.
    const rawModulos = Array.isArray(modulos) ? modulos : [];
    const allAulas = rawModulos.flatMap((m: any) => (Array.isArray(m?.aulas) ? m.aulas : []));
    if (allAulas.length === 0) {
      return res.status(400).json({ error: "Adicione pelo menos um vídeo do Vimeo ao conteúdo." });
    }
    for (const a of allAulas) {
      const tv = a?.tipoVideo || "";
      const vu = (a?.videoUrl || "").toString().toLowerCase();
      if (tv !== "vimeo") {
        return res.status(400).json({ error: `Vídeo "${a?.titulo || "sem título"}": só é permitido vincular vídeos do Vimeo.` });
      }
      if (vu.includes("youtube.com") || vu.includes("youtu.be") || vu.includes("www.youtube")) {
        return res.status(400).json({ error: `Vídeo "${a?.titulo || "sem título"}": links do YouTube não são permitidos.` });
      }
      if (!a?.videoId || !a?.videoUrl) {
        return res.status(400).json({ error: `Vídeo "${a?.titulo || "sem título"}": selecione um vídeo válido da sua conta Vimeo.` });
      }
    }
    const sanitizedModulos = rawModulos.map((m: any) => ({
      id: m?.id || `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      titulo: cleanText(m?.titulo) || "Módulo 1",
      aulas: (Array.isArray(m?.aulas) ? m.aulas : []).map((a: any) => ({
        id: a?.id || `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        titulo: cleanText(a?.titulo) || "Aula",
        duracao: cleanText(a?.duracao),
        tipoVideo: "vimeo" as const,
        videoUrl: safeLinkTarget(a?.videoUrl),
        videoId: cleanText(a?.videoId),
        videoHash: cleanText(a?.videoHash),
        thumbnail: safeLinkTarget(a?.thumbnail)
      }))
    }));

    const courseId = id || `c-${Date.now()}`;
    const item: Curso = {
      id: courseId,
      titulo: cleanText(titulo),
      descricao: cleanText(descricao),
      categoria: cleanText(categoria),
      nivel: cleanText(nivel) || "Iniciante",
      imagem: courseCoverPath(courseId),
      duracao: cleanText(duracao) || "0h",
      modulos: sanitizedModulos,
      professorNome: cleanText(professorNome),
      professorEspecialidade: cleanText(professorEspecialidade),
      professorBio: cleanText(professorBio),
      professorFoto: safeLinkTarget(professorFoto),
createdAt: createdAt || new Date().toISOString(),
      secao: (secao === "series" || secao === "treinamentos" ? "treinamentos" : "cursos") as Curso["secao"]
    };

    await dbService.saveCurso(item, req.user.role, req.user?.supabaseToken);
    res.json({ success: true, item });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao salvar curso." });
  }
}));

app.delete("/api/admin/cursos/:id", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    let item: Curso | undefined;
    try {
      item = (await dbService.getCursos(req.user?.supabaseToken)).find((c: Curso) => c.id === id);
    } catch {}
    await dbService.deleteCurso(id, req.user.role, req.user?.supabaseToken);
    let midias = { removidas: 0, mantidas: 0 };
    if (item) {
      const chaves = collectMediaKeys(item);
      if (chaves.length > 0) {
        const r = await removeOrphanMedia(chaves, geradoPor);
        midias = { removidas: r.removidas.length, mantidas: r.mantidas.length };
      }
    }
    res.json({
      success: true,
      message: "Curso removido.",
      midias
    });
  } catch (err: any) {
    console.error("Erro ao remover curso:", err);
    res.status(500).json({ error: "Erro ao remover curso." });
  }
}));

// 7. Materiais CRUD
// fileUrl de materiais é servido como link de download ‐ aceita SOMENTE caminhos
// do próprio site (Supabase Storage). URLs externas (http/data:/javascript:) são rejeitadas.
function isSafeMaterialFileUrl(value: string): boolean {
  return (
    typeof value === "string" &&
    value.startsWith("/api/storage/")
  );
}

app.post("/api/admin/materiais", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id, titulo, tipo, categoria, thumbnail, fileUrl, isPublic } = req.body;
    if (!titulo || !tipo || !categoria || !thumbnail || !fileUrl) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes." });
    }
    if (!isSafeMaterialFileUrl(fileUrl)) {
      return res.status(400).json({ error: "URL do arquivo inválida. Use o upload do painel (link interno do site)." });
    }

    const materiais = await dbService.getMateriais(req.user?.supabaseToken);
    const existing = materiais.find((m) => m.id === id);
    const item: Material = {
      id: id || `m-mat-${Date.now()}`,
      titulo: cleanText(titulo),
      tipo: cleanText(tipo) as Material["tipo"],
      categoria: cleanText(categoria),
      thumbnail: safeLinkTarget(thumbnail),
      fileUrl,
      downloads: existing ? existing.downloads : 0,
      isPublic: !!isPublic,
      createdAt: new Date().toISOString()
    };

    await dbService.saveMaterial(item, req.user.role, req.user?.supabaseToken);
    res.json({ success: true, item });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao salvar material." });
  }
}));

app.delete("/api/admin/materiais/:id", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    let item: Material | undefined;
    try {
      item = (await dbService.getMateriais(req.user?.supabaseToken)).find((m: Material) => m.id === id);
    } catch {}
    await dbService.deleteMaterial(id, req.user.role, req.user?.supabaseToken);
    let midias = { removidas: 0, mantidas: 0 };
    if (item) {
      const chaves = collectMediaKeys(item);
      if (chaves.length > 0) {
        const r = await removeOrphanMedia(chaves, geradoPor);
        midias = { removidas: r.removidas.length, mantidas: r.mantidas.length };
      }
    }
    res.json({
      success: true,
      message: "Material removido.",
      midias
    });
  } catch (err: any) {
    console.error("Erro ao remover material:", err);
    res.status(500).json({ error: "Erro ao remover material." });
  }
}));

// 8. Leader Bio Update
app.post("/api/admin/leader-bio", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const rawBio: LeaderBio = req.body || {};
    if (!rawBio.nome || !rawBio.cargo || !rawBio.bio) {
      return res.status(400).json({ error: "Campos obrigatórios de Bio ausentes." });
    }

    const bioData: LeaderBio = {
      ...rawBio,
      nome: cleanText(rawBio.nome),
      cargo: cleanText(rawBio.cargo),
      bio: cleanText(rawBio.bio),
      foto: safeLinkTarget(rawBio.foto),
      localizacao: cleanText(rawBio.localizacao),
      experiencia: cleanText(rawBio.experiencia),
      impacto: cleanText(rawBio.impacto),
      citacao: cleanText(rawBio.citacao),
      historia: Array.isArray(rawBio.historia) ? rawBio.historia.map((h) => cleanText(h)) : [],
      valores: sanitizeArrayOfObjects(
        Array.isArray(rawBio.valores) ? rawBio.valores : [],
        ["titulo", "descricao"],
        ["icone"]
      ),
      timeline: sanitizeArrayOfObjects(
        Array.isArray(rawBio.timeline) ? rawBio.timeline : [],
        ["ano", "titulo", "descricao"]
      )
    };

    await dbService.updateLeaderBio(bioData, req.user.role, req.user?.supabaseToken);
    res.json({ success: true, leaderBio: bioData });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao atualizar Bio." });
  }
}));

// 8.1. Tecnologias Update
app.post("/api/admin/tecnologias", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { tecnologias } = req.body;
    if (!Array.isArray(tecnologias)) {
      return res.status(400).json({ error: "Lista de tecnologias inválida." });
    }

    const cleanTecnologias = sanitizeArrayOfObjects(
      tecnologias,
      ["titulo", "subtitulo", "categoria", "descricao", "destaque", "patente"],
      ["imagem", "logoUrl"]
    );
    await dbService.updateTecnologias(cleanTecnologias, req.user.role, req.user?.supabaseToken);
    res.json({ success: true, tecnologias: cleanTecnologias });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao atualizar Tecnologias." });
  }
}));

// 8.1.1. Páginas institucionais editáveis (Grupo Fênix / Tecnologias / Elite Milionária)
app.post("/api/admin/paginas", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
const { chave, blocos } = req.body;
    if (chave !== "paginaTecnologias" && chave !== "paginaElite" && chave !== "paginaBiografia") {
      return res.status(400).json({ error: "Chave de página inválida." });
    }
    if (!Array.isArray(blocos)) {
      return res.status(400).json({ error: "Lista de blocos inválida." });
    }

    const cleanBlocos = sanitizeArrayOfObjects(
      blocos,
      ["badge", "eyebrow", "titulo", "tituloDestaque", "destaqueTitulo", "destaqueTexto", "imagemAlt", "legenda", "botaoTexto", "notaTexto", "icone"],
      ["badgeImagem", "imagem"]
    );
const cleanBlocosFinal = cleanBlocos.map((bloco: any) => ({
      ...bloco,
      campos: bloco.campos ? {
        ...bloco.campos,
        textos: Array.isArray(bloco.campos.textos) ? bloco.campos.textos.map((t: unknown) => cleanText(t)) : bloco.campos.textos,
        itens: Array.isArray(bloco.campos.itens) ? bloco.campos.itens.map((t: unknown) => cleanText(t)) : bloco.campos.itens,
        faq: Array.isArray(bloco.campos.faq) ? bloco.campos.faq.map((f: any) => ({ ...f, q: cleanText(f?.q), a: cleanText(f?.a) })) : bloco.campos.faq
      } : bloco.campos
    }));
    const responsavel = req.user?.name || req.user?.code || req.user?.role || "admin";
    await dbService.savePagina(chave, cleanBlocosFinal, responsavel, req.user?.supabaseToken);
    res.json({ success: true, pagina: cleanBlocosFinal });
  } catch (err: any) {
    console.error("Erro ao salvar página:", err);
    res.status(500).json({ error: "Erro ao salvar página." });
  }
}));

// 8.1. Logo Upload & Reset
// Segurança: somente PNG REAL (data URI image/png + magic bytes). SVG (mesmo com
// type "image/svg+xml") carrega <script> executável no contexto do site ‐ rejeitado.
app.post("/api/admin/logo", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  const { logoBase64 } = req.body;
  if (!logoBase64 || typeof logoBase64 !== "string") {
    return res.status(400).json({ error: "Nenhuma imagem fornecida." });
  }

  try {
    const matches = logoBase64.match(/^data:image\/png;base64,(.+)$/);
    if (!matches || matches.length !== 2) {
      return res.status(400).json({ error: "Apenas imagens no formato PNG são permitidas." });
    }
    const buffer = Buffer.from(matches[1], "base64");
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "Imagem inválida ou corrompida." });
    }
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: "A imagem deve ter no máximo 2 MB." });
    }
    if (!hasMagicPrefix(buffer, ["89504e47"])) {
      return res.status(400).json({ error: "O conteúdo do arquivo não corresponde a uma imagem PNG." });
    }

    // Save the base64 string directly in the database (Supabase / local fallback) for true persistence
    await dbService.updateLogoUrl(logoBase64, req.user.role, req.user?.supabaseToken);

    res.json({ success: true, logoUrl: logoBase64 });
  } catch (err: any) {
    console.error("Erro ao salvar logo:", err);
    res.status(500).json({ error: "Falha ao processar e salvar a imagem da logo." });
  }
}));

app.post("/api/admin/logo/reset", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    await dbService.updateLogoUrl(undefined, req.user.role, req.user?.supabaseToken);
    res.json({ success: true, logoUrl: undefined });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao resetar logo." });
  }
}));

// 8.2 Generic File Upload with Storage folder support
app.post("/api/admin/upload-file", uploadRateLimiter, asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  const { fileBase64, fileName, folder } = req.body;
  if (!fileBase64) {
    return res.status(400).json({ error: "Nenhum arquivo fornecido." });
  }

  try {
    const matches = fileBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: "Formato de arquivo base64 inválido." });
    }

    const type = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    // Confere o conteúdo real para tipos com assinatura conhecida (admin também
    // pode falhar): imagem/vídeo/PDF forjados (ex.: HTML/SVG) são rejeitados.
    const declaredFamily =
      type.startsWith("image/") ? "image" :
      type.startsWith("video/") ? "video" :
      type === "application/pdf" ? "pdf" : null;
    if (declaredFamily) {
      const sniffed = sniffContentType(buffer);
      const sniffedFamily =
        sniffed && sniffed.startsWith("image/") ? "image" :
        sniffed && sniffed.startsWith("video/") ? "video" :
        sniffed === "application/pdf" ? "pdf" : null;
      if (!sniffedFamily || sniffedFamily !== declaredFamily) {
        return res.status(400).json({ error: "O arquivo não corresponde ao tipo informado ou está corrompido." });
      }
    }

    // Determine target folder (allowlist ‐ pastas arbitrárias são rejeitadas)
    let targetFolder: string | null = null;
    if (!folder) {
      if (type.startsWith("video/")) targetFolder = "cursos/videos";
      else if (type === "application/pdf") targetFolder = "materiais";
      else targetFolder = "geral";
    } else {
      targetFolder = sanitizeUploadFolder(folder);
    }
    if (targetFolder === null) {
      return res.status(400).json({ error: "Pasta de destino inválida." });
    }

    // Upload direto no Supabase Storage (sem fallback em disco)
    const bucketStatus = await ensureBucketExists(STORAGE_BUCKET);
    if (!bucketStatus.ready) {
      return res.status(500).json({ error: `Storage indisponível: ${bucketStatus.error || "falha ao verificar bucket"}` });
    }

    const client = getActiveStorageClient();
    const timestamp = Date.now();
    const rand = crypto.randomBytes(4).toString("hex");
    const cleanName = fileName ? fileName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").substring(0, 30) : "file";
    const objectKey = `${targetFolder}/${timestamp}_${rand}_${cleanName}`;
    if (objectKey.length > 400) {
      return res.status(400).json({ error: "Nome do arquivo muito longo." });
    }

    await client.putObject(STORAGE_BUCKET, objectKey, buffer, buffer.length, {
      "Content-Type": type
    });

    const url = type.startsWith("video/")
      ? `/api/storage/stream/${encodeURIComponent(objectKey)}`
      : `/api/storage/preview/${encodeURIComponent(objectKey)}`;

    return res.json({ success: true, url, objectKey, storage: "storage" });
  } catch (err: any) {
    console.error("Erro no upload de arquivo:", err);
    res.status(500).json({ error: "Falha ao salvar o arquivo." });
  }
}));

// Detecção de tipo REAL do arquivo pelos magic bytes (o MIME declarado pelo
// cliente é spoofável). Retorna null para conteúdo desconhecido/corrompido.
function sniffContentType(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return "image/gif";
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return "image/webp";
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "application/pdf";
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return "video/webm";
  if (buffer.length >= 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return "video/mp4";
  return null;
}

function stripTags(input: string): string {
  if (!input) return "";
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\shref\s*=\s*"?\s*javascript:[^">]*"?/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

// Sanitização de texto livre de conteúdo admin (nunca null/undefined).
function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return stripTags(String(value));
}

// Destinos de links (banners/novidades/imagens): só http(s) ou caminhos internos.
// Bloqueia javascript:/data:/vbscript: (XSS via href/src).
function safeLinkTarget(value: unknown): string {
  const v = cleanText(value).replace(/javascript:/gi, "").replace(/data:/gi, "").replace(/vbscript:/gi, "").trim();
  if (!v) return "";
  if (/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(v)) return v;
  return "";
}

// Aplica cleanText em campos de texto e safeLinkTarget em campos de URL/imagem.
function sanitizeObject<T extends Record<string, any>>(obj: T, textFields: string[], urlFields: string[] = []): T {
  if (!obj || typeof obj !== "object") return obj;
  const out: any = { ...obj };
  for (const f of textFields) {
    if (out[f] !== undefined && out[f] !== null) out[f] = cleanText(out[f]);
  }
  for (const f of urlFields) {
    if (out[f] !== undefined && out[f] !== null) out[f] = safeLinkTarget(out[f]);
  }
  return out as T;
}

// Sanitiza campos de texto recursivamente dentro de arrays de objetos.
function sanitizeArrayOfObjects<T extends Record<string, any>>(arr: T[], textFields: string[], urlFields: string[] = []): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => sanitizeObject(item, textFields, urlFields));
}

function csvSafe(value: string): string {
  const v = String(value || "");
  if (/^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email || "";
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

// ---------------- FENIX SOCIAL MODULE ENDPOINTS ----------------

// Get approved public feed
app.get("/api/fenix-social/posts", asyncHandler(async (req, res) => {
  try {
    const data = await cacheJsonResponse("fenix-social/posts", 30000, async () => {
      const posts = await dbService.getPublicFenixPosts();
      return JSON.stringify({ posts: posts.map(publicPost) });
    });
    res.type("application/json").send(data);
  } catch (err) {
    console.error("Erro ao buscar feed do Fenix Social:", err);
    res.status(500).json({ error: "Falha ao carregar publicações." });
  }
}));

// Get single post by ID (for direct sharing links)
app.get("/api/fenix-social/post/:id", asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const post = await dbService.getFenixPostById(id);
    if (!post) {
      return res.status(404).json({ error: "Publicação não encontrada." });
    }
    res.json({ post: publicPost(post) });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar publicação." });
  }
}));

// Helper for saving base64 files directly to Supabase Storage (fenix_social folder)
async function saveBase64MediaFile(fileBase64: string): Promise<{ url: string; isVideo: boolean; error?: string }> {
  const matches = fileBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return { url: "", isVideo: false, error: "Formato de arquivo base64 inválido." };
  }

  const mimeType = matches[1].toLowerCase();
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, "base64");

  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");

  if (!isImage && !isVideo) {
    return { url: "", isVideo: false, error: "Apenas fotos (JPG, PNG, WEBP) e vídeos (MP4, WEBM) são permitidos." };
  }

  if (isImage && buffer.length > 2 * 1024 * 1024) {
    return { url: "", isVideo: false, error: "Uma foto excede o tamanho máximo de 2 MB." };
  }

  if (isVideo && buffer.length > 50 * 1024 * 1024) {
    return { url: "", isVideo: false, error: "Um vídeo excede o tamanho máximo de 50 MB." };
  }

  // Confere os magic bytes: o conteúdo REAL precisa ser imagem/vídeo e da mesma
  // família declarada (blobs arbitrários com prefixo image/ são rejeitados).
  const sniffed = sniffContentType(buffer);
  const sniffedIsImage = sniffed ? sniffed.startsWith("image/") : false;
  const sniffedIsVideo = sniffed ? sniffed.startsWith("video/") : false;
  if (!sniffed || (!sniffedIsImage && !sniffedIsVideo)) {
    return { url: "", isVideo: false, error: "Arquivo inválido ou corrompido. Envie uma foto (JPG, PNG, WEBP) ou vídeo (MP4, WEBM) válido." };
  }
  if ((isImage && !sniffedIsImage) || (isVideo && !sniffedIsVideo)) {
    return { url: "", isVideo: false, error: "O tipo do arquivo não corresponde ao conteúdo enviado. Envie um arquivo válido." };
  }

  let ext = "png";
  if (sniffed === "image/jpeg") ext = "jpg";
  else if (sniffed === "image/webp") ext = "webp";
  else if (sniffed === "image/gif") ext = "gif";
  else if (sniffed === "video/mp4") ext = "mp4";
  else if (sniffed === "video/webm") ext = "webm";

  const uniqueId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 10);
  const cleanName = `post_${Date.now()}_${uniqueId}.${ext}`;
  const objectKey = `fenix_social/${cleanName}`;

  // Upload direto no Supabase Storage (sem fallback em disco)
  const bucketStatus = await ensureBucketExists(STORAGE_BUCKET);
  if (!bucketStatus.ready) {
    return { url: "", isVideo: false, error: `Storage indisponível: ${bucketStatus.error || "falha ao verificar bucket"}` };
  }

  const client = getActiveStorageClient();
  await client.putObject(STORAGE_BUCKET, objectKey, buffer, buffer.length, {
    "Content-Type": sniffed
  });
  const url = isVideo
    ? `/api/storage/stream/${encodeURIComponent(objectKey)}`
    : `/api/storage/preview/${encodeURIComponent(objectKey)}`;
  return { url, isVideo };
}

// Create new post (Restricted strictly to logged-in users)
app.post("/api/fenix-social/posts", fenixSocialPostRateLimiter, asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const { titulo, legenda, dataPublicacao, usuarioNome, filesBase64, fileBase64 } = req.body;

    const rawFiles: string[] = Array.isArray(filesBase64) && filesBase64.length > 0 
      ? filesBase64 
      : (fileBase64 ? [fileBase64] : []);

    if (rawFiles.length > 3) return res.status(400).json({ error: "Envie no máximo 3 arquivos." });
    if (rawFiles.length === 0) {
      return res.status(400).json({ error: "Envie ao menos 1 foto ou vídeo." });
    }

    if (!titulo || !titulo.trim()) {
      return res.status(400).json({ error: "O título da publicação é obrigatório." });
    }

    if (!legenda || !legenda.trim()) {
      return res.status(400).json({ error: "A descrição da publicação é obrigatória." });
    }

    // Process files
    const mediaUrls: string[] = [];
    let isVideoPost = false;

    for (let i = 0; i < rawFiles.length; i++) {
      const saved = await saveBase64MediaFile(rawFiles[i]);
      if (saved.error) {
        return res.status(400).json({ error: saved.error });
      }

      if (saved.isVideo) {
        isVideoPost = true;
        if (rawFiles.length > 1) {
          return res.status(400).json({ error: "Em caso de vídeo, só é permitido 1 vídeo por publicação." });
        }
      }

      mediaUrls.push(saved.url);
    }

    if (!isVideoPost && mediaUrls.length > 3) {
      return res.status(400).json({ error: "O número máximo de fotos permitido por publicação é 3." });
    }

    const sanitizedTitulo = stripTags(titulo);
    const sanitizedLegenda = stripTags(legenda);
    const autorNomeFinal = usuarioNome && usuarioNome.trim() 
      ? stripTags(usuarioNome) 
      : (req.user?.code === "admin" ? "Administrador Fênix" : `Membro (${req.user?.code || "Aluno"})`);

    const finalDataPub = dataPublicacao || new Date().toISOString().substring(0, 10);

    const post = await dbService.createFenixPost({
      titulo: sanitizedTitulo,
      usuarioNome: autorNomeFinal,
      usuarioRole: req.user?.role === "admin" ? "Administrador" : "Aluno Fênix",
      tipoMedia: isVideoPost ? "video" : "photo",
      mediaUrl: mediaUrls[0],
      mediaUrls,
      legenda: sanitizedLegenda,
      dataPublicacao: finalDataPub
    });

    res.json({
      success: true,
      message: "Publicação enviada com sucesso! Ela passará por análise de moderação antes de ser exibida no feed.",
      post
    });
  } catch (err: any) {
    console.error("Erro ao criar post Fênix:", err);
    res.status(500).json({ error: "Erro interno ao processar a publicação." });
  }
}));

// Like post
app.post("/api/fenix-social/posts/:id/like", fenixSocialInteractionRateLimiter, asyncHandler(optionalAuthenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const userKey = crypto.createHmac("sha256", JWT_SECRET).update(req.user?.code || req.ip || "anonymous").digest("hex");
    if (!await dbService.getFenixPostById(id)) return res.status(404).json({ error: "Publicação não encontrada." });
    const result = await dbService.likeFenixPost(id, userKey);
    if (!result) {
      return res.status(404).json({ error: "Publicação não encontrada." });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: "Erro ao registrar curtida." });
  }
}));

// Comment on post
app.post("/api/fenix-social/posts/:id/comment", fenixSocialInteractionRateLimiter, asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const { texto, usuarioNome } = req.body;
    if (!texto) {
      return res.status(400).json({ error: "O texto do comentário é obrigatório." });
    }
    if (typeof texto !== "string" || texto.trim().length > 2000) {
      return res.status(400).json({ error: "O comentário deve ter no máximo 2000 caracteres." });
    }

    const sanitizedTexto = stripTags(texto);
    const sanitizedNome = req.user ? stripTags(req.user.name) : "Visitante";

    if (!await dbService.getFenixPostById(id)) return res.status(404).json({ error: "Publicação não encontrada." });
    const comment = await dbService.commentFenixPost(id, sanitizedTexto, sanitizedNome);
    if (!comment) {
      return res.status(404).json({ error: "Publicação não encontrada." });
    }

    res.json({ success: true, comment });
  } catch (err) {
    res.status(500).json({ error: "Erro ao publicar comentário." });
  }
}));

// Moderation feed (Requires Admin OR valid Moderator Token)
app.get("/api/fenix-social/moderacao", fenixModeracaoRateLimiter, asyncHandler(optionalAuthenticateUser), asyncHandler(async (req: any, res) => {
  try {
    // Token do moderador SOMENTE via header (nunca na URL ‐ evita vazamento
    // em logs/referrers/histórico).
    const token = req.headers["x-moderator-token"];
    let authorized = false;

    if (req.user?.role === "admin") {
      authorized = true;
    } else if (token) {
      const validLink = await dbService.validateModeratorToken(String(token));
      if (validLink) authorized = true;
    }

    if (!authorized) {
      return res.status(403).json({ error: "Acesso negado à moderação." });
    }

    if (typeof token === "string") res.cookie("moderator_media", token, { httpOnly: true, secure: isProduction, sameSite: "strict", path: "/api/storage", maxAge: 15 * 60 * 1000 });
    const posts = await dbService.getPendingFenixPosts();
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: "Erro ao carregar posts pendentes para moderação." });
  }
}));

// Moderation approve
app.post("/api/fenix-social/moderacao/:id/aprovar", fenixModeracaoRateLimiter, asyncHandler(optionalAuthenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const token = req.headers["x-moderator-token"];
    let modName = req.user?.code || "admin";

    if (req.user?.role !== "admin") {
      if (!token) return res.status(403).json({ error: "Token de moderador ausente." });
      const validLink = await dbService.validateModeratorToken(String(token));
      if (!validLink) return res.status(403).json({ error: "Token de moderador inválido." });
      modName = `Moderador(${validLink.moderadorNome})`;
    }

    const success = await dbService.approveFenixPost(id, modName);
    if (!success) {
      return res.status(404).json({ error: "Publicação não encontrada." });
    }
    res.json({ success: true, message: "Publicação aprovada com sucesso e liberada no feed público." });
  } catch (err) {
    res.status(500).json({ error: "Erro ao aprovar publicação." });
  }
}));

// Moderation reject (Hard Delete)
app.post("/api/fenix-social/moderacao/:id/recusar", fenixModeracaoRateLimiter, asyncHandler(optionalAuthenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const token = req.headers["x-moderator-token"];
    let modName = req.user?.code || "admin";

    if (req.user?.role !== "admin") {
      if (!token) return res.status(403).json({ error: "Token de moderador ausente." });
      const validLink = await dbService.validateModeratorToken(String(token));
      if (!validLink) return res.status(403).json({ error: "Token de moderador inválido." });
      modName = `Moderador(${validLink.moderadorNome})`;
    }

    const mediaUrls = await dbService.rejectFenixPost(id, modName);
    
    // Hard delete physical files from server storage
    if (mediaUrls && mediaUrls.length > 0) {
      for (const mediaUrl of mediaUrls) {
        if (mediaUrl && mediaUrl.startsWith("/api/storage/")) {
          // Conteúdo recusado também deve sumir do Storage. Falha de conexão
          // não quebra a recusa (log only).
          try {
            const rawKey = decodeURIComponent(mediaUrl.replace(/^\/api\/storage\/(stream|preview)\//, "")).split("?")[0];
            if (rawKey && !isBackupFamilyKey(rawKey)) {
              const bucketStatus = await ensureBucketExists(STORAGE_BUCKET);
              if (bucketStatus.ready) {
                const client = getActiveStorageClient();
                await client.removeObject(STORAGE_BUCKET, rawKey);
                console.log(`[Moderação Fênix] Objeto removido do Storage: ${rawKey}`);
              }
            }
          } catch (storageErr) {
            console.warn("[Moderação Fênix] Não foi possível remover objeto do Storage (recusa mantida):", storageErr?.message || storageErr);
          }
        }
      }
    }

    res.json({ success: true, message: "Publicação recusada e removida permanentemente do sistema e do servidor." });
  } catch (err) {
    console.error("[Moderação Fênix] Erro ao recusar:", err);
    res.status(500).json({ error: "Erro ao recusar publicação." });
  }
}));

// --- ADMIN MANAGEMENT ENDPOINTS FOR FENIX SOCIAL ---

// Get ALL posts (Approved, Pending, Rejected) for Admin
app.get("/api/fenix-social/admin/all-posts", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const posts = await dbService.getAllFenixPosts(req.token);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: "Erro ao carregar todas as publicações para administração." });
  }
}));

// Edit post in Admin Panel
app.put("/api/fenix-social/admin/posts/:id", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const { titulo, legenda, status, dataPublicacao, usuarioNome } = req.body;

    const updates: any = {};
    if (titulo !== undefined) updates.titulo = stripTags(titulo);
    if (legenda !== undefined) updates.legenda = stripTags(legenda);
    if (status !== undefined) updates.status = status;
    if (dataPublicacao !== undefined) updates.dataPublicacao = dataPublicacao;
    if (usuarioNome !== undefined) updates.usuarioNome = stripTags(usuarioNome);

    const updated = await dbService.updateFenixPost(id, updates, req.user?.code || "admin", req.token);
    if (!updated) {
      return res.status(404).json({ error: "Publicação não encontrada." });
    }

    res.json({ success: true, post: updated });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar publicação." });
  }
}));

// Delete post in Admin Panel (Hard delete files & DB entry)
app.delete("/api/fenix-social/admin/posts/:id", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    let post: FenixPost | null = null;
    try {
      post = await dbService.getFenixPostById(id, req.user?.supabaseToken);
    } catch {}
    const result = await dbService.deleteFenixPost(id, geradoPor, req.token);
    if (!result.success) {
      return res.status(404).json({ error: "Publicação não encontrada." });
    }

    let midias = { removidas: 0, mantidas: 0 };
    if (result.mediaUrls && result.mediaUrls.length > 0) {
      for (const mediaUrl of result.mediaUrls) {
        if (mediaUrl.startsWith("/uploads/")) {
          const relativePath = mediaUrl.replace(/^\/uploads\//, "");
          const fullPath = path.join(process.cwd(), "public", "uploads", relativePath);
          if (fs.existsSync(fullPath)) {
            try {
              fs.unlinkSync(fullPath);
            } catch (e) {
              console.error("Falha ao excluir arquivo no admin delete:", e);
            }
          }
        }
      }
    }
    if (post) {
      const chaves = collectMediaKeys(post);
      if (chaves.length > 0) {
        const r = await removeOrphanMedia(chaves, geradoPor);
        midias = { removidas: r.removidas.length, mantidas: r.mantidas.length };
      }
    }

    res.json({
      success: true,
      message: "Publicação e arquivos excluídos com sucesso.",
      midias
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir publicação." });
  }
}));

// Get Moderator Links
app.get("/api/fenix-social/admin/moderator-links", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const links = await dbService.getModeratorLinks(req.user?.supabaseToken);
    res.json({ links });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar links de moderadores." });
  }
}));

// Create Moderator Link
app.post("/api/fenix-social/admin/moderator-links", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { moderadorNome } = req.body;
    if (!moderadorNome || !moderadorNome.trim()) {
      return res.status(400).json({ error: "O nome do moderador é obrigatório." });
    }

    const newLink = await dbService.createModeratorLink(stripTags(moderadorNome), req.user?.code || "admin", req.user?.supabaseToken);
    res.json({ success: true, link: newLink });
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar link de moderador." });
  }
}));

// Delete Moderator Link
app.delete("/api/fenix-social/admin/moderator-links/:id", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    const success = await dbService.deleteModeratorLink(id, geradoPor, req.user?.supabaseToken);
    if (!success) {
      return res.status(404).json({ error: "Link de moderador não encontrado." });
    }
    res.json({
      success: true,
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir link de moderador." });
  }
}));

// Rate limiter store for Ouvidoria: IP => { count: number, resetAt: number }
const ouvidoriaRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkOuvidoriaRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes window
  const maxRequests = 5;

  const record = ouvidoriaRateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    ouvidoriaRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count += 1;
  return true;
}

// --- OUVIDORIA ENDPOINTS ---

// Public submission
app.post("/api/ouvidoria/submit", ouvidoriaRateLimiter, asyncHandler(async (req: any, res) => {
  try {
    // IP REAL via req.ip (respeita o trust proxy configurado) ‐ o header
    // X-Forwarded-For é ignorado aqui (spoofável por qualquer cliente).
    const clientIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
    const ip = Array.isArray(clientIp) ? clientIp[0] : String(clientIp).split(",")[0].trim();

    // 1. Rate Limiting Check
    if (!checkOuvidoriaRateLimit(ip)) {
      return res.status(429).json({
        error: "Muitas tentativas em pouco tempo. Por favor, aguarde 15 minutos antes de enviar outra mensagem."
      });
    }

    const { tipo, nome, email, telefone, cidade, estado, pais, assunto, tipoParceria, mensagem, aceitaLgpd, website, _hp } = req.body;

    // 2. Honeypot check (anti-bot)
    if (website || _hp) {
      return res.json({ success: true, message: "Sua mensagem foi enviada com sucesso!" });
    }

    // 3. Mandatory LGPD validation
    if (!aceitaLgpd) {
      return res.status(400).json({ error: "È necessário aceitar a declaração de consentimento da LGPD para enviar a mensagem." });
    }

    // 4. Validate Tipo
    if (tipo !== "suporte" && tipo !== "parceria") {
      return res.status(400).json({ error: "Tipo de mensagem inválido." });
    }

    // 5. Validate Nome
    if (!nome || typeof nome !== "string" || nome.trim().length < 2 || nome.trim().length > 120) {
      return res.status(400).json({ error: "Por favor, informe seu nome completo (entre 2 e 120 caracteres)." });
    }

    // 6. Validate Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
      return res.status(400).json({ error: "Por favor, informe um endereço de e-mail válido." });
    }

    // 7. WhatsApp obligation means for Quero Fazer Parte / Parceria (required, com DDD)
    if (tipo === "parceria") {
      if (!telefone || typeof telefone !== "string" || !String(telefone).replace(/\D/g, "")) {
        return res.status(400).json({ error: "Por favor, informe seu WhatsApp com DDD." });
      }
      const digits = String(telefone).replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 13) {
        return res.status(400).json({ error: "Por favor, informe um WhatsApp válido com DDD (somente números, ex.: 11988887777)." });
      }
    }

    // 8. Specific validation by tipo
    if (tipo === "suporte") {
      if (!assunto || typeof assunto !== "string" || !assunto.trim()) {
        return res.status(400).json({ error: "Por favor, informe o assunto do seu contato." });
      }
      if (!mensagem || typeof mensagem !== "string" || mensagem.trim().length < 10 || mensagem.trim().length > 2000) {
        return res.status(400).json({ error: "A mensagem deve conter entre 10 e 2000 caracteres." });
      }
    } else {
      if (!cidade || typeof cidade !== "string" || !cidade.trim()) {
        return res.status(400).json({ error: "Por favor, informe sua Cidade." });
      }
      if (!estado || typeof estado !== "string" || !estado.trim()) {
        return res.status(400).json({ error: "Por favor, informe seu Estado." });
      }
      if (!pais || typeof pais !== "string" || !pais.trim()) {
        return res.status(400).json({ error: "Por favor, informe seu País." });
      }
      if (!mensagem || typeof mensagem !== "string" || mensagem.trim().length < 15 || mensagem.trim().length > 3000) {
        return res.status(400).json({ error: "Sua mensagem deve conter entre 15 e 3000 caracteres." });
      }
    }

    // 9. Sanitize inputs
    const sanitizedNome = stripTags(nome.trim());
    const sanitizedEmail = stripTags(email.trim());
    const sanitizedTelefone = telefone ? stripTags(telefone.trim()) : "";
    const sanitizedCidade = cidade ? stripTags(cidade.trim()) : "";
    const sanitizedEstado = estado ? stripTags(estado.trim()) : "";
    const sanitizedPais = pais ? stripTags(pais.trim()) : "";
    const sanitizedAssunto = assunto ? stripTags(assunto.trim()) : "";
    const sanitizedTipoParceria = tipoParceria ? stripTags(tipoParceria.trim()) : "Quero Fazer Parte";
    const sanitizedMensagem = stripTags(mensagem.trim());

    // 10. Save message
    const saved = await dbService.saveOuvidoriaMessage({
      tipo,
      nome: sanitizedNome,
      email: sanitizedEmail,
      telefone: sanitizedTelefone,
      cidade: sanitizedCidade,
      estado: sanitizedEstado,
      pais: sanitizedPais,
      assunto: sanitizedAssunto,
      tipoParceria: sanitizedTipoParceria,
      mensagem: sanitizedMensagem,
      ip
    });

    // 11. Notificação por e-mail (fire-and-forget ‐ falha de e-mail nunca quebra o form)
    const config = await dbService.getOuvidoriaConfig();
    if (tipo === "parceria" && config.notifyParceriaEmail && config.emailParcerias) {
      sendEmail({
        to: config.emailParcerias,
        subject: `Novo interessado ‐ Quero Fazer Parte (${sanitizedTipoParceria})`,
        text: `Novo contato ‐ Quero Fazer Parte:\nNome: ${sanitizedNome}\nE-mail: ${sanitizedEmail}\nWhatsApp: ${sanitizedTelefone}\nLocalização: ${sanitizedCidade}/${sanitizedEstado}/${sanitizedPais}\nProposta: ${sanitizedTipoParceria}\n\nMensagem:\n${sanitizedMensagem}`,
        html: notifyNewLeadHtml({
          nome: sanitizedNome,
          email: sanitizedEmail,
          telefone: sanitizedTelefone,
          cidade: sanitizedCidade,
          estado: sanitizedEstado,
          pais: sanitizedPais,
          tipoParceria: sanitizedTipoParceria,
          mensagem: sanitizedMensagem
        })
      });
    } else {
      const destinationEmail = tipo === "suporte" ? config.emailSuporte : config.emailParcerias;
      console.log(`[Ouvidoria] Nova mensagem ${saved.id} de ${tipo.toUpperCase()} recebida (notificação por e-mail desativada ou SMTP não configurado). Destino: ${destinationEmail}`);
    }

    publishSupportChange();

    return res.json({
      success: true,
      message: "Sua mensagem foi recebida com sucesso! Nossa equipe analisará os dados e entrará em contato em breve."
    });
  } catch (err: any) {
    console.error("Erro ao processar mensagem de ouvidoria:", err);
    res.status(500).json({ error: "Ocorreu um erro interno ao processar sua mensagem. Tente novamente." });
  }
}));

// Admin list messages
app.get("/api/admin/ouvidoria/messages", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { tipo, status, search } = req.query;
    const messages = await dbService.getOuvidoriaMessages(
      tipo ? String(tipo) : undefined,
      status ? String(status) : undefined,
      search ? String(search) : undefined
    );
    const config = await dbService.getOuvidoriaConfig();

    res.json({
      messages,
      config
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar mensagens da ouvidoria." });
  }
}));

// Admin update status
app.put("/api/admin/ouvidoria/messages/:id/status", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!["pendente", "lida", "resolvida", "arquivada"].includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }

    const updated = await dbService.updateOuvidoriaMessageStatus(id, status, req.user?.code || "admin");
    if (!updated) {
      return res.status(404).json({ error: "Mensagem não encontrada." });
    }

    res.json({ success: true, message: updated });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar status da mensagem." });
  }
}));

// Admin delete message
app.delete("/api/admin/ouvidoria/messages/:id", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const success = await dbService.deleteOuvidoriaMessage(id, req.user?.code || "admin");
    if (!success) {
      return res.status(404).json({ error: "Mensagem não encontrada." });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir mensagem." });
  }
}));

// Admin get config
app.get("/api/admin/ouvidoria/config", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const config = await dbService.getOuvidoriaConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Erro ao obter configurações da ouvidoria." });
  }
}));

// Admin update config
app.post("/api/admin/ouvidoria/config", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { emailSuporte, emailParcerias, autoResponderEnabled } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailSuporte && !emailRegex.test(emailSuporte.trim())) {
      return res.status(400).json({ error: "E-mail de suporte inválido." });
    }
    if (emailParcerias && !emailRegex.test(emailParcerias.trim())) {
      return res.status(400).json({ error: "E-mail de parcerias inválido." });
    }

    const updated = await dbService.updateOuvidoriaConfig(
      {
        emailSuporte: emailSuporte ? stripTags(emailSuporte.trim()) : undefined,
        emailParcerias: emailParcerias ? stripTags(emailParcerias.trim()) : undefined,
        autoResponderEnabled: typeof autoResponderEnabled === "boolean" ? autoResponderEnabled : true
      },
      req.user?.code || "admin"
    );

    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar configurações da ouvidoria." });
  }
}));

// Admin export CSV
app.get("/api/admin/ouvidoria/export", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const messages = await dbService.getOuvidoriaMessages();

    let csv = "ID,Data,Tipo,Nome,Email,Telefone,Cidade,Estado,Pais,Assunto_Proposta,Mensagem,Status,IP\n";
    for (const m of messages) {
      const dateStr = new Date(m.createdAt).toLocaleString("pt-BR");
      const subj = (m.tipo === "suporte" ? m.assunto : m.tipoParceria) || "";
      const cleanMsg = m.mensagem.replace(/"/g, '""').replace(/\n/g, ' ');
      csv += `"${csvSafe(m.id)}","${dateStr}","${csvSafe(m.tipo)}","${csvSafe(m.nome)}","${csvSafe(m.email)}","${csvSafe(m.telefone || "")}","${csvSafe(m.cidade || "")}","${csvSafe(m.estado || "")}","${csvSafe(m.pais || "")}","${csvSafe(subj)}","${cleanMsg}","${csvSafe(m.status)}","${csvSafe(m.ip || "")}"\n`;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ouvidoria_mensagens_fenix.csv"');
    res.status(200).send("\uFEFF" + csv);
  } catch (err) {
    res.status(500).json({ error: "Erro ao exportar relatório CSV." });
  }
}));

// 9. Audit Logs & Stats (Admin Dashboard)
app.get("/api/admin/metrics", asyncHandler(requireAdmin), asyncHandler(async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    if (![7, 30, 90].includes(days)) return res.status(400).json({ error: "Período inválido." });
    res.setHeader('Cache-Control', 'no-store');
    res.json(await metricsReport(days));
  } catch (error: any) {
    res.status(503).json({ error: error.message });
  }
}));

app.post("/api/content/course-access/:id", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  if (req.user.role !== 'user') return res.status(204).end();
  const course = (await dbService.getCursos(req.user.supabaseToken)).find(c => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Curso não encontrado.' });
  await recordMetric({ kind: course.secao === 'treinamentos' ? 'training' : 'course', actor: req.user.code, entity_id: course.id, detail: { title: course.titulo } });
  res.status(204).end();
}));

// --- ADMIN D.I. CODE MANAGEMENT ENDPOINTS ---
app.get("/api/admin/dis", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const list = await dbService.getDICodes(req.user?.supabaseToken);
    res.json({ success: true, diCodes: list });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao buscar códigos D.I." });
  }
}));

app.post("/api/admin/dis", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { codigo, descricao, ativo } = req.body;
    if (!codigo || typeof codigo !== "string" || !codigo.trim()) {
      return res.status(400).json({ error: "O código D.I. é obrigatório." });
    }
    const adminUser = req.user?.code || "Admin";
    const result = await dbService.saveDICode({ codigo, descricao: cleanText(descricao), ativo }, adminUser, req.user?.supabaseToken);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, message: "Código D.I. cadastrado com total segurança!", diCode: result.diCode });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao cadastrar código D.I." });
  }
}));

app.put("/api/admin/dis/:id/toggle", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const adminUser = req.user?.code || "Admin";
    const result = await dbService.toggleDICodeStatus(id, adminUser, req.user?.supabaseToken);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, message: "Status do código D.I. alterado com sucesso." });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao alterar status do código D.I." });
  }
}));

app.delete("/api/admin/dis/:id", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const adminUser = req.user?.code || "Admin";
    const result = await dbService.deleteDICode(id, adminUser, req.user?.supabaseToken);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, message: "Código D.I. excluído com sucesso." });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao excluir código D.I." });
  }
}));

// --- ADMIN D.I. BULK IMPORT (CSV) ---
const csvImportMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // max 3 MB
  fileFilter: (req: any, file: any, cb: any) => {
    const isCsvName = /\.csv$/i.test(file.originalname || "");
    const isCsvMime =
      /text\/csv|application\/csv|application\/vnd\.ms-excel|text\/plain|application\/octet-stream/i.test(file.mimetype || "") ||
      !file.mimetype;
    if (isCsvName && isCsvMime) return cb(null, true);
    cb(null, false);
  }
});

app.get("/api/admin/dis/template", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const content = "\uFEFF" + buildDITemplateCSV();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="modelo-cadastro-dis.csv"');
    res.send(content);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao gerar o modelo CSV." });
  }
}));

// Export CSV dos D.I.s CADASTRADOS (espelho do modelo de importação:
// Nome | Código | Papel ‐ papel derivado do prefixo DI-ADMIN-).
app.get("/api/admin/dis/export-csv", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const list = await dbService.getDICodes(req.user?.supabaseToken);
    const linhaAtivos = list.filter((d: any) => d.ativo !== false).length;

    let csv = "Nome do DI,Codigo do DI,Papel,Status\n";
    for (const d of list) {
      const papel = String(d.codigo || "").startsWith("DI-ADMIN-") ? "Admin" : "Usuario";
      const status = d.ativo === false ? "Inativo" : "Ativo";
      csv += `"${csvSafe(d.descricao || "")}","${csvSafe(d.codigo)}","${csvSafe(papel)}","${csvSafe(status)}"\n`;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="dis-cadastrados.csv"');
    res.status(200).send("\uFEFF" + csv + `\n# ${list.length} D.I. cadastrados (${linhaAtivos} ativos).\n`);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao gerar o CSV dos D.I.s cadastrados." });
  }
}));

app.post("/api/admin/dis/import", uploadRateLimiter, asyncHandler(requireAdmin), csvImportMulter.single("file"), asyncHandler(async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Envie um arquivo .csv." });
    }

    const parsed = parseDICsv(req.file.buffer);
    if (parsed.rows.length === 0) {
      return res.status(400).json({
        error:
          parsed.errors.length > 0
            ? `Nenhuma linha válida encontrada (${parsed.errors[0].motivo})`
            : "Arquivo sem linhas de D.I. (esperado: Nome,Código)."
      });
    }

    const adminUser = req.user?.code || "Admin";
    const result = await dbService.importDIsBatch(parsed.rows, adminUser, req.user?.supabaseToken);
    if (!result.success) {
      return res.status(400).json({ error: result.errors[0]?.motivo || "Erro ao importar D.I.s." });
    }

    res.json({
      success: true,
      message: `${result.imported} D.I. importado(s) com sucesso.`,
      total: parsed.rows.length,
      imported: result.imported,
      duplicates: result.duplicates,
      errors: [...parsed.errors, ...result.errors]
    });
  } catch (err: any) {
    if (err && (err.name === "MulterError" || /file too large/i.test(err.message || ""))) {
      return res.status(400).json({ error: "Arquivo muito grande (máx. 3 MB)." });
    }
    console.error("[D.I. import error]", err);
    res.status(500).json({ error: "Erro ao processar o arquivo D.I." });
  }
}));

// ---------------- SUPORTE POR TICKETS ----------------
// Histórico 100% imutável: NÂO existem rotas de exclusão de chamados ou mensagens.
const SUPPORT_VALID_STATUSES = ["aberto", "em_andamento", "aguardando_resposta", "resolvido", "fechado", "arquivado"];

// EQUIPE DE SUPORTE = SOMENTE role "support" (área separada do admin). O admin
// NÂO acessa a área de suporte: isso é garantido aqui ‐ todas as rotas de staff
// dependem deste helper ‐ além do bloqueio na tela (SupportApp). Contas de D.I.
// (role "user") seguem usando as rotas do próprio chamado normalmente.
function isSupportStaffRole(role?: string): boolean {
  return role === "support";
}

// Regra de senha das contas de suporte (temporária do admin E definitiva do
// responsável): mínimo 8 caracteres, com letras e números.
function isValidSupportPassword(pw: any): boolean {
  return typeof pw === "string" && pw.length <= 256 && pw.length >= 8 && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);
}
const SUPPORT_PASSWORD_HINT = "A senha deve ter no mínimo 8 caracteres, com letras e números.";

// ---------------- REALTIME DO SUPORTE (SSE) ----------------
// Clientes logados (staff ou D.I.) abrem uma conexão EventSource. Quando algo
// muda (mensagem nova, anexo, status, novo interessado), publicamos um evento
// GENÈRICO sem dados ‐ cada cliente refaz o próprio fetch e o servidor filtra
// por papel/dono. Zero vazamento entre lados.
const sseClients = new Set<import("express").Response>();
function publishSupportChange() {
  const payload = "event: support-changed\nretry: 5000\ndata: {}\n\n";
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

app.get("/api/support/realtime", asyncHandler(authenticateUser), concurrencyLimit(2, 100), asyncHandler(async (req: any, res) => {
  // �?rea de suporte exclusiva ‐ admin não participa (nem do fluxo de eventos).
  if (req.user?.role === "admin") {
    return res.status(403).json({ error: "�?rea de suporte restrita ao suporte." });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("retry: 5000\n\n");
  sseClients.add(res);
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* conexão encerrada */
    }
  }, 25000);
  res.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
}));

app.get("/api/support/tickets", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const all = await dbService.getSupportTickets(req.user?.supabaseToken);
    const isStaff = isSupportStaffRole(req.user?.role);
    const tickets = isStaff ? all : all.filter(t => t.criadoPor === req.user?.code);
    res.json({
      success: true,
      tickets,
      counts: {
        todos: tickets.length,
        abertos: tickets.filter(t => t.status === "aberto").length,
        em_andamento: tickets.filter(t => t.status === "em_andamento").length,
        aguardando_resposta: tickets.filter(t => t.status === "aguardando_resposta").length,
        resolvidos: tickets.filter(t => t.status === "resolvido").length,
        fechados: tickets.filter(t => t.status === "fechado").length
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao carregar chamados." });
  }
}));

// Multer para os anexos do suporte (fotos/documentos no chat): até 5 arquivos
// de 10MB cada, em memória (as imagens são re-comprimidas com sharp antes de gravar).
const supportAnexoMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 8, parts: 13, fieldSize: 20000, fieldNameSize: 100 }
});

app.post("/api/support/tickets", uploadRateLimiter, asyncHandler(authenticateUser), uploadConcurrency, supportAnexoMulter.array("files", 5), asyncHandler(async (req: any, res) => {
  try {
    if (req.user?.role !== "user") {
      return res.status(403).json({ error: "Somente membros com código D.I. podem abrir chamados." });
    }
    if (!req.user?.code) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }
    const { assunto, texto } = req.body;
    if (!assunto || typeof assunto !== "string" || !assunto.trim()) {
      return res.status(400).json({ error: "Informe o assunto do chamado." });
    }
    if (!texto || typeof texto !== "string" || !texto.trim()) {
      return res.status(400).json({ error: "Escreva a mensagem inicial do chamado." });
    }
    if (assunto.trim().length > 200 || texto.trim().length > 5000) {
      return res.status(400).json({ error: "Assunto (máx. 200) ou mensagem (máx. 5000 caracteres) muito longos." });
    }
    const files: Express.Multer.File[] = req.files || [];
    let anexos: any[] | undefined;
    if (files.length > 0) {
      const built = await buildSupportAnexosFromFiles(files, "novo-chamado");
      if ("error" in built) return res.status(400).json({ error: built.error });
      anexos = built.anexos;
    }
    const result = await dbService.createSupportTicket(
      { assunto: stripTags(assunto.trim()), texto: stripTags(texto.trim()), anexos },
      { code: req.user.code, name: req.user.name || req.user.code },
      req.user?.supabaseToken
    );
    if (!result.success) return res.status(400).json({ error: result.error });
    publishSupportChange();
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao abrir chamado." });
  }
}));

app.get("/api/support/tickets/:id", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const ticket = await dbService.getSupportTicket(req.params.id, req.user?.supabaseToken);
    if (!ticket) return res.status(404).json({ error: "Chamado não encontrado." });
    const isStaff = isSupportStaffRole(req.user?.role);
    if (!isStaff && ticket.criadoPor !== req.user?.code) {
      return res.status(403).json({ error: "Este chamado não pertence a você." });
    }
    res.json({ success: true, ticket });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao carregar chamado." });
  }
}));

app.post("/api/support/tickets/:id/mensagens", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const ticket = await dbService.getSupportTicket(req.params.id, req.user?.supabaseToken);
    if (!ticket) return res.status(404).json({ error: "Chamado não encontrado." });
    const isStaff = isSupportStaffRole(req.user?.role);
    if (!isStaff && !req.user?.code) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }
    if (!isStaff && ticket.criadoPor !== req.user?.code) {
      return res.status(403).json({ error: "Este chamado não pertence a você." });
    }
    const { texto } = req.body;
    if (!texto || typeof texto !== "string" || !texto.trim()) {
      return res.status(400).json({ error: "Escreva a mensagem." });
    }
    if (texto.trim().length > 5000) {
      return res.status(400).json({ error: "Mensagem muito longa (máx. 5000 caracteres)." });
    }
    const result = await dbService.addSupportMessage(
      ticket.id,
      {
        tipo: isStaff ? "suporte" : "di",
        autorNome: req.user.name || (isStaff ? "Suporte Fênix" : req.user.code),
        autorRef: req.user.code,
        texto: stripTags(texto.trim())
      },
      req.user?.supabaseToken
    );
    if (!result.success) return res.status(400).json({ error: result.error });

    publishSupportChange();
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao enviar mensagem." });
  }
}));

app.post("/api/support/tickets/:id/status", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const ticket = await dbService.getSupportTicket(req.params.id, req.user?.supabaseToken);
    if (!ticket) return res.status(404).json({ error: "Chamado não encontrado." });
    const isStaff = isSupportStaffRole(req.user?.role);
    if (!isStaff && !req.user?.code) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }
    if (!isStaff && ticket.criadoPor !== req.user?.code) {
      return res.status(403).json({ error: "Este chamado não pertence a você." });
    }
    const { status } = req.body;
    if (!SUPPORT_VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }
    const result = await dbService.setSupportTicketStatus(
      ticket.id,
      status,
      {
        ref: req.user.code,
        name: req.user.name || (isStaff ? "Suporte Fênix" : req.user.code),
        tipo: isStaff ? "suporte" : "di"
      },
      req.user?.supabaseToken
    );
    if (!result.success) return res.status(400).json({ error: result.error });
    publishSupportChange();
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao alterar status do chamado." });
  }
}));

// D.I. reabre o próprio chamado depois de fechado/resolvido
app.post("/api/support/tickets/:id/reabrir", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const ticket = await dbService.getSupportTicket(req.params.id, req.user?.supabaseToken);
    if (!ticket) return res.status(404).json({ error: "Chamado não encontrado." });
    if (isSupportStaffRole(req.user?.role)) {
      return res.status(400).json({ error: "Para o suporte, use a alteração de status." });
    }
    if (!req.user?.code) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }
    if (ticket.criadoPor !== req.user?.code) {
      return res.status(403).json({ error: "Este chamado não pertence a você." });
    }
    const result = await dbService.setSupportTicketStatus(
      ticket.id,
      "aberto",
      {
        ref: req.user.code,
        name: req.user.name || req.user.code,
        tipo: "di"
      },
      req.user?.supabaseToken
    );
    if (!result.success) return res.status(400).json({ error: result.error });
    publishSupportChange();
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao reabrir o chamado." });
  }
}));

// O responsável de suporte troca a PRÏPRIA senha (primeiro acesso ou após
// redefinição do admin). A senha do Supabase Auth é atualizada pelo próprio id da
// sessão (req.user.code = id da conta Supabase) e a flag de "troca pendente" é
// limpa. Nunca se loga a senha.
app.post("/api/support/change-password", passwordChangeRateLimiter, asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    if (req.user?.role !== "support") {
      return res.status(403).json({ error: "�?rea de suporte restrita ao suporte." });
    }
    const { novaSenha, senhaAtual } = req.body;
    if (typeof senhaAtual !== "string" || !senhaAtual || senhaAtual.length > 256) return res.status(400).json({ error: "Informe sua senha atual." });
    if (!isValidSupportPassword(novaSenha)) {
      return res.status(400).json({ error: SUPPORT_PASSWORD_HINT });
    }
    const uid = req.user?.code;
    if (!uid) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    const trusted = getSupabaseTrustedClient();
    if (!trusted) throw new Error("Autenticação indisponível.");
    if (trusted) {
      const { data: existing, error: lookupError } = await trusted.auth.admin.getUserById(String(uid));
      if (lookupError || !existing.user?.email) throw new Error("Conta indisponível.");
      const verification = await getSupabaseClient()!.auth.signInWithPassword({ email: existing.user.email, password: senhaAtual });
      if (verification.error || verification.data.user?.id !== uid) return res.status(401).json({ error: "Senha atual inválida." });
      const { error: updErr } = await trusted.auth.admin.updateUserById(String(uid), { password: novaSenha });
      if (updErr) {
        console.error("[Supabase Auth] Erro ao trocar senha do suporte:", updErr.message);
        return res.status(400).json({ error: `Não foi possível alterar a senha: ${updErr.message}` });
      }
      // O registro do painel guarda o e-mail ⅎ resolve para limpar a flag.
      const { data: userData } = await trusted.auth.admin.getUserById(String(uid)).catch(() => ({ data: null }));
      const email = userData?.user?.email;
      if (email) {
        const result = await dbService.setSupportUserMustChange(email, false, req.user.name || "Suporte", req.user?.supabaseToken);
        if (!result.success) {
          console.warn("[change-password] Falha ao limpar flag:", result.error);
        }
      }
    }

    sessions.revokeAccount(String(uid));
    const currentIdentity = await lookupIdentity(String(uid));
    if (!currentIdentity) { clearSessionCookies(res); return res.status(401).json({ error: "Faça login novamente." }); }
    setSessionCookies(res, await sessions.create(currentIdentity));
    res.json({ success: true, message: "Senha atualizada com sucesso." });
  } catch (err: any) {
    console.error("[change-password] erro:", err);
    res.status(500).json({ error: "Erro ao alterar a senha." });
  }
}));

// Caixa de entrada unificada do staff: chamados + interessados "Quero Fazer Parte" (prioridade; técnico: leads)
app.get("/api/support/inbox", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    if (!isSupportStaffRole(req.user?.role)) {
      return res.status(403).json({ error: "Acesso restrito à equipe de suporte." });
    }
    const [tickets, leads, config] = await Promise.all([
      dbService.getSupportTickets(req.user?.supabaseToken),
      dbService.getOuvidoriaMessages(undefined, undefined, undefined, req.user?.supabaseToken),
      dbService.getOuvidoriaConfig()
    ]);
    const parceriaLeads = (leads || []).filter((l) => l.tipo === "parceria");
    res.json({
      success: true,
      tickets,
      leads: parceriaLeads,
      counts: {
        todos: tickets.length,
        abertos: tickets.filter((t: any) => t.status === "aberto").length,
        em_andamento: tickets.filter((t: any) => t.status === "em_andamento").length,
        aguardando_resposta: tickets.filter((t: any) => t.status === "aguardando_resposta").length,
        resolvidos: tickets.filter((t: any) => t.status === "resolvido").length,
        fechados: tickets.filter((t: any) => t.status === "fechado").length,
        leadsPendentes: parceriaLeads.filter((l) => l.status === "pendente").length,
        leadsEmAndamento: parceriaLeads.filter((l) => l.status === "lida").length,
        leadsArquivados: parceriaLeads.filter((l) => l.status === "arquivada" || l.status === "resolvida").length,
        leadsTotal: parceriaLeads.length
      },
      emailConfig: { emailSuporte: config.emailSuporte, emailParcerias: config.emailParcerias }
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao carregar a caixa de entrada." });
  }
}));

// Status do interessado "Quero Fazer Parte" (somente staff; técnico: lead)
app.put("/api/support/ouvidoria/:id/status", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    if (!isSupportStaffRole(req.user?.role)) {
      return res.status(403).json({ error: "Acesso restrito à equipe de suporte." });
    }
    const { status } = req.body;
    if (!["pendente", "lida", "resolvida", "arquivada"].includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }
    const updated = await dbService.updateOuvidoriaMessageStatus(req.params.id, status, req.user?.code || "staff", req.user?.supabaseToken);
    if (!updated) {
      return res.status(404).json({ error: "Contato não encontrado." });
    }
    publishSupportChange();
    res.json({ success: true, message: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao atualizar status do contato." });
  }
}));

// --- ANEXOS DO SUPORTE (fotos/documentos no chat) ---
// Permitidos: imagens (JPG/PNG/WebP), PDF e Office (doc/docx/xls/xlsx).
// Limites: 10MB por arquivo, até 5 por mensagem. Imagens são re-comprimidas
// (sharp) sem perda perceptível; o original é mantido se a compressão piorar.
// Download liberado para staff E para o D.I. dono do chamado (ambos baixam).
const SUPPORT_ANEXO_EXT = /\.(png|jpe?g|webp|pdf|doc|docx|xls|xlsx)$/i;

function sniffSupportAnexo(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    if (buffer.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  }
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "application/pdf";
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return "application/zip"; // docx/xlsx (ZIP)
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return "application/x-ole-storage"; // .doc/.xls (OLE)
  return null;
}

// Compactador de imagem: JPG ⅎ JPEG q80 (mozjpeg), PNG/WebP ⅎ WebP q85,
// com redimensionamento de fotos grandes (máx. 1920px). Retorna o buffer
// comprimido + novo MIME, ou null para manter o original (se for menor).
async function compressSupportImage(buffer: Buffer, mime: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    // import dinâmico: funciona no dev (tsx/ESM) e no build (CJS ‐ vira require do sharp externo)
    const sharpLib = (await import("sharp")).default;
    let pipeline = sharpLib(buffer, { failOn: "none" });
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) return null;
    if (meta.width > 1920 || meta.height > 1920) {
      pipeline = pipeline.resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true });
    }
    if (mime === "image/png" || mime === "image/webp") {
      const out = await pipeline.clone().webp({ quality: 85 }).toBuffer();
      return out.length < buffer.length ? { buffer: out, mime: "image/webp" } : null;
    }
    const out = await pipeline.clone().jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return out.length < buffer.length ? { buffer: out, mime: "image/jpeg" } : null;
  } catch {
    return null;
  }
}

// Valida + comprime + armazena os arquivos de uma mensagem. Retorna a lista de
// anexos prontos para o JSON do chamado, ou { error } para o primeiro inválido.
async function buildSupportAnexosFromFiles(files: Express.Multer.File[], ticketId: string): Promise<{ anexos: any[] } | { error: string }> {
  const anexos = [];
  for (const f of files) {
    const check = SUPPORT_ANEXO_EXT.test(f.originalname || "");
    const sniffed = sniffSupportAnexo(f.buffer);
    if (!check || !sniffed) {
      return { error: `Arquivo "${f.originalname}" não é um tipo permitido ou está corrompido.` };
    }
    let buffer = f.buffer;
    let mime = sniffed;
    if (sniffed.startsWith("image/")) {
      const compressed = await compressSupportImage(f.buffer, sniffed);
      if (compressed) {
        buffer = compressed.buffer;
        mime = compressed.mime;
      }
    }
    const stored = await storeSupportAnexo(buffer, f.originalname, mime, ticketId);
    anexos.push({
      id: `sa-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      nome: f.originalname,
      tamanhoKb: Math.max(1, Math.round(buffer.length / 1024)),
      mime,
      key: stored.key,
      storage: stored.storage,
      isImage: stored.isImage
    });
  }
  return { anexos };
}
// Armazena no Supabase Storage (pasta suporte-anexos/<ticketId>/) — sem fallback em disco.
async function storeSupportAnexo(
  buffer: Buffer,
  originalName: string,
  mime: string,
  ticketId: string
): Promise<{ key: string; storage: "storage"; isImage: boolean }> {
  const isImage = mime.startsWith("image/");
  const cleanName = path
    .basename(originalName || "anexo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\s+/g, "_")
    .toLowerCase()
    .slice(0, 60);
  const rand = crypto.randomBytes(6).toString("hex");
  const ts = Date.now();
  const objectKey = `suporte-anexos/${ticketId}/${ts}_${rand}_${cleanName}`;

  const bucketStatus = await ensureBucketExists(STORAGE_BUCKET);
  if (!bucketStatus.ready) {
    throw new Error(`Storage indisponível: ${bucketStatus.error || "falha ao verificar bucket"}`);
  }
  await getActiveStorageClient().putObject(STORAGE_BUCKET, objectKey, buffer, buffer.length, { "Content-Type": mime });
  return { key: objectKey, storage: "storage", isImage };
}

// Anexa arquivos a uma mensagem do chamado (staff responde OU D.I. envia)
app.post("/api/support/tickets/:id/anexos", uploadRateLimiter, asyncHandler(authenticateUser), uploadConcurrency, supportAnexoMulter.array("files", 5), asyncHandler(async (req: any, res) => {
  try {
    const ticket = await dbService.getSupportTicket(req.params.id, req.user?.supabaseToken);
    if (!ticket) return res.status(404).json({ error: "Chamado não encontrado." });
    const isStaff = isSupportStaffRole(req.user?.role);
    if (!isStaff && !req.user?.code) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }
    if (!isStaff && ticket.criadoPor !== req.user?.code) {
      return res.status(403).json({ error: "Este chamado não pertence a você." });
    }
    const files: Express.Multer.File[] = req.files || [];
    const texto = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";
    if (!texto) {
      return res.status(400).json({ error: "Escreva a mensagem." });
    }
    if (files.length === 0) {
      return res.status(400).json({ error: "Envie pelo menos um arquivo." });
    }
    if (files.length > 5) {
      return res.status(400).json({ error: "Máximo de 5 arquivos por mensagem." });
    }
    const built = await buildSupportAnexosFromFiles(files, ticket.id);
    if ("error" in built) return res.status(400).json({ error: built.error });
    const result = await dbService.addSupportMessage(
      ticket.id,
      {
        tipo: isStaff ? "suporte" : "di",
        autorNome: req.user.name || (isStaff ? "Suporte Fênix" : req.user.code),
        autorRef: req.user.code,
        texto: stripTags(texto),
        anexos: built.anexos
      },
      req.user?.supabaseToken
    );
    if (!result.success) return res.status(400).json({ error: result.error });
    publishSupportChange();
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao anexar arquivos." });
  }
}));

// Download de anexo ‐ staff OU o D.I. dono do chamado (ambos baixam qualquer
// arquivo da conversa; quem não é dono e não é staff recebe 403).
app.get("/api/support/tickets/:id/anexos/:anexoId", asyncHandler(authenticateUser), asyncHandler(async (req: any, res) => {
  try {
    const ticket = await dbService.getSupportTicket(req.params.id, req.user?.supabaseToken);
    if (!ticket) return res.status(404).json({ error: "Chamado não encontrado." });
    const isStaff = isSupportStaffRole(req.user?.role);
    if (!isStaff && ticket.criadoPor !== req.user?.code) {
      return res.status(403).json({ error: "Este chamado não pertence a você." });
    }
    let anexo: any = null;
    for (const m of ticket.mensagens || []) {
      const hit = (m.anexos || []).find((a: any) => a.id === req.params.anexoId);
      if (hit) { anexo = hit; break; }
    }
    if (!anexo) return res.status(404).json({ error: "Anexo não encontrado." });
    const nome = path.basename(String(anexo.nome || "anexo").replace(/[\\/]/g, "_")).slice(0, 120);
    // Sempre attachment: no chat nada abre direto ‐ o usuário baixa e depois visualiza.
    res.setHeader("Content-Type", anexo.mime || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${nome.replace(/"/g, "")}"`);
    const stream = await getActiveStorageClient().getObject(STORAGE_BUCKET, anexo.key);
    pipeMedia(stream, res);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao entregar o anexo." });
  }
}));



// Limpeza de todos os chamados de suporte (para testes do zero)
app.post("/api/admin/support/clear-all", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const limpo = await dbService.clearAllSupportTickets(req.user?.code || "admin", req.user?.supabaseToken);
    if (!limpo.success) {
      return res.status(500).json({ error: limpo.error });
    }
    publishSupportChange();
    res.json({ success: true, message: "Todas as mensagens de suporte foram limpas com sucesso." });
  } catch (err: any) {
    console.error("[Limpeza Suporte] Erro:", err);
    res.status(500).json({ error: "Erro ao limpar chamados de suporte." });
  }
}));



// ---- ADMIN: modo manutenção ----
app.post("/api/admin/manutencao", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { ativo, mensagem } = req.body || {};
    const result = await setManutencao(!!ativo, typeof mensagem === "string" ? cleanText(mensagem) : "", req.user?.code || "admin");
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Manutenção] Erro:", err);
    res.status(500).json({ error: err?.message || "Erro ao alterar o modo manutenção." });
  }
}));

// ---- PÖBLICO: status do modo manutenção (para a página de manutenção) ----
app.get("/api/manutencao/status", asyncHandler(async (req, res) => {
  try {
    const data = await cacheJsonResponse("manutencao/status", 30000, async () => {
      const status = await getManutencaoStatus();
      return JSON.stringify({ success: true, ...status });
    });
    res.type("application/json").send(data);
  } catch {
    res.json({ success: true, ativo: false, mensagem: "" });
  }
}));

// ---- ADMIN: gerenciamento dos usuários da área de suporte ----
app.get("/api/admin/support-users", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const users = await dbService.getSupportUsers(req.user?.supabaseToken);
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao carregar usuários de suporte." });
  }
}));

app.post("/api/admin/support-users", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { email, nome, senha, ativo } = req.body;
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
    }
    if (!nome || typeof nome !== "string" || !nome.trim()) {
      return res.status(400).json({ error: "Informe o nome do usuário de suporte." });
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = await dbService.getSupportUserByEmail(cleanEmail);
    if (!existing) {
      if (!isValidSupportPassword(senha)) {
        return res.status(400).json({ error: `Informe uma senha com mínimo 8 caracteres, letras e números, para criar a conta de acesso.` });
      }
      const trusted = getSupabaseTrustedClient();
      if (trusted) {
        const { error: authErr } = await trusted.auth.admin.createUser({
          email: cleanEmail,
          password: senha,
          email_confirm: true
        });
        if (authErr) {
          console.error("[Supabase Auth] Erro ao criar usuário de suporte:", authErr.message);
          return res.status(400).json({ error: `Erro ao criar a conta: ${authErr.message}` });
        }
      }
    }
    const result = await dbService.saveSupportUser(
      {
        email: cleanEmail,
        nome: cleanText(nome),
        ativo: ativo !== undefined ? !!ativo : true,
        // Senha do admin é temporária: no cadastro novo, o responsável é
        // obrigado a definir a própria senha no próximo login.
        mustChangePassword: existing ? undefined : true
      },
      req.user?.code || "Admin",
      req.user?.supabaseToken
    );
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({
      success: true,
      message: existing ? "Usuário de suporte atualizado." : "Usuário de suporte cadastrado com sucesso."
    });
  } catch (err: any) {
    console.error("[support-users] erro:", err);
    res.status(500).json({ error: "Erro ao cadastrar usuário de suporte." });
  }
}));

// Redefinição de senha de um responsável pelo admin: define uma nova senha
// temporária (repassada ao responsável) e marca a troca como pendente ‐ no
// próximo login o responsável deverá escolher a própria senha.
app.post("/api/admin/support-users/:email/reset-password", passwordChangeRateLimiter, asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { novaSenha } = req.body;
    if (!isValidSupportPassword(novaSenha)) {
      return res.status(400).json({ error: SUPPORT_PASSWORD_HINT });
    }
    const rawEmail = String(req.params.email || "");
    let email: string;
    try {
      email = decodeURIComponent(rawEmail).trim().toLowerCase();
    } catch {
      return res.status(400).json({ error: "E-mail inválido." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "E-mail inválido." });
    }
    const supportUser = await dbService.getSupportUserByEmail(email);
    if (!supportUser) {
      return res.status(404).json({ error: "Responsável de suporte não encontrado." });
    }

    const trusted = getSupabaseTrustedClient();
    if (trusted) {
      // Localiza a conta Supabase Auth pelo e-mail (o registro do painel só guarda o e-mail).
      const { data: list } = await trusted.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const account = (list?.users || []).find((u: any) => (u.email || "").toLowerCase() === email);
      if (!account) {
        // Sem conta de acesso (config legada): recria a conta com a senha temporária.
        const { error: createErr } = await trusted.auth.admin.createUser({ email, password: novaSenha, email_confirm: true });
        if (createErr) {
          console.error("[Supabase Auth] Erro ao recriar conta no reset:", createErr.message);
          return res.status(400).json({ error: `Erro ao recriar a conta: ${createErr.message}` });
        }
      } else {
        const { error: updErr } = await trusted.auth.admin.updateUserById(account.id, { password: novaSenha });
        if (updErr) {
          console.error("[Supabase Auth] Erro ao redefinir senha:", updErr.message);
          return res.status(400).json({ error: `Erro ao redefinir a senha: ${updErr.message}` });
        }
      }
    }

    // Auth updated_at is revalidated on every request; explicit revocation also
    // covers requests in flight on this process.
    const { data: accounts } = await getSupabaseTrustedClient()!.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const resetAccount = accounts?.users.find(u => u.email?.toLowerCase() === email);
    if (resetAccount) sessions.revokeAccount(resetAccount.id);
    const flag = await dbService.setSupportUserMustChange(email, true, req.user?.code || "Admin", req.user?.supabaseToken);
    if (!flag.success) return res.status(400).json({ error: flag.error });

    res.json({ success: true, message: "Senha redefinida. O responsável definirá a própria senha no próximo acesso." });
} catch (err: any) {
    console.error("[reset-password] erro:", err);
    res.status(500).json({ error: "Erro ao redefinir a senha." });
  }
}));

// ====================================================================
// NIPPONFLEX — D.I.s (fonte de dados: API Nipponflex)
// ====================================================================

// Status do sistema de sincronização (para o card "Estado do Sistema" no admin)
app.get("/api/admin/nipponflex/status", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const estado = getNfEstado();
    const logs = getNfLogs();
    const metricas = await obterMetricasDis();
    res.json({ success: true, estado, logs, metricas });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao obter status do Nipponflex." });
  }
}));

// Sincronização manual (botão de emergência "SINCRONIZAR DADOS").
// Roda em background (fire-and-forget) — a resposta volta na hora e o
// card acompanha o andamento pelo status/logs.
app.post("/api/admin/nipponflex/sync", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    if (getNfEstado().status === "em_andamento") {
      return res.json({ success: false, erro: "Sincronização já em andamento." });
    }
    // Dispara em background, sem bloquear a resposta HTTP.
    executarSincronizacao().catch((e) => console.error("[Nipponflex] erro no sync manual:", e));
    res.json({ success: true, iniciado: true });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao disparar sincronização." });
  }
}));

// Lista paginada de D.I.s (nome, código, situação)
app.get("/api/admin/nipponflex/dados", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const pagina = Math.max(1, parseInt(String(req.query.pagina || "1"), 10) || 1);
    const busca = String(req.query.busca || "").trim();
    const situacao = String(req.query.situacao || "todos").trim();
    const result = await obterDisPaginado(pagina, busca, situacao);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao listar D.I.s." });
  }
}));

// Situações que podem logar no site (ex.: ["A"] inicialmente)
app.get("/api/admin/nipponflex/situacoes-permitidas", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const client = getSupabaseTrustedClient();
    const { data } = await client!.from("config").select("value").eq("key", "disSituacoesPermitidas").maybeSingle();
    res.json({ success: true, situacoes: Array.isArray(data?.value) ? data.value : ["A"] });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao obter situações permitidas." });
  }
}));

app.post("/api/admin/nipponflex/situacoes-permitidas", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { situacoes } = req.body;
    if (!Array.isArray(situacoes)) {
      return res.status(400).json({ error: "Envie uma lista de situações." });
    }
    const permitidas = situacoes.map((s) => String(s).toUpperCase()).filter((s) => ["A", "I", "P", "S", "D"].includes(s));
    const client = getSupabaseTrustedClient();
    await client!.from("config").upsert({ key: "disSituacoesPermitidas", value: permitidas });
    await dbService.recordAuditLog(req.user?.code || "Admin", "ATUALIZAR_SITUACOES_DI", `Situações permitidas para login D.I.: ${permitidas.join(", ") || "(nenhuma)"}`, req.user?.supabaseToken);
    res.json({ success: true, situacoes: permitidas });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao salvar situações permitidas." });
  }
}));

// ---------------- SUPABASE STORAGE & STREAMING ENDPOINTS ----------------

// ==========================================
// NOTIFICAÆÑES POR E-MAIL (config admin ‐ destinos + toggles + status SMTP)
// ==========================================
// Credenciais SMTP vivem só no .env do servidor (SMTP_HOST/SMTP_PORT/SMTP_SECURE/
// SMTP_USER/SMTP_PASS/MAIL_FROM_NAME). O painel só vê o status (user mascarado).
// Envio é fire-and-forget: falha de e-mail nunca quebra formulário ou API.

app.get("/api/admin/support/email-config", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const config = await dbService.getOuvidoriaConfig();
    res.json({
      success: true,
      config: {
        emailSuporte: config.emailSuporte,
        emailParcerias: config.emailParcerias,
        notifySuporteEmail: !!config.notifySuporteEmail,
        notifyParceriaEmail: !!config.notifyParceriaEmail
      },
      smtp: getSmtpStatus()
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao obter configurações de e-mail." });
  }
}));

app.post("/api/admin/support/email-config", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { emailSuporte, emailParcerias, notifySuporteEmail, notifyParceriaEmail } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailSuporte !== undefined && !emailRegex.test(String(emailSuporte).trim())) {
      return res.status(400).json({ error: "E-mail de suporte inválido." });
    }
    if (emailParcerias !== undefined && !emailRegex.test(String(emailParcerias).trim())) {
      return res.status(400).json({ error: "E-mail de parcerias inválido." });
    }
    const updated = await dbService.updateOuvidoriaConfig(
      {
        emailSuporte: typeof emailSuporte === "string" && emailSuporte.trim() ? stripTags(emailSuporte.trim()) : undefined,
        emailParcerias: typeof emailParcerias === "string" && emailParcerias.trim() ? stripTags(emailParcerias.trim()) : undefined,
        notifySuporteEmail: typeof notifySuporteEmail === "boolean" ? notifySuporteEmail : undefined,
        notifyParceriaEmail: typeof notifyParceriaEmail === "boolean" ? notifyParceriaEmail : undefined
      },
      req.user?.code || "admin"
    );
    res.json({
      success: true,
      config: {
        emailSuporte: updated.emailSuporte,
        emailParcerias: updated.emailParcerias,
        notifySuporteEmail: !!updated.notifySuporteEmail,
        notifyParceriaEmail: !!updated.notifyParceriaEmail
      },
      smtp: getSmtpStatus()
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao salvar configurações de e-mail." });
  }
}));

app.post("/api/admin/support/email-test", asyncHandler(requireAdmin), asyncHandler(async (req: any, res) => {
  try {
    const { to } = req.body;
    const config = await dbService.getOuvidoriaConfig();
    const destino = typeof to === "string" && to.trim() ? to.trim() : config.emailSuporte;
    const result = await sendTestEmail(destino);
    if (result.ok) {
      return res.json({ success: true, message: result.message });
    }
    return res.status(400).json({ success: false, error: result.error || "Erro ao enviar e-mail de teste." });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao testar e-mail." });
  }
}));

// ---------------- SUPABASE STORAGE & STREAMING ENDPOINTS ----------------

// ==========================================
// STATUS DAS INTEGRAÇÕES (Supabase Storage + Vimeo)
// ==========================================
// Verifica conectividade real SEM expor nenhuma credencial (token, client
// secret nunca saem do servidor).
app.get("/api/admin/integrations/status", asyncHandler(requireAdmin), asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await integrationStatus());
}));

// Multipart / Buffer / Base64 Direct Upload to Supabase Storage with Folder Structure
// Somente ADMIN: permite gravar em qualquer pasta da allowlist (inclusive
// materiais/ e cursos/videos). Usuários comuns têm rotas próprias com escopo
// fixo (fenix_social via /api/fenix-social/posts, anexos via /api/support/*).
app.post("/api/storage/upload", uploadRateLimiter, asyncHandler(requireAdmin), uploadConcurrency, uploadMulter.single("file"), asyncHandler(async (req: any, res) => {
  try {
    let fileBuffer: Buffer | null = null;
    let fileName = "arquivo";
    let mimeType = "application/octet-stream";
    const folder = sanitizeUploadFolder(req.body.folder);
    if (folder === null) {
      return res.status(400).json({ error: "Pasta de destino inválida." });
    }

    if (req.file) {
      fileBuffer = req.file.buffer;
      fileName = req.file.originalname;
      mimeType = req.file.mimetype;
    } else if (req.body.fileBase64) {
      const matches = req.body.fileBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        fileBuffer = Buffer.from(matches[2], "base64");
        if (req.body.fileName) fileName = req.body.fileName;
      }
    }

    if (!fileBuffer) {
      return res.status(400).json({ error: "Nenhum arquivo ou base64 fornecido para upload." });
    }

    // Validação de conteúdo (extensão + magic bytes + anti-XSS) ‐ vale para multipart e base64
    const validation = validateUploadBuffer(fileBuffer, fileName);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error || "Arquivo rejeitado." });
    }

    const cleanName = fileName.toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
    const timestamp = Date.now();
    const rand = crypto.randomBytes(4).toString("hex");
    const objectKey = `${folder}/${timestamp}_${rand}_${cleanName}`;
    if (objectKey.length > 400) {
      return res.status(400).json({ error: "Nome do arquivo muito longo." });
    }
    const isVideo = mimeType.startsWith("video/");

    const bucketStatus = await ensureBucketExists(STORAGE_BUCKET);
    if (!bucketStatus.ready) {
      return res.status(500).json({ error: `Storage indisponível: ${bucketStatus.error || "falha ao verificar bucket"}` });
    }

    try {
      const client = getActiveStorageClient();

      await client.putObject(STORAGE_BUCKET, objectKey, fileBuffer, fileBuffer.length, {
        "Content-Type": mimeType
      });

      const previewUrl = `/api/storage/preview/${encodeURIComponent(objectKey)}`;
      const streamUrl = `/api/storage/stream/${encodeURIComponent(objectKey)}`;
      const hlsUrl = `/api/storage/hls/master.m3u8?key=${encodeURIComponent(objectKey)}`;

      return res.json({
        success: true,
        storage: "storage",
        bucket: STORAGE_BUCKET,
        objectKey,
        mimeType,
        url: isVideo ? streamUrl : previewUrl,
        previewUrl,
        streamUrl,
        hlsUrl: isVideo ? hlsUrl : undefined
      });
    } catch (uploadErr: any) {
      console.error("[Storage Upload Error]:", uploadErr?.message || uploadErr);
      return res.status(500).json({ error: `Falha ao gravar arquivo no Storage: ${uploadErr?.message || uploadErr}` });
    }
  } catch (err: any) {
    console.error("Erro ao realizar upload no Storage:", err);
    res.status(500).json({ error: "Falha ao gravar arquivo no armazenamento." });
  }
}));

// Objetos das famílias de backup (backups-site/, backups-banco/, backup-suporte/)
// contêm dados sensíveis (configs com vimeoConfig/supportTickets,
// contas, audit_logs, conversas completas de suporte) e NUNCA são servidos
// pelas rotas públicas de mídia ‐ somente pelas rotas admin
// (/api/admin/backup/*download). Anexos do suporte (suporte-anexos/) também são
// privados (download só pelo painel do atendente). Resposta 404 idêntica à de
// arquivo inexistente.
const BACKUP_FAMILY_PREFIXES = ["backups-site/", "backups-banco/", "backup-suporte/", "suporte-anexos/"];
function isBackupFamilyKey(objectKey: string): boolean {
  return BACKUP_FAMILY_PREFIXES.some((p) => objectKey.startsWith(p));
}

// Serve Images / Documents directly from Supabase Storage
// Mídias de material (pasta materiais/*) são protegidas: só servidas com sessão
// válida (cookie httpOnly OU Authorization Bearer ‐ o mesmo fallback do
// authenticateUser, para <img>/<video>/<a href> seguirem funcionando). Anônimos
// recebem o MESMO 404 de arquivo inexistente (não revela existência do arquivo).
// Requests do próprio servidor (loopback ‐ ex.: ffmpeg remuxando HLS de material
// via http://127.0.0.1:PORT) passam sem sessão.
function mediaAbortSignal(res: import("express").Response, timeout = 120000): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  timer.unref();
  res.once("close", () => { clearTimeout(timer); controller.abort(); });
  res.once("finish", () => clearTimeout(timer));
  return controller.signal;
}
function pipeMedia(stream: import("node:stream").Readable, res: import("express").Response) {
  res.once("close", () => stream.destroy());
  stream.once("error", () => { if (res.headersSent) res.destroy(); else res.status(502).end(); });
  stream.pipe(res);
}
const internalMediaTokens = new Map<string, { key: string; expiresAt: number }>();
async function isMaterialMediaAllowed(req: any, res: any): Promise<boolean> {
  const user = await resolveUser(req, res);
  return !!user && !user.mustChangePassword;
}
async function authorizeMedia(req: any, res: any, key: string): Promise<boolean> {
  const internal = typeof req.headers["x-internal-ffmpeg"] === "string" && internalMediaTokens.get(req.headers["x-internal-ffmpeg"]);
  const socket = req.socket?.remoteAddress;
  if (internal && internal.key === key && internal.expiresAt > Date.now() && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(socket)) {
    res.setHeader("Cache-Control", "private, no-store");
    return true;
  }
  const policy = await mediaPolicy(key);
  res.setHeader("Cache-Control", policy === "public" ? "public, max-age=60" : "private, no-store");
  if (policy === "blocked") return false;
  if (policy === "public") return true;
  const user = await resolveUser(req, res);
  if (user?.mustChangePassword) return false;
  if (policy === "member") return !!user;
  if (user?.role === "admin") return true;
  const moderator = req.cookies?.moderator_media;
  return typeof moderator === "string" && moderator.length <= 256 && !!(await dbService.validateModeratorToken(moderator));
}

// --- Proteção contra travamento do Storage remoto sob concorrência ---
// Quando o Storage fica lento/fora (ex.: rede), as requisições simultâneas
// (ex.: 7 imagens da home) seguram os 6 sockets HTTP do navegador por host e
// deixam as views lazy (Suspense) parecendo travadas. Um timeout curto nas
// chamadas remotas garante que os sockets sejam liberados em poucos segundos;
// previews pequenos ficam em memória (revisitas instantâneas).

const STORAGE_PREVIEW_CACHE_MAX_ITEMS = 200;
const STORAGE_PREVIEW_CACHE_MAX_BYTES = 128 * 1024 * 1024;
const STORAGE_PREVIEW_CACHE_MAX_FILE = 4 * 1024 * 1024;
const STORAGE_PREVIEW_CACHE_TTL = 60 * 60 * 1000;
const storagePreviewCache = new Map<string, { data: Buffer; mime: string; time: number }>();
const imagePreviewPending = new Map<string, Promise<{ data: Buffer; mime: string }>>();
let storagePreviewCacheBytes = 0;
function storagePreviewCacheGet(key: string) {
  const hit = storagePreviewCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > STORAGE_PREVIEW_CACHE_TTL) {
    storagePreviewCache.delete(key);
    storagePreviewCacheBytes -= hit.data.length;
    return null;
  }
  return hit;
}
function storagePreviewCacheSet(key: string, data: Buffer, mime: string) {
  if (data.length > STORAGE_PREVIEW_CACHE_MAX_FILE) return;
  const old = storagePreviewCache.get(key);
  if (old) storagePreviewCacheBytes -= old.data.length;
  storagePreviewCache.set(key, { data, mime, time: Date.now() });
  storagePreviewCacheBytes += data.length;
  while (storagePreviewCache.size > STORAGE_PREVIEW_CACHE_MAX_ITEMS || storagePreviewCacheBytes > STORAGE_PREVIEW_CACHE_MAX_BYTES) {
    const firstKey = storagePreviewCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    const evicted = storagePreviewCache.get(firstKey);
    storagePreviewCache.delete(firstKey);
    if (evicted) storagePreviewCacheBytes -= evicted.data.length;
  }
}

app.get("/api/storage/preview/*", mediaConcurrency, asyncHandler(async (req, res) => {
  try {
    const rawKey = req.params[0];
    if (!rawKey) return res.status(400).json({ error: "Chave do arquivo ausente." });

    const objectKey = storageKey(rawKey);
    if (!objectKey) {
      return res.status(400).json({ error: "Chave do arquivo inválida." });
    }
    if (isBackupFamilyKey(objectKey)) {
      return res.status(404).json({ error: "Arquivo não encontrado no Storage." });
    }
    const ext = fileExtOf(objectKey);
    const mime = EXT_TO_MIME[ext] || "application/octet-stream";
    if (!await authorizeMedia(req, res, objectKey)) {
      return res.status(404).json({ error: "Arquivo não encontrado no Storage." });
    }

    const isExplicitDownload = req.query.download === "1" || req.query.download === "true";
    const width = previewWidth(req.query, isExplicitDownload);
    const sendPreview = async (data: Buffer, originalMime: string) => {
      let image = { data, mime: originalMime };
      if (width) {
        const variantKey = `${objectKey}:webp:${width}`;
        const cached = storagePreviewCacheGet(variantKey);
        if (cached) image = cached;
        else {
          let pending = imagePreviewPending.get(variantKey);
          if (!pending) {
            pending = resizePreview(data, originalMime, width).then(result => {
              storagePreviewCacheSet(variantKey, result.data, result.mime);
              return result;
            }).finally(() => imagePreviewPending.delete(variantKey));
            imagePreviewPending.set(variantKey, pending);
          }
          image = await pending;
        }
      }
      res.setHeader('Content-Type', image.mime);
      return res.end(image.data);
    };
    const getSafeFilename = () => {
      let safeName = (typeof req.query.filename === "string" && req.query.filename.trim())
        ? req.query.filename.trim().replace(/[\r\n"]/g, "_")
        : path.basename(objectKey).replace(/[\r\n"]/g, "_");
      if (!path.extname(safeName) && ext) safeName += ext;
      return safeName;
    };

    const cacheHit = storagePreviewCacheGet(objectKey);
    if (cacheHit) {
      res.setHeader("Content-Type", cacheHit.mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (isExplicitDownload) res.setHeader("Cache-Control", "private, no-store");
      if (isExplicitDownload) {
        const safeName = getSafeFilename();
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
      } else if (!INLINE_MEDIA_EXT.has(ext) && !objectKey.startsWith("fenix_social/")) {
        const safeName = path.basename(objectKey).replace(/[\r\n"]/g, "_");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      }
      return await sendPreview(cacheHit.data, cacheHit.mime);
    }

    const client = getActiveStorageClient();

    const stat = await withTimeout(client.statObject(STORAGE_BUCKET, objectKey), 1500, "Timeout no Storage");
    const dispositionHeaders = () => {
      if (isExplicitDownload) {
        const safeName = getSafeFilename();
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
      } else if (!INLINE_MEDIA_EXT.has(ext) && !objectKey.startsWith("fenix_social/")) {
        const safeName = path.basename(objectKey).replace(/[\r\n"]/g, "_");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      }
    };
    if (stat.size <= STORAGE_PREVIEW_CACHE_MAX_FILE) {
      const stream = await client.getObject(STORAGE_BUCKET, objectKey, mediaAbortSignal(res, 4000));
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > STORAGE_PREVIEW_CACHE_MAX_FILE) { stream.destroy(); throw new Error("Preview excedeu o limite."); }
        chunks.push(buffer);
      }
      const data = Buffer.concat(chunks);
      storagePreviewCacheSet(objectKey, data, mime);
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (isExplicitDownload) res.setHeader("Cache-Control", "private, no-store");
      dispositionHeaders();
      await sendPreview(data, mime);
    } else {
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (isExplicitDownload) res.setHeader("Cache-Control", "private, no-store");
      dispositionHeaders();
      const stream = await client.getObject(STORAGE_BUCKET, objectKey, mediaAbortSignal(res));
      pipeMedia(stream, res);
    }
  } catch (err: any) {
    res.status(404).json({ error: "Arquivo não encontrado no Storage." });
  }
}));

// Stream Video / Audio with Range Requests support
app.get("/api/storage/stream/*", mediaConcurrency, asyncHandler(async (req, res) => {
  try {
    const rawKey = req.params[0];
    if (!rawKey) return res.status(400).json({ error: "Chave do arquivo ausente." });

    const objectKey = storageKey(rawKey);
    if (!objectKey) {
      return res.status(400).json({ error: "Chave do arquivo inválida." });
    }
    if (isBackupFamilyKey(objectKey)) {
      return res.status(404).json({ error: "Mídia/Vídeo não encontrado no Storage." });
    }
    if (!await authorizeMedia(req, res, objectKey)) {
      return res.status(404).json({ error: "Mídia/Vídeo não encontrado no Storage." });
    }

    const client = getActiveStorageClient();
    const stat = await withTimeout(client.statObject(STORAGE_BUCKET, objectKey), 1500, "Timeout no Storage");
    const fileSize = stat.size;
    const ext = fileExtOf(objectKey);
    const contentType = EXT_TO_MIME[ext] || "video/mp4";
    const streamHeaders: Record<string, string> = {
      "X-Content-Type-Options": "nosniff"
    };
    // Mídias do Fênix Social são SEMPRE inline (só visualização ‐ sem baixar)
    if (!INLINE_MEDIA_EXT.has(ext) && !objectKey.startsWith("fenix_social/")) {
      streamHeaders["Content-Type"] = "application/octet-stream";
      const safeName = path.basename(objectKey).replace(/[\r\n"]/g, "_");
      streamHeaders["Content-Disposition"] = `attachment; filename="${safeName}"`;
    } else {
      streamHeaders["Content-Type"] = contentType;
    }

    const range = req.headers.range;
    if (range) {
      const parsed = parseByteRange(range, fileSize);
      if (!parsed) { res.setHeader("Content-Range", `bytes */${fileSize}`); return res.status(416).end(); }
      const { start, end } = parsed;
      const chunkSize = end - start + 1;
      const stream = await client.getPartialObject(STORAGE_BUCKET, objectKey, start, chunkSize, mediaAbortSignal(res));

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        ...streamHeaders
      });

      pipeMedia(stream, res);
    } else {
      const stream = await client.getObject(STORAGE_BUCKET, objectKey, mediaAbortSignal(res));
      res.writeHead(200, {
        "Content-Length": fileSize,
        ...streamHeaders
      });

      pipeMedia(stream, res);
    }
  } catch (err: any) {
    res.status(404).json({ error: "Mídia/Vídeo não encontrado no Storage." });
  }
}));

// HLS playlists and segments share exactly the same object authorization.
app.get("/api/storage/hls/master.m3u8", mediaConcurrency, asyncHandler(async (req, res) => {
  const key = storageKey(req.query.key);
  if (!key) return res.status(400).json({ error: "Chave do arquivo inválida." });
  if (!await authorizeMedia(req, res, key)) return res.status(404).json({ error: "Playlist não encontrada." });
  const stat = await getActiveStorageClient().statObject(STORAGE_BUCKET, key);
  if (stat.size > 200 * 1024 * 1024) return res.status(413).json({ error: "Vídeo excede o limite de processamento." });
  const token = crypto.randomBytes(32).toString("base64url");
  internalMediaTokens.set(token, { key, expiresAt: Date.now() + 6 * 60 * 1000 });
  try {
    const playlist = await hlsPlaylist(key, `http://127.0.0.1:${PORT}/api/storage/stream/${encodeURIComponent(key)}`, token);
    res.setHeader("Cache-Control", "private, no-store");
    res.type("application/vnd.apple.mpegurl").send(playlist);
  } catch (error: any) {
    res.status(error.status === 429 ? 429 : 503).json({ error: "Vídeo disponível pela reprodução direta.", fallbackUrl: `/api/storage/stream/${encodeURIComponent(key)}` });
  } finally { internalMediaTokens.delete(token); }
}));
app.get("/api/storage/hls/segment/:hash/:segment", mediaConcurrency, asyncHandler(async (req, res) => {
  const { hash, segment } = req.params;
  if (!/^[a-f0-9]{64}$/.test(hash) || !/^seg_\d{3,6}\.ts$/.test(segment)) return res.status(400).json({ error: "Segmento inválido." });
  const key = hlsObject(hash);
  if (!key || !await authorizeMedia(req, res, key)) return res.status(404).json({ error: "Segmento não encontrado." });
  const file = hlsSegment(hash, segment);
  if (!file) return res.status(404).json({ error: "Segmento não encontrado." });
  res.setHeader("Cache-Control", "private, no-store");
  res.type("video/mp2t").sendFile(file);
}));

// ==========================================
// VIMEO API ENDPOINTS (credenciais somente via env/banco ‐ nunca editáveis no painel)
// ==========================================

// Verify Vimeo Connection & Get Account Info
app.get("/api/admin/vimeo/me", asyncHandler(requireAdmin), asyncHandler(async (req, res) => {
  try {
    const config = await dbService.getVimeoConfig();
    if (!config.accessToken || !config.clientId || !config.clientSecret) {
      return res.status(400).json({
        error: "Credenciais da API Vimeo não configuradas. Configure VIMEO_CLIENT_ID, VIMEO_CLIENT_SECRET e VIMEO_ACCESS_TOKEN nas variáveis de ambiente do servidor."
      });
    }

    const account = await getVimeoAccountDetails(
      config.clientId.trim(),
      config.clientSecret.trim(),
      config.accessToken.trim()
    );

    return res.json({ success: true, account });
  } catch (err: any) {
    console.error("[vimeo/me] erro:", err);
    return res.status(500).json({ error: "Falha ao conectar com a API do Vimeo." });
  }
}));

// List Videos from Admin's Vimeo Account (Node Vimeo SDK)
app.get("/api/admin/vimeo/my-videos", asyncHandler(requireAdmin), asyncHandler(async (req, res) => {
  try {
    const config = await dbService.getVimeoConfig();
    if (!config.accessToken || !config.clientId || !config.clientSecret) {
      return res.status(400).json({
        error: "Credenciais da API Vimeo não configuradas. Configure as variáveis de ambiente VIMEO_* do servidor."
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 24;
    const search = (req.query.search as string) || "";

    const result = await fetchMyVimeoVideos(
      config.clientId.trim(),
      config.clientSecret.trim(),
      config.accessToken.trim(),
      page,
      perPage,
      search
    );

    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[vimeo/my-videos] erro:", err);
    return res.status(500).json({ error: "Erro ao buscar vídeos da conta Vimeo." });
  }
}));

// Fetch Vimeo Video Details via Vimeo API (somente usuários autenticados + rate limit)
app.post("/api/vimeo/info", vimeoInfoRateLimiter, asyncHandler(authenticateUser), asyncHandler(async (req, res) => {
  try {
    const { videoInput } = req.body;
    if (!videoInput) {
      return res.status(400).json({ error: "Nenhum ID ou link do Vimeo fornecido." });
    }

    // Extract video ID & hash
    let trimmed = String(videoInput).trim();
    if (trimmed.includes("<iframe")) {
      const srcMatch = trimmed.match(/src=["']([^"']+)["']/);
      if (srcMatch && srcMatch[1]) trimmed = srcMatch[1];
    }

    let videoId = "";
    let hash = "";

    if (trimmed.includes("player.vimeo.com/video/")) {
      const parts = trimmed.split("player.vimeo.com/video/")[1] || "";
      const [idPart, queryPart] = parts.split("?");
      videoId = idPart?.split("/")[0] || "";
      if (queryPart) {
        const params = new URLSearchParams(queryPart);
        hash = params.get("h") || "";
      }
    } else if (trimmed.includes("vimeo.com/")) {
      const pathStr = trimmed.split("vimeo.com/")[1]?.split("?")[0] || "";
      const segments = pathStr.split("/").filter(Boolean);
      if (segments.length >= 1) videoId = segments[0];
      if (segments.length >= 2) hash = segments[1];
    } else if (/^\d+$/.test(trimmed)) {
      videoId = trimmed;
    }

    if (!videoId) {
      return res.status(400).json({ error: "ID de vídeo Vimeo não reconhecido." });
    }

    const embedUrl = constructProtectedEmbedUrl(videoId, hash);

    const vimeoConfig = await dbService.getVimeoConfig();
    const token = vimeoConfig.accessToken?.trim();

    if (token) {
      // Call official Vimeo API v3
      try {
        const vimeoRes = await fetch(`https://api.vimeo.com/videos/${videoId}${hash ? `:${hash}` : ""}`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "User-Agent": "FenixEscola/1.0"
          }
        });

        if (vimeoRes.ok) {
          const vData: any = await vimeoRes.json();
          const durationSeconds = vData.duration || 0;
          const mins = Math.floor(durationSeconds / 60);
          const secs = Math.floor(durationSeconds % 60);
          const durationFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

          const pictures = vData.pictures?.sizes || [];
          const thumbnail = pictures.length > 0 ? pictures[pictures.length - 1].link : "";

          return res.json({
            success: true,
            videoId,
            hash,
            embedUrl,
            title: vData.name || "",
            durationSeconds,
            durationFormatted,
            thumbnail,
            description: vData.description || "",
            source: "vimeo_api"
          });
        }
      } catch (apiErr) {
        console.warn("[Vimeo API Fetch Error]:", apiErr);
      }
    }

    // Fallback response with parsed embed URL
    return res.json({
      success: true,
      videoId,
      hash,
      embedUrl,
      title: "",
      durationFormatted: "Auto",
      thumbnail: "",
      source: "vimeo_parser"
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Falha ao obter informações do vídeo." });
  }
}));


// Qualquer /api/* sem rota correspondente => 404 JSON (nunca o fallback HTML da SPA)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

// Error handler global de /api: erros de multipart/multer viram 400 JSON; o resto
// é 500 genérico (nunca detalhes internos na resposta). Fora de /api passa adiante
// (mantém o overlay de erros do Vite em dev).
app.use((err: any, req: any, res: any, next: any) => {
  if (res.headersSent) return next(err);
  if (!String(req.path || "").startsWith("/api/")) return next(err);
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido." });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Conteúdo excede o limite permitido." });
  const msg = String(err?.message || "");
  if (err && (err.name === "MulterError" || err.code === "LIMIT_FILE_SIZE" || /malformed|unexpected field|part/i.test(msg))) {
    return res.status(400).json({ error: "Upload inválido ou corrompido." });
  }
  console.error("[API Error]", req.method, req.path, err);
  return res.status(500).json({ error: "Erro interno do servidor." });
});

// Start custom server combined with Vite
async function start() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode with Vite Dev Server integrated
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), "dist");

    // /assets/*: gzip + cache imutável (nomes hasheados). Sempre antes do
    // express.static para servir versões comprimidas e evitar revalidação.
    const ASSET_MIME: Record<string, string> = {
      js: "application/javascript; charset=UTF-8",
      css: "text/css; charset=UTF-8",
      svg: "image/svg+xml",
      json: "application/json; charset=UTF-8"
    };
    const assetGzipCache = new Map<string, { gz: Buffer; raw: Buffer }>();
    app.use("/assets", (req, res, next) => {
      let pathname = req.path || "";
      try {
        pathname = decodeURIComponent(pathname);
      } catch {
        return next();
      }
      const ext = path.extname(pathname).slice(1).toLowerCase();
      const isCompressible = ASSET_MIME[ext] && /gzip/.test((req.headers["accept-encoding"] || "").toLowerCase());
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      if (!isCompressible) return next();

      const file = path.join(distPath, "assets", path.basename(pathname));
      if (!fs.existsSync(file)) return next();
      let entry = assetGzipCache.get(pathname);
      if (!entry) {
        try {
          const raw = fs.readFileSync(file);
          entry = { gz: gzipSync(raw), raw };
          assetGzipCache.set(pathname, entry);
        } catch {
          return next();
        }
      }
      res.setHeader("Content-Type", ASSET_MIME[ext]);
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Length", String(entry.gz.length));
      return res.end(entry.gz);
    });

    // Guarda: nunca servir arquivos sensíveis que estejam dentro de dist/
    // (server.cjs, sourcemaps, docs, envs, sql, logs, db.json...)
    const SENSITIVE_STATIC = /\.(cjs|map|md|sql|bat|log|env|ts|tsx|pem|key|zip)$/i;
    const SENSITIVE_NAMES = new Set([
      "server.cjs", "server.cjs.map", "db.json", "package.json", "package-lock.json",
      "metadata.json", "estado_plataforma.md", "AGENTS.md", "DOCUMENTACAO.md",
      "CORRECOES-SEGURANCA.md", "Vulnerabilidades.txt", "Correcoes-Seguranca.txt",
      "supabase_schema.sql", "supabase-security-fix.sql",
      ".env", ".env.example", "dev-server.bat", "dev-server.log", "dev-server.err.log"
    ]);
    app.use((req, res, next) => {
      let pathname = req.path || "";
      try {
        pathname = decodeURIComponent(pathname);
      } catch {
        return res.status(404).send("Not Found");
      }
      const base = pathname.split("/").pop() || "";
      if (SENSITIVE_STATIC.test(pathname) || SENSITIVE_NAMES.has(base) || pathname.split("/").some(part => part.startsWith("."))) {
        return res.status(404).send("Not Found");
      }
      next();
    });
    app.use(express.static(distPath, { dotfiles: "deny", index: false }));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // "::" = dual-stack (IPv6 + IPv4): sem isso, "localhost" (que resolve para
  // ::1 no Windows) faz o navegador tentar IPv6 primeiro e esperar ~19s de
  // retransmissões de SYN antes de cair para IPv4 (view parecia travada).
const server = app.listen(PORT, isProduction ? "::" : "127.0.0.1", () => {
    console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  });

  // Agendadores diários:
  // 1. API Nipponflex: roda às 02:30 (horário de Brasília).
  carregarEstadoInicial().then(() => {
    verificarAgendador();
  });
  setInterval(() => {
    verificarAgendador().catch((e) => console.error("[Nipponflex] erro no agendador:", e));
  }, 60_000);

  // Request timeout unlimited (large uploads), but keep-alive com teto contra
  // DoS de conexões paradas. ATENÆÂO: keepAliveTimeout baixo (5s) faz o Node
  // fechar sockets ociosos enquanto o navegador ainda os reutiliza ‐ o request
  // morre em silêncio e o Chrome só percebe ~19s depois (view parecia travada,
  // fallback do Suspense preso). 60s é o valor padrão da comunidade: navegadores
  // reutilizam sockets por até ~60s; acima disso eles abrem conexão nova mesmo.
  server.setTimeout(120000);
  server.requestTimeout = 120000;
  server.keepAliveTimeout = 60000;
  server.headersTimeout = 66000;
}

if (process.env.FENIX_AUTOSTART !== "0") start();
