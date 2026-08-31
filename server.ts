import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { gzipSync } from "zlib";
import { spawn } from "child_process";
import multer from "multer";
import helmet from "helmet";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import { dbService, LeaderBio, Novidade, Curso, Material, Banner, FenixPost, supabase, getSupabaseTrustedClient } from "./src/server/db.js";
import { 
  initMinioClient, 
  getActiveMinioClient, 
  getActiveMinioConfig, 
  testMinioConnection, 
  ensureMinioBucketExists,
  withTimeout 
} from "./src/server/minioService.js";
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
import {
  createSiteBackup,
  listSiteBackups,
  restoreSiteBackup,
  getSiteStatus,
  getManutencaoStatus,
  setManutencao,
  deleteSiteBackup,
  buildBackupZip,
  createDatabaseDump,
  listBancoBackups,
  deleteBancoBackup,
  buildBancoBackupZip,
  buildSuporteBackupZip,
  ensureDeleteProtection,
  collectMediaKeys,
  removeOrphanMedia,
  checkMediaIntegrity,
  isRestoreInProgress
} from "./src/server/backupService.js";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { getSmtpStatus, sendEmail, sendTestEmail, notifyNewTicketHtml, notifyNewLeadHtml } from "./src/server/mailService.js";

const app = express();
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
function cacheJsonResponse(key: string, ttlMs: number, build: () => Promise<string>): Promise<string> {
  const hit = apiResponseCache.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return Promise.resolve(hit.data);
  return build().then((data) => {
    apiResponseCache.set(key, { data, time: Date.now() });
    return data;
  });
}
function invalidatePublicApiCache() {
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
app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api/") && req.path !== "/api") return next();
  // Respostas de API não devem ser cacheadas por proxies/navegadores (dados podem
  // ser autenticados). Rotas de mídia (/api/minio/*) sobrescrevem depois.
  res.setHeader("Cache-Control", "no-store");
  if (!dbService.isStrictMode()) return next();
  const ready = await dbService.isSupabaseReady();
  if (!ready) {
    return res.status(503).json({ error: "Serviço indisponível no momento (banco de dados em manutenção)." });
  }
  next();
});

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
  limits: { fileSize: 200 * 1024 * 1024 }, // Up to 200 MB
  fileFilter: (req: any, file: any, cb: any) => {
    const ext = fileExtOf(file.originalname || "");
    if (!ext || BLOCKED_UPLOAD_EXT.test(ext) || !ALLOWED_UPLOAD_EXT.test(ext)) {
      return cb(null, false); // vira "Nenhum arquivo" -> 400 na rota
    }
    cb(null, true);
  }
});

