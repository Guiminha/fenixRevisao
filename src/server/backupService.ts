import crypto from "crypto";
import JSZip from "jszip";
import { dbService, getSupabaseTrustedClient } from "./db.js";
import { getActiveMinioClient, ensureMinioBucketExists, withTimeout } from "./minioService.js";

export const BACKUP_PREFIX = "backups-site/";
export const BANCO_BACKUP_PREFIX = "backups-banco/";
export const SUPORTE_BACKUP_PREFIX = "backup-suporte/";
export const MAX_BACKUPS = 15;
export const MAX_BANCO_BACKUPS = 10;
export const AVISO_SAVE_ANTIGA_MS = 30 * 24 * 60 * 60 * 1000;

// Proteção pré-exclusão: no máximo 1 backup automático por janela de 10 min,
// para excluir conteúdo não encher o histórico de saves.
const PRE_EXCLUSAO_THROTTLE_MS = 10 * 60 * 1000;

// Todas as famílias de backup do bucket. NUNCA são tratadas como mídia do site
// (manifesto, integridade, limpeza de órfãos etc. ignoram estes prefixos).
const BACKUP_PREFIXES = [BACKUP_PREFIX, BANCO_BACKUP_PREFIX, SUPORTE_BACKUP_PREFIX];

const TABELAS = ["novidades", "cursos", "materiais", "tecnologias", "fenix_posts", "leader_bio"] as const;
const CONFIG_KEY_CONEXOES = ["minioConfig", "vimeoConfig"];

let restoreInProgress = false;

export interface BackupResumo {
  config: number;
  novidades: number;
  cursos: number;
  materiais: number;
  tecnologias: number;
  fenixPosts: number;
  contas: number;
  midias: number;
}

export interface BackupListEntry {
  key: string;
  nome: string;
  tamanho: number;
  tamanhoKb: number;
  modificadoEm: string;
  antiga: boolean;
}