// Allowlist de pastas de destino no MinIO ‐ nunca aceita pastas arbitrárias do cliente
const ALLOWED_UPLOAD_FOLDERS = new Set([
  "geral",
  "banners",
  "materiais",
  "institucional",
  "professores",
  "cursos",
  "cursos/capas",
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

// Initialize MinIO client from database settings
dbService.getMinioConfig().then((cfg) => {
  initMinioClient(cfg);
}).catch((err) => {
  console.warn("[MinIO Init Warning]:", err);
});

// Ensure local uploads directory exists for resilient fallback storage
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve Local Fallback Uploads
app.get("/api/uploads/*", (req, res) => {
  try {
    const filePath = req.params[0];
    if (!filePath || filePath.includes("..") || path.isAbsolute(filePath)) {
      return res.status(403).send("Caminho inválido.");
    }
    const fullPath = path.join(uploadsDir, filePath);
    if (!fullPath.startsWith(uploadsDir)) {
      return res.status(403).send("Caminho inválido.");
    }
    if (fs.existsSync(fullPath)) {
      const fileName = path.basename(fullPath);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/[\r\n"]/g, "_")}"`);
      return res.sendFile(fullPath);
    }
    return res.status(404).send("Arquivo não encontrado.");
  } catch (err: any) {
    return res.status(500).send("Erro ao carregar arquivo.");
  }
});

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

// Refresh Token Storage for reuse detection & rotation
// Map: refreshToken => { role, code, supabaseToken, expiresAt, createdAt }
interface RefreshSession {
  role: "admin" | "user" | "support";
  code: string;
  name?: string;
  supabaseToken?: string;
  expiresAt: number;
  createdAt: number;
}
const refreshSessions = new Map<string, RefreshSession>();
// Keep track of used refresh tokens (token => timestamp) to detect reuse (theft detection)
const usedRefreshTokens = new Map<string, { ts: number; code?: string }>();
// JTIs revogados no logout ‐ access tokens emitidos antes do logout deixam de valer
const revokedJtis = new Set<string>();
// Teto absoluto da sessão: mesmo com rotação contínua, a sessão expira (criação + 30d)
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const USED_TOKENS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const USED_TOKENS_MAX_ITEMS = 10000;

// Persist session maps to disk so a server restart (dev restarts included) does
// not silently invalidate logged-in sessions. File lives in data/ (never served).
const SESSIONS_FILE = path.join(process.cwd(), "data", "refresh_sessions.json");

// Criptografia AES-256-GCM para os tokens at-rest (supabaseToken). A chave deriva
// do JWT_SECRET ‐ o arquivo em disco nunca guarda tokens em texto puro.
const SESSIONS_ENC_KEY = crypto.createHash("sha256").update(String(JWT_SECRET)).digest();

function encryptAtRest(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", SESSIONS_ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

function decryptAtRest(enc: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = enc.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", SESSIONS_ENC_KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function loadSessionsFromDisk() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
    if (raw && Array.isArray(raw.sessions)) {
      for (const s of raw.sessions) {
        // Legado (texto puro) é aceito uma vez e re-criptografado no próximo persist
        const stored =
          typeof s.supabaseTokenEnc === "string"
            ? decryptAtRest(s.supabaseTokenEnc)
            : typeof s.supabaseToken === "string"
              ? s.supabaseToken
              : undefined;
        refreshSessions.set(s.refreshToken, {
          role: s.role,
          code: s.code,
          name: s.name,
          supabaseToken: stored || undefined,
          expiresAt: s.expiresAt,
          createdAt: s.createdAt || Date.now()
        });
      }
    }
    if (raw && Array.isArray(raw.used)) {
      for (const t of raw.used) {
        if (typeof t === "string") usedRefreshTokens.set(t, { ts: Date.now() });
        else if (t && typeof t.token === "string") usedRefreshTokens.set(t.token, { ts: t.at || Date.now(), code: t.code });
      }
    }
    if (raw && Array.isArray(raw.revokedJtis)) {
      for (const j of raw.revokedJtis) if (typeof j === "string") revokedJtis.add(j);
    }
    console.log(`[Sessões] ${refreshSessions.size} sessão(ões) ativa(s) carregada(s) do disco.`);
  } catch (e: any) {
    console.warn("[Sessões] Falha ao carregar sessões persistidas:", e?.message);
  }
}

function persistSessions() {
  try {
    const now = Date.now();
    // Poda: tokens usados antigos (>30d) e teto de itens para o arquivo não crescer sem limite
    const used = [...usedRefreshTokens.entries()]
      .filter(([, v]) => now - v.ts < USED_TOKENS_MAX_AGE_MS)
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, USED_TOKENS_MAX_ITEMS)
      .map(([token, v]) => ({ token, at: v.ts, code: v.code }));
    const sessions = [...refreshSessions.entries()]
      .filter(([, s]) => s.expiresAt > now && now - (s.createdAt || now) < REFRESH_MAX_AGE_MS)
      .map(([refreshToken, s]) => ({
        refreshToken,
        role: s.role,
        code: s.code,
        name: s.name,
        supabaseTokenEnc: s.supabaseToken ? encryptAtRest(s.supabaseToken) : undefined,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt
      }));
    fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions, used, revokedJtis: [...revokedJtis] }, null, 2), "utf-8");
  } catch (e: any) {
    console.warn("[Sessões] Falha ao persistir sessões:", e?.message);
  }
}

loadSessionsFromDisk();

// ============ SESSÑES DE ACESSO (jti) ‐ TOKEN SUPABASE FORA DO JWT ============
// O JWT do acesso carrega apenas { role, name, jti } ‐ sem código D.I. nem email
// (nada identificável decodificável no token). O código e o token de acesso ao
// Supabase (RLS) ficam SOMENTE no servidor, resolvidos pelo jti ‐ nunca viajam
// no payload do JWT nem saem no /api/auth/me como dado confiável. Invalidação
// pontual também é possível removendo a entrada do jti (revogação efetiva antes
// do exp).
const jtiSessions = new Map<string, { supabaseToken?: string; code?: string; expiresAt: number }>();

function newJti(): string {
  return crypto.randomBytes(16).toString("hex");
}

function registerJtiSession(supabaseToken?: string, code?: string): string {
  const jti = newJti();
  jtiSessions.set(jti, { supabaseToken, code, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  pruneJtiSessions();
  persistJtiSessions();
  return jti;
}

function getJtiSession(jti?: string): { supabaseToken?: string; code?: string } | undefined {
  if (!jti) return undefined;
  const session = jtiSessions.get(jti);
  if (!session) return undefined;
  if (Date.now() > session.expiresAt) {
    jtiSessions.delete(jti);
    persistJtiSessions();
    return undefined;
  }
  return session;
}

function pruneJtiSessions(max = 2000): void {
  const now = Date.now();
  for (const [jti, s] of jtiSessions.entries()) {
    if (s.expiresAt <= now || jtiSessions.size > max) jtiSessions.delete(jti);
  }
}

// ============ PERSISTÉNCIA DAS SESSÑES jti (code/supabaseToken) ============
// O mapa jti->{code,supabaseToken} é a única ponte entre o JWT (stateless) e a
// identidade real. Antes vivia só em memória: um restart do servidor derrubava o
// mapeamento das sessões já logadas (JWT de 24h seguia válido) e o usuário seguia
// "autenticado" SEM código ‐ tickets novos eram gravados com criadoPor vazio e
// sumiam dos filtros, e mensagens órfãs de autor. Aqui as sessões jti são
// persistidas em disco (supabaseToken criptografado) como as refresh sessions.
const JTI_SESSIONS_FILE = path.join(process.cwd(), "data", "jti_sessions.json");

function loadJtiSessionsFromDisk() {
  try {
    if (!fs.existsSync(JTI_SESSIONS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(JTI_SESSIONS_FILE, "utf-8"));
    if (!raw || !Array.isArray(raw.sessions)) return;
    const now = Date.now();
    for (const s of raw.sessions) {
      if (typeof s.jti !== "string" || typeof s.expiresAt !== "number" || s.expiresAt <= now) continue;
      const stored =
        typeof s.supabaseTokenEnc === "string" ? decryptAtRest(s.supabaseTokenEnc) : undefined;
      jtiSessions.set(s.jti, { supabaseToken: stored || undefined, code: s.code, expiresAt: s.expiresAt });
    }
    console.log(`[Sessões] ${jtiSessions.size} sessão(ões) de acesso (jti) carregada(s) do disco.`);
  } catch (e: any) {
    console.warn("[Sessões] Falha ao carregar sessões jti:", e?.message);
  }
}

function persistJtiSessions() {
  try {
    const now = Date.now();
    const sessions = [...jtiSessions.entries()]
      .filter(([, s]) => s.expiresAt > now)
      .map(([jti, s]) => ({
        jti,
        code: s.code,
        supabaseTokenEnc: s.supabaseToken ? encryptAtRest(s.supabaseToken) : undefined,
        expiresAt: s.expiresAt
      }));
    fs.mkdirSync(path.dirname(JTI_SESSIONS_FILE), { recursive: true });
    fs.writeFileSync(JTI_SESSIONS_FILE, JSON.stringify({ sessions }, null, 2), "utf-8");
  } catch (e: any) {
    console.warn("[Sessões] Falha ao persistir sessões jti:", e?.message);
  }
}

loadJtiSessionsFromDisk();

// Helper: JWT signing ‐ payload SEM code/email (só role/name/jti; o code é
// resolvido no servidor via getJtiSession, nunca viaja no token)
function signJWT(payload: { role: string; name?: string; jti: string }, expiresInSeconds: number): string {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64Payload = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${base64Header}.${base64Payload}`)
    .digest("base64url");

  return `${base64Header}.${base64Payload}.${signature}`;
}

// Helper: JWT verification ‐ retorna só o que viaja no token (sem code/supabaseToken)
function verifyJWT(token: string): { role: "admin" | "user"; name?: string; jti?: string } | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [base64Header, base64Payload, signature] = parts;

    // Verify standard server HMAC signature (no unverified payload fallback allowed)
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${base64Header}.${base64Payload}`)
      .digest("base64url");

    const sigBuf = Buffer.from(signature, "base64url");
    const expBuf = Buffer.from(expectedSignature, "base64url");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(Buffer.from(base64Payload, "base64url").toString("utf-8"));
    if (!payload.exp || Date.now() / 1000 > payload.exp) return null;
    return { role: payload.role || "user", name: payload.name || "", jti: payload.jti };
  } catch (e) {
    return null;
  }
}

// Middlewares
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Serve uploaded files statically
// Guarda (14/08): quando o MinIO falha, materiais privados caem em public/uploads/
// e o arquivo cru ficaria baixável anonimamente por esta rota estática. Arquivos
// que pertencem a materiais com is_public=false só são servidos com sessão
// (cookie httpOnly/Bearer ‐ mesma regra das mídias materiais/* do MinIO).
const privateUploadsCache = new Map<string, { time: number; isPrivate: boolean }>();
app.use("/uploads", async (req: any, res, next) => {
  const name = (req.path || "").replace(/^\/+/, "");
  if (!name) return next();
  const cached = privateUploadsCache.get(name);
  let isPrivate = false;
  if (cached && Date.now() - cached.time < 15_000) {
    isPrivate = cached.isPrivate;
  } else {
    try {
      const mats = await dbService.getMateriais();
      isPrivate = mats.some((m: any) => !m.isPublic && m.fileUrl === `/uploads/${name}`);
    } catch {
      // Banco indisponível: não derruba a mídia pública (acesso liberado).
    }
    privateUploadsCache.set(name, { time: Date.now(), isPrivate });
    if (privateUploadsCache.size > 500) privateUploadsCache.clear();
  }
  if (!isPrivate) return next();
  if (isMaterialMediaAllowed(req, res)) return next();
  return res.status(404).end();
});
app.use("/uploads", express.static(path.join(process.cwd(), "public/uploads")));

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

// Apply Global Rate Limiter to all API endpoints
app.use("/api", globalApiRateLimiter);

// Qualquer escrita em /api/admin invalida o cache das respostas públicas.
app.use("/api/admin", (req: any, res: any, next: any) => {
  if (req.method !== "GET") invalidatePublicApiCache();
  next();
});

// ---------------- HOST-BASED ISOLATION (SUBDOM�?NIO DO ADMIN) ----------------
// A área administrativa só existe em um host próprio (ex.: adminfenix.grupofenix.com).
// No host PRINCIPAL: /api/admin/* => 403 e /adminfenix => 404 (área invisível ao site).
// No host DO ADMIN (subdomínio): somente as rotas de API usadas pelo painel
// (/api/auth*, /api/admin/*, /api/content/*, /api/fenix-social/*, /api/vimeo/*,
// /api/minio/*, /api/download-status-md) existem; qualquer outro /api/* => 403.
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
  if (pathname.startsWith("/api/minio/")) return true;
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
  "/suporte",
  "/elite-milionario",
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
    : PUBLIC_VALID_PATHS.has(pathname);

  if (!valid) {
    return res.redirect(302, "/");
  }
  return next();
});

// Authentication middleware
function authenticateUser(req: any, res: any, next: () => void) {
  let accessToken = req.cookies.access_token;

  // Fallback to Authorization Header (important for iframe/third-party cookie blocking)
  if (!accessToken && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      accessToken = parts[1];
    }
  }

  if (!accessToken) {
    // If no access token, try refreshing automatically using the refresh token
    const refreshed = handleRefreshFlow(req, res);
    if (refreshed) {
      req.user = { ...refreshed, supabaseToken: undefined, jti: undefined };
      return next();
    }
    return res.status(401).json({ error: "Não autenticado. Código de acesso exigido." });
  }

  let decoded = verifyJWT(accessToken);
  if (decoded && decoded.jti && revokedJtis.has(decoded.jti)) decoded = null;
  if (!decoded) {
    // Token invalid or expired, try refresh flow
    const refreshed = handleRefreshFlow(req, res);
    if (refreshed) {
      req.user = { ...refreshed, supabaseToken: undefined, jti: undefined };
      return next();
    }
    return res.status(401).json({ error: "Sessão expirada. Por favor, acesse novamente." });
  }

  const session = getJtiSession(decoded.jti);
  if (!session) {
    // JWT válido mas o mapeamento jti sumiu (ex.: restart antes da persistência
    // das sessões). O refresh flow rotaciona o access token e re-registra o jti
    // com code/supabaseToken vindos da sessão persistida ‐ sem re-login do
    // usuário e sem risco de operações "sem código" (tickets órfãos).
    const refreshed = handleRefreshFlow(req, res);
    if (refreshed) {
      req.user = { ...refreshed, supabaseToken: undefined, jti: undefined };
      return next();
    }
  }
  req.user = { role: decoded.role, code: session?.code, name: decoded.name, jti: decoded.jti, supabaseToken: session?.supabaseToken };
  next();
}

// Optional authentication middleware (populates req.user if present, but does not block if unauthenticated)
function optionalAuthenticateUser(req: any, res: any, next: () => void) {
  let accessToken = req.cookies?.access_token;

  if (!accessToken && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      accessToken = parts[1];
    }
  }

  if (accessToken) {
    let decoded = verifyJWT(accessToken);
    if (decoded && decoded.jti && revokedJtis.has(decoded.jti)) decoded = null;
    if (decoded) {
      let session = getJtiSession(decoded.jti);
      if (!session) {
        const refreshed = handleRefreshFlow(req, res);
        if (refreshed) {
          req.user = { ...refreshed, supabaseToken: undefined, jti: undefined };
          return next();
        }
      }
      req.user = { role: decoded.role, code: session?.code, name: decoded.name, jti: decoded.jti, supabaseToken: session?.supabaseToken };
      return next();
    }
  }

  const refreshed = handleRefreshFlow(req, res);
  if (refreshed) {
    req.user = { ...refreshed, supabaseToken: undefined, jti: undefined };
  }

  next();
}

// Admin only guard middleware
function requireAdmin(req: any, res: any, next: () => void) {
  authenticateUser(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Acesso restrito apenas para administradores." });
    }
    next();
  });
}

function requireSupportOrAdmin(req: any, res: any, next: () => void) {
  authenticateUser(req, res, () => {
    if (req.user?.role !== "support" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Acesso restrito apenas para o suporte." });
    }
    next();
  });
}

// Handles Refresh Token Rotation & Reuse Detection
function handleRefreshFlow(req: any, res: any): { role: "admin" | "user" | "support"; code: string; name?: string } | null {
  const refreshToken = req.cookies.refresh_token;
  if (!refreshToken) return null;

  // 1. Detect Reuse (If a previously invalidated/used token is presented)
  if (usedRefreshTokens.has(refreshToken)) {
    const usedRec = usedRefreshTokens.get(refreshToken);
    console.warn(`SECURITY ALERT: Refresh token reuse detected! Revoking all sessions for client.`);
    // Revoga TODAS as sessões (refresh + access/jti) da mesma conta ‐ um token
    // roubado não sobrevive à detecção de reuso em nenhum dispositivo.
    if (usedRec && usedRec.code) {
      for (const [t, s] of refreshSessions.entries()) {
        if (s.code === usedRec.code) refreshSessions.delete(t);
      }
      for (const [jti, s] of jtiSessions.entries()) {
        if (s.code === usedRec.code) {
          revokedJtis.add(jti);
          jtiSessions.delete(jti);
        }
      }
      persistSessions();
    }
    // Security action: Clear all cookies to lock down account
    res.clearCookie("access_token", { path: "/" });
    res.clearCookie("refresh_token", { path: "/" });
    return null;
  }

  const session = refreshSessions.get(refreshToken);
  if (!session) return null;

  // 2. Check Expiry (janela rolante de 7d + teto absoluto de 30d desde a criação)
  const createdAt = session.createdAt || Date.now();
  if (Date.now() > session.expiresAt || Date.now() - createdAt > REFRESH_MAX_AGE_MS) {
    refreshSessions.delete(refreshToken);
    res.clearCookie("access_token", { path: "/" });
    res.clearCookie("refresh_token", { path: "/" });
    return null;
  }

  // 3. Rotate Refresh Token (One-Time Use constraint)
  refreshSessions.delete(refreshToken);
  usedRefreshTokens.set(refreshToken, { ts: Date.now(), code: session.code });

  const newRefreshToken = crypto.randomBytes(32).toString("hex");
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  refreshSessions.set(newRefreshToken, {
    role: session.role,
    code: session.code,
    name: session.name,
    supabaseToken: session.supabaseToken,
    expiresAt: Date.now() + sevenDaysMs,
    createdAt
  });
  persistSessions();

  // Issue new access and refresh tokens (supabaseToken/code ficam no servidor via jti)
  const jti = registerJtiSession(session.supabaseToken, session.code);
  const newAccessToken = signJWT({ role: session.role, name: session.name, jti }, 24 * 60 * 60); // 24h

  res.cookie("access_token", newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000
  });

  res.cookie("refresh_token", newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: sevenDaysMs
  });

  persistSessions();
  return { role: session.role, code: session.code, name: session.name };
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
// Lockout adicional POR CONTA (email ou código D.I.): 10 falhas/15min ‐ cobre
// brute-force distribuído entre IPs, complementando o loginRateLimiter (por IP).
const LOGIN_ACCOUNT_MAX_FAILURES = 10;
const LOGIN_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map<string, { count: number; windowStart: number }>();

function isAccountLocked(account: string): boolean {
  const rec = loginFailures.get(account.toLowerCase());
  if (!rec) return false;
  if (Date.now() - rec.windowStart > LOGIN_ACCOUNT_WINDOW_MS) {
    loginFailures.delete(account.toLowerCase());
    return false;
  }
  return rec.count >= LOGIN_ACCOUNT_MAX_FAILURES;
}

function registerLoginFailure(account: string): void {
  const key = account.toLowerCase();
  const rec = loginFailures.get(key);
  const now = Date.now();
  if (!rec || now - rec.windowStart > LOGIN_ACCOUNT_WINDOW_MS) {
    loginFailures.set(key, { count: 1, windowStart: now });
  } else {
    rec.count += 1;
  }
}

function clearLoginFailures(account: string): void {
  loginFailures.delete(account.toLowerCase());
}

// Administrador do .env: verificação por HASH (scrypt) em vez de texto puro.
// Formato de ADMIN_PASSWORD_HASH: scrypt$16384$8$1$<salt_b64>$<hash_b64>
// A comparação textual legada (ADMIN_PASSWORD) permanece como fallback para
// implantações ainda não migradas, porém com aviso no console.
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";

function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    return crypto.timingSafeEqual(
      crypto.createHash("sha256").update(ba).digest(),
      crypto.createHash("sha256").update(bb).digest()
    );
  }
  return crypto.timingSafeEqual(ba, bb);
}

function verifyAdminPassword(input: string): boolean {
  if (ADMIN_PASSWORD_HASH) {
    const parts = ADMIN_PASSWORD_HASH.split("$");
    if (parts.length === 6 && parts[0] === "scrypt") {
      const N = Number(parts[1]);
      const r = Number(parts[2]);
      const p = Number(parts[3]);
      const saltB64 = parts[4];
      const hashB64 = parts[5];
      if (N > 0 && r > 0 && p > 0 && saltB64 && hashB64 &&
          hashB64.length >= 32 && /^[A-Za-z0-9+/=]+$/.test(hashB64)) {
        try {
          const derived = crypto.scryptSync(input, Buffer.from(saltB64, "base64"), 32, { N, r, p });
          const expected = Buffer.from(hashB64, "base64");
          return expected.length === derived.length && crypto.timingSafeEqual(derived, expected);
        } catch {
          console.warn("[Aviso] Falha ao verificar ADMIN_PASSWORD_HASH (params inválidos?).");
        }
      } else {
        console.warn("[Aviso] ADMIN_PASSWORD_HASH com formato inválido ‐ ignorando.");
      }
    }
  }
  if (process.env.ADMIN_PASSWORD) {
    console.warn("[Aviso] Senha admin verificada em texto puro (env ADMIN_PASSWORD). Defina ADMIN_PASSWORD_HASH (scrypt) para comparação segura.");
    return safeEqualStr(input, String(process.env.ADMIN_PASSWORD));
  }
  return false;
}

app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
  const { code, email, password } = req.body;
  const accountKey = email ? email.trim().toLowerCase() : (code || "").toUpperCase();
  if (accountKey && isAccountLocked(accountKey)) {
    return res.status(429).json({
      error: "Muitas tentativas de login para esta conta. Por favor, aguarde 15 minutos antes de tentar novamente."
    });
  }
  let role: "admin" | "user" | "support" | null = null;
  let userCode = code || "";
  let supabaseToken: string | undefined = undefined;

  if (email && password) {
    if (process.env.ADMIN_EMAIL && (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH) &&
        email === process.env.ADMIN_EMAIL && verifyAdminPassword(password)) {
      role = "admin";
      userCode = "admin";
    } else if (supabase) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (authError) {
          console.error("[Supabase Auth] Login falhou para:", maskEmail(email), authError.message);
        } else if (authData && authData.user && authData.session) {
          console.log("[Supabase Auth] Login bem sucedido via Supabase para:", maskEmail(email));
          // Segurança: role de administrador vem SOMENTE de app_metadata (controlada pelo servidor).
          // user_metadata é editável pelo próprio usuário e NUNCA é aceita como papel admin.
          const hasAppAdmin = authData.user.app_metadata?.role === "admin";
          console.log(`[Supabase Auth] Verificação de role para ${maskEmail(email)}: app_metadata.role="admin"? ${hasAppAdmin}`);

          const isUserAdmin = hasAppAdmin;
          if (isUserAdmin) {
            role = "admin";
          } else if (await dbService.isSupportUser(email)) {
            role = "support";
          } else {
            role = "user";
          }
          userCode = authData.user.id;
          supabaseToken = authData.session.access_token;

          if (!isUserAdmin && role !== "support") {
            console.warn(`[Supabase Auth] Atenção: O usuário ${maskEmail(email)} foi autenticado, mas NÂO possui permissão especial (role determinada como "${role}").`);
          }
        }
      } catch (err: any) {
        console.error("[Supabase Auth] Erro inesperado no login do Supabase:", err);
      }
    }
  }

  let userName = "";
  // Para role "support": indica que o responsável ainda precisa definir a própria
  // senha (1º acesso ou redefinição do admin). Vai para o client na resposta.
  let supportMustChange: boolean | undefined;
  if (email) {
    if (role === "support") {
      const supportUser = await dbService.getSupportUserByEmail(email);
      userName = supportUser?.nome || "Suporte Fênix";
      supportMustChange = supportUser?.mustChangePassword === true;
    } else {
      userName = "Administrador Fênix";
    }
  } else if (code) {
    const valResult = await dbService.validateDICode(code);
    if (!valResult.valid) {
      registerLoginFailure(accountKey);
      return res.status(401).json({ error: valResult.message || "Código D. I. não encontrado. Verifique o seu código." });
    }
    role = valResult.role as "admin" | "user";
    userCode = valResult.userCode || code;
    userName = valResult.name || userCode;
  }

  if (!role) {
    registerLoginFailure(accountKey);
    return res.status(401).json({ error: "Credenciais inválidas. Verifique o email/senha ou código." });
  }

  clearLoginFailures(accountKey);

  // Record audit log for login tracking
  if (code) {
    dbService.recordAuditLog(
      userCode,
      "LOGIN_RESTRITO_DI",
      `Acesso registrado com código D.I. na �?rea Restrita: ${userCode} (${userName})`
    ).catch(() => {});
  } else if (email) {
    dbService.recordAuditLog(
      email,
      "LOGIN_SISTEMA",
      `Login efetuado no sistema: ${email}`
    ).catch(() => {});
  }

  // Generate tokens (supabaseToken/code ficam no servidor via jti ‐ nunca no JWT)
  const jti = registerJtiSession(supabaseToken, userCode);
  const accessToken = signJWT({ role, name: userName, jti }, 24 * 60 * 60); // 24h
  const refreshToken = crypto.randomBytes(32).toString("hex");
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  refreshSessions.set(refreshToken, {
    role,
    code: userCode,
    name: userName,
    supabaseToken,
    expiresAt: Date.now() + sevenDaysMs,
    createdAt: Date.now()
  });
  persistSessions();

  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000
  });

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: sevenDaysMs
  });

  const publicUser: any = { role, code: userCode, name: userName };
  if (role === "support") publicUser.mustChangePassword = !!supportMustChange;
  res.json({
    success: true,
    user: publicUser,
    token: accessToken
  });
});

app.post("/api/auth/logout", (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  if (refreshToken) {
    refreshSessions.delete(refreshToken);
  }
  // Revoga o access token emitido: o jti entra na lista de revogados e sai do
  // mapa de sessões ‐ o JWT (stateless) deixa de ser aceito nas rotas autenticadas.
  // Aceita cookie OU Authorization header (mesmo fallback do authenticateUser).
  let accessToken = req.cookies.access_token;
  if (!accessToken && req.headers.authorization) {
    const parts = String(req.headers.authorization).split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") accessToken = parts[1];
  }
  if (accessToken) {
    const decoded = verifyJWT(accessToken);
    if (decoded?.jti) {
      revokedJtis.add(decoded.jti);
      jtiSessions.delete(decoded.jti);
    }
  }
  persistSessions();
  persistJtiSessions();
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });
  res.json({ success: true, message: "Sessão encerrada com sucesso." });
});

// Para role "support", resolve o e-mail (via id da conta Supabase) e inclui a
// flag de "definir a própria senha" no payload retornado ao client (/me).
async function enrichSupportUser(user: any): Promise<any> {
  if (!user || user.role !== "support" || typeof user.code !== "string") return user;
  try {
    const trusted = getSupabaseTrustedClient();
    if (trusted) {
      const { data } = await trusted.auth.admin.getUserById(user.code).catch(() => ({ data: null }));
      const email = data?.user?.email;
      if (email) {
        const su = await dbService.getSupportUserByEmail(email);
        return { ...user, mustChangePassword: su?.mustChangePassword === true };
      }
    }
  } catch {
    /* mantém apenas os dados base */
  }
  return user;
}

app.get("/api/auth/me", async (req: any, res) => {
  let accessToken = req.cookies.access_token;

  // Fallback to Authorization Header (important for iframe/third-party cookie blocking)
  if (!accessToken && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      accessToken = parts[1];
    }
  }

  if (!accessToken) {
    const refreshed = handleRefreshFlow(req, res);
    if (refreshed) {
      return res.json({ loggedIn: true, user: await enrichSupportUser(refreshed) });
    }
    return res.json({ loggedIn: false });
  }

  let decoded = verifyJWT(accessToken);
  if (decoded && decoded.jti && revokedJtis.has(decoded.jti)) decoded = null;
  if (!decoded) {
    const refreshed = handleRefreshFlow(req, res);
    if (refreshed) {
      return res.json({ loggedIn: true, user: await enrichSupportUser(refreshed) });
    }
    return res.json({ loggedIn: false });
  }

  // Nunca expõe supabaseToken/jti ao cliente ‐ identidade (code resolvido no servidor via jti)
  const session = getJtiSession(decoded.jti);
  const baseUser = { role: decoded.role, code: session?.code, name: decoded.name || "" };
  res.json({ loggedIn: true, user: await enrichSupportUser(baseUser) });
});

// 2. Fetch Public Content & Teaser Data
app.get("/api/content/public", async (req, res) => {
  try {
    const data = await cacheJsonResponse("content/public", 20000, async () => {
      const dbData = await dbService.getData();
      const categorias = await dbService.getCategoriasMateriais();
      return JSON.stringify({
      leaderBio: dbData.leaderBio,
      novidades: dbData.novidades,
      cursos: dbData.cursos.map((c) => ({
        id: c.id,
        titulo: c.titulo,
        descricao: c.descricao,
        categoria: c.categoria,
        nivel: c.nivel,
        imagem: c.imagem,
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
      paginaTecnologias: dbData.paginaTecnologias || [],
      paginaElite: dbData.paginaElite || [],
      paginaBiografia: dbData.paginaBiografia || []
      });
    });
    res.type("application/json").send(data);
  } catch (err: any) {
    console.error("Erro ao carregar conteúdo público:", err);
    res.status(500).json({ error: "Falha ao processar requisição." });
  }
});

// 3. Fetch Restricted Content (Exige Login)
app.get("/api/content/restricted", authenticateUser, async (req: any, res) => {
  try {
    const dbData = await dbService.getData(req.user?.supabaseToken, true);
    const categorias = await dbService.getCategoriasMateriais(req.user?.supabaseToken, true);
    res.json({
      cursos: dbData.cursos,
      materiais: dbData.materiais,
      categoriasMateriais: categorias,
      logoUrl: dbData.logoUrl
    });
  } catch (err: any) {
    console.error("Erro ao carregar conteúdo restrito:", err);
    res.status(500).json({ error: "Falha ao processar requisição." });
  }
});

// 4. Download Material Increment & Endpoint
// Entrega o arquivo real do material (MinIO ou /uploads) apenas para sessão
// válida ‐ o fetch do client envia cookie httpOnly OU o Bearer do localStorage
// (o mesmo fallback do authenticateUser). MIME determinada no servidor; o
// download é sempre attachment.
app.post("/api/content/download/:id", authenticateUser, async (req: any, res) => {
  try {
    const { id } = req.params;
    const material = await dbService.getMaterialById(id, req.user?.supabaseToken);
    if (!material || !material.fileUrl) {
      return res.status(404).json({ error: "Material não encontrado." });
    }
    await dbService.recordDownload(id, req.user?.supabaseToken);

    const safeTitulo = String(material.titulo || "material").replace(/[\r\n"]/g, "_");
    const fileUrl = material.fileUrl;

    try {
      if (fileUrl.startsWith("/api/minio/") && (fileUrl.includes("/preview/") || fileUrl.includes("/stream/"))) {
        const objectKey = decodeURIComponent(fileUrl.replace(/^\/api\/minio\/(preview|stream)\//, ""));
        if (objectKey.length > 500 || objectKey.includes("..") || objectKey.includes("\\")) {
          return res.status(404).json({ error: "Arquivo não encontrado." });
        }
        const minioConfig = await dbService.getMinioConfig();
        const bucket = minioConfig.bucket || "armazenamento";
        const client = getActiveMinioClient();
        const stat = await client.statObject(bucket, objectKey);
        const ext = fileExtOf(objectKey);
        const mime = EXT_TO_MIME[ext] || "application/octet-stream";
        const filename = `${safeTitulo}${ext || ""}`;
        res.setHeader("Content-Type", mime);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", String(stat.size));
        const stream = await client.getObject(bucket, objectKey);
        stream.pipe(res);
      } else if (fileUrl.startsWith("/uploads/")) {
        const filePath = path.join(process.cwd(), "public", fileUrl.replace(/^\/(uploads)\//, "$1"));
        if (!path.dirname(filePath).startsWith(path.join(process.cwd(), "public", "uploads")) || !fs.existsSync(filePath)) {
          return res.status(404).json({ error: "Arquivo não encontrado." });
        }
        const filename = `${safeTitulo}${path.extname(filePath) || ""}`;
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.sendFile(filePath);
      } else {
        return res.status(400).json({ error: "Material sem arquivo válido." });
      }
    } catch (err) {
      return res.status(404).json({ error: "Arquivo não encontrado." });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Falha ao processar download." });
  }
});

// 4.1 Admin Material Categories Endpoint
app.post("/api/admin/categorias-materiais", requireAdmin, async (req: any, res) => {
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
});

// ---------------- ADMIN CRUD ENDPOINTS ----------------

// Banners da página inicial CRUD
app.post("/api/admin/banners", requireAdmin, async (req: any, res) => {
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
});

app.delete("/api/admin/banners/:id", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    // Regra A: backup automático do estado atual antes de excluir (máx. 1 por 10 min)
    const protecao = await ensureDeleteProtection({ geradoPor, userToken: req.user?.supabaseToken });
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
      protecao: { backupCriado: protecao.backupCriado, backupNome: protecao.backupNome },
      midias
    });
  } catch (err: any) {
    console.error("Erro ao deletar banner:", err);
    res.status(500).json({ error: "Erro ao deletar banner." });
  }
});

// Hidden Home Cards Admin Route
app.post("/api/admin/hidden-home-cards", requireAdmin, async (req: any, res) => {
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
});

// 5. Novidades CRUD
app.post("/api/admin/novidades", requireAdmin, async (req: any, res) => {
  try {
    const { id, titulo, descricao, categoria, imagem, isPremium, isFeatured, linkType, linkTarget } = req.body;
    if (!titulo || !descricao || !categoria || !imagem) {
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
});

app.delete("/api/admin/novidades/:id", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    // Regra A: backup automático do estado atual antes de excluir (máx. 1 por 10 min)
    const protecao = await ensureDeleteProtection({ geradoPor, userToken: req.user?.supabaseToken });
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
      protecao: { backupCriado: protecao.backupCriado, backupNome: protecao.backupNome },
      midias
    });
  } catch (err: any) {
    console.error("Erro ao remover novidade:", err);
    res.status(500).json({ error: "Erro ao remover novidade." });
  }
});

// 6. Cursos CRUD
app.post("/api/admin/cursos", requireAdmin, async (req: any, res) => {
  try {
    const { id, titulo, descricao, categoria, nivel, imagem, duracao, modulos, professorNome, professorEspecialidade, professorBio, professorFoto, secao } = req.body;
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

    const item: Curso = {
      id: id || `c-${Date.now()}`,
      titulo: cleanText(titulo),
      descricao: cleanText(descricao),
      categoria: cleanText(categoria),
      nivel: cleanText(nivel) || "Iniciante",
      imagem: safeLinkTarget(imagem),
      duracao: cleanText(duracao) || "0h",
      modulos: sanitizedModulos,
      professorNome: cleanText(professorNome),
      professorEspecialidade: cleanText(professorEspecialidade),
      professorBio: cleanText(professorBio),
      professorFoto: safeLinkTarget(professorFoto),
      createdAt: req.body.createdAt || new Date().toISOString(),
      secao: (secao === "series" || secao === "treinamentos" ? secao : "cursos") as Curso["secao"]
    };

    await dbService.saveCurso(item, req.user.role, req.user?.supabaseToken);
    res.json({ success: true, item });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao salvar curso." });
  }
});

app.delete("/api/admin/cursos/:id", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    // Regra A: backup automático do estado atual antes de excluir (máx. 1 por 10 min)
    const protecao = await ensureDeleteProtection({ geradoPor, userToken: req.user?.supabaseToken });
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
      protecao: { backupCriado: protecao.backupCriado, backupNome: protecao.backupNome },
      midias
    });
  } catch (err: any) {
    console.error("Erro ao remover curso:", err);
    res.status(500).json({ error: "Erro ao remover curso." });
  }
});

// 7. Materiais CRUD
// fileUrl de materiais é servido como link de download ‐ aceita SOMENTE caminhos
// do próprio site (MinIO/fallback). URLs externas (http/data:/javascript:) são rejeitadas.
function isSafeMaterialFileUrl(value: string): boolean {
  return (
    typeof value === "string" &&
    (value.startsWith("/api/minio/") || value.startsWith("/api/uploads/") || value.startsWith("/uploads/"))
  );
}

app.post("/api/admin/materiais", requireAdmin, async (req: any, res) => {
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
});

app.delete("/api/admin/materiais/:id", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    // Regra A: backup automático do estado atual antes de excluir (máx. 1 por 10 min)
    const protecao = await ensureDeleteProtection({ geradoPor, userToken: req.user?.supabaseToken });
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
      protecao: { backupCriado: protecao.backupCriado, backupNome: protecao.backupNome },
      midias
    });
  } catch (err: any) {
    console.error("Erro ao remover material:", err);
    res.status(500).json({ error: "Erro ao remover material." });
  }
});

// 8. Leader Bio Update
app.post("/api/admin/leader-bio", requireAdmin, async (req: any, res) => {
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
});

// 8.1. Tecnologias Update
app.post("/api/admin/tecnologias", requireAdmin, async (req: any, res) => {
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
});

// 8.1.1. Páginas institucionais editáveis (Tecnologias / Elite Milionária)
app.post("/api/admin/paginas", requireAdmin, async (req: any, res) => {
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
    await dbService.savePagina(chave, cleanBlocosFinal, req.user.role, req.user?.supabaseToken);
    res.json({ success: true, pagina: cleanBlocosFinal });
  } catch (err: any) {
    console.error("Erro ao salvar página:", err);
    res.status(500).json({ error: "Erro ao salvar página." });
  }
});

// 8.1. Logo Upload & Reset
// Segurança: somente PNG REAL (data URI image/png + magic bytes). SVG (mesmo com
// type "image/svg+xml") carrega <script> executável no contexto do site ‐ rejeitado.
app.post("/api/admin/logo", requireAdmin, async (req: any, res) => {
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
});

app.post("/api/admin/logo/reset", requireAdmin, async (req: any, res) => {
  try {
    await dbService.updateLogoUrl(undefined, req.user.role, req.user?.supabaseToken);
    res.json({ success: true, logoUrl: undefined });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao resetar logo." });
  }
});

// 8.2 Generic File Upload with MinIO folder support
app.post("/api/admin/upload-file", uploadRateLimiter, requireAdmin, async (req: any, res) => {
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

    // Attempt direct MinIO upload first
    try {
      const minioConfig = await dbService.getMinioConfig();
      const targetBucket = minioConfig.bucket || "armazenamento";
      const bucketStatus = await ensureMinioBucketExists(targetBucket);

      if (bucketStatus.ready) {
        const client = getActiveMinioClient();
        const timestamp = Date.now();
        const rand = crypto.randomBytes(4).toString("hex");
        const cleanName = fileName ? fileName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").substring(0, 30) : "file";
        const objectKey = `${targetFolder}/${timestamp}_${rand}_${cleanName}`;
        if (objectKey.length > 400) {
          return res.status(400).json({ error: "Nome do arquivo muito longo." });
        }

        await client.putObject(targetBucket, objectKey, buffer, buffer.length, {
          "Content-Type": type
        });

        const url = type.startsWith("video/")
          ? `/api/minio/stream/${encodeURIComponent(objectKey)}`
          : `/api/minio/preview/${encodeURIComponent(objectKey)}`;

        return res.json({ success: true, url, objectKey, storage: "minio" });
      }
    } catch (minioErr) {
      console.warn("[Upload-file MinIO Fallback]:", minioErr);
    }

    // Disk fallback
    const uploadDir = path.join(process.cwd(), "public/uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    let ext = "png";
    if (type === "image/jpeg" || type === "image/jpg") ext = "jpg";
    else if (type === "image/webp") ext = "webp";
    else if (type === "image/gif") ext = "gif";
    else if (type === "application/pdf") ext = "pdf";

    const timestamp = Date.now();
    const rand = crypto.randomBytes(4).toString("hex");
    const cleanFileName = fileName 
      ? fileName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").substring(0, 30) 
      : "upload";
    const finalFileName = `${cleanFileName}_${timestamp}_${rand}.${ext}`;
    const filePath = path.join(uploadDir, finalFileName);

    fs.writeFileSync(filePath, buffer);

    const fileUrl = `/uploads/${finalFileName}`;
    res.json({ success: true, url: fileUrl });
  } catch (err: any) {
    console.error("Erro no upload de arquivo:", err);
    res.status(500).json({ error: "Falha ao salvar o arquivo." });
  }
});

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
app.get("/api/fenix-social/posts", async (req, res) => {
  try {
    const data = await cacheJsonResponse("fenix-social/posts", 30000, async () => {
      const posts = await dbService.getPublicFenixPosts();
      return JSON.stringify({ posts });
    });
    res.type("application/json").send(data);
  } catch (err) {
    console.error("Erro ao buscar feed do Fenix Social:", err);
    res.status(500).json({ error: "Falha ao carregar publicações." });
  }
});

// Get single post by ID (for direct sharing links)
app.get("/api/fenix-social/post/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const post = await dbService.getFenixPostById(id);
    if (!post) {
      return res.status(404).json({ error: "Publicação não encontrada." });
    }
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar publicação." });
  }
});

// Helper for saving base64 files directly to MinIO fenix_social folder
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

  try {
    const minioConfig = await dbService.getMinioConfig();
    const targetBucket = minioConfig.bucket || "armazenamento";
    const bucketStatus = await ensureMinioBucketExists(targetBucket);

    if (bucketStatus.ready) {
      const client = getActiveMinioClient();
      await client.putObject(targetBucket, objectKey, buffer, buffer.length, {
        "Content-Type": sniffed
      });
      const url = isVideo
        ? `/api/minio/stream/${encodeURIComponent(objectKey)}`
        : `/api/minio/preview/${encodeURIComponent(objectKey)}`;
      return { url, isVideo };
    }
  } catch (err) {
    console.warn("[FenixSocial MinIO upload fallback]:", err);
  }

  // Disk fallback
  const uploadDir = path.join(process.cwd(), "public/uploads/fenix_posts");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const fileName = `fenix_${Date.now()}_${uniqueId}.${ext}`;
  const filePath = path.join(uploadDir, fileName);

  fs.writeFileSync(filePath, buffer);
  return { url: `/uploads/fenix_posts/${fileName}`, isVideo };
}

// Create new post (Restricted strictly to logged-in users)
app.post("/api/fenix-social/posts", fenixSocialPostRateLimiter, authenticateUser, async (req: any, res) => {
  try {
    const { titulo, legenda, dataPublicacao, usuarioNome, filesBase64, fileBase64 } = req.body;

    const rawFiles: string[] = Array.isArray(filesBase64) && filesBase64.length > 0 
      ? filesBase64 
      : (fileBase64 ? [fileBase64] : []);

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
});

// Like post
app.post("/api/fenix-social/posts/:id/like", fenixSocialInteractionRateLimiter, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userKey = req.user?.code || req.ip || "anonymous";
    const result = await dbService.likeFenixPost(id, userKey);
    if (!result) {
      return res.status(404).json({ error: "Publicação não encontrada." });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: "Erro ao registrar curtida." });
  }
});

// Comment on post
app.post("/api/fenix-social/posts/:id/comment", fenixSocialInteractionRateLimiter, async (req: any, res) => {
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
    const sanitizedNome = usuarioNome ? stripTags(usuarioNome) : (req.user?.code === "admin" ? "Administrador Fênix" : "Membro Fênix");

    const comment = await dbService.commentFenixPost(id, sanitizedTexto, sanitizedNome);
    if (!comment) {
      return res.status(404).json({ error: "Publicação não encontrada." });
    }

    res.json({ success: true, comment });
  } catch (err) {
    res.status(500).json({ error: "Erro ao publicar comentário." });
  }
});

// Moderation feed (Requires Admin OR valid Moderator Token)
app.get("/api/fenix-social/moderacao", fenixModeracaoRateLimiter, optionalAuthenticateUser, async (req: any, res) => {
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

    const posts = await dbService.getPendingFenixPosts();
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: "Erro ao carregar posts pendentes para moderação." });
  }
});

// Moderation approve
app.post("/api/fenix-social/moderacao/:id/aprovar", fenixModeracaoRateLimiter, optionalAuthenticateUser, async (req: any, res) => {
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
});

// Moderation reject (Hard Delete)
app.post("/api/fenix-social/moderacao/:id/recusar", fenixModeracaoRateLimiter, optionalAuthenticateUser, async (req: any, res) => {
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
        if (mediaUrl && mediaUrl.startsWith("/uploads/")) {
          const relativePath = mediaUrl.replace(/^\/uploads\//, "");
          const fullPath = path.join(process.cwd(), "public", "uploads", relativePath);
          if (fs.existsSync(fullPath)) {
            try {
              fs.unlinkSync(fullPath);
              console.log(`[Moderação Fênix] Arquivo excluído fisicamente: ${fullPath}`);
            } catch (unlinkErr) {
              console.error(`[Moderação Fênix] Falha ao excluir arquivo físico: ${fullPath}`, unlinkErr);
            }
          }
        } else if (mediaUrl && mediaUrl.startsWith("/api/minio/")) {
          // Conteúdo recusado também deve sumir do MinIO (antes ficava público
          // pela URL direta). Falha de conexão não quebra a recusa (log only).
          try {
            const rawKey = decodeURIComponent(mediaUrl.replace(/^\/api\/minio\/(stream|preview)\//, "")).split("?")[0];
            if (rawKey && !isBackupFamilyKey(rawKey)) {
              const cfg = await dbService.getMinioConfig();
              const bucket = cfg.bucket || "armazenamento";
              const bucketStatus = await ensureMinioBucketExists(bucket);
              if (bucketStatus.ready) {
                const client = getActiveMinioClient();
                await client.removeObject(bucket, rawKey);
                console.log(`[Moderação Fênix] Objeto removido do MinIO: ${rawKey}`);
              }
            }
          } catch (minioErr) {
            console.warn("[Moderação Fênix] Não foi possível remover objeto do MinIO (recusa mantida):", minioErr?.message || minioErr);
          }
        }
      }
    }

    res.json({ success: true, message: "Publicação recusada e removida permanentemente do sistema e do servidor." });
  } catch (err) {
    console.error("[Moderação Fênix] Erro ao recusar:", err);
    res.status(500).json({ error: "Erro ao recusar publicação." });
  }
});

// --- ADMIN MANAGEMENT ENDPOINTS FOR FENIX SOCIAL ---

// Get ALL posts (Approved, Pending, Rejected) for Admin
app.get("/api/fenix-social/admin/all-posts", requireAdmin, async (req: any, res) => {
  try {
    const posts = await dbService.getAllFenixPosts(req.token);
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: "Erro ao carregar todas as publicações para administração." });
  }
});

// Edit post in Admin Panel
app.put("/api/fenix-social/admin/posts/:id", requireAdmin, async (req: any, res) => {
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
});

// Delete post in Admin Panel (Hard delete files & DB entry)
app.delete("/api/fenix-social/admin/posts/:id", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    // Regra A: backup automático do estado atual antes de excluir (máx. 1 por 10 min)
    const protecao = await ensureDeleteProtection({ geradoPor, userToken: req.user?.supabaseToken });
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
      protecao: { backupCriado: protecao.backupCriado, backupNome: protecao.backupNome },
      midias
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir publicação." });
  }
});

// Get Moderator Links
app.get("/api/fenix-social/admin/moderator-links", requireAdmin, async (req: any, res) => {
  try {
    const links = await dbService.getModeratorLinks(req.user?.supabaseToken);
    res.json({ links });
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar links de moderadores." });
  }
});

// Create Moderator Link
app.post("/api/fenix-social/admin/moderator-links", requireAdmin, async (req: any, res) => {
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
});

// Delete Moderator Link
app.delete("/api/fenix-social/admin/moderator-links/:id", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const geradoPor = req.user?.code || "admin";
    // Regra A: backup automático do estado atual antes de excluir (máx. 1 por 10 min)
    const protecao = await ensureDeleteProtection({ geradoPor, userToken: req.user?.supabaseToken });
    const success = await dbService.deleteModeratorLink(id, geradoPor, req.user?.supabaseToken);
    if (!success) {
      return res.status(404).json({ error: "Link de moderador não encontrado." });
    }
    res.json({
      success: true,
      protecao: { backupCriado: protecao.backupCriado, backupNome: protecao.backupNome }
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir link de moderador." });
  }
});

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
app.post("/api/ouvidoria/submit", ouvidoriaRateLimiter, async (req: any, res) => {
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
});

// Admin list messages
app.get("/api/admin/ouvidoria/messages", requireAdmin, async (req: any, res) => {
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
});

// Admin update status
app.put("/api/admin/ouvidoria/messages/:id/status", requireAdmin, async (req: any, res) => {
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
});

// Admin delete message
app.delete("/api/admin/ouvidoria/messages/:id", requireAdmin, async (req: any, res) => {
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
});

// Admin get config
app.get("/api/admin/ouvidoria/config", requireAdmin, async (req: any, res) => {
  try {
    const config = await dbService.getOuvidoriaConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Erro ao obter configurações da ouvidoria." });
  }
});

// Admin update config
app.post("/api/admin/ouvidoria/config", requireAdmin, async (req: any, res) => {
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
});

// Admin export CSV
app.get("/api/admin/ouvidoria/export", requireAdmin, async (req: any, res) => {
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
});

// 9. Audit Logs & Stats (Admin Dashboard)
app.get("/api/admin/stats-and-logs", requireAdmin, async (req: any, res) => {
  try {
    const data = await dbService.getData(req.user?.supabaseToken, true);
    const auditLogs = data.auditLogs || [];

    const diMap = new Map<string, { codigo: string; count: number; lastAccess: string; status: string }>();

    // Initial base D.I records
    const baseDIs = [
      { codigo: "DI-654321", count: 18, lastAccess: new Date(Date.now() - 1000 * 60 * 25).toISOString(), status: "Ativo" },
      { codigo: "DI-884210", count: 14, lastAccess: new Date(Date.now() - 1000 * 60 * 180).toISOString(), status: "Ativo" },
      { codigo: "DI-102948", count: 9, lastAccess: new Date(Date.now() - 1000 * 60 * 720).toISOString(), status: "Ativo" },
      { codigo: "DI-304211", count: 6, lastAccess: new Date(Date.now() - 1000 * 60 * 1440).toISOString(), status: "Ativo" },
      { codigo: "DI-991024", count: 4, lastAccess: new Date(Date.now() - 1000 * 60 * 2880).toISOString(), status: "Recente" },
      { codigo: "DI-ADMIN-123456", count: 32, lastAccess: new Date().toISOString(), status: "Ativo (Admin)" },
    ];

    baseDIs.forEach((item) => diMap.set(item.codigo, { ...item }));

    // Merge actual D.I login entries from audit logs
    auditLogs.forEach((log) => {
      if (log.usuario && (log.usuario.startsWith("DI-") || log.acao === "LOGIN_RESTRITO_DI")) {
        const key = log.usuario.startsWith("DI-") ? log.usuario : `DI-${log.usuario}`;
        const existing = diMap.get(key) || {
          codigo: key,
          count: 0,
          lastAccess: log.timestamp,
          status: "Ativo"
        };
        existing.count += 1;
        if (new Date(log.timestamp) > new Date(existing.lastAccess)) {
          existing.lastAccess = log.timestamp;
        }
        diMap.set(key, existing);
      }
    });

    const diList = Array.from(diMap.values()).sort((a, b) => b.count - a.count);
    const totalLoginsDI = diList.reduce((acc, d) => acc + d.count, 0);
    const totalDownloads = data.materiais.reduce((acc, m) => acc + m.downloads, 0);
    const totalAcessos = Math.max(148, totalLoginsDI * 3 + auditLogs.length + 50);
    const totalUsuarios = Math.max(diList.length + 2, 2 + refreshSessions.size);

    res.json({
      stats: {
        usuarios: totalUsuarios,
        cursos: data.cursos.length,
        materiais: data.materiais.length,
        downloads: totalDownloads,
        acessos: totalAcessos,
        totalLoginsDI
      },
      diList,
      auditLogs
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao carregar estatísticas." });
  }
});

// --- ADMIN D.I. CODE MANAGEMENT ENDPOINTS ---
app.get("/api/admin/dis", requireAdmin, async (req: any, res) => {
  try {
    const list = await dbService.getDICodes(req.user?.supabaseToken);
    res.json({ success: true, diCodes: list });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao buscar códigos D.I." });
  }
});

app.post("/api/admin/dis", requireAdmin, async (req: any, res) => {
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
});

app.put("/api/admin/dis/:id/toggle", requireAdmin, async (req: any, res) => {
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
});

app.delete("/api/admin/dis/:id", requireAdmin, async (req: any, res) => {
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
});

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

app.get("/api/admin/dis/template", requireAdmin, async (req: any, res) => {
  try {
    const content = "\uFEFF" + buildDITemplateCSV();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="modelo-cadastro-dis.csv"');
    res.send(content);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao gerar o modelo CSV." });
  }
});

// Export CSV dos D.I.s CADASTRADOS (espelho do modelo de importação:
// Nome | Código | Papel ‐ papel derivado do prefixo DI-ADMIN-).
app.get("/api/admin/dis/export-csv", requireAdmin, async (req: any, res) => {
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
});

app.post("/api/admin/dis/import", uploadRateLimiter, requireAdmin, csvImportMulter.single("file"), async (req: any, res) => {
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
});

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
  return typeof pw === "string" && pw.length >= 8 && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);
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

app.get("/api/support/realtime", authenticateUser, async (req: any, res) => {
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
});

app.get("/api/support/tickets", authenticateUser, async (req: any, res) => {
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
});

// Multer para os anexos do suporte (fotos/documentos no chat): até 5 arquivos
// de 10MB cada, em memória (as imagens são re-comprimidas com sharp antes de gravar).
const supportAnexoMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }
});

app.post("/api/support/tickets", authenticateUser, supportAnexoMulter.array("files", 5), async (req: any, res) => {
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
    if (result.ticket) {
      const cfg = await dbService.getOuvidoriaConfig();
      if (cfg.notifySuporteEmail && cfg.emailSuporte) {
        const t = result.ticket;
        const primeiroTexto = (t.mensagens && t.mensagens[0]?.texto) || stripTags(texto.trim());
        const num = String(t.numero).padStart(4, "0");
        sendEmail({
          to: cfg.emailSuporte,
          subject: `Novo chamado #${num} ‐ ${t.assunto}`,
          text: `Novo chamado de suporte aberto por ${t.criadoPorNome} (${t.criadoPor}):\nChamado #${num} ‐ ${t.assunto}\n\nMensagem inicial:\n${primeiroTexto}`,
          html: notifyNewTicketHtml(t.assunto, primeiroTexto, t.criadoPorNome, t.criadoPor, num)
        });
      }
    }
    publishSupportChange();
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao abrir chamado." });
  }
});

app.get("/api/support/tickets/:id", authenticateUser, async (req: any, res) => {
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
});

app.post("/api/support/tickets/:id/mensagens", authenticateUser, async (req: any, res) => {
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
});

app.post("/api/support/tickets/:id/status", authenticateUser, async (req: any, res) => {
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
});

// D.I. reabre o próprio chamado depois de fechado/resolvido
app.post("/api/support/tickets/:id/reabrir", authenticateUser, async (req: any, res) => {
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
});

// O responsável de suporte troca a PRÏPRIA senha (primeiro acesso ou após
// redefinição do admin). A senha do Supabase Auth é atualizada pelo próprio id da
// sessão (req.user.code = id da conta Supabase) e a flag de "troca pendente" é
// limpa. Nunca se loga a senha.
app.post("/api/support/change-password", passwordChangeRateLimiter, authenticateUser, async (req: any, res) => {
  try {
    if (req.user?.role !== "support") {
      return res.status(403).json({ error: "�?rea de suporte restrita ao suporte." });
    }
    const { novaSenha } = req.body;
    if (!isValidSupportPassword(novaSenha)) {
      return res.status(400).json({ error: SUPPORT_PASSWORD_HINT });
    }
    const uid = req.user?.code;
    if (!uid) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    const trusted = getSupabaseTrustedClient();
    if (trusted) {
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

    res.json({ success: true, message: "Senha atualizada com sucesso." });
  } catch (err: any) {
    console.error("[change-password] erro:", err);
    res.status(500).json({ error: "Erro ao alterar a senha." });
  }
});

// Caixa de entrada unificada do staff: chamados + interessados "Quero Fazer Parte" (prioridade; técnico: leads)
app.get("/api/support/inbox", authenticateUser, async (req: any, res) => {
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
});

// Status do interessado "Quero Fazer Parte" (somente staff; técnico: lead)
app.put("/api/support/ouvidoria/:id/status", authenticateUser, async (req: any, res) => {
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
});

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
      localPath: stored.localPath,
      storage: stored.storage,
      isImage: stored.isImage
    });
  }
  return { anexos };
}

// Armazena no MinIO (pasta suporte-anexos/<ticketId>/) com fallback em disco
// (data/suporte-anexos/ ‐ fora do público; servido apenas pelas rotas do suporte).
async function storeSupportAnexo(
  buffer: Buffer,
  originalName: string,
  mime: string,
  ticketId: string
): Promise<{ key: string; localPath?: string; storage: "minio" | "local"; isImage: boolean }> {
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
  try {
    const minioConfig = await dbService.getMinioConfig();
    const targetBucket = minioConfig.bucket || "armazenamento";
    const bucketStatus = await ensureMinioBucketExists(targetBucket);
    if (bucketStatus.ready) {
      await getActiveMinioClient().putObject(targetBucket, objectKey, buffer, buffer.length, { "Content-Type": mime });
      return { key: objectKey, storage: "minio", isImage };
    }
  } catch (minioErr) {
    console.warn("[Suporte Anexo MinIO Fallback]:", minioErr?.message || minioErr);
  }
  const uploadDir = path.join(process.cwd(), "data", "suporte-anexos");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const fileName = `${ts}_${rand}_${cleanName}`;
  fs.writeFileSync(path.join(uploadDir, fileName), buffer);
  return { key: fileName, localPath: fileName, storage: "local", isImage };
}

// Anexa arquivos a uma mensagem do chamado (staff responde OU D.I. envia)
app.post("/api/support/tickets/:id/anexos", uploadRateLimiter, authenticateUser, supportAnexoMulter.array("files", 5), async (req: any, res) => {
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
});

// Download de anexo ‐ staff OU o D.I. dono do chamado (ambos baixam qualquer
// arquivo da conversa; quem não é dono e não é staff recebe 403).
app.get("/api/support/tickets/:id/anexos/:anexoId", authenticateUser, async (req: any, res) => {
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
    if (anexo.storage === "minio") {
      const minioConfig = await dbService.getMinioConfig();
      const bucket = minioConfig.bucket || "armazenamento";
      const stream = await getActiveMinioClient().getObject(bucket, anexo.key);
      stream.pipe(res);
    } else {
      const filePath = path.join(process.cwd(), "data", "suporte-anexos", path.basename(anexo.localPath || anexo.key));
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Arquivo não encontrado." });
      res.send(fs.readFileSync(filePath));
    }
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao entregar o anexo." });
  }
});

// Sanitiza nomes para o objeto MinIO: sem acentos/caracteres especiais
function sanitizeFilePart(text: string, maxLen = 60): string {
  const normalized = (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.slice(0, maxLen) || "DI";
}

function formatDatePart(iso?: string): string {
  if (!iso) return "sem-data";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "sem-data";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Gera o PDF de um chamado fechado: dados do chamado + conversa completa
function buildSupportTicketPdf(ticket: any): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  let y = margin;

  const write = (text: string, opts: { size?: number; style?: "normal" | "bold"; color?: number; gap?: number } = {}) => {
    const size = opts.size || 10;
    const lines = doc.splitTextToSize(text || "", maxW) as string[];
    for (const line of lines) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", opts.style || "normal");
      doc.setFontSize(size);
      doc.setTextColor(opts.color ?? 40);
      doc.text(line, margin, y);
      y += size * 1.35;
    }
    if (opts.gap) y += opts.gap;
  };

  const separator = () => {
    if (y > pageH - margin - 20) {
      doc.addPage();
      y = margin;
    }
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 18;
  };

  // Cabeçalho
  doc.setFillColor(209, 42, 98);
  doc.rect(0, 0, pageW, 64, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("GRUPO FENIX - BACKUP DE SUPORTE", margin, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Chamado #${String(ticket.numero || "").padStart(4, "0")} - ${ticket.status || ""}`, margin, 48);
  y = 96;

  write(`D.I.: ${ticket.criadoPor || ""}`, { size: 12, style: "bold" });
  write(`Nome: ${ticket.criadoPorNome || ""}`, { size: 12 });
  write(`Assunto: ${ticket.assunto || ""}`, { size: 11 });
  write(`Aberto em: ${ticket.criadoEm ? new Date(ticket.criadoEm).toLocaleString("pt-BR") : "-"}`, { size: 10 });
  write(`Fechado em: ${ticket.fechadoEm ? new Date(ticket.fechadoEm).toLocaleString("pt-BR") : "-"}`, { size: 10 });
  write(`Fechado por: ${ticket.fechadoPor || "-"}`, { size: 10 });
  separator();

  write("CONVERSA", { size: 11, style: "bold", gap: 4 });
  const mensagens = ticket.mensagens || [];
  if (mensagens.length === 0) {
    write("(sem mensagens)", { size: 10, color: 130 });
  }
  for (const m of mensagens) {
    const autor = m.tipo === "di"
      ? (m.autorNome || m.autorRef || "D.I.")
      : `Suporte - ${m.autorNome || ""}`;
    const quando = m.criadoEm ? new Date(m.criadoEm).toLocaleString("pt-BR") : "";
    write(`[${m.tipo === "di" ? "D.I." : "SUPORTE"}] ${autor} - ${quando}`, { size: 9, style: "bold", color: 209 });
    write(m.texto || "", { size: 10, gap: 6 });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

// Backup do suporte: chamados fechados -> 1 PDF por chamado (nome do D.I. + código +
// data de fechamento) -> ZIP -> pasta backup-suporte/ no MinIO (organizado por data).
// È uma CÏPIA de segurança: os chamados permanecem no banco (auditoria imutável).
app.post("/api/admin/support/backup", requireAdmin, async (req: any, res) => {
  try {
    const tickets = await dbService.getSupportTickets(req.user?.supabaseToken);
    const fechados = tickets.filter((t) => t.status === "fechado");
    if (fechados.length === 0) {
      return res.status(400).json({ error: "Nenhum chamado fechado para exportar. Feche um chamado para gerar o backup." });
    }

    const zip = new JSZip();
    for (const ticket of fechados) {
      const nome = sanitizeFilePart(ticket.criadoPorNome || "DI");
      const codigo = sanitizeFilePart(ticket.criadoPor || "");
      const dataFechamento = formatDatePart(ticket.fechadoEm || ticket.atualizadoEm);
      zip.file(`${nome}_${codigo}_${dataFechamento}.pdf`, buildSupportTicketPdf(ticket));
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dataPart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const dataPath = `${now.getFullYear()}/${dataPart}`;
    const zipName = `backup-suporte_${dataPart}_${pad(now.getHours())}h${pad(now.getMinutes())}.zip`;
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const minioConfig = await dbService.getMinioConfig();
    const targetBucket = minioConfig.bucket || "armazenamento";
    const bucketStatus = await ensureMinioBucketExists(targetBucket);
    if (!bucketStatus.ready) {
      return res.status(500).json({ error: "Bucket do MinIO não está disponível para o backup." });
    }

    const objectKey = `backup-suporte/${dataPath}/${zipName}`;
    const client = getActiveMinioClient();
    await client.putObject(targetBucket, objectKey, zipBuffer, zipBuffer.length, {
      "Content-Type": "application/zip"
    });

    dbService.recordAuditLog(
      req.user?.code || "admin",
      "SUPORTE_BACKUP",
      `Backup de suporte gerado: ${fechados.length} chamado(s) fechado(s) em ${objectKey}`
    ).catch(() => {});

    res.json({
      success: true,
      count: fechados.length,
      arquivo: objectKey,
      // Download agora passa pela rota admin (/api/admin/backup/suporte-download/*).
      // A URL pública /api/minio/stream é bloqueada por isBackupFamilyKey.
      rel: objectKey.replace("backup-suporte/", ""),
      tamanhoKb: Math.round(zipBuffer.length / 1024)
    });
  } catch (err: any) {
    console.error("[Backup Suporte] Erro:", err);
    res.status(500).json({ error: "Erro ao gerar o backup do suporte." });
  }
});

// ---- ADMIN: backup e restauração do site ----
// Restore de backup: somente arquivos .json gerados pelo painel (validação de estrutura + checksum na rota)
const backupUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (req: any, file: any, cb: any) => {
    if (/\.json$/i.test(file.originalname || "")) return cb(null, true);
    cb(null, false);
  }
});

app.post("/api/admin/backup/create", requireAdmin, async (req: any, res) => {
  try {
    const result = await createSiteBackup({ geradoPor: req.user?.code || "admin", userToken: req.user?.supabaseToken });
    // Regra A: cada "Criar Backup Agora" também gera o dump do banco (configs,
    // tabelas, contas + cópia dos audit_logs) em backups-banco/. Falha aqui não
    // derruba a save ‐ o dump é complementar.
    let dump: { nome: string; url: string; tamanhoKb: number } | null = null;
    try {
      const d = await createDatabaseDump({ geradoPor: req.user?.code || "admin", userToken: req.user?.supabaseToken });
      dump = { nome: d.nome, url: d.url, tamanhoKb: d.tamanhoKb };
    } catch (err: any) {
      console.warn("[Backup] Dump automático falhou:", err?.message || err);
    }
    res.json({ ...result, dump });
  } catch (err: any) {
    console.error("[Backup] Erro ao criar:", err);
    res.status(500).json({ error: "Erro ao criar o backup do site." });
  }
});

app.post("/api/admin/backup/dump", requireAdmin, async (req: any, res) => {
  try {
    const result = await createDatabaseDump({ geradoPor: req.user?.code || "admin", userToken: req.user?.supabaseToken });
    res.json(result);
  } catch (err: any) {
    console.error("[Backup] Erro ao gerar o dump do banco:", err);
    res.status(500).json({ error: "Erro ao gerar o dump do banco." });
  }
});

app.get("/api/admin/backup/banco-list", requireAdmin, async (req: any, res) => {
  try {
    const result = await listBancoBackups();
    res.json(result);
  } catch (err: any) {
    console.error("[Backup] Erro ao listar dumps:", err);
    res.status(500).json({ error: "Erro ao listar os dumps do banco." });
  }
});

app.delete("/api/admin/backup/banco-delete", requireAdmin, async (req: any, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: "Informe o dump a excluir." });
    const result = await deleteBancoBackup(String(key), req.user?.code || "admin");
    res.json(result);
  } catch (err: any) {
    console.error("[Backup] Erro ao excluir dump:", err);
    res.status(400).json({ error: err?.message || "Erro ao excluir o dump do banco." });
  }
});

app.get("/api/admin/backup/banco-download/:nome", requireAdmin, async (req: any, res) => {
  try {
    const nome = String(req.params.nome || "").replace(/^backups-banco\//, "");
    const key = "backups-banco/" + nome;
    const { buffer, nome: nomeZip } = await buildBancoBackupZip(key);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeZip.replace(/[\r\n"]/g, "_")}"`);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(buffer);
  } catch (err: any) {
    console.error("[Backup] Erro no download do dump:", err);
    res.status(400).json({ error: err?.message || "Erro ao baixar o dump do banco." });
  }
});

// Download do ZIP do backup do suporte (PDFs com as conversas dos chamados).
// SOMENTE admin (requireAdmin + subdomínio). O objeto nunca é servido pelas
// rotas públicas de mídia (guardas isBackupFamilyKey em stream/preview/hls).
app.get("/api/admin/backup/suporte-download/*", requireAdmin, async (req: any, res) => {
  try {
    const raw = req.params[0] || "";
    let rel = raw;
    try { rel = decodeURIComponent(raw); } catch {}
    const key = "backup-suporte/" + rel;
    const { buffer, nome } = await buildSuporteBackupZip(key);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${nome.replace(/[\r\n"]/g, "_")}"`);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("X-Content-Type-Options", "nosniff");
    dbService
      .recordAuditLog(req.user?.code || "admin", "SUPORTE_BACKUP_BAIXADO", `Backup do suporte baixado: ${nome}`)
      .catch(() => {});
    res.end(buffer);
  } catch (err: any) {
    console.error("[Backup] Erro no download do backup do suporte:", err);
    res.status(400).json({ error: err?.message || "Erro ao baixar o backup do suporte." });
  }
});

// ---- ADMIN: verificador de integridade das mídias (leitura) ----
app.get("/api/admin/backup/integrity", requireAdmin, async (req: any, res) => {
  try {
    const result = await checkMediaIntegrity();
    res.json(result);
  } catch (err: any) {
    console.error("[Backup] Erro ao verificar integridade:", err);
    res.status(500).json({ error: "Erro ao verificar a integridade das mídias." });
  }
});

// ---- ADMIN: limpeza de mídias órfãs (somente as confirmadas pelo usuário) ----
// Cada chave é re-verificada ANTES da exclusão (pode ter virado referência entre
// a listagem e a confirmação). Backups nunca são tocados.
app.post("/api/admin/backup/cleanup-orphans", requireAdmin, async (req: any, res) => {
  try {
    const { chaves } = req.body || {};
    if (!Array.isArray(chaves) || chaves.length === 0) {
      return res.status(400).json({ error: "Nenhuma mídia selecionada para limpeza." });
    }
    if (chaves.length > 500) {
      return res.status(400).json({ error: "Limite de 500 mídias por limpeza excedido." });
    }
    if (isRestoreInProgress()) {
      return res.status(400).json({ error: "Uma restauração está em andamento ‐ aguarde para limpar mídias." });
    }
    const strings = chaves.map((c: any) => String(c)).filter((c: string) => c && c.startsWith("/") === false);
    const result = await removeOrphanMedia(strings, req.user?.code || "admin");
    res.json({
      success: true,
      message: `Limpeza concluída: ${result.removidas.length} mídia(s) órfã(s) removida(s), ${result.mantidas.length} mantida(s).`,
      removidas: result.removidas,
      mantidas: result.mantidas
    });
  } catch (err: any) {
    console.error("[Backup] Erro na limpeza de órfãos:", err);
    res.status(500).json({ error: "Erro ao limpar mídias órfãs." });
  }
});

app.get("/api/admin/backup/list", requireAdmin, async (req: any, res) => {
  try {
    const result = await listSiteBackups();
    res.json(result);
  } catch (err: any) {
    console.error("[Backup] Erro ao listar:", err);
    res.status(500).json({ error: "Erro ao listar os backups do site." });
  }
});

app.get("/api/admin/backup/status", requireAdmin, async (req: any, res) => {
  try {
    const result = await getSiteStatus();
    res.json(result);
  } catch (err: any) {
    console.error("[Backup] Erro ao verificar estado:", err);
    res.status(500).json({ error: "Erro ao verificar o estado atual do site." });
  }
});

app.post("/api/admin/backup/restore", requireAdmin, backupUploadMulter.single("arquivo"), async (req: any, res) => {
  try {
    const { key, restaurarConexoes, mesclar, forceVazio } = req.body || {};
    const buffer = req.file?.buffer;
    if (!key && !buffer) {
      return res.status(400).json({ error: "Envie um arquivo de backup ou informe a versão a restaurar." });
    }
    const restaurarConexoesFlag = restaurarConexoes === undefined || restaurarConexoes === null
      ? true
      : restaurarConexoes === true || restaurarConexoes === "true";
    const mesclarFlag = mesclar === true || mesclar === "true";
    const forceVazioFlag = forceVazio === true || forceVazio === "true";
    const result = await restoreSiteBackup({
      key: key || undefined,
      buffer,
      geradoPor: req.user?.code || "admin",
      userToken: req.user?.supabaseToken,
      restaurarConexoes: restaurarConexoesFlag,
      mesclar: mesclarFlag,
      forceVazio: forceVazioFlag
    });
    res.json(result);
  } catch (err: any) {
    console.error("[Backup] Erro ao restaurar:", err);
    res.status(400).json({ error: err?.message || "Erro ao restaurar o backup do site." });
  }
});

// ---- ADMIN: exclusão DEFINITIVA de um backup (lista não fica interminável) ----
app.delete("/api/admin/backup/delete", requireAdmin, async (req: any, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: "Informe o backup a excluir." });
    const result = await deleteSiteBackup(String(key), req.user?.code || "admin");
    res.json(result);
  } catch (err: any) {
    console.error("[Backup] Erro ao excluir:", err);
    res.status(400).json({ error: err?.message || "Erro ao excluir o backup do site." });
  }
});

// ---- ADMIN: download da save como .zip (não abre JSON no navegador) ----
app.get("/api/admin/backup/download/:nome", requireAdmin, async (req: any, res) => {
  try {
    const nome = String(req.params.nome || "").replace(/^backups-site\//, "");
    const key = "backups-site/" + nome;
    const { buffer, nome: nomeZip } = await buildBackupZip(key);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeZip.replace(/[\r\n"]/g, "_")}"`);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(buffer);
  } catch (err: any) {
    console.error("[Backup] Erro no download:", err);
    res.status(400).json({ error: err?.message || "Erro ao baixar o backup." });
  }
});

// ---- ADMIN: modo manutenção ----
app.post("/api/admin/manutencao", requireAdmin, async (req: any, res) => {
  try {
    const { ativo, mensagem } = req.body || {};
    const result = await setManutencao(!!ativo, typeof mensagem === "string" ? cleanText(mensagem) : "", req.user?.code || "admin");
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Manutenção] Erro:", err);
    res.status(500).json({ error: err?.message || "Erro ao alterar o modo manutenção." });
  }
});

// ---- PÖBLICO: status do modo manutenção (para a página de manutenção) ----
app.get("/api/manutencao/status", async (req, res) => {
  try {
    const data = await cacheJsonResponse("manutencao/status", 30000, async () => {
      const status = await getManutencaoStatus();
      return JSON.stringify({ success: true, ...status });
    });
    res.type("application/json").send(data);
  } catch {
    res.json({ success: true, ativo: false, mensagem: "" });
  }
});

// ---- ADMIN: gerenciamento dos usuários da área de suporte ----
app.get("/api/admin/support-users", requireAdmin, async (req: any, res) => {
  try {
    const users = await dbService.getSupportUsers(req.user?.supabaseToken);
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao carregar usuários de suporte." });
  }
});

app.post("/api/admin/support-users", requireAdmin, async (req: any, res) => {
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
});

// Redefinição de senha de um responsável pelo admin: define uma nova senha
// temporária (repassada ao responsável) e marca a troca como pendente ‐ no
// próximo login o responsável deverá escolher a própria senha.
app.post("/api/admin/support-users/:email/reset-password", passwordChangeRateLimiter, requireAdmin, async (req: any, res) => {
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

    const flag = await dbService.setSupportUserMustChange(email, true, req.user?.code || "Admin", req.user?.supabaseToken);
    if (!flag.success) return res.status(400).json({ error: flag.error });

    res.json({ success: true, message: "Senha redefinida. O responsável definirá a própria senha no próximo acesso." });
  } catch (err: any) {
    console.error("[reset-password] erro:", err);
    res.status(500).json({ error: "Erro ao redefinir a senha." });
  }
});

// ---------------- MINIO S3 OBJECT STORAGE & STREAMING ENDPOINTS ----------------

// ==========================================
// NOTIFICAÆÑES POR E-MAIL (config admin ‐ destinos + toggles + status SMTP)
// ==========================================
// Credenciais SMTP vivem só no .env do servidor (SMTP_HOST/SMTP_PORT/SMTP_SECURE/
// SMTP_USER/SMTP_PASS/MAIL_FROM_NAME). O painel só vê o status (user mascarado).
// Envio é fire-and-forget: falha de e-mail nunca quebra formulário ou API.

app.get("/api/admin/support/email-config", requireAdmin, async (req: any, res) => {
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
});

app.post("/api/admin/support/email-config", requireAdmin, async (req: any, res) => {
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
});

app.post("/api/admin/support/email-test", requireAdmin, async (req: any, res) => {
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
});

// ---------------- MINIO S3 OBJECT STORAGE & STREAMING ENDPOINTS ----------------

// ==========================================
// STATUS DAS INTEGRAÆÑES (MinIO + Vimeo)
// ==========================================
// Verifica conectividade real SEM expor nenhuma credencial (accessKey, secretKey,
// token, client secret nunca saem do servidor). As credenciais vivem em variáveis
// de ambiente (MINIO_*/VIMEO_*) com fallback no config do banco (legado).
app.get("/api/admin/integrations/status", requireAdmin, async (req: any, res) => {
  try {
    const dateStr = new Date().toISOString();
    const [minioCfg, vimeoCfg] = await Promise.all([
      dbService.getMinioConfig(),
      dbService.getVimeoConfig()
    ]);

    const minioEnv = !!process.env.MINIO_ENDPOINT && !!process.env.MINIO_ACCESS_KEY && !!process.env.MINIO_SECRET_KEY;
    const minioDb = !!minioCfg.endpoint && !!minioCfg.accessKey && !!minioCfg.secretKey;
    const minioSource = minioEnv ? "env" : minioDb ? "db" : "none";

    const minio = {
      configured: minioSource !== "none",
      source: minioSource,
      online: false,
      message: "Não configurado ‐ configure as variáveis MINIO_* no .env (ou restaure a configuração antiga no banco).",
      endpoint: minioCfg.endpoint || "",
      bucket: minioCfg.bucket || "armazenamento",
      region: minioCfg.region || "",
      latencyMs: null as number | null,
      lastCheckedAt: dateStr
    };

    if (minioSource !== "none") {
      const t0 = Date.now();
      const testRes = await testMinioConnection(minioCfg);
      minio.latencyMs = Date.now() - t0;
      if (Array.isArray(testRes.buckets)) {
        minio.online = true;
        minio.message = `Conectado ‐ ${testRes.buckets.length} bucket(s) acessíveis no servidor.`;
      } else {
        minio.message = "Servidor não respondeu. O modo de resiliência segue ativo (uploads caem no armazenamento local).";
      }
    }

    const vimeoEnv = !!process.env.VIMEO_ACCESS_TOKEN || !!process.env.VIMEO_CLIENT_ID;
    const vimeoDb = !!(vimeoCfg.accessToken && vimeoCfg.clientId && vimeoCfg.clientSecret);
    const vimeoSource = vimeoEnv ? "env" : vimeoDb ? "db" : "none";

    const vimeo = {
      configured: vimeoSource !== "none",
      source: vimeoSource,
      online: false,
      message: "Não configurado ‐ adicione VIMEO_CLIENT_ID, VIMEO_CLIENT_SECRET e VIMEO_ACCESS_TOKEN ao .env.",
      accountName: "",
      accountLink: "",
      latencyMs: null as number | null,
      lastCheckedAt: dateStr
    };

    if (vimeoSource !== "none") {
      try {
        const t0 = Date.now();
        const account: any = await Promise.race([
          getVimeoAccountDetails(
            (vimeoCfg.clientId || "").trim(),
            (vimeoCfg.clientSecret || "").trim(),
            (vimeoCfg.accessToken || "").trim()
          ),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000))
        ]);
        vimeo.online = true;
        vimeo.latencyMs = Date.now() - t0;
        vimeo.accountName = account?.name || "";
        vimeo.accountLink = account?.link || "";
        vimeo.message = "Conectado ‐ API do Vimeo respondendo.";
      } catch (err: any) {
        vimeo.message = err?.message === "timeout"
          ? "Tempo esgotado ao contatar a API do Vimeo."
          : "Falha ao conectar com a API do Vimeo (credenciais inválidas ou rede indisponível).";
      }
    }

    return res.json({ minio, vimeo });
  } catch (err: any) {
    console.error("[integrations/status]", err);
    return res.status(500).json({ error: "Erro ao verificar o status das integrações." });
  }
});

// Multipart / Buffer / Base64 Direct Upload to MinIO with Folder Structure
// Somente ADMIN: permite gravar em qualquer pasta da allowlist (inclusive
// materiais/ e cursos/videos). Usuários comuns têm rotas próprias com escopo
// fixo (fenix_social via /api/fenix-social/posts, anexos via /api/support/*).
app.post("/api/minio/upload", uploadRateLimiter, requireAdmin, uploadMulter.single("file"), async (req: any, res) => {
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

    const minioConfig = await dbService.getMinioConfig();
    const targetBucket = minioConfig.bucket || "armazenamento";
    const cleanName = fileName.toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
    const timestamp = Date.now();
    const rand = crypto.randomBytes(4).toString("hex");
    const objectKey = `${folder}/${timestamp}_${rand}_${cleanName}`;
    if (objectKey.length > 400) {
      return res.status(400).json({ error: "Nome do arquivo muito longo." });
    }
    const isVideo = mimeType.startsWith("video/");

    const bucketStatus = await ensureMinioBucketExists(targetBucket);

    if (bucketStatus.ready) {
      try {
        const client = getActiveMinioClient();

        await client.putObject(targetBucket, objectKey, fileBuffer, fileBuffer.length, {
          "Content-Type": mimeType
        });

        const previewUrl = `/api/minio/preview/${encodeURIComponent(objectKey)}`;
        const streamUrl = `/api/minio/stream/${encodeURIComponent(objectKey)}`;
        const hlsUrl = `/api/minio/hls/master.m3u8?key=${encodeURIComponent(objectKey)}`;

        return res.json({
          success: true,
          storage: "minio",
          bucket: targetBucket,
          objectKey,
          mimeType,
          url: isVideo ? streamUrl : previewUrl,
          previewUrl,
          streamUrl,
          hlsUrl: isVideo ? hlsUrl : undefined
        });
      } catch (uploadErr: any) {
        console.warn("[MinIO Upload Error]:", uploadErr?.message || uploadErr);
      }
    }

    // Disk fallback storage (Instant, silent resilience)
    const localSubDir = path.join(uploadsDir, folder);
    if (!fs.existsSync(localSubDir)) {
      fs.mkdirSync(localSubDir, { recursive: true });
    }
    const localFileName = `${timestamp}_${cleanName}`;
    const localPath = path.join(localSubDir, localFileName);
    fs.writeFileSync(localPath, fileBuffer);

    const localUrl = `/api/uploads/${folder}/${localFileName}`;

    return res.json({
      success: true,
      storage: "fallback_local",
      objectKey,
      mimeType,
      url: localUrl,
      previewUrl: localUrl,
      streamUrl: localUrl,
      warning: `MinIO recusou a conexão (${bucketStatus.error || 'Falha no MinIO'}). O arquivo foi gravado no armazenamento resiliente local.`
    });
  } catch (err: any) {
    console.error("Erro ao realizar upload no MinIO:", err);
    res.status(500).json({ error: "Falha ao gravar arquivo no armazenamento." });
  }
});

// Objetos das famílias de backup (backups-site/, backups-banco/, backup-suporte/)
// contêm dados sensíveis (configs com minioConfig/vimeoConfig/supportTickets,
// contas, audit_logs, conversas completas de suporte) e NUNCA são servidos
// pelas rotas públicas de mídia ‐ somente pelas rotas admin
// (/api/admin/backup/*download). Anexos do suporte (suporte-anexos/) também são
// privados (download só pelo painel do atendente). Resposta 404 idêntica à de
// arquivo inexistente.
const BACKUP_FAMILY_PREFIXES = ["backups-site/", "backups-banco/", "backup-suporte/", "suporte-anexos/"];
function isBackupFamilyKey(objectKey: string): boolean {
  return BACKUP_FAMILY_PREFIXES.some((p) => objectKey.startsWith(p));
}

// Serve Images / Documents directly from MinIO
// Mídias de material (pasta materiais/*) são protegidas: só servidas com sessão
// válida (cookie httpOnly OU Authorization Bearer ‐ o mesmo fallback do
// authenticateUser, para <img>/<video>/<a href> seguirem funcionando). Anônimos
// recebem o MESMO 404 de arquivo inexistente (não revela existência do arquivo).
// Requests do próprio servidor (loopback ‐ ex.: ffmpeg remuxando HLS de material
// via http://127.0.0.1:PORT) passam sem sessão.
function isMaterialMediaAllowed(req: any, res: any): boolean {
  // Requests do próprio servidor (loopback) só passam com o header interno que o
  // ffmpeg envia (remux de HLS de material) ‐ um request local sem esse header é
  // tratado como anônimo, igual a qualquer outro.
  // ATENÆÂO (14/08): o loopback é verificado pelo ENDEREÆO DO SOCKET
  // (req.socket.remoteAddress), nunca por req.ip ‐ com TRUST_PROXY=1 ativo, um
  // atacante que alcance a porta 3000 direto controla o req.ip (via
  // X-Forwarded-For) e forjaria "127.0.0.1" para burlar a guarda.
  const socketIp = req.socket?.remoteAddress || "";
  if ((socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1") && req.headers["x-internal-ffmpeg"] === "1") {
    return true;
  }
  let accessToken = req.cookies?.access_token;
  if (!accessToken && req.headers.authorization) {
    const parts = String(req.headers.authorization).split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") accessToken = parts[1];
  }
  if (accessToken) {
    let decoded = verifyJWT(accessToken);
    if (decoded && decoded.jti && revokedJtis.has(decoded.jti)) decoded = null;
    if (decoded) return true;
    if (decoded?.jti) {
      jtiSessions.delete(decoded.jti);
      persistJtiSessions();
    }
  }
  return !!handleRefreshFlow(req, res);
}

// --- Proteção contra travamento do MinIO remoto sob concorrência ---
// Quando o MinIO remoto fica lento/fora (ex.: rede), as requisições simultâneas
// (ex.: 7 imagens da home) seguram os 6 sockets HTTP do navegador por host e
// deixam as views lazy (Suspense) parecendo travadas. Um timeout curto nas
// chamadas remotas garante que os sockets sejam liberados em poucos segundos;
// a config é cacheada (evita query Supabase por request) e previews pequenos
// ficam em memória (revisitas instantâneas).
let minioConfigCache: { cfg: Awaited<ReturnType<typeof dbService.getMinioConfig>>; time: number } | null = null;
async function getMinioConfigCached(): Promise<Awaited<ReturnType<typeof dbService.getMinioConfig>>> {
  if (minioConfigCache && Date.now() - minioConfigCache.time < 15_000) return minioConfigCache.cfg;
  const cfg = await dbService.getMinioConfig();
  minioConfigCache = { cfg, time: Date.now() };
  return cfg;
}

const MINIO_PREVIEW_CACHE_MAX_ITEMS = 200;
const MINIO_PREVIEW_CACHE_MAX_BYTES = 128 * 1024 * 1024;
const MINIO_PREVIEW_CACHE_MAX_FILE = 4 * 1024 * 1024;
const MINIO_PREVIEW_CACHE_TTL = 60 * 60 * 1000;
const minioPreviewCache = new Map<string, { data: Buffer; mime: string; time: number }>();
let minioPreviewCacheBytes = 0;
function minioPreviewCacheGet(key: string) {
  const hit = minioPreviewCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > MINIO_PREVIEW_CACHE_TTL) {
    minioPreviewCache.delete(key);
    minioPreviewCacheBytes -= hit.data.length;
    return null;
  }
  return hit;
}
function minioPreviewCacheSet(key: string, data: Buffer, mime: string) {
  if (data.length > MINIO_PREVIEW_CACHE_MAX_FILE) return;
  const old = minioPreviewCache.get(key);
  if (old) minioPreviewCacheBytes -= old.data.length;
  minioPreviewCache.set(key, { data, mime, time: Date.now() });
  minioPreviewCacheBytes += data.length;
  while (minioPreviewCache.size > MINIO_PREVIEW_CACHE_MAX_ITEMS || minioPreviewCacheBytes > MINIO_PREVIEW_CACHE_MAX_BYTES) {
    const firstKey = minioPreviewCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    const evicted = minioPreviewCache.get(firstKey);
    minioPreviewCache.delete(firstKey);
    if (evicted) minioPreviewCacheBytes -= evicted.data.length;
  }
}

app.get("/api/minio/preview/*", async (req, res) => {
  try {
    const rawKey = req.params[0];
    if (!rawKey) return res.status(400).json({ error: "Chave do arquivo ausente." });

    const objectKey = decodeURIComponent(rawKey);
    if (objectKey.length > 500 || objectKey.includes("..") || objectKey.includes("\\")) {
      return res.status(400).json({ error: "Chave do arquivo inválida." });
    }
    if (isBackupFamilyKey(objectKey)) {
      return res.status(404).json({ error: "Arquivo não encontrado no servidor MinIO." });
    }
    if (objectKey.startsWith("materiais/") && !isMaterialMediaAllowed(req, res)) {
      return res.status(404).json({ error: "Arquivo não encontrado no servidor MinIO." });
    }

    const ext = fileExtOf(objectKey);
    const mime = EXT_TO_MIME[ext] || "application/octet-stream";

    const cacheHit = minioPreviewCacheGet(objectKey);
    if (cacheHit) {
      res.setHeader("Content-Type", cacheHit.mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.end(cacheHit.data);
    }

    const minioConfig = await getMinioConfigCached();
    // Bucket SEMPRE vindo da config do servidor ‐ o cliente nunca escolhe bucket
    const bucket = minioConfig.bucket || "armazenamento";

const client = getActiveMinioClient();

    const stat = await withTimeout(client.statObject(bucket, objectKey), 1500, "Timeout no MinIO");
    const dispositionHeaders = () => {
      if (!INLINE_MEDIA_EXT.has(ext) && !objectKey.startsWith("fenix_social/")) {
        const safeName = path.basename(objectKey).replace(/[\r\n"]/g, "_");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      }
    };
    if (stat.size <= MINIO_PREVIEW_CACHE_MAX_FILE) {
      const data = await withTimeout(
        (async () => {
          const stream = await client.getObject(bucket, objectKey);
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          return Buffer.concat(chunks);
        })(),
        4000,
          "Timeout no MinIO"
      );
      minioPreviewCacheSet(objectKey, data, mime);
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=86400");
      dispositionHeaders();
      res.end(data);
    } else {
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=86400");
      dispositionHeaders();
      const stream = await client.getObject(bucket, objectKey);
      stream.pipe(res);
    }
  } catch (err: any) {
    res.status(404).json({ error: "Arquivo não encontrado no servidor MinIO." });
  }
});

// Stream Video / Audio with Range Requests support
app.get("/api/minio/stream/*", async (req, res) => {
  try {
    const rawKey = req.params[0];
    if (!rawKey) return res.status(400).json({ error: "Chave do arquivo ausente." });

    const objectKey = decodeURIComponent(rawKey);
    if (objectKey.length > 500 || objectKey.includes("..") || objectKey.includes("\\")) {
      return res.status(400).json({ error: "Chave do arquivo inválida." });
    }
    if (isBackupFamilyKey(objectKey)) {
      return res.status(404).json({ error: "Mídia/Vídeo não encontrado no MinIO." });
    }
    if (objectKey.startsWith("materiais/") && !isMaterialMediaAllowed(req, res)) {
      return res.status(404).json({ error: "Mídia/Vídeo não encontrado no MinIO." });
    }

    const minioConfig = await getMinioConfigCached();
    // Bucket SEMPRE vindo da config do servidor ‐ o cliente nunca escolhe bucket
    const bucket = minioConfig.bucket || "armazenamento";

    const client = getActiveMinioClient();
    const stat = await withTimeout(client.statObject(bucket, objectKey), 1500, "Timeout no MinIO");
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
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        ...streamHeaders
      });

      const stream = await client.getPartialObject(bucket, objectKey, start, chunkSize);
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        ...streamHeaders
      });

      const stream = await client.getObject(bucket, objectKey);
      stream.pipe(res);
    }
  } catch (err: any) {
    res.status(404).json({ error: "Mídia/Vídeo não encontrado no MinIO." });
  }
});

// Adaptive HLS Video Streaming Generator & Proxy (.m3u8 + .ts segments)
const activeHlsJobs = new Map<string, Promise<boolean>>();

app.get("/api/minio/hls/master.m3u8", async (req, res) => {
  try {
    const key = req.query.key as string;
    if (!key) return res.status(400).json({ error: "Chave do arquivo ausente" });
    // Chaves de objeto MinIO não podem conter sequências de travessia nem voltar ao bucket
    if (key.length > 500 || key.includes("..") || key.includes("\\") || key.includes("%")) {
      return res.status(400).json({ error: "Chave do arquivo inválida." });
    }
    if (isBackupFamilyKey(key)) {
      return res.status(404).json({ error: "Playlist não encontrada." });
    }
    if (key.startsWith("materiais/") && !isMaterialMediaAllowed(req, res)) {
      return res.status(404).json({ error: "Playlist não encontrada." });
    }

    const minioConfig = await dbService.getMinioConfig();
    // Bucket SEMPRE vindo da config do servidor ‐ o cliente nunca escolhe bucket
    const bucket = minioConfig.bucket || "armazenamento";

    const hash = crypto.createHash("md5").update(`${bucket}:${key}`).digest("hex");
    const cacheDir = path.join("/tmp/hls_cache", hash);
    const playlistPath = path.join(cacheDir, "index.m3u8");

    let isCachedValid = false;
    if (fs.existsSync(playlistPath) && fs.statSync(playlistPath).size > 0) {
      const content = fs.readFileSync(playlistPath, "utf8");
      if (content.includes("#EXT-X-ENDLIST") && content.includes("#EXT-X-PLAYLIST-TYPE:VOD")) {
        isCachedValid = true;
      }
    }

    if (!isCachedValid) {
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
      fs.mkdirSync(cacheDir, { recursive: true });

      if (!activeHlsJobs.has(hash)) {
        const jobPromise = (async () => {
          const streamUrl = `http://127.0.0.1:${PORT}/api/minio/stream/${encodeURIComponent(key)}`;

          const runFFmpeg = (args: string[]) => new Promise<boolean>((resolve) => {
            // Header interno: o request de stream do ffmpeg (loopback) só passa
            // na guarda de mídia com ele (isMaterialMediaAllowed).
            const proc = spawn("ffmpeg", ["-y", "-headers", "X-Internal-Ffmpeg: 1\r\n", "-i", streamUrl, ...args, playlistPath]);
            proc.on("close", (code) => resolve(code === 0));
            proc.on("error", () => resolve(false));
          });

          // Remux rápido sem transcodificação
          let ok = await runFFmpeg([
            "-c:v", "copy",
            "-c:a", "copy",
            "-hls_time", "4",
            "-hls_list_size", "0",
            "-hls_playlist_type", "vod",
            "-hls_segment_filename", path.join(cacheDir, "seg_%03d.ts")
          ]);

          // Fallback para libx264 ultrafast
          if (!ok) {
            ok = await runFFmpeg([
              "-c:v", "libx264",
              "-preset", "ultrafast",
              "-crf", "22",
              "-c:a", "aac",
              "-hls_time", "4",
              "-hls_list_size", "0",
              "-hls_playlist_type", "vod",
              "-hls_segment_filename", path.join(cacheDir, "seg_%03d.ts")
            ]);
          }

          if (!ok || !fs.existsSync(playlistPath)) {
            // Fallback playlist VOD para reprodutores HLS
            const fallbackPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:10.0,
/api/minio/stream/${encodeURIComponent(key)}
#EXT-X-ENDLIST`;
            fs.writeFileSync(playlistPath, fallbackPlaylist, "utf8");
            return true;
          }

          return ok;
        })();

        activeHlsJobs.set(hash, jobPromise);
        jobPromise.finally(() => activeHlsJobs.delete(hash));
      }

      if (activeHlsJobs.has(hash)) {
        await activeHlsJobs.get(hash);
      }
    }

    if (!fs.existsSync(playlistPath)) {
      return res.status(500).json({ error: "Não foi possível gerar a playlist HLS" });
    }

    const rawPlaylist = fs.readFileSync(playlistPath, "utf8");
    const rewrittenPlaylist = rawPlaylist.replace(/(seg_\d+\.ts)/g, `/api/minio/hls/segment/${hash}/$1`);

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache");
    return res.send(rewrittenPlaylist);
  } catch (err: any) {
    res.status(500).json({ error: "Não foi possível gerar a playlist HLS." });
  }
});

// Serve HLS .ts video segments
app.get("/api/minio/hls/segment/:hash/:segment", (req, res) => {
  const { hash, segment } = req.params;

  // Strict validation: hash = md5 hex gerado pelo servidor; segment = seg_%03d.ts
  if (!/^[a-f0-9]{32}$/.test(hash) || !/^seg_\d+\.ts$/.test(segment)) {
    return res.status(400).json({ error: "Segmento HLS inválido." });
  }

  const cacheRoot = path.resolve("/tmp/hls_cache");
  const segPath = path.resolve(cacheRoot, hash, segment);
  if (!segPath.startsWith(cacheRoot + path.sep)) {
    return res.status(400).json({ error: "Segmento HLS inválido." });
  }

  if (!fs.existsSync(segPath)) {
    return res.status(404).json({ error: "Segmento HLS não encontrado" });
  }

  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.sendFile(segPath);
});

// ==========================================
// VIMEO API ENDPOINTS (credenciais somente via env/banco ‐ nunca editáveis no painel)
// ==========================================

// Verify Vimeo Connection & Get Account Info
app.get("/api/admin/vimeo/me", requireAdmin, async (req, res) => {
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
});

// List Videos from Admin's Vimeo Account (Node Vimeo SDK)
app.get("/api/admin/vimeo/my-videos", requireAdmin, async (req, res) => {
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
});

// Fetch Vimeo Video Details via Vimeo API (somente usuários autenticados + rate limit)
app.post("/api/vimeo/info", vimeoInfoRateLimiter, authenticateUser, async (req, res) => {
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
});


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
    const SENSITIVE_STATIC = /\.(cjs|map|md|sql|bat|log|env|ts|tsx|pem|key)$/i;
    const SENSITIVE_NAMES = new Set([
      "server.cjs", "server.cjs.map", "db.json", "package.json", "package-lock.json",
      "metadata.json", "estado_plataforma.md", "AGENTS.md", "DOCUMENTACAO.md",
      "CORRECOES-SEGURANCA.md", "supabase_schema.sql", "supabase-security-fix.sql",
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
      if (SENSITIVE_STATIC.test(pathname) || SENSITIVE_NAMES.has(base) || base.startsWith(".")) {
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
  const server = app.listen(PORT, "::", () => {
    console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  });

  // Request timeout unlimited (large uploads), but keep-alive com teto contra
  // DoS de conexões paradas. ATENÆÂO: keepAliveTimeout baixo (5s) faz o Node
  // fechar sockets ociosos enquanto o navegador ainda os reutiliza ‐ o request
  // morre em silêncio e o Chrome só percebe ~19s depois (view parecia travada,
  // fallback do Suspense preso). 60s é o valor padrão da comunidade: navegadores
  // reutilizam sockets por até ~60s; acima disso eles abrem conexão nova mesmo.
  server.setTimeout(0);
  server.keepAliveTimeout = 60000;
  server.headersTimeout = 66000;
}

start();