export interface BackupMeta {
  success: boolean;
  key: string;
  nome: string;
  url: string;
  tamanhoKb: number;
  resumo: BackupResumo;
  checksum: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function backupTimestamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function sha256(data: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

// Assinatura HMAC das saves: impede que um atacante que tenha acesso ao objeto
// do backup recompute o checksum e altere o conteúdo sem ser detectado. A chave
// fica somente no servidor (env BACKUP_HMAC_SECRET, fallback JWT_SECRET). Em
// produção exige-se ao menos uma delas (nada de secret previsível hardcoded).
let BACKUP_HMAC_SECRET: string;
if (process.env.BACKUP_HMAC_SECRET) {
  BACKUP_HMAC_SECRET = process.env.BACKUP_HMAC_SECRET;
} else if (process.env.JWT_SECRET) {
  BACKUP_HMAC_SECRET = process.env.JWT_SECRET;
} else if (process.env.NODE_ENV === "production") {
  console.error("BACKUP_HMAC_SECRET/JWT_SECRET não definidos. Abortando em produção (backups sem assinatura segura).");
  process.exit(1);
} else {
  BACKUP_HMAC_SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("[Aviso] BACKUP_HMAC_SECRET não definido. Gerado valor aleatório (saves antigas não terão HMAC válido após o boot).");
}

function hmacOf(payload: unknown): string {
  return crypto.createHmac("sha256", BACKUP_HMAC_SECRET).update(JSON.stringify(payload)).digest("hex");
}

// Teto de segurança do restore: uma save com volume absurdo de linhas (backup
// corrompido, restaurado do lugar errado ou adulterado) é recusada ANTES de
// aplicar qualquer mudança. Ajustável via RESTORE_MAX_ROWS.
const RESTORE_MAX_ROWS = Number(process.env.RESTORE_MAX_ROWS) || 10000;
const RESTORE_MAX_CONFIG_KEYS = 500;

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function listBucketObjects(prefix: string, excludeBackups = false): Promise<{ nome: string; tamanho: number; modificadoEm: string }[]> {
  const minioConfig = await dbService.getMinioConfig();
  const bucket = minioConfig.bucket || "armazenamento";
  const client = getActiveMinioClient();
  const items: { nome: string; tamanho: number; modificadoEm: string }[] = [];
  const collect = (async () => {
    const stream = client.listObjectsV2(bucket, prefix, true);
    for await (const obj of stream as AsyncIterable<any>) {
      if (!obj || !obj.name) continue;
      if (excludeBackups && BACKUP_PREFIXES.some((p) => obj.name.startsWith(p))) continue;
      items.push({ nome: obj.name, tamanho: obj.size || 0, modificadoEm: obj.lastModified ? new Date(obj.lastModified).toISOString() : "" });
    }
  })();
  await withTimeout(collect, 90000, "Tempo limite ao listar objetos do MinIO");
  return items;
}

async function collectAuthUsers(): Promise<{ id: string; email: string; criadaEm: string; papel: string }[]> {
  const trusted = getSupabaseTrustedClient();
  const contas: { id: string; email: string; criadaEm: string; papel: string }[] = [];
  if (!trusted) return contas;
  let page = 1;
  for (let guard = 0; guard < 100; guard++) {
    const { data, error } = await trusted.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users || data.users.length === 0) break;
    for (const u of data.users) {
      // Espelha requireAdmin: o papel de admin vive em app_metadata.
      const papel = (u.app_metadata as any)?.role || (u.user_metadata as any)?.role || "";
      contas.push({ id: u.id, email: u.email || "", criadaEm: u.created_at || "", papel });
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return contas;
}

async function collectCoreData(): Promise<{ config: { key: string; value: unknown }[]; tabelas: Record<string, any[]>; contas: { id: string; email: string; criadaEm: string; papel: string }[] }> {
  const trusted = getSupabaseTrustedClient();
  if (!trusted) throw new Error("Supabase indisponível — não é possível criar o backup.");
  const dados: Record<string, any[]> = {};
  for (const tabela of TABELAS) {
    const { data, error } = await trusted.from(tabela).select("*");
    if (error) throw new Error(`Erro ao ler a tabela ${tabela}: ${error.message}`);
    dados[tabela] = (data as any[]) || [];
  }
  const { data: config, error: configErr } = await trusted.from("config").select("*").order("key");
  if (configErr) throw new Error(`Erro ao ler as configurações: ${configErr.message}`);
  const contas = await collectAuthUsers();
  return {
    config: ((config as any[]) || []).map((c) => ({ key: c.key, value: c.value })),
    tabelas: dados,
    contas
  };
}

async function putBackupObject(key: string, buffer: Buffer): Promise<void> {
  const minioConfig = await dbService.getMinioConfig();
  const bucket = minioConfig.bucket || "armazenamento";
  const bucketStatus = await ensureMinioBucketExists(bucket);
  if (!bucketStatus.ready) throw new Error("Bucket do MinIO não está disponível para o backup.");
  const client = getActiveMinioClient();
  await withTimeout(
    client.putObject(bucket, key, buffer, buffer.length, { "Content-Type": "application/json" }),
    60000,
    "Tempo limite ao gravar o backup no MinIO"
  );
}

// Retenção automática: mantém apenas as MAX_BACKUPS saves mais recentes em
// backups-site/ (nunca toca em mídias do site). Executada após cada criação.
async function pruneOldBackups(): Promise<number> {
  try {
    const items = await listBucketObjects(BACKUP_PREFIX, false);
    const jsons = items
      .filter((i) => i.nome.endsWith(".json"))
      .sort((a, b) => (a.modificadoEm < b.modificadoEm ? 1 : a.modificadoEm > b.modificadoEm ? -1 : 0));
    const excedentes = jsons.length - MAX_BACKUPS;
    if (excedentes <= 0) return 0;
    const minioConfig = await dbService.getMinioConfig();
    const bucket = minioConfig.bucket || "armazenamento";
    const client = getActiveMinioClient();
    let removidos = 0;
    for (const item of jsons.slice(MAX_BACKUPS)) {
      await client.removeObject(bucket, item.nome).catch(() => {});
      removidos += 1;
    }
    console.log(`[Backup] Retenção aplicada: ${removidos} save(s) antiga(s) removida(s) (limite ${MAX_BACKUPS}).`);
    return removidos;
  } catch (err: any) {
    console.warn("[Backup] Retenção automática falhou:", err?.message || err);
    return 0;
  }
}

export async function createSiteBackup(opts: { geradoPor: string; userToken?: string; tipo?: "manual" | "pre-restauracao" | "pre-exclusao" }): Promise<BackupMeta> {
  const { geradoPor, userToken, tipo = "manual" } = opts;
  const core = await collectCoreData();
  const checksum = sha256({ config: core.config, tabelas: core.tabelas, contas: core.contas });

  let midias: { nome: string; tamanho: number; modificadoEm: string }[] = [];
  if (tipo !== "pre-restauracao") {
    try {
      midias = await listBucketObjects("", true);
    } catch (err: any) {
      console.warn("[Backup] Manifesto de mídias indisponível:", err?.message || err);
    }
  }

  const snapshot = {
    schemaVersion: 1,
    tipo,
    geradoEm: new Date().toISOString(),
    geradoPor,
    checksum,
    hmac: "",
    resumo: {
      config: core.config.length,
      novidades: core.tabelas.novidades.length,
      cursos: core.tabelas.cursos.length,
      materiais: core.tabelas.materiais.length,
      tecnologias: core.tabelas.tecnologias.length,
      fenixPosts: core.tabelas.fenix_posts.length,
      contas: core.contas.length,
      midias: midias.length
    },
    dados: {
      ...core,
      midias
    }
  };
  snapshot.hmac = hmacOf(snapshot);

  const now = new Date();
  const sufixo = tipo === "pre-restauracao" ? "-pré-restauração" : tipo === "pre-exclusao" ? "-pré-exclusão" : "";
  const nome = `backup-${backupTimestamp(now)}${sufixo}.json`;
  const key = BACKUP_PREFIX + nome;
  const buffer = Buffer.from(JSON.stringify(snapshot), "utf-8");
  await putBackupObject(key, buffer);
  await pruneOldBackups();

  const acao = tipo === "pre-restauracao" ? "BACKUP_PRE_RESTAURACAO" : tipo === "pre-exclusao" ? "BACKUP_PRE_EXCLUSAO" : "BACKUP_CRIADO";
  const midiaNote = tipo === "pre-restauracao" ? " (sem manifesto de mídias — apenas proteção antes da restauração)" : "";
  dbService
    .recordAuditLog(
      geradoPor,
      acao,
      `Backup gerado: ${nome} — ${core.config.length} configs, ${core.tabelas.novidades.length} novidades, ${core.tabelas.cursos.length} cursos, ${core.tabelas.materiais.length} materiais, ${core.tabelas.tecnologias.length} tecnologias, ${core.tabelas.fenix_posts.length} posts, ${core.contas.length} contas${midiaNote}`
    )
    .catch(() => {});

  return {
    success: true,
    key,
    nome,
    url: `/api/minio/stream/${encodeURIComponent(key)}`,
    tamanhoKb: Math.round(buffer.length / 1024),
    resumo: snapshot.resumo,
    checksum
  };
}

export interface BackupListEntry {
  key: string;
  nome: string;
  tamanho: number;
  tamanhoKb: number;
  modificadoEm: string;
  antiga: boolean;
  // Resumo lido do próprio arquivo (configs/cursos/materiais...) — permite
  // ao painel mostrar o conteúdo de cada save e marcar as vazias.
  resumo: BackupResumo | null;
}

// Cache curto (60s) do resumo por arquivo (chave = nome + modificadoEm),
// para a listagem não rebaixar todos os JSONs a cada refresh.
const RESUMO_CACHE_TTL_MS = 60 * 1000;
const resumoCache = new Map<string, { resumo: BackupResumo | null; criadoEm: number }>();

async function backupResumoOf(key: string, modificadoEm: string): Promise<BackupResumo | null> {
  const cacheKey = `${modificadoEm}::${key}`;
  const hit = resumoCache.get(cacheKey);
  if (hit && Date.now() - hit.criadoEm < RESUMO_CACHE_TTL_MS) return hit.resumo;
  try {
    const buffer = await getBackupBuffer(key);
    const snapshot = JSON.parse(buffer.toString("utf-8"));
    const r: BackupResumo = snapshot?.resumo || {};
    resumoCache.set(cacheKey, { resumo: r, criadoEm: Date.now() });
    return r;
  } catch {
    resumoCache.set(cacheKey, { resumo: null, criadoEm: Date.now() });
    return null;
  }
}

export async function listSiteBackups(): Promise<{ success: boolean; backups: BackupListEntry[] }> {
  const items = await listBucketObjects(BACKUP_PREFIX, false);
  const jsons = items.filter((i) => i.nome.endsWith(".json"));
  const backups: BackupListEntry[] = [];
  for (const i of jsons) {
    backups.push({
      key: i.nome,
      nome: i.nome.replace(BACKUP_PREFIX, ""),
      tamanho: i.tamanho,
      tamanhoKb: Math.round(i.tamanho / 1024),
      modificadoEm: i.modificadoEm,
      antiga: i.modificadoEm ? Date.now() - new Date(i.modificadoEm).getTime() > AVISO_SAVE_ANTIGA_MS : false,
      resumo: await backupResumoOf(i.nome, i.modificadoEm)
    });
  }
  backups.sort((a, b) => (a.modificadoEm < b.modificadoEm ? 1 : a.modificadoEm > b.modificadoEm ? -1 : 0));
  return { success: true, backups };
}

async function getBackupBuffer(key: string): Promise<Buffer> {
  const minioConfig = await dbService.getMinioConfig();
  const bucket = minioConfig.bucket || "armazenamento";
  const client = getActiveMinioClient();
  const stream = await withTimeout(client.getObject(bucket, key), 30000, "Tempo limite ao baixar o backup do MinIO");
  return streamToBuffer(stream);
}

function isValidBackupKey(key: string, prefix: string): boolean {
  return (
    typeof key === "string" &&
    key.startsWith(prefix) &&
    key.length <= 500 &&
    !key.includes("..") &&
    !key.includes("\\") &&
    key.endsWith(".json")
  );
}

export function isRestoreInProgress(): boolean {
  return restoreInProgress;
}

// Exclusão DEFINITIVA de uma save (botão no painel). Só aceita backups do site
// (backups-site/*.json) — nunca mídias/outros objetos. Registra em audit_logs.
export async function deleteSiteBackup(key: string, geradoPor: string): Promise<{ success: boolean; nome: string }> {
  if (!isValidBackupKey(key, BACKUP_PREFIX)) {
    throw new Error("Chave de backup inválida.");
  }
  if (restoreInProgress) {
    throw new Error("Uma restauração está em andamento — não é possível excluir backups agora.");
  }
  const minioConfig = await dbService.getMinioConfig();
  const bucket = minioConfig.bucket || "armazenamento";
  const client = getActiveMinioClient();
  await withTimeout(client.statObject(bucket, key), 15000, "Tempo limite ao verificar o backup no MinIO");
  await withTimeout(client.removeObject(bucket, key), 30000, "Tempo limite ao excluir o backup do MinIO");
  const nome = key.replace(BACKUP_PREFIX, "");
  dbService
    .recordAuditLog(geradoPor, "EXCLUIR_BACKUP", `Backup excluído definitivamente: ${nome}`)
    .catch(() => {});
  return { success: true, nome };
}

// Download da save como .zip (Content-Type application/zip + attachment):
// evita o navegador abrir o JSON inline. O ZIP contém o arquivo .json original.
export async function buildBackupZip(key: string): Promise<{ buffer: Buffer; nome: string }> {
  return buildBackupZipFor(BACKUP_PREFIX, key);
}

async function buildBackupZipFor(prefix: string, key: string): Promise<{ buffer: Buffer; nome: string }> {
  if (!isValidBackupKey(key, prefix)) {
    throw new Error("Chave de backup inválida.");
  }
  const buf = await getBackupBuffer(key);
  const nome = key.replace(prefix, "");
  const zip = new JSZip();
  zip.file(nome, buf);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { buffer, nome: `${nome.replace(/\.json$/i, "")}.zip` };
}

// ---------------- DUMP DO BANCO DE DADOS ----------------
// Retrato COMPLETO do banco (configs, todas as tabelas, contas e cópia imutável
// dos audit_logs) gravado em backups-banco/banco-<data>_<hora>.json no MinIO.
// Complementa a save do site: serve para reconstruir/auditar o banco sozinho.

async function pruneBancoBackups(): Promise<number> {
  try {
    const items = await listBucketObjects(BANCO_BACKUP_PREFIX, false);
    const jsons = items
      .filter((i) => i.nome.endsWith(".json"))
      .sort((a, b) => (a.modificadoEm < b.modificadoEm ? 1 : a.modificadoEm > b.modificadoEm ? -1 : 0));
    const excedentes = jsons.length - MAX_BANCO_BACKUPS;
    if (excedentes <= 0) return 0;
    const minioConfig = await dbService.getMinioConfig();
    const bucket = minioConfig.bucket || "armazenamento";
    const client = getActiveMinioClient();
    let removidos = 0;
    for (const item of jsons.slice(MAX_BANCO_BACKUPS)) {
      await client.removeObject(bucket, item.nome).catch(() => {});
      removidos += 1;
    }
    console.log(`[Backup] Retenção do dump aplicada: ${removidos} dump(s) antigo(s) removido(s) (limite ${MAX_BANCO_BACKUPS}).`);
    return removidos;
  } catch (err: any) {
    console.warn("[Backup] Retenção do dump falhou:", err?.message || err);
    return 0;
  }
}

export async function createDatabaseDump(opts: { geradoPor: string; userToken?: string }): Promise<BackupMeta> {
  const { geradoPor } = opts;
  const trusted = getSupabaseTrustedClient();
  if (!trusted) throw new Error("Supabase indisponível — não é possível gerar o dump do banco.");

  const core = await collectCoreData();

  // Cópia imutável do histórico de auditoria (o dump é a única forma de guardar
  // os audit_logs fora do banco; a tabela nunca é alterada).
  let audit: any[] = [];
  try {
    const { data, error } = await trusted.from("audit_logs").select("*").order("timestamp", { ascending: false }).limit(20000);
    if (!error) audit = ((data as any[]) || []).map((r) => r);
  } catch (err: any) {
    console.warn("[Backup] Dump sem audit_logs:", err?.message || err);
  }

  const checksum = sha256({ config: core.config, tabelas: core.tabelas, contas: core.contas, audit });
  const snapshot = {
    schemaVersion: 1,
    tipo: "banco",
    geradoEm: new Date().toISOString(),
    geradoPor,
    checksum,
    hmac: "",
    resumo: {
      config: core.config.length,
      novidades: core.tabelas.novidades.length,
      cursos: core.tabelas.cursos.length,
      materiais: core.tabelas.materiais.length,
      tecnologias: core.tabelas.tecnologias.length,
      fenixPosts: core.tabelas.fenix_posts.length,
      contas: core.contas.length,
      midias: 0,
      auditLogs: audit.length
    },
    dados: {
      ...core,
      auditLogs: audit
    }
  };
  snapshot.hmac = hmacOf(snapshot);

  const nome = `banco-${backupTimestamp(new Date())}.json`;
  const key = BANCO_BACKUP_PREFIX + nome;
  const buffer = Buffer.from(JSON.stringify(snapshot), "utf-8");
  await putBackupObject(key, buffer);
  await pruneBancoBackups();

  dbService
    .recordAuditLog(
      geradoPor,
      "BACKUP_BANCO_CRIADO",
      `Dump do banco gerado: ${nome} — ${core.config.length} configs, ${core.tabelas.cursos.length} cursos, ${core.tabelas.materiais.length} materiais, ${core.tabelas.novidades.length} novidades, ${core.contas.length} contas, ${audit.length} registros de auditoria`
    )
    .catch(() => {});

  return {
    success: true,
    key,
    nome,
    url: `/api/minio/stream/${encodeURIComponent(key)}`,
    tamanhoKb: Math.round(buffer.length / 1024),
    resumo: snapshot.resumo,
    checksum
  };
}

export interface BancoBackupListEntry {
  key: string;
  nome: string;
  tamanho: number;
  tamanhoKb: number;
  modificadoEm: string;
  antiga: boolean;
  resumo: { config?: number; cursos?: number; materiais?: number; novidades?: number; tecnologias?: number; fenixPosts?: number; contas?: number; auditLogs?: number } | null;
}

export async function listBancoBackups(): Promise<{ success: boolean; backups: BancoBackupListEntry[] }> {
  const items = await listBucketObjects(BANCO_BACKUP_PREFIX, false);
  const jsons = items.filter((i) => i.nome.endsWith(".json"));
  const backups: BancoBackupListEntry[] = [];
  for (const i of jsons) {
    let resumo: BancoBackupListEntry["resumo"] = null;
    try {
      const snapshot = JSON.parse((await getBackupBuffer(i.nome)).toString("utf-8"));
      resumo = snapshot?.resumo || null;
    } catch {}
    backups.push({
      key: i.nome,
      nome: i.nome.replace(BANCO_BACKUP_PREFIX, ""),
      tamanho: i.tamanho,
      tamanhoKb: Math.round(i.tamanho / 1024),
      modificadoEm: i.modificadoEm,
      antiga: i.modificadoEm ? Date.now() - new Date(i.modificadoEm).getTime() > AVISO_SAVE_ANTIGA_MS : false,
      resumo
    });
  }
  backups.sort((a, b) => (a.modificadoEm < b.modificadoEm ? 1 : a.modificadoEm > b.modificadoEm ? -1 : 0));
  return { success: true, backups };
}

export async function deleteBancoBackup(key: string, geradoPor: string): Promise<{ success: boolean; nome: string }> {
  if (!isValidBackupKey(key, BANCO_BACKUP_PREFIX)) {
    throw new Error("Chave de dump inválida.");
  }
  if (restoreInProgress) {
    throw new Error("Uma restauração está em andamento — não é possível excluir dumps agora.");
  }
  const minioConfig = await dbService.getMinioConfig();
  const bucket = minioConfig.bucket || "armazenamento";
  const client = getActiveMinioClient();
  await withTimeout(client.statObject(bucket, key), 15000, "Tempo limite ao verificar o dump no MinIO");
  await withTimeout(client.removeObject(bucket, key), 30000, "Tempo limite ao excluir o dump do MinIO");
  const nome = key.replace(BANCO_BACKUP_PREFIX, "");
  dbService.recordAuditLog(geradoPor, "EXCLUIR_BACKUP_BANCO", `Dump do banco excluído definitivamente: ${nome}`).catch(() => {});
  return { success: true, nome };
}

export async function buildBancoBackupZip(key: string): Promise<{ buffer: Buffer; nome: string }> {
  return buildBackupZipFor(BANCO_BACKUP_PREFIX, key);
}

// Download do ZIP do backup do suporte (backup-suporte/*.zip — PDFs com as
// conversas dos chamados). O objeto já é um ZIP: devolve o buffer para a rota
// admin servir como attachment. Validação própria (extensão .zip, não .json)
// + prefixo restrito — nunca é servido pelas rotas públicas de mídia.
export async function buildSuporteBackupZip(key: string): Promise<{ buffer: Buffer; nome: string }> {
  if (
    typeof key !== "string" ||
    !key.startsWith(SUPORTE_BACKUP_PREFIX) ||
    key.length > 500 ||
    key.includes("..") ||
    key.includes("\\") ||
    !key.endsWith(".zip")
  ) {
    throw new Error("Chave de backup de suporte inválida.");
  }
  const buffer = await getBackupBuffer(key);
  return { buffer, nome: key.replace(SUPORTE_BACKUP_PREFIX, "") };
}

// ---------------- PROTEÇÃO PRÉ-EXCLUSÃO (Regra A) ----------------
// Antes de qualquer exclusão de conteúdo pela área administrativa, o sistema
// garante que existe um backup recente do estado atual (máx. 1 por 10 min).

export async function ensureDeleteProtection(opts: { geradoPor: string; userToken?: string }): Promise<{ backupCriado: boolean; backupNome?: string }> {
  try {
    const items = await listBucketObjects(BACKUP_PREFIX, false);
    const pre = items
      .filter((i) => i.nome.includes("-pré-exclusão"))
      .sort((a, b) => (a.modificadoEm < b.modificadoEm ? 1 : a.modificadoEm > b.modificadoEm ? -1 : 0));
    if (pre.length > 0 && Date.now() - new Date(pre[0].modificadoEm).getTime() < PRE_EXCLUSAO_THROTTLE_MS) {
      return { backupCriado: false };
    }
    const backup = await createSiteBackup({ geradoPor: opts.geradoPor, userToken: opts.userToken, tipo: "pre-exclusao" });
    return { backupCriado: true, backupNome: backup.nome };
  } catch (err: any) {
    console.warn("[Backup] Proteção pré-exclusão falhou (a exclusão prossegue sem ela):", err?.message || err);
    return { backupCriado: false };
  }
}

// ---------------- REFERÊNCIAS DE MÍDIA ----------------
// Extrai as chaves de objetos do MinIO citadas em qualquer valor JSON (item de
// tabela, config etc.). URLs do site: /api/minio/stream/<key-encoded> e
// /api/minio/preview/<key-encoded>.

const MEDIA_URL_RE = /\/api\/minio\/(?:stream|preview)\/([^"'\s)\\]+)/g;

function collectMediaKeysInto(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    MEDIA_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MEDIA_URL_RE.exec(value)) !== null) {
      try {
        out.add(decodeURIComponent(m[1]));
      } catch {}
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectMediaKeysInto(v, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectMediaKeysInto(v, out);
  }
}

export function collectMediaKeys(jsonValue: unknown): string[] {
  const out = new Set<string>();
  collectMediaKeysInto(jsonValue, out);
  return Array.from(out);
}

async function allReferencedMediaKeys(): Promise<Set<string>> {
  const core = await collectCoreData();
  const referenciadas = new Set<string>();
  for (const cfg of core.config) collectMediaKeysInto(cfg.value, referenciadas);
  for (const tabela of TABELAS) {
    for (const row of core.tabelas[tabela]) collectMediaKeysInto(row, referenciadas);
  }
  return referenciadas;
}

// Remove do MinIO APENAS as mídias que não são mais citadas em NENHUM lugar do
// site (tabelas + configs). Mídia compartilhada/em uso é mantida. Backups nunca
// são tocados. Audita tudo que foi removido.
export async function removeOrphanMedia(
  chaves: string[],
  geradoPor: string
): Promise<{ removidas: string[]; mantidas: string[] }> {
  const unicas = Array.from(new Set((chaves || []).filter((c) => typeof c === "string" && c)));
  if (unicas.length === 0) return { removidas: [], mantidas: [] };

  const referenciadas = await allReferencedMediaKeys();
  const minioConfig = await dbService.getMinioConfig();
  const bucket = minioConfig.bucket || "armazenamento";
  const client = getActiveMinioClient();

  const removidas: string[] = [];
  const mantidas: string[] = [];
  for (const chave of unicas) {
    if (BACKUP_PREFIXES.some((p) => chave.startsWith(p))) {
      mantidas.push(chave);
      continue;
    }
    if (referenciadas.has(chave)) {
      mantidas.push(chave);
      continue;
    }
    try {
      await withTimeout(client.statObject(bucket, chave), 15000, "Tempo limite ao verificar mídia no MinIO");
    } catch {
      // Já não existe no bucket — nada a excluir.
      mantidas.push(chave);
      continue;
    }
    try {
      await withTimeout(client.removeObject(bucket, chave), 30000, "Tempo limite ao excluir mídia do MinIO");
      removidas.push(chave);
    } catch (err: any) {
      console.warn("[Backup] Falha ao excluir mídia órfã:", chave, err?.message || err);
      mantidas.push(chave);
    }
  }

  if (removidas.length > 0) {
    dbService
      .recordAuditLog(
        geradoPor,
        "EXCLUIR_MIDIA",
        `Mídias sem referência removidas do MinIO (${removidas.length}): ${removidas.join(", ")}${mantidas.length ? ` — mantidas em uso: ${mantidas.length}` : ""}`
      )
      .catch(() => {});
  }
  return { removidas, mantidas };
}

// ---------------- VERIFICADOR DE INTEGRIDADE ----------------
// Confere cada mídia citada no site contra o MinIO (achados = ausentes) e lista
// os objetos do bucket que ninguém cita (órfãos em potencial). Backup de suporte
// nunca entra nas contas.

export async function checkMediaIntegrity(): Promise<{
  success: boolean;
  totalReferenciadas: number;
  presentes: number;
  ausentes: { chave: string; onde: string }[];
  semReferencia: { nome: string; tamanho: number }[];
  totalObjetos: number;
}> {
  const core = await collectCoreData();
  const referenciadas = new Set<string>();
  const ondePorChave = new Map<string, string[]>();
  const registrar = (chave: string, origem: string) => {
    referenciadas.add(chave);
    const lista = ondePorChave.get(chave) || [];
    if (lista.length < 3) lista.push(origem);
    ondePorChave.set(chave, lista);
  };
  for (const cfg of core.config) {
    const local = new Set<string>();
    collectMediaKeysInto(cfg.value, local);
    for (const c of local) registrar(c, `config:${cfg.key}`);
  }
  for (const tabela of TABELAS) {
    for (const row of core.tabelas[tabela]) {
      const local = new Set<string>();
      collectMediaKeysInto(row, local);
      for (const c of local) registrar(c, tabela);
    }
  }

  const minioConfig = await dbService.getMinioConfig();
  const bucket = minioConfig.bucket || "armazenamento";
  const client = getActiveMinioClient();
  const ausentes: { chave: string; onde: string }[] = [];
  let presentes = 0;

  for (const chave of referenciadas) {
    try {
      await withTimeout(client.statObject(bucket, chave), 15000, "Tempo limite ao verificar mídia no MinIO");
      presentes += 1;
    } catch {
      ausentes.push({ chave, onde: (ondePorChave.get(chave) || []).join(", ") || "?" });
    }
  }

  const objetos = await listBucketObjects("", true);
  const semReferencia = objetos.filter((o) => !referenciadas.has(o.nome)).map((o) => ({ nome: o.nome, tamanho: o.tamanho }));

  return {
    success: true,
    totalReferenciadas: referenciadas.size,
    presentes,
    ausentes,
    semReferencia,
    totalObjetos: objetos.length
  };
}

function parseAndValidateSnapshot(buffer: Buffer): any {
  let snapshot: any;
  try {
    snapshot = JSON.parse(buffer.toString("utf-8"));
  } catch {
    throw new Error("O arquivo de backup está corrompido ou não é um JSON válido.");
  }
  if (!snapshot || snapshot.schemaVersion !== 1) {
    throw new Error("Versão de backup não suportada fora do padrão do site. Use um backup gerado por este painel.");
  }
  if (!snapshot.dados || !Array.isArray(snapshot.dados.config) || !snapshot.dados.tabelas) {
    throw new Error("Estrutura do backup inválida. Use um backup gerado por este painel.");
  }

  // 1) Assinatura HMAC (saves novas): recomputada com a chave secreta do servidor.
  if (snapshot.hmac) {
    const recomputed = hmacOf({ ...snapshot, hmac: "" });
    if (recomputed !== snapshot.hmac) {
      throw new Error("Assinatura do backup não confere — o arquivo pode ter sido alterado. Não foi aplicado nada.");
    }
  } else {
    // 2) Saves legadas (sem assinatura): mantém a validação por sha256.
    const esperado = sha256({ config: snapshot.dados.config, tabelas: snapshot.dados.tabelas, contas: snapshot.dados.contas || [] });
    if (!snapshot.checksum || snapshot.checksum !== esperado) {
      throw new Error("Integridade do backup não confere — o arquivo pode ter sido alterado ou corrompido. Não foi aplicado nada.");
    }
  }

  // 3) Teto de volume: recusa restaurações de saves com tamanho fora do real.
  let totalLinhas = 0;
  for (const rows of Object.values(snapshot.dados.tabelas) as any[]) {
    totalLinhas += Array.isArray(rows) ? rows.length : 0;
  }
  if (totalLinhas > RESTORE_MAX_ROWS || snapshot.dados.config.length > RESTORE_MAX_CONFIG_KEYS) {
    throw new Error(
      `A save possui volume incompatível (${totalLinhas} linhas / ${snapshot.dados.config.length} configs, teto ${RESTORE_MAX_ROWS}/${RESTORE_MAX_CONFIG_KEYS}). ` +
      "Nenhuma restauração foi aplicada — verifique se o arquivo/versão está correto."
    );
  }

  return snapshot;
}

async function applyConfigUpserts(configRows: { key: string; value: unknown }[], restaurarConexoes: boolean) {
  const trusted = getSupabaseTrustedClient();
  if (!trusted) throw new Error("Supabase indisponível para a restauração.");
  const aplicadas: string[] = [];
  const ignoradas: string[] = [];
  for (const row of configRows) {
    if (!row || typeof row.key !== "string" || row.value === undefined) continue;
    if (!restaurarConexoes && CONFIG_KEY_CONEXOES.includes(row.key)) {
      ignoradas.push(row.key);
      continue;
    }
    const { error } = await trusted.from("config").upsert({ key: row.key, value: row.value });
    if (error) throw new Error(`Erro ao restaurar a configuração "${row.key}": ${error.message}`);
    aplicadas.push(row.key);
  }
  return { aplicadas, ignoradas };
}

async function applyTableRows(tabela: string, rows: any[], mesclar = false) {
  const trusted = getSupabaseTrustedClient();
  if (!trusted) throw new Error("Supabase indisponível para a restauração.");
  const { data: atuais, error: listErr } = await trusted.from(tabela).select("id");
  if (listErr) throw new Error(`Erro ao consultar a tabela ${tabela}: ${listErr.message}`);
  const idsAtuais: string[] = ((atuais as any[]) || []).map((r) => r.id);
  const idsNovos = new Set((rows || []).map((r) => r?.id).filter(Boolean));

  // 1) Upsert primeiro (o site não fica vazio em momento algum)
  const chunkSize = 200;
  for (let i = 0; i < (rows || []).length; i += chunkSize) {
    const chunk = (rows || []).slice(i, i + chunkSize);
    const { error } = await trusted.from(tabela).upsert(chunk);
    if (error) throw new Error(`Erro ao restaurar dados da tabela ${tabela}: ${error.message}`);
  }

  // 2) Modo EXATO (padrão): remove o que existe agora mas não existia no backup
  //    (retorno exato ao estado da save). Modo MESCLAR: preserva tudo o que foi
  //    criado depois do backup — nenhuma remoção acontece.
  if (!mesclar) {
    const paraRemover = idsAtuais.filter((id) => !idsNovos.has(id));
    if (paraRemover.length > 0) {
      const { error } = await trusted.from(tabela).delete().in("id", paraRemover);
      if (error) throw new Error(`Erro ao limpar itens removidos do backup na tabela ${tabela}: ${error.message}`);
    }
  }
}

async function applyAuthUsers(contas: { id: string; email: string; papel: string }[]) {
  const trusted = getSupabaseTrustedClient();
  if (!trusted) return { criadas: 0 };
  const { data, error } = await trusted.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Erro ao consultar contas atuais: ${error.message}`);
  const emailsExistentes = new Set((data?.users || []).map((u) => (u.email || "").toLowerCase()));
  let criadas = 0;
  for (const conta of contas || []) {
    const email = (conta.email || "").trim().toLowerCase();
    if (!email || emailsExistentes.has(email)) continue;
    const { error: createErr } = await trusted.auth.admin.createUser({
      email,
      email_confirm: true,
      // Papel em AMBOS os metadados: requireAdmin lê de app_metadata, mas o
      // perfil de usuário (user_metadata) também é consultado pelo painel.
      app_metadata: conta.papel ? { role: conta.papel } : {},
      user_metadata: conta.papel ? { role: conta.papel } : {}
    });
    if (createErr) {
      console.warn(`[Backup] Não foi possível recriar a conta ${email}:`, createErr.message);
      continue;
    }
    emailsExistentes.add(email);
    criadas += 1;
  }
  return { criadas };
}

// Contagem leve do conteúdo atual (só ids), para o guarda anti-save-vazia.
async function currentContentCounts(): Promise<{ cursos: number; materiais: number; novidades: number; tecnologias: number; fenixPosts: number }> {
  const trusted = getSupabaseTrustedClient();
  const out = { cursos: 0, materiais: 0, novidades: 0, tecnologias: 0, fenixPosts: 0 };
  if (!trusted) return out;
  for (const t of ["cursos", "materiais", "novidades", "tecnologias", "fenix_posts"] as const) {
    try {
      const { data, error } = await trusted.from(t).select("id");
      if (!error) out[t === "fenix_posts" ? "fenixPosts" : t] = (data as any[])?.length || 0;
    } catch {}
  }
  return out;
}

function conteudoTotalDaSave(tabelas: Record<string, any[]>): number {
  // Só conteúdo de USUÁRIO conta para a guarda — leader_bio/config são estruturais
  // (toda save tem 1 leader_bio; se contassem, a guarda nunca dispararia).
  const conteudo = ["cursos", "materiais", "novidades", "tecnologias", "fenix_posts"] as const;
  return conteudo.reduce((acc, t) => acc + (Array.isArray(tabelas?.[t]) ? tabelas[t].length : 0), 0);
}

export async function restoreSiteBackup(opts: {
  key?: string;
  buffer?: Buffer;
  geradoPor: string;
  userToken?: string;
  restaurarConexoes?: boolean;
  mesclar?: boolean;
  forceVazio?: boolean;
}): Promise<{
  success: boolean;
  mensagem: string;
  backupSeguranca: string;
  resumo: any;
  aplicadas: string[];
  ignoradas: string[];
  contasRecriadas: number;
  modo: "exata" | "mesclada";
  verificacao: { config: number; cursos: number; materiais: number; novidades: number; tecnologias: number; fenixPosts: number };
  integridade: any;
}> {
  const { key, buffer, geradoPor, userToken, restaurarConexoes = true, mesclar = false, forceVazio = false } = opts;
  const buf = buffer || (key ? await getBackupBuffer(key) : null);
  if (!buf) throw new Error("Nenhum backup informado.");

  if (restoreInProgress) {
    throw new Error("Já existe uma restauração em andamento. Aguarde terminar e tente novamente.");
  }
  restoreInProgress = true;
  try {
    const snapshot = parseAndValidateSnapshot(buf);
    const dados = snapshot.dados;

    // GUARDA ANTI-SAVE-VAZIA: restaurar uma save sem conteúdo em modo exata
    // sobrescreve o site atual sem nada — a causa do incidente de hoje.
    const totalSave = conteudoTotalDaSave(dados.tabelas || {});
    const atuais = await currentContentCounts();
    const totalAtual = atuais.cursos + atuais.materiais + atuais.novidades + atuais.tecnologias + atuais.fenixPosts;
    if (totalSave === 0 && totalAtual > 0 && !forceVazio) {
      throw new Error(
        `Esta save está VAZIA (${dados.config.length} configs, 0 cursos, 0 materiais...) e o site atual tem ${totalAtual} itens de conteúdo. ` +
          "Restaurar em modo exato apagaria todo o conteúdo atual. Se for intencional, confirme a opção de força no painel."
      );
    }

    // 1) Proteção automática: backup do ESTADO ATUAL antes de qualquer mudança
    const backupSeguranca = await createSiteBackup({ geradoPor, userToken, tipo: "pre-restauracao" });

    const aplicado: string[] = [];
    try {
      // 2) Configurações
      const { aplicadas, ignoradas } = await applyConfigUpserts(dados.config || [], restaurarConexoes);
      aplicado.push("configs");

      // 3) Tabelas (exata: retorno ao estado da save; mesclada: preserva o que veio depois)
      const tabelasRestauradas: string[] = [];
      for (const tabela of TABELAS) {
        if (dados.tabelas?.[tabela]) {
          await applyTableRows(tabela, dados.tabelas[tabela], mesclar);
          tabelasRestauradas.push(tabela);
        }
        aplicado.push(tabela);
      }

      // 4) Contas de acesso (recria as que não existem mais)
      let contasRecriadas = 0;
      if (Array.isArray(dados.contas)) {
        const res = await applyAuthUsers(dados.contas);
        contasRecriadas = res.criadas;
      }

      const resumo = snapshot.resumo || {};
      const modoTexto = mesclar ? "mesclada (preservou itens criados depois do backup)" : "exata (retorno exato ao estado da save)";

      // 5) Verificação pós-restore: contagens REAIS lidas do banco depois de aplicar
      const verificacao = await currentContentCounts();
      const configVerif = await (async () => {
        const trusted = getSupabaseTrustedClient();
        if (!trusted) return null;
        const { data } = await trusted.from("config").select("key");
        return (data as any[])?.length ?? null;
      })();
      const verificacaoFull = { config: configVerif ?? aplicadas.length, ...verificacao };

      // 5.1) Verificação de integridade das mídias pós-restore (leitura apenas —
      //      nada é alterado; avisa se alguma mídia citada sumiu do MinIO).
      let integridade: any = null;
      try {
        integridade = await checkMediaIntegrity();
      } catch (err: any) {
        console.warn("[Backup] Verificação de integridade pós-restore falhou:", err?.message || err);
      }

      dbService
          .recordAuditLog(
          geradoPor,
          "BACKUP_RESTAURADO",
          `Restauração ${modoTexto} a partir de ${snapshot.geradoEm || key || "arquivo enviado"} — configs: ${aplicadas.length}${ignoradas.length ? `, ignoradas (conexões): ${ignoradas.join(", ")}` : ""}; tabelas: ${tabelasRestauradas.join(", ")}; contas recriadas: ${contasRecriadas}. Verificado após aplicar: ${verificacaoFull.cursos} cursos, ${verificacaoFull.materiais} materiais, ${verificacaoFull.novidades} novidades${integridade ? `; mídias: ${integridade.presentes}/${integridade.totalReferenciadas} presentes${integridade.ausentes?.length ? `, ${integridade.ausentes.length} ausentes` : ""}` : ""}. Backup de segurança do estado anterior: ${backupSeguranca.nome}`
        )
        .catch(() => {});

      return {
        success: true,
        mensagem: `Site restaurado (modo ${mesclar ? "mesclado" : "exato"}): ${aplicadas.length} configs aplicadas, ${verificacaoFull.cursos} cursos, ${verificacaoFull.materiais} materiais, ${verificacaoFull.novidades} novidades verificados após a restauração.`,
        backupSeguranca: backupSeguranca.nome,
        resumo,
        aplicadas,
        ignoradas,
        contasRecriadas,
        modo: mesclar ? "mesclada" : "exata",
        verificacao: verificacaoFull,
        integridade
      };
    } catch (err: any) {
      // Erro parcial transparente: diz o que já foi aplicado antes da falha.
      throw new Error(
        `${err?.message || "Erro ao restaurar."} Já haviam sido aplicados antes da falha: ${aplicado.join(", ") || "nada"}. ` +
          `O estado anterior foi preservado em ${backupSeguranca.nome} (use o painel para restaurá-lo).`
      );
    }
  } finally {
    restoreInProgress = false;
  }
}

// ---------------- MODO MANUTENÇÃO ----------------
// Config key "manutencao" com valor { ativo: boolean, mensagem: string }.

export async function getManutencaoStatus(): Promise<{ ativo: boolean; mensagem: string }> {
  try {
    const trusted = getSupabaseTrustedClient();
    if (!trusted) return { ativo: false, mensagem: "" };
    const { data } = await trusted.from("config").select("value").eq("key", "manutencao").maybeSingle();
    const v = data?.value;
    if (v === true || v === "true") return { ativo: true, mensagem: "" };
    if (v && typeof v === "object") {
      return { ativo: !!(v as any).ativo, mensagem: typeof (v as any).mensagem === "string" ? (v as any).mensagem : "" };
    }
    return { ativo: false, mensagem: "" };
  } catch {
    return { ativo: false, mensagem: "" };
  }
}

export async function setManutencao(ativo: boolean, mensagem: string, geradoPor: string): Promise<{ ativo: boolean; mensagem: string }> {
  const trusted = getSupabaseTrustedClient();
  if (!trusted) throw new Error("Supabase indisponível para o modo manutenção.");
  const value = { ativo: !!ativo, mensagem: (mensagem || "").slice(0, 300) };
  const { error } = await trusted.from("config").upsert({ key: "manutencao", value });
  if (error) throw new Error(`Erro ao salvar o modo manutenção: ${error.message}`);
  dbService
    .recordAuditLog(
      geradoPor,
      ativo ? "MANUTENCAO_ATIVADA" : "MANUTENCAO_DESATIVADA",
      ativo ? `Modo manutenção ATIVADO para o site público${value.mensagem ? ` — mensagem: "${value.mensagem}"` : ""}` : "Modo manutenção DESATIVADO — site público liberado"
    )
    .catch(() => {});
  return value;
}

// ---------------- VERIFICAÇÃO DE ESTADO ATUAL ----------------

export async function getSiteStatus(): Promise<{
  success: boolean;
  config: number;
  novidades: number;
  cursos: number;
  materiais: number;
  tecnologias: number;
  fenixPosts: number;
  contas: number;
  manutencao: { ativo: boolean; mensagem: string };
}> {
  const core = await collectCoreData();
  const manutencao = await getManutencaoStatus();
  return {
    success: true,
    config: core.config.length,
    novidades: core.tabelas.novidades.length,
    cursos: core.tabelas.cursos.length,
    materiais: core.tabelas.materiais.length,
    tecnologias: core.tabelas.tecnologias.length,
    fenixPosts: core.tabelas.fenix_posts.length,
    contas: core.contas.length,
    manutencao
  };
}