import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { defaultData, defaultTecnologias } from "../defaultData";

const DB_FILE = process.env.DB_FILE_PATH || path.join(process.cwd(), "data", "db.json");

export interface LeaderBio {
  nome: string;
  cargo: string;
  bio: string;
  foto: string;
  localizacao: string;
  experiencia: string;
  impacto: string;
  citacao: string;
  historia: string[];
  valores: { id: string; titulo: string; descricao: string; icone: string }[];
  timeline: { id: string; ano: string; titulo: string; descricao: string }[];
}

export interface Novidade {
  id: string;
  titulo: string;
  descricao: string;
  categoria: string;
  imagem: string;
  isPremium: boolean;
  isFeatured: boolean;
  createdAt: string;
  linkType?: "curso" | "material" | "externo" | "nenhum";
  linkTarget?: string;
}

export interface Aula {
  id: string;
  titulo: string;
  duracao: string;
  videoUrl: string;
  tipoVideo?: "vimeo";
  videoId?: string;
  videoHash?: string;
  thumbnail?: string;
}

export interface Modulo {
  id: string;
  titulo: string;
  aulas: Aula[];
}

export interface Curso {
  id: string;
  titulo: string;
  descricao: string;
  categoria: string;
  nivel: string; // 'Iniciante' | 'Intermediário' | 'Avançado'
  imagem: string;
  duracao: string;
  modulos: Modulo[];
  professorNome?: string;
  professorEspecialidade?: string;
  professorBio?: string;
  professorFoto?: string;
  createdAt?: string;
  secao?: "cursos" | "series" | "treinamentos";
}

// Deriva a seção com prioridade ao campo `secao` (coluna nova) e, antes da
// migração do SQL rodar, usa a `categoria` (que o form grava como
// "Cursos"/"Séries"/"Treinamentos") — assim o site funciona sem o ALTER.
function normalizeSecao(c: any): Curso["secao"] {
  if (c.secao === "series" || c.secao === "treinamentos") return c.secao;
  if (c.categoria === "Séries") return "series";
  if (c.categoria === "Treinamentos") return "treinamentos";
  return "cursos";
}

export interface Material {
  id: string;
  titulo: string;
  tipo: "image" | "video" | "pdf";
  categoria: string;
  thumbnail: string;
  fileUrl: string;
  downloads: number;
  isPublic: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  usuario: string;
  acao: string;
  detalhes: string;
  timestamp: string;
}

export interface Banner {
  id: string;
  titulo: string;
  descricao: string;
  imagem: string;
  corTitulo?: string;
  corDescricao?: string;
  botoesAtivos: boolean;
  btn1Texto?: string;
  btn1Tipo?: "pagina" | "curso" | "material" | "externo" | "nenhum";
  btn1Destino?: string;
  btn2Texto?: string;
  btn2Tipo?: "pagina" | "curso" | "material" | "externo" | "nenhum";
  btn2Destino?: string;
  ordem?: number;
  createdAt: string;
}

export interface FenixComment {
  id: string;
  usuarioNome: string;
  texto: string;
  createdAt: string;
}

export interface ModeratorLink {
  id: string;
  moderadorNome: string;
  token: string;
  createdAt: string;
}

export interface FenixPost {
  id: string;
  titulo?: string;
  usuarioNome: string;
  usuarioRole?: string;
  tipoMedia: "photo" | "video";
  mediaUrl: string;
  mediaUrls?: string[];
  legenda: string;
  status: "pendente" | "aprovado" | "recusado";
  likes: number;
  likedBy?: string[];
  comentarios: FenixComment[];
  dataPublicacao?: string;
  createdAt: string;
}

export interface OuvidoriaMessage {
  id: string;
  tipo: "suporte" | "parceria";
  nome: string;
  email: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  pais?: string;
  assunto?: string;
  tipoParceria?: string;
  mensagem: string;
  status: "pendente" | "lida" | "resolvida" | "arquivada";
  ip?: string;
  createdAt: string;
}

export interface OuvidoriaConfig {
  emailSuporte: string;
  emailParcerias: string;
  autoResponderEnabled?: boolean;
  notifySuporteEmail?: boolean;
  notifyParceriaEmail?: boolean;
}

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  consoleUrl: string;
}

export interface Tecnologia {
  id: string;
  titulo: string;
  subtitulo?: string;
  categoria?: string;
  descricao: string;
  destaque?: string;
  imagem: string;
  logoUrl?: string;
  patente?: string;
  ordem?: number;
  createdAt?: string;
}

export interface VimeoConfig {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  autoFetchDetails?: boolean;
}

// As credenciais de integração são resolvidas PRIMEIRO pelas variáveis de
// ambiente (MINIO_* / VIMEO_*), depois pelo config do banco (fallback legado).
// Nunca expor secrets dessas funções via API.
export function minioConfigFromEnv(): MinioConfig | null {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  if (!endpoint || !accessKey || !secretKey) return null;
  return {
    endpoint,
    port: Number(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey,
    secretKey,
    bucket: process.env.MINIO_BUCKET || "armazenamento",
    region: process.env.MINIO_REGION || "us-east-1",
    consoleUrl: process.env.MINIO_CONSOLE_URL || "",
  };
}

export function vimeoConfigFromEnv(): VimeoConfig | null {
  if (!process.env.VIMEO_ACCESS_TOKEN && !process.env.VIMEO_CLIENT_ID) return null;
  return {
    accessToken: process.env.VIMEO_ACCESS_TOKEN || "",
    clientId: process.env.VIMEO_CLIENT_ID || "",
    clientSecret: process.env.VIMEO_CLIENT_SECRET || "",
    autoFetchDetails: true,
  };
}

export interface DICode {
  id: string;
  codigo: string;
  descricao?: string;
  ativo: boolean;
  createdAt: string;
  criadoPor?: string;
}

export type SupportTicketStatus = "aberto" | "em_andamento" | "aguardando_resposta" | "resolvido" | "fechado" | "arquivado";

export interface SupportAnexo {
  id: string;
  nome: string;
  tamanhoKb: number;
  mime: string;
  key: string;
  localPath?: string; // relativo a data/suporte-anexos/ quando storage="local"
  storage: "minio" | "local";
  isImage: boolean;
}

export interface SupportMessage {
  id: string;
  tipo: "di" | "suporte";
  autorNome: string;
  autorRef: string;
  texto: string;
  criadoEm: string;
  anexos?: SupportAnexo[];
}

export interface SupportTicket {
  id: string;
  numero: number;
  assunto: string;
  status: SupportTicketStatus;
  criadoPor: string;
  criadoPorNome: string;
  criadoEm: string;
  atualizadoEm: string;
  fechadoEm?: string;
  fechadoPor?: string;
  mensagens: SupportMessage[];
}

export interface SupportUser {
  email: string;
  nome: string;
  ativo: boolean;
  criadoEm: string;
  // Sinaliza que o responsável ainda precisa definir a própria senha no 1º acesso
  // (ou após uma redefinição feita pelo admin). Definido no cadastro/reset,
  // limpo quando o responsável troca a senha.
  mustChangePassword?: boolean;
}

export type PaginaBlocoTipo = "banner" | "hero_header" | "card_tecnologia" | "texto" | "imagem" | "destaque" | "cta" | "hero_banner" | "lista" | "faq";

export interface PaginaBlocoCampos {
  badge?: string;
  badgeImagem?: string;
  eyebrow?: string;
  titulo?: string;
  tituloDestaque?: string;
  textos?: string[];
  destaqueTitulo?: string;
  destaqueTexto?: string;
  imagem?: string;
  imagemAlt?: string;
  legenda?: string;
  botaoTexto?: string;
  notaTexto?: string;
  icone?: string;
  cor?: string;
  itens?: string[];
  faq?: { q: string; a: string }[];
}

export interface PaginaBloco {
  id: string;
  tipo: PaginaBlocoTipo;
  ativo: boolean;
  ordem: number;
  campos: PaginaBlocoCampos;
}

export interface DBData {
  leaderBio: LeaderBio;
  novidades: Novidade[];
  cursos: Curso[];
  materiais: Material[];
  tecnologias?: Tecnologia[];
  auditLogs: AuditLog[];
  banners?: Banner[];
  fenixPosts?: FenixPost[];
  moderatorLinks?: ModeratorLink[];
  ouvidoriaMessages?: OuvidoriaMessage[];
  ouvidoriaConfig?: OuvidoriaConfig;
  minioConfig?: MinioConfig;
  vimeoConfig?: VimeoConfig;
  categoriasMateriais?: string[];
  logoUrl?: string;
  diCodes?: DICode[];
  supportTickets?: SupportTicket[];
  supportUsers?: SupportUser[];
  hiddenHomeCardIds?: string[];
  deletedCursoIds?: string[];
  deletedNovidadeIds?: string[];
  deletedMaterialIds?: string[];
  deletedBannerIds?: string[];
  paginaTecnologias?: PaginaBloco[];
  paginaElite?: PaginaBloco[];
  paginaBiografia?: PaginaBloco[];
}

// Re-export imported default items for backward compatibility
export { defaultTecnologias, defaultData };

// Map helpers for database column names
function mapNovidadeFromDb(row: any): Novidade {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao,
    categoria: row.categoria,
    imagem: row.imagem,
    isPremium: row.is_premium,
    isFeatured: row.is_featured,
    createdAt: row.created_at,
    linkType: row.link_type,
    linkTarget: row.link_target
  };
}

function mapNovidadeToDb(item: Novidade): any {
  return {
    id: item.id,
    titulo: item.titulo,
    descricao: item.descricao,
    categoria: item.categoria,
    imagem: item.imagem,
    is_premium: item.isPremium,
    is_featured: item.isFeatured,
    created_at: item.createdAt,
    link_type: item.linkType,
    link_target: item.linkTarget
  };
}

function mapMaterialFromDb(row: any): Material {
  return {
    id: row.id,
    titulo: row.titulo,
    tipo: row.tipo,
    categoria: row.categoria,
    thumbnail: row.thumbnail,
    fileUrl: row.file_url,
    downloads: row.downloads,
    isPublic: row.is_public,
    createdAt: row.created_at
  };
}

function mapMaterialToDb(item: Material): any {
  return {
    id: item.id,
    titulo: item.titulo,
    tipo: item.tipo,
    categoria: item.categoria,
    thumbnail: item.thumbnail,
    file_url: item.fileUrl,
    downloads: item.downloads,
    is_public: item.isPublic,
    created_at: item.createdAt
  };
}

// Global Supabase Client Initialization
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const hasSupabase = !!(supabaseUrl && supabaseAnonKey);

// Modo estrito: dados vivem SOMENTE no Supabase.
// - SUPABASE_ONLY=1: nunca grava em data/db.json, nunca faz merge com dados locais,
//   se o Supabase ficar inacessível os endpoints de /api/* respondem 503 (manutenção).
// - SUPABASE_ONLY ausente/0: modo de desenvolvimento com fallback local.
export const SUPABASE_ONLY = process.env.SUPABASE_ONLY === "1";

export let supabase: SupabaseClient | null = null;
if (hasSupabase) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      }
    });
    console.log("[Supabase] Cliente inicializado com URL:", supabaseUrl);
  } catch (err) {
    console.error("[Supabase] Erro ao inicializar cliente:", err);
  }
} else {
  console.log("[Supabase] Chaves não encontradas no ambiente. Rodando no modo Local Fallback.");
}

export function getSupabaseClient(userToken?: string): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  if (userToken) {
    try {
      return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        },
        global: {
          headers: {
            Authorization: `Bearer ${userToken}`
          }
        }
      });
    } catch (e) {
      console.error("[Supabase] Erro ao criar cliente com token do usuário:", e);
    }
  }
  return supabase;
}

/**
 * Cliente para operações AUTENTICADAS PELO SERVIDOR (rotas admin/restritas).
 * O SERVIDOR é quem valida a permissão (requireAdmin/validateDICode), portanto
 * estas operações usam SEMPRE service_role quando a chave existe — nunca o token
 * do usuário (que é sujeito a RLS e pode não ter grant de escrita no banco).
 * Leituras públicas NÃO devem usar este cliente (mantém RLS/anon).
 * NUNCA exportar SERVICE_ROLE_KEY ao client/web.
 */
export function getSupabaseTrustedClient(userToken?: string): SupabaseClient | null {
  if (!supabaseUrl) return null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    try {
      return createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    } catch (e) {
      console.error("[Supabase] Erro ao criar cliente service_role:", e);
    }
  }
  if (userToken) {
    try {
      return createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } catch (e) {
      console.error("[Supabase] Erro ao criar cliente com token do usuário:", e);
    }
  }
  // Deploy mal configurado: sem service_role E sem token de usuário, o "trusted"
  // cairia para anon (RLS bloquearia escritas silenciosamente, dados "sumindo").
  // Falhar alto é melhor que perda silenciosa de dados.
  if (!serviceRoleKey && !userToken) {
    throw new Error("SERVICE_ROLE_KEY ausente no ambiente: o servidor não pode executar operações autenticadas no Supabase. Configure SUPABASE_SERVICE_ROLE_KEY.");
  }
  return null;
}

async function seedSupabaseIfNeeded(client: SupabaseClient, localData: DBData): Promise<boolean> {
  try {
    // Check if leader_bio table is accessible
    const { data, error } = await client.from("leader_bio").select("id").limit(1);
    if (error) {
      const isFetchFailed = error.message && (
        error.message.toLowerCase().includes("fetch") || 
        error.message.toLowerCase().includes("network") ||
        error.message.toLowerCase().includes("failed")
      );
      if (isFetchFailed) {
        console.log("[Supabase] Nao foi possivel conectar ao Supabase devido a erro de conexao/fetch. Usando fallback do banco de dados local.");
      } else {
        console.log("[Supabase] Tabela leader_bio nao acessivel. Certifique-se de executar o schema.sql se desejar usar o Supabase. Detalhes:", error.message);
      }
      return false; 
    }

    // Se estiver vazia, faz o seed de tudo com dados locais
    if (!data || data.length === 0) {
      console.log("[Supabase] Tabelas detectadas, mas vazias. Semeando dados iniciais locais no Supabase...");
      
      // Seed leader_bio
      if (localData.leaderBio) {
        const lb = localData.leaderBio;
        await client.from("leader_bio").upsert({
          id: "main",
          nome: lb.nome,
          cargo: lb.cargo,
          bio: lb.bio,
          foto: lb.foto,
          localizacao: lb.localizacao,
          experiencia: lb.experiencia,
          impacto: lb.impacto,
          citacao: lb.citacao,
          historia: lb.historia,
          valores: lb.valores,
          timeline: lb.timeline
        });
      }

      // Seed novidades
      if (localData.novidades && localData.novidades.length > 0) {
        const rows = localData.novidades.map(mapNovidadeToDb);
        await client.from("novidades").insert(rows);
      }

      // Seed cursos
      if (localData.cursos && localData.cursos.length > 0) {
        const rows = localData.cursos.map(c => ({
          id: c.id,
          titulo: c.titulo,
          descricao: c.descricao,
          categoria: c.categoria,
          nivel: c.nivel,
          imagem: c.imagem,
          duracao: c.duracao,
          modulos: c.modulos
        }));
        await client.from("cursos").insert(rows);
      }

      // Seed materiais
      if (localData.materiais && localData.materiais.length > 0) {
        const rows = localData.materiais.map(mapMaterialToDb);
        await client.from("materiais").insert(rows);
      }

      // Seed auditLogs
      if (localData.auditLogs && localData.auditLogs.length > 0) {
        const rows = localData.auditLogs.map(log => ({
          id: log.id,
          usuario: log.usuario,
          acao: log.acao,
          detalhes: log.detalhes,
          timestamp: log.timestamp
        }));
        await client.from("audit_logs").insert(rows);
      }

      // Seed config
      if (localData.logoUrl) {
        await client.from("config").upsert({ key: "logoUrl", value: localData.logoUrl });
      }
      if (localData.categoriasMateriais) {
        await client.from("config").upsert({ key: "categoriasMateriais", value: localData.categoriasMateriais });
      }
      if (localData.banners && localData.banners.length > 0) {
        await client.from("config").upsert({ key: "banners", value: localData.banners });
      }

      console.log("[Supabase] Seed efetuado com absoluto sucesso!");
    }
    return true;
  } catch (err) {
    console.error("[Supabase] Erro ao verificar ou semear dados:", err);
    return false;
  }
}

class DBService {
  private data: DBData | null = null;
  private supabaseActive: boolean = false;
  private checkPromise: Promise<boolean> | null = null;

  private async ensureInitialized(): Promise<boolean> {
    if (this.checkPromise) return this.checkPromise;

    this.checkPromise = (async () => {
      // 1. Carrega dados locais de qualquer forma para servir de cache/fallback
      this.loadLocal();

      if (!supabase) {
        this.supabaseActive = false;
        return false;
      }

      console.log("[Supabase] Verificando conexão de rede e tabelas...");
      // Em modo estrito (SUPABASE_ONLY=1) a nuvem é a ÚNICA fonte de dados:
      // nunca semear, sincronizar ou alterar o banco a partir de dados locais
      // (o db.json local sequer precisa existir).
      if (SUPABASE_ONLY) {
        this.supabaseActive = true;
        return true;
      }
      const seeded = await seedSupabaseIfNeeded(supabase, this.data!);
      if (seeded) {
        console.log("[Supabase] Supabase ativo e totalmente sincronizado.");
        this.supabaseActive = true;
        return true;
      } else {
        console.warn("[Supabase] Rodando em modo de Fallback Local devido a ausência de tabelas.");
        this.supabaseActive = false;
        return false;
      }
    })();

    return this.checkPromise;
  }

  private loadLocal(): DBData {
    if (this.data) {
      if (!this.data.deletedNovidadeIds) this.data.deletedNovidadeIds = [];
      if (!this.data.deletedCursoIds) this.data.deletedCursoIds = [];
      if (!this.data.deletedMaterialIds) this.data.deletedMaterialIds = [];
      if (!this.data.tecnologias) this.data.tecnologias = [];
      if (!this.data.banners) this.data.banners = [];
      if (!this.data.hiddenHomeCardIds) this.data.hiddenHomeCardIds = [];
      if (!this.data.paginaTecnologias) this.data.paginaTecnologias = [];
      if (!this.data.paginaElite) this.data.paginaElite = [];
      if (!this.data.paginaBiografia) this.data.paginaBiografia = [];
      if (!this.data.diCodes) {
        this.data.diCodes = [
          { id: "di-1", codigo: "DI-654321", descricao: "Acesso Geral Padrão D.I.", ativo: true, createdAt: new Date().toISOString(), criadoPor: "Sistema" }
        ];
      }
      return this.data;
    }
    try {
      // Modo estrito: nunca ler dados de data/db.json (fonte única é o Supabase).
      if (!SUPABASE_ONLY && fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, "utf-8");
        this.data = JSON.parse(fileContent);
        if (!this.data.deletedNovidadeIds) this.data.deletedNovidadeIds = [];
        if (!this.data.deletedCursoIds) this.data.deletedCursoIds = [];
        if (!this.data.deletedMaterialIds) this.data.deletedMaterialIds = [];
        if (!this.data.tecnologias) this.data.tecnologias = [];
        if (!this.data.banners) this.data.banners = [];
        if (!this.data.hiddenHomeCardIds) this.data.hiddenHomeCardIds = [];
        if (!this.data.paginaTecnologias) this.data.paginaTecnologias = [];
if (!this.data.paginaElite) this.data.paginaElite = [];
        if (!this.data.paginaBiografia) this.data.paginaBiografia = [];
        if (!this.data.diCodes) {
          this.data.diCodes = [
            { id: "di-1", codigo: "DI-654321", descricao: "Acesso Geral Padrão D.I.", ativo: true, createdAt: new Date().toISOString(), criadoPor: "Sistema" }
          ];
        }
      } else {
        this.data = { ...defaultData };
        this.data.deletedNovidadeIds = [];
        this.data.deletedCursoIds = [];
        this.data.deletedMaterialIds = [];
        this.data.diCodes = [
          { id: "di-1", codigo: "DI-654321", descricao: "Acesso Geral Padrão D.I.", ativo: true, createdAt: new Date().toISOString(), criadoPor: "Sistema" }
        ];
        this.saveLocal();
      }
    } catch (e) {
      console.error("Erro ao ler db.json local, usando padrões:", e);
      this.data = { ...defaultData };
      this.data.deletedNovidadeIds = [];
      this.data.deletedCursoIds = [];
      this.data.deletedMaterialIds = [];
    }
    return this.data!;
  }

  private saveLocal(): void {
    // Em modo estrito SUPABASE_ONLY os dados só vivem no Supabase — nunca gravar em disco.
    if (SUPABASE_ONLY) return;
    if (!this.data) return;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      console.error("Erro ao salvar db.json local:", e);
    }
  }

  public async getData(userToken?: string, trusted = false): Promise<DBData> {
    const isSupabase = await this.ensureInitialized();
    const client = trusted ? getSupabaseTrustedClient(userToken) : getSupabaseClient(userToken);
    const local = this.loadLocal();

    const deletedCursoIds = new Set(local.deletedCursoIds || []);
    const deletedNovidadeIds = new Set(local.deletedNovidadeIds || []);
    const deletedMaterialIds = new Set(local.deletedMaterialIds || []);

    if (!isSupabase || !client) {
      // Modo estrito: não existe fallback local — a fonte única é o Supabase.
      if (SUPABASE_ONLY) {
        throw new Error("Supabase indisponível (modo SUPABASE_ONLY).");
      }
      return {
        ...local,
        novidades: (local.novidades || []).filter((n) => !deletedNovidadeIds.has(n.id)),
        cursos: (local.cursos || []).filter((c) => !deletedCursoIds.has(c.id)),
        materiais: (local.materiais || []).filter((m) => !deletedMaterialIds.has(m.id)),
        tecnologias: local.tecnologias || [],
        banners: local.banners || [],
        hiddenHomeCardIds: local.hiddenHomeCardIds || []
      };
    }

    try {
      const [
        leaderBioRes,
        novidadesRes,
        cursosRes,
        materiaisRes,
        auditLogsRes,
        configRes
      ] = await Promise.all([
        Promise.resolve(client.from("leader_bio").select("*").eq("id", "main").maybeSingle()).catch(() => ({ data: null, error: null })),
        Promise.resolve(client.from("novidades").select("*").order("created_at", { ascending: false })).catch(() => ({ data: null, error: null })),
        Promise.resolve(client.from("cursos").select("*")).catch(() => ({ data: null, error: null })),
        Promise.resolve(client.from("materiais").select("*")).catch(() => ({ data: null, error: null })),
        Promise.resolve(client.from("audit_logs").select("*").order("timestamp", { ascending: false }).limit(100)).catch(() => ({ data: null, error: null })),
        Promise.resolve(client.from("config").select("*")).catch(() => ({ data: null, error: null }))
      ]);

      const leaderBioData = leaderBioRes?.data;
      const novidadesData = novidadesRes?.data;
      const cursosData = cursosRes?.data;
      const materiaisData = materiaisRes?.data;
      const auditLogsData = auditLogsRes?.data;
      const configData = configRes?.data;

      // Parse config
      let logoUrl: string | undefined = SUPABASE_ONLY ? undefined : local.logoUrl;
      let categoriasMateriais: string[] = local.categoriasMateriais || ["Criativos", "Copys", "Vendas", "Planejamento"];
      let banners: Banner[] = local.banners || defaultData.banners || [];

      if (configData && Array.isArray(configData)) {
        const logoRow = configData.find((c: any) => c.key === "logoUrl");
        if (logoRow && logoRow.value !== null && logoRow.value !== "null") {
          logoUrl = typeof logoRow.value === "string" ? logoRow.value : JSON.stringify(logoRow.value);
        }
        const catsRow = configData.find((c: any) => c.key === "categoriasMateriais");
        if (catsRow && catsRow.value) {
          categoriasMateriais = Array.isArray(catsRow.value) ? catsRow.value : catsRow.value;
        }
        const bannersRow = configData.find((c: any) => c.key === "banners");
        if (bannersRow && bannersRow.value) {
          banners = Array.isArray(bannersRow.value) ? (bannersRow.value as Banner[]) : banners;
        }
        const paginaTecnoRow = configData.find((c: any) => c.key === "paginaTecnologias");
        if (paginaTecnoRow && paginaTecnoRow.value && Array.isArray(paginaTecnoRow.value)) {
          this.data.paginaTecnologias = paginaTecnoRow.value as PaginaBloco[];
        }
        const paginaEliteRow = configData.find((c: any) => c.key === "paginaElite");
        if (paginaEliteRow && paginaEliteRow.value && Array.isArray(paginaEliteRow.value)) {
          this.data.paginaElite = paginaEliteRow.value as PaginaBloco[];
        }
        const paginaBioRow = configData.find((c: any) => c.key === "paginaBiografia");
        if (paginaBioRow && paginaBioRow.value && Array.isArray(paginaBioRow.value)) {
          this.data.paginaBiografia = paginaBioRow.value as PaginaBloco[];
        }
      }

      // Map leader bio
      let leaderBio: LeaderBio = local.leaderBio;
      if (leaderBioData) {
        leaderBio = {
          nome: leaderBioData.nome || leaderBio.nome,
          cargo: leaderBioData.cargo || leaderBio.cargo,
          bio: leaderBioData.bio || leaderBio.bio,
          foto: leaderBioData.foto || leaderBio.foto,
          localizacao: leaderBioData.localizacao || leaderBio.localizacao,
          experiencia: leaderBioData.experiencia || leaderBio.experiencia,
          impacto: leaderBioData.impacto || leaderBio.impacto,
          citacao: leaderBioData.citacao || leaderBio.citacao,
          historia: leaderBioData.historia || leaderBio.historia,
          valores: leaderBioData.valores || leaderBio.valores,
          timeline: leaderBioData.timeline || leaderBio.timeline
        };
      }

      // Merge Cursos
      const cursosMap = new Map<string, Curso>();

      // Index local courses by normalized title for cross-referencing
      const localByTitle = new Map<string, any>();
      (local.cursos || []).forEach((lc: any) => {
        if (!deletedCursoIds.has(lc.id)) {
          const norm = (lc.titulo || "").trim().toLowerCase();
          if (norm) localByTitle.set(norm, lc);
        }
      });

      if (Array.isArray(cursosData)) {
        cursosData.forEach((c: any) => {
          if (!deletedCursoIds.has(c.id)) {
            const normTitle = (c.titulo || "").trim().toLowerCase();
            const lc = localByTitle.get(normTitle) || (local.cursos || []).find((l: any) => l.id === c.id);

            cursosMap.set(c.id, {
              ...c,
              id: c.id,
              titulo: c.titulo,
              descricao: c.descricao,
              categoria: c.categoria,
              nivel: c.nivel,
              imagem: c.imagem || lc?.imagem || "",
              duracao: c.duracao || lc?.duracao || "",
              modulos: (c.modulos && c.modulos.length > 0) ? c.modulos : (lc?.modulos || []),
              professorNome: c.professorNome || c.professor_nome || lc?.professorNome || lc?.professor_nome || "",
              professorEspecialidade: c.professorEspecialidade || c.professor_especialidade || lc?.professorEspecialidade || lc?.professor_especialidade || "",
              professorBio: c.professorBio || c.professor_bio || lc?.professorBio || lc?.professor_bio || "",
              professorFoto: c.professorFoto || c.professor_foto || lc?.professorFoto || lc?.professor_foto || "",
              secao: normalizeSecao(c),
              createdAt: c.created_at || lc?.createdAt || ""
            });
          }
        });
      }

      if (!SUPABASE_ONLY) {
        (local.cursos || []).forEach((lc: any) => {
          if (!deletedCursoIds.has(lc.id)) {
            const normTitle = (lc.titulo || "").trim().toLowerCase();
            let existingKey: string | undefined = undefined;
            for (const [k, v] of cursosMap.entries()) {
              if (k === lc.id || (normTitle && (v.titulo || "").trim().toLowerCase() === normTitle)) {
                existingKey = k;
                break;
              }
            }

            if (existingKey) {
              const existingInDb = cursosMap.get(existingKey)!;
              cursosMap.set(existingKey, {
                ...existingInDb,
                ...lc,
                id: existingInDb.id || lc.id,
                professorNome: lc.professorNome || lc.professor_nome || existingInDb.professorNome || "",
                professorEspecialidade: lc.professorEspecialidade || lc.professor_especialidade || existingInDb.professorEspecialidade || "",
                professorBio: lc.professorBio || lc.professor_bio || existingInDb.professorBio || "",
                professorFoto: lc.professorFoto || lc.professor_foto || existingInDb.professorFoto || ""
              });
            } else {
              cursosMap.set(lc.id, {
                ...lc,
              professorNome: lc.professorNome || lc.professor_nome || "",
              professorEspecialidade: lc.professorEspecialidade || lc.professor_especialidade || "",
              professorBio: lc.professorBio || lc.professor_bio || "",
              professorFoto: lc.professorFoto || lc.professor_foto || ""
            });
          }
        }
        });
      }

      // Deduplicate cursos by title so each course is published only ONCE
      const cursosList = Array.from(cursosMap.values());
      const deduplicatedMap = new Map<string, Curso>();
      for (const c of cursosList) {
        if (deletedCursoIds.has(c.id)) continue;
        const norm = (c.titulo || "").trim().toLowerCase();
        if (!norm) continue;
        if (!deduplicatedMap.has(norm)) {
          deduplicatedMap.set(norm, c);
        } else {
          const existing = deduplicatedMap.get(norm)!;
          deduplicatedMap.set(norm, {
            ...existing,
            ...c,
            professorNome: c.professorNome || existing.professorNome || "",
            professorEspecialidade: c.professorEspecialidade || existing.professorEspecialidade || "",
            professorBio: c.professorBio || existing.professorBio || "",
            professorFoto: c.professorFoto || existing.professorFoto || ""
          });
        }
      }
      const deduplicatedCursos = Array.from(deduplicatedMap.values())
        .filter(c => !deletedCursoIds.has(c.id))
        .map(c => ({
          ...c,
          secao: normalizeSecao(c),
          createdAt: c.createdAt || ""
        }));

      // Merge Novidades: start with DB data, then apply local data (only in fallback mode)
      const novidadesDbMapped = Array.isArray(novidadesData) ? novidadesData.map(mapNovidadeFromDb) : [];
      const novidadesMap = new Map<string, Novidade>();
      novidadesDbMapped.forEach((n: Novidade) => {
        if (!deletedNovidadeIds.has(n.id)) novidadesMap.set(n.id, n);
      });
      if (!SUPABASE_ONLY) {
        (local.novidades || []).forEach((ln) => {
          if (!deletedNovidadeIds.has(ln.id)) novidadesMap.set(ln.id, ln);
        });
      }

      // Merge Materiais: start with DB data, then apply local data
      const materiaisDbMapped = Array.isArray(materiaisData) ? materiaisData.map(mapMaterialFromDb) : [];
      const materiaisMap = new Map<string, Material>();
      materiaisDbMapped.forEach((m: Material) => {
        if (!deletedMaterialIds.has(m.id)) materiaisMap.set(m.id, m);
      });
      if (!SUPABASE_ONLY) {
        (local.materiais || []).forEach((lm) => {
          if (!deletedMaterialIds.has(lm.id)) materiaisMap.set(lm.id, lm);
        });
      }

      const mergedData = {
        ...(SUPABASE_ONLY ? {} : local),
        leaderBio,
        novidades: Array.from(novidadesMap.values()).filter(n => !deletedNovidadeIds.has(n.id)),
        cursos: deduplicatedCursos,
        materiais: Array.from(materiaisMap.values()).filter(m => !deletedMaterialIds.has(m.id)),
        tecnologias: local.tecnologias || [],
        banners,
        hiddenHomeCardIds: local.hiddenHomeCardIds || [],
        deletedNovidadeIds: Array.from(deletedNovidadeIds),
        deletedCursoIds: Array.from(deletedCursoIds),
        deletedMaterialIds: Array.from(deletedMaterialIds),
        auditLogs: Array.isArray(auditLogsData) ? auditLogsData.map(row => ({
          id: row.id,
          usuario: row.usuario,
          acao: row.acao,
          detalhes: row.detalhes,
          timestamp: row.timestamp
        })) : (local.auditLogs || []),
        categoriasMateriais,
        logoUrl,
        paginaTecnologias: this.data.paginaTecnologias || local.paginaTecnologias || [],
        paginaElite: this.data.paginaElite || local.paginaElite || [],
        paginaBiografia: this.data.paginaBiografia || local.paginaBiografia || []
      };

      // Cache the successfully fetched data in memory (never on disk in SUPABASE_ONLY mode)
      this.data = mergedData;
      this.saveLocal();

      return mergedData;
    } catch (err) {
      if (SUPABASE_ONLY) {
        console.error("[Supabase] getData falhou em modo SUPABASE_ONLY (sem fallback local):", err);
        throw err;
      }
      console.error("[Supabase] getData falhou. Retornando dados locais.", err);
      return {
        ...local,
        novidades: (local.novidades || []).filter((n) => !deletedNovidadeIds.has(n.id)),
        cursos: (local.cursos || []).filter((c) => !deletedCursoIds.has(c.id)),
        materiais: (local.materiais || []).filter((m) => !deletedMaterialIds.has(m.id)),
        tecnologias: local.tecnologias || [],
        banners: local.banners || [],
        hiddenHomeCardIds: local.hiddenHomeCardIds || [],
        paginaTecnologias: local.paginaTecnologias || [],
        paginaElite: local.paginaElite || [],
        paginaBiografia: local.paginaBiografia || []
      };
    }
  }

  public async getLeaderBio(userToken?: string): Promise<LeaderBio> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (!isSupabase || !client) {
      return this.loadLocal().leaderBio;
    }
    try {
      const { data, error } = await client.from("leader_bio").select("*").eq("id", "main").maybeSingle();
      if (error || !data) return this.loadLocal().leaderBio;
      return {
        nome: data.nome,
        cargo: data.cargo,
        bio: data.bio,
        foto: data.foto,
        localizacao: data.localizacao,
        experiencia: data.experiencia,
        impacto: data.impacto,
        citacao: data.citacao,
        historia: data.historia,
        valores: data.valores,
        timeline: data.timeline
      };
    } catch {
      return this.loadLocal().leaderBio;
    }
  }

  public async updateLeaderBio(bio: LeaderBio, user: string, userToken?: string): Promise<void> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (!isSupabase || !client) {
      const data = this.loadLocal();
      data.leaderBio = bio;
      this.addLocalAuditLog(user, "ATUALIZACAO_BIO", "Bio do líder atualizada via Painel Admin.");
      this.saveLocal();
      return;
    }

    try {
      await Promise.all([
        client.from("leader_bio").upsert({
          id: "main",
          nome: bio.nome,
          cargo: bio.cargo,
          bio: bio.bio,
          foto: bio.foto,
          localizacao: bio.localizacao,
          experiencia: bio.experiencia,
          impacto: bio.impacto,
          citacao: bio.citacao,
          historia: bio.historia,
          valores: bio.valores,
          timeline: bio.timeline
        }),
        this.addAuditLog(user, "ATUALIZACAO_BIO", "Bio do líder atualizada via Painel Admin.", userToken)
      ]);
    } catch (err) {
      console.error("[Supabase] updateLeaderBio falhou:", err);
    }
  }

  public async getTecnologias(userToken?: string): Promise<Tecnologia[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseClient(userToken);
    if (isSupabase && client) {
      try {
        const { data, error } = await client.from("tecnologias").select("*").order("ordem", { ascending: true });
        if (!error && data && data.length > 0) {
          return data.map((t: any) => ({
            id: t.id,
            titulo: t.titulo,
            subtitulo: t.subtitulo,
            categoria: t.categoria,
            descricao: t.descricao,
            destaque: t.destaque,
            imagem: t.imagem,
            logoUrl: t.logo_url,
            patente: t.patente,
            ordem: t.ordem,
            createdAt: t.created_at
          }));
        }
      } catch (err) {
        console.error("[Supabase] getTecnologias error:", err);
      }
    }
    const data = await this.getData(userToken);
    return data.tecnologias || [];
  }

  public async updateTecnologias(tecnologias: Tecnologia[], user: string, userToken?: string): Promise<void> {
    const data = this.loadLocal();
    data.tecnologias = tecnologias;
    this.addLocalAuditLog(user, "ATUALIZACAO_TECNOLOGIAS", `Página de Tecnologias atualizada (${tecnologias.length} itens).`);
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (isSupabase && client) {
      try {
        const rows = tecnologias.map((t) => ({
          id: t.id,
          titulo: t.titulo,
          subtitulo: t.subtitulo,
          categoria: t.categoria,
          descricao: t.descricao,
          destaque: t.destaque,
          imagem: t.imagem,
          logo_url: t.logoUrl,
          patente: t.patente,
          ordem: t.ordem,
          created_at: t.createdAt || new Date().toISOString()
        }));
        await client.from("tecnologias").upsert(rows);
        await client.from("config").upsert({ key: "tecnologias", value: tecnologias });
      } catch (err) {
        console.error("[Supabase] updateTecnologias error:", err);
      }
    }
  }

  public async getNovidades(userToken?: string): Promise<Novidade[]> {
    const data = await this.getData(userToken);
    return data.novidades;
  }

  public async saveNovidade(novidade: Novidade, user: string, userToken?: string): Promise<void> {
    const data = this.loadLocal();
    if (data.deletedNovidadeIds) {
      data.deletedNovidadeIds = data.deletedNovidadeIds.filter((dId) => dId !== novidade.id);
    }
    const index = data.novidades.findIndex((n) => n.id === novidade.id);
    if (index >= 0) {
      data.novidades[index] = novidade;
      this.addLocalAuditLog(user, "EDITAR_NOVIDADE", `Novidade editada: ${novidade.titulo}`);
    } else {
      data.novidades.unshift(novidade);
      this.addLocalAuditLog(user, "CRIAR_NOVIDADE", `Novidade criada: ${novidade.titulo}`);
    }
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data: existing } = await client.from("novidades").select("id").eq("id", novidade.id).maybeSingle();
        const acao = existing ? "EDITAR_NOVIDADE" : "CRIAR_NOVIDADE";
        const detalhes = existing ? `Novidade editada: ${novidade.titulo}` : `Novidade criada: ${novidade.titulo}`;

        const mappedData = mapNovidadeToDb(novidade);
        const { error: upsertErr } = await client.from("novidades").upsert(mappedData);
        
        if (upsertErr) {
          console.warn("[Supabase] Upsert de novidade com colunas link_type falhou, tentando fallback sem redirecionamentos:", upsertErr);
          const fallbackData = { ...mappedData };
          delete fallbackData.link_type;
          delete fallbackData.link_target;
          const { error: retryErr } = await client.from("novidades").upsert(fallbackData);
          if (retryErr) {
            throw retryErr;
          }
        }

        await this.addAuditLog(user, acao, detalhes, userToken);
      } catch (err) {
        console.error("[Supabase] saveNovidade falhou:", err);
      }
    }
  }

  public async deleteNovidade(id: string, user: string, userToken?: string): Promise<void> {
    const data = this.loadLocal();
    if (!data.deletedNovidadeIds) data.deletedNovidadeIds = [];
    if (!data.deletedNovidadeIds.includes(id)) data.deletedNovidadeIds.push(id);
    const item = data.novidades.find((n) => n.id === id);
    data.novidades = data.novidades.filter((n) => n.id !== id);
    this.addLocalAuditLog(user, "DELETAR_NOVIDADE", item ? `Novidade deletada: ${item.titulo}` : `Novidade deletada: ${id}`);
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        await client.from("novidades").delete().eq("id", id);
        if (item) {
          await this.addAuditLog(user, "DELETAR_NOVIDADE", `Novidade deletada: ${item.titulo}`, userToken);
        }
      } catch (err) {
        console.error("[Supabase] deleteNovidade falhou:", err);
      }
    }
  }

  public async getCursos(userToken?: string): Promise<Curso[]> {
    const data = await this.getData(userToken);
    return data.cursos;
  }

  public async saveCurso(curso: Curso, user: string, userToken?: string): Promise<void> {
    const data = this.loadLocal();
    if (data.deletedCursoIds) {
      data.deletedCursoIds = data.deletedCursoIds.filter((dId) => dId !== curso.id);
    }
    const normTitle = (curso.titulo || "").trim().toLowerCase();
    const index = data.cursos.findIndex(
      (c) => c.id === curso.id || (normTitle.length > 0 && (c.titulo || "").trim().toLowerCase() === normTitle)
    );
    if (index >= 0) {
      curso.id = data.cursos[index].id;
      if (!curso.createdAt) curso.createdAt = data.cursos[index].createdAt || new Date().toISOString();
      data.cursos.splice(index, 1);
      data.cursos.unshift(curso);
      this.addLocalAuditLog(user, "EDITAR_CURSO", `Curso editado: ${curso.titulo}`);
    } else {
      if (!curso.id) curso.id = `c-${Date.now()}`;
      if (!curso.createdAt) curso.createdAt = new Date().toISOString();
      data.cursos.unshift(curso);
      this.addLocalAuditLog(user, "CRIAR_CURSO", `Curso criado: ${curso.titulo}`);
    }
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data: existing } = await client.from("cursos").select("id").eq("id", curso.id).maybeSingle();
        const acao = existing ? "EDITAR_CURSO" : "CRIAR_CURSO";
        const detalhes = existing ? `Curso editado: ${curso.titulo}` : `Curso criado: ${curso.titulo}`;

        let { error: upsertErr } = await client.from("cursos").upsert({
          id: curso.id,
          titulo: curso.titulo,
          descricao: curso.descricao,
          categoria: curso.categoria,
          nivel: curso.nivel,
          imagem: curso.imagem,
          duracao: curso.duracao,
          modulos: curso.modulos,
          professor_nome: curso.professorNome,
          professor_especialidade: curso.professorEspecialidade,
          professor_bio: curso.professorBio,
          professor_foto: curso.professorFoto,
          secao: curso.secao || "cursos",
          created_at: curso.createdAt || new Date().toISOString()
        });

        if (upsertErr && (upsertErr.message?.includes("Could not find") || upsertErr.code === "PGRST204")) {
          const retry = await client.from("cursos").upsert({
            id: curso.id,
            titulo: curso.titulo,
            descricao: curso.descricao,
            categoria: curso.categoria,
            nivel: curso.nivel,
            imagem: curso.imagem,
            duracao: curso.duracao,
            modulos: curso.modulos,
            professor_nome: curso.professorNome,
            professor_especialidade: curso.professorEspecialidade,
            professor_bio: curso.professorBio,
            professor_foto: curso.professorFoto
          });
          upsertErr = retry.error;
        }

        if (upsertErr) {
          if (upsertErr.code === "42501" || upsertErr.message?.includes("permission denied")) {
            // Silently persist locally without cluttering server logs
          } else {
            console.warn("[Supabase] saveCurso upsert:", upsertErr.message || upsertErr);
          }
        } else {
          await this.addAuditLog(user, acao, detalhes, userToken);
        }
      } catch (err) {
        console.error("[Supabase] saveCurso falhou:", err);
      }
    }
  }

  public async deleteCurso(id: string, user: string, userToken?: string): Promise<void> {
    const data = this.loadLocal();
    if (!data.deletedCursoIds) data.deletedCursoIds = [];
    if (!data.deletedCursoIds.includes(id)) data.deletedCursoIds.push(id);
    const item = data.cursos.find((c) => c.id === id);
    data.cursos = data.cursos.filter((c) => c.id !== id);
    this.addLocalAuditLog(user, "DELETAR_CURSO", item ? `Curso deletado: ${item.titulo}` : `Curso deletado: ${id}`);
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        await client.from("cursos").delete().eq("id", id);
        if (item) {
          await this.addAuditLog(user, "DELETAR_CURSO", `Curso deletado: ${item.titulo}`, userToken);
        }
      } catch (err) {
        console.error("[Supabase] deleteCurso falhou:", err);
      }
    }
  }

  public async getMateriais(userToken?: string): Promise<Material[]> {
    const data = await this.getData(userToken);
    return data.materiais;
  }

  public async getMaterialById(id: string, userToken?: string): Promise<Material | null> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (isSupabase && client) {
      try {
        const { data: row } = await client.from("materiais").select("*").eq("id", id).maybeSingle();
        return row ? mapMaterialFromDb(row) : null;
      } catch (err) {
        console.error("[Supabase] getMaterialById falhou:", err);
      }
    }
    const data = this.loadLocal();
    return data.materiais.find((m) => m.id === id) || null;
  }

  public async saveMaterial(material: Material, user: string, userToken?: string): Promise<void> {
    const data = this.loadLocal();
    if (data.deletedMaterialIds) {
      data.deletedMaterialIds = data.deletedMaterialIds.filter((dId) => dId !== material.id);
    }
    const index = data.materiais.findIndex((m) => m.id === material.id);
    if (index >= 0) {
      if (!material.createdAt) material.createdAt = data.materiais[index].createdAt || new Date().toISOString();
      data.materiais.splice(index, 1);
      data.materiais.unshift(material);
      this.addLocalAuditLog(user, "EDITAR_MATERIAL", `Material editado: ${material.titulo}`);
    } else {
      if (!material.createdAt) material.createdAt = new Date().toISOString();
      data.materiais.unshift(material);
      this.addLocalAuditLog(user, "CRIAR_MATERIAL", `Material criado: ${material.titulo}`);
    }
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data: existing } = await client.from("materiais").select("id").eq("id", material.id).maybeSingle();
        const acao = existing ? "EDITAR_MATERIAL" : "CRIAR_MATERIAL";
        const detalhes = existing ? `Material editado: ${material.titulo}` : `Material criado: ${material.titulo}`;

        await Promise.all([
          client.from("materiais").upsert(mapMaterialToDb(material)),
          this.addAuditLog(user, acao, detalhes, userToken)
        ]);
      } catch (err) {
        console.error("[Supabase] saveMaterial falhou:", err);
      }
    }
  }

  public async deleteMaterial(id: string, user: string, userToken?: string): Promise<void> {
    const data = this.loadLocal();
    if (!data.deletedMaterialIds) data.deletedMaterialIds = [];
    if (!data.deletedMaterialIds.includes(id)) data.deletedMaterialIds.push(id);
    const item = data.materiais.find((m) => m.id === id);
    data.materiais = data.materiais.filter((m) => m.id !== id);
    this.addLocalAuditLog(user, "DELETAR_MATERIAL", item ? `Material deletado: ${item.titulo}` : `Material deletado: ${id}`);
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        await client.from("materiais").delete().eq("id", id);
        if (item) {
          await this.addAuditLog(user, "DELETAR_MATERIAL", `Material deletado: ${item.titulo}`, userToken);
        }
      } catch (err) {
        console.error("[Supabase] deleteMaterial falhou:", err);
      }
    }
  }

  public async recordDownload(id: string, userToken?: string): Promise<void> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (!isSupabase || !client) {
      const data = this.loadLocal();
      const material = data.materiais.find((m) => m.id === id);
      if (material) {
        material.downloads += 1;
        this.addLocalAuditLog("anonymous", "DOWNLOAD_MATERIAL", `Download efetuado: ${material.titulo}`);
        this.saveLocal();
      }
      return;
    }

    try {
      const { data: material } = await client.from("materiais").select("titulo, downloads").eq("id", id).maybeSingle();
      if (material) {
        await Promise.all([
          client.from("materiais").update({ downloads: (material.downloads || 0) + 1 }).eq("id", id),
          this.addAuditLog("anonymous", "DOWNLOAD_MATERIAL", `Download efetuado: ${material.titulo}`, userToken)
        ]);
      }
    } catch (err) {
      console.error("[Supabase] recordDownload falhou:", err);
    }
  }

  public async getAuditLogs(userToken?: string): Promise<AuditLog[]> {
    const data = await this.getData(userToken);
    return data.auditLogs;
  }

  public async getLogoUrl(userToken?: string): Promise<string | undefined> {
    const data = await this.getData(userToken);
    return data.logoUrl;
  }

  public async updateLogoUrl(logoUrl: string | undefined, user: string, userToken?: string): Promise<void> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (!isSupabase || !client) {
      const data = this.loadLocal();
      data.logoUrl = logoUrl;
      this.addLocalAuditLog(user, "ATUALIZACAO_LOGO", "Logo do site atualizada via Painel Admin.");
      this.saveLocal();
      return;
    }

    try {
      await Promise.all([
        client.from("config").upsert({ key: "logoUrl", value: logoUrl ? logoUrl : "null" }),
        this.addAuditLog(user, "ATUALIZACAO_LOGO", "Logo do site atualizada via Painel Admin.", userToken)
      ]);
    } catch (err) {
      console.error("[Supabase] updateLogoUrl falhou:", err);
    }
  }

  public async getCategoriasMateriais(userToken?: string, trusted = false): Promise<string[]> {
    const data = await this.getData(userToken, trusted);
    return data.categoriasMateriais || ["Criativos", "Copys", "Vendas", "Planejamento"];
  }

  public async saveCategoriasMateriais(categorias: string[], user: string, userToken?: string): Promise<void> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (!isSupabase || !client) {
      const data = this.loadLocal();
      data.categoriasMateriais = categorias;
      this.addLocalAuditLog(user, "SALVAR_CATEGORIAS_MATERIAIS", `Categorias de materiais atualizadas.`);
      this.saveLocal();
      return;
    }

    try {
      await Promise.all([
        client.from("config").upsert({ key: "categoriasMateriais", value: categorias }),
        this.addAuditLog(user, "SALVAR_CATEGORIAS_MATERIAIS", "Categorias de materiais atualizadas.", userToken)
      ]);
    } catch (err) {
      console.error("[Supabase] saveCategoriasMateriais falhou:", err);
    }
  }

  private async addAuditLog(usuario: string, acao: string, detalhes: string, userToken?: string): Promise<void> {
    const client = getSupabaseTrustedClient(userToken);
    if (!client) return;
    try {
      const log = {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        usuario,
        acao,
        detalhes,
        timestamp: new Date().toISOString()
      };
      await client.from("audit_logs").insert(log);
    } catch (err) {
      console.error("[Supabase] Falha ao registrar log de auditoria:", err);
    }
  }

  public async recordAuditLog(usuario: string, acao: string, detalhes: string, userToken?: string): Promise<void> {
    this.addLocalAuditLog(usuario, acao, detalhes);
    this.saveLocal();
    const isSupabase = await this.ensureInitialized();
    if (isSupabase) {
      await this.addAuditLog(usuario, acao, detalhes, userToken);
    }
  }

  public async getDICodes(userToken?: string): Promise<DICode[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (!isSupabase || !client) {
      const data = this.loadLocal();
      if (!data.diCodes) {
        this.loadLocal();
      }
      return data.diCodes || [];
    }
    try {
      const { data: config } = await client.from("config").select("value").eq("key", "diCodes").maybeSingle();
      if (config && config.value && Array.isArray(config.value)) {
        return config.value as DICode[];
      }
      const data = this.loadLocal();
      return data.diCodes || [];
    } catch (err) {
      console.error("[Supabase] getDICodes error:", err);
      const data = this.loadLocal();
      return data.diCodes || [];
    }
  }

  public async saveDICode(newDI: { codigo: string; descricao?: string; ativo?: boolean }, user: string, userToken?: string): Promise<{ success: boolean; diCode?: DICode; error?: string }> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    
    let currentCodes = await this.getDICodes(userToken);

    const rawCode = newDI.codigo.trim().toUpperCase();
    const formattedCode = rawCode.startsWith("DI-") ? rawCode : `DI-${rawCode}`;

    // Check duplicate
    const exists = currentCodes.some(d => d.codigo.toUpperCase() === formattedCode || d.codigo.toUpperCase() === rawCode);
    if (exists) {
      return { success: false, error: `O Código D.I. "${formattedCode}" já está cadastrado.` };
    }

    const diItem: DICode = {
      id: `di-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      codigo: formattedCode,
      descricao: newDI.descricao?.trim() || "Código de Acesso à Área Restrita",
      ativo: newDI.ativo !== undefined ? newDI.ativo : true,
      createdAt: new Date().toISOString(),
      criadoPor: user
    };

    currentCodes.unshift(diItem);
    
    if (isSupabase && client) {
      const { error: upErr } = await client.from("config").upsert({ key: "diCodes", value: currentCodes });
      if (upErr) {
        console.error("[Supabase] saveDICode upsert error:", upErr.message);
        return { success: false, error: `Não foi possível salvar no banco de dados: ${upErr.message}` };
      }
      await this.addAuditLog(user, "CADASTRO_CODIGO_DI", `Novo Código D.I. cadastrado: ${formattedCode}`, userToken);
    }

    const data = this.loadLocal();
    data.diCodes = currentCodes;
    this.addLocalAuditLog(user, "CADASTRO_CODIGO_DI", `Novo Código D.I. cadastrado com segurança: ${formattedCode}`);
    this.saveLocal();

    return { success: true, diCode: diItem };
  }

  public async toggleDICodeStatus(id: string, user: string, userToken?: string): Promise<{ success: boolean; error?: string }> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    
    let currentCodes = await this.getDICodes(userToken);

    const index = currentCodes.findIndex(d => d.id === id);
    if (index === -1) {
      return { success: false, error: "Código D.I. não encontrado." };
    }

    currentCodes[index].ativo = !currentCodes[index].ativo;
    const statusStr = currentCodes[index].ativo ? "Ativado" : "Desativado";
    
    if (isSupabase && client) {
      const { error: upErr } = await client.from("config").upsert({ key: "diCodes", value: currentCodes });
      if (upErr) {
        console.error("[Supabase] toggleDICodeStatus upsert error:", upErr.message);
        return { success: false, error: `Não foi possível alterar no banco de dados: ${upErr.message}` };
      }
      await this.addAuditLog(user, "ALTERAR_STATUS_DI", `Código D.I. ${currentCodes[index].codigo} ${statusStr}`, userToken);
    }
    
    const data = this.loadLocal();
    data.diCodes = currentCodes;
    this.addLocalAuditLog(user, "ALTERAR_STATUS_DI", `Código D.I. ${currentCodes[index].codigo} alterado para: ${statusStr}`);
    this.saveLocal();

    return { success: true };
  }

  public async deleteDICode(id: string, user: string, userToken?: string): Promise<{ success: boolean; error?: string }> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    
    let currentCodes = await this.getDICodes(userToken);

    const diToDelete = currentCodes.find(d => d.id === id);
    if (!diToDelete) {
      return { success: false, error: "Código D.I. não encontrado." };
    }

    currentCodes = currentCodes.filter(d => d.id !== id);

    if (isSupabase && client) {
      const { error: upErr } = await client.from("config").upsert({ key: "diCodes", value: currentCodes });
      if (upErr) {
        console.error("[Supabase] deleteDICode upsert error:", upErr.message);
        return { success: false, error: `Não foi possível excluir no banco de dados: ${upErr.message}` };
      }
      await this.addAuditLog(user, "EXCLUIR_CODIGO_DI", `Código D.I. removido: ${diToDelete.codigo}`, userToken);
    }
    
    const data = this.loadLocal();
    data.diCodes = currentCodes;
    this.addLocalAuditLog(user, "EXCLUIR_CODIGO_DI", `Código D.I. removido: ${diToDelete.codigo}`);
    this.saveLocal();

    return { success: true };
  }

  public async importDIsBatch(
    rows: { nome: string; codigo: string; line: number }[],
    user: string,
    userToken?: string
  ): Promise<{ success: boolean; imported: number; duplicates: number; errors: { line: number; motivo: string }[] }> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);

    const currentCodes = await this.getDICodes(userToken);
    const existing = new Set<string>(currentCodes.map(d => d.codigo.toUpperCase()));
    const seenInFile = new Set<string>();

    const newItems: DICode[] = [];
    const errorList: { line: number; motivo: string }[] = [];
    let duplicateCount = 0;

    for (const row of rows) {
      const rawCode = (row.codigo || "").trim().toUpperCase();
      if (!rawCode) {
        errorList.push({ line: row.line, motivo: "Código D.I. vazio." });
        continue;
      }
      const formattedCode = rawCode.startsWith("DI-") ? rawCode : `DI-${rawCode}`;
      if (existing.has(formattedCode) || seenInFile.has(formattedCode)) {
        duplicateCount++;
        continue;
      }
      seenInFile.add(formattedCode);
      const nome = (row.nome || "").trim();
      newItems.push({
        id: `di-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        codigo: formattedCode,
        descricao: nome || "Código de Acesso à Área Restrita",
        ativo: true,
        createdAt: new Date().toISOString(),
        criadoPor: user
      });
    }

    if (newItems.length > 0) {
      const updatedCodes = [...newItems, ...currentCodes];
      if (isSupabase && client) {
        const { error: upErr } = await client.from("config").upsert({ key: "diCodes", value: updatedCodes });
        if (upErr) {
          console.error("[Supabase] importDIsBatch upsert error:", upErr.message);
          return { success: false, imported: 0, duplicates: 0, errors: [{ line: 0, motivo: `Não foi possível salvar no banco de dados: ${upErr.message}` }] };
        }
        await this.addAuditLog(user, "CADASTRO_LOTE_DI", `Importação em lote: ${newItems.length} código(s) D.I. cadastrado(s).`, userToken);
      }
      const data = this.loadLocal();
      data.diCodes = updatedCodes;
      this.addLocalAuditLog(user, "CADASTRO_LOTE_DI", `Importação em lote: ${newItems.length} código(s) D.I. cadastrado(s).`);
      this.saveLocal();
    }

    return { success: true, imported: newItems.length, duplicates: duplicateCount, errors: errorList };
  }

  public async validateDICode(code: string): Promise<{ valid: boolean; role?: string; userCode?: string; name?: string; message?: string }> {
    const raw = code.trim();
    const formattedInput = raw.toUpperCase();
    const formattedWithPrefix = formattedInput.startsWith("DI-") ? formattedInput : `DI-${formattedInput}`;

    const registeredList = await this.getDICodes();
    
    // Find matching active D.I. code in database
    const found = registeredList.find(d => 
      (d.codigo.toUpperCase() === formattedInput || d.codigo.toUpperCase() === formattedWithPrefix || d.codigo.replace("DI-", "") === formattedInput)
    );

    if (found) {
      if (!found.ativo) {
        console.warn(`[D.I.] Código ${found.codigo} existe mas está desativado (resposta uniforme por anti-enumeração).`);
        return { valid: false, message: "Código D. I. não encontrado. Verifique o seu código." };
      }
      const isAdmin = found.codigo.toUpperCase().startsWith("DI-ADMIN-");
      return { valid: true, role: isAdmin ? "admin" : "user", userCode: found.codigo, name: found.descricao || found.codigo };
    }

    return { valid: false, message: "Código D. I. não encontrado. Verifique o seu código." };
  }

  private addLocalAuditLog(usuario: string, acao: string, detalhes: string): void {
    const data = this.loadLocal();
    const log: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      usuario,
      acao,
      detalhes,
      timestamp: new Date().toISOString()
    };
    data.auditLogs.unshift(log);
    if (data.auditLogs.length > 100) {
      data.auditLogs = data.auditLogs.slice(0, 100);
    }
  }

  // ---------------- SUPORTE POR TICKETS (append-only, histórico imutável) ----------------

  private async persistSupportTickets(tickets: SupportTicket[], user: string, acao: string, detalhes: string, userToken?: string): Promise<{ success: boolean; error?: string }> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (isSupabase && client) {
      const { error: upErr } = await client.from("config").upsert({ key: "supportTickets", value: tickets });
      if (upErr) {
        console.error("[Supabase] supportTickets upsert error:", upErr.message);
        return { success: false, error: `Não foi possível salvar no banco de dados: ${upErr.message}` };
      }
      await this.addAuditLog(user, acao, detalhes, userToken);
    }
    const data = this.loadLocal();
    data.supportTickets = tickets;
    this.addLocalAuditLog(user, acao, detalhes);
    this.saveLocal();
    return { success: true };
  }

  public async getSupportTickets(userToken?: string): Promise<SupportTicket[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (isSupabase && client) {
      try {
        const { data: config } = await client.from("config").select("value").eq("key", "supportTickets").maybeSingle();
        if (config && Array.isArray(config.value)) {
          return (config.value as SupportTicket[]).sort((a, b) => b.numero - a.numero);
        }
      } catch (err) {
        console.error("[Supabase] getSupportTickets error:", err);
      }
    }
    const data = this.loadLocal();
    return (data.supportTickets || []).sort((a, b) => b.numero - a.numero);
  }

  public async getSupportTicket(id: string, userToken?: string): Promise<SupportTicket | null> {
    const tickets = await this.getSupportTickets(userToken);
    return tickets.find(t => t.id === id) || null;
  }

  public async createSupportTicket(
    data: { assunto: string; texto: string; anexos?: SupportAnexo[] },
    requester: { code: string; name: string },
    userToken?: string
  ): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
    const current = await this.getSupportTickets(userToken);
    const nextNumero = current.reduce((max, t) => Math.max(max, t.numero || 0), 0) + 1;
    const now = new Date().toISOString();
    const ticket: SupportTicket = {
      id: `st-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      numero: nextNumero,
      assunto: data.assunto.trim(),
      status: "aberto",
      criadoPor: requester.code,
      criadoPorNome: requester.name || requester.code,
      criadoEm: now,
      atualizadoEm: now,
      mensagens: [
        {
          id: `sm-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          tipo: "di",
          autorNome: requester.name || requester.code,
          autorRef: requester.code,
          texto: data.texto.trim(),
          criadoEm: now,
          anexos: data.anexos && data.anexos.length > 0 ? data.anexos : undefined
        }
      ]
    };
    const updated = [...current, ticket];
    const persist = await this.persistSupportTickets(updated, requester.code, "SUPORTE_TICKET_ABERTO", `Ticket de suporte #${String(ticket.numero).padStart(4, "0")} aberto por ${requester.name || requester.code}: ${ticket.assunto}`, userToken);
    if (!persist.success) return { success: false, error: persist.error };
    return { success: true, ticket };
  }

  public async addSupportMessage(
    ticketId: string,
    data: { tipo: "di" | "suporte"; autorNome: string; autorRef: string; texto: string; anexos?: SupportAnexo[] },
    userToken?: string
  ): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
    const current = await this.getSupportTickets(userToken);
    const index = current.findIndex(t => t.id === ticketId);
    if (index === -1) return { success: false, error: "Chamado não encontrado." };
    const ticket = current[index];
    if (ticket.status === "fechado" || ticket.status === "resolvido" || ticket.status === "arquivado") {
      return { success: false, error: "Este chamado está encerrado. Apenas reabrir para adicionar mensagem." };
    }
    if (!data.texto?.trim() && (!data.anexos || data.anexos.length === 0)) {
      return { success: false, error: "Escreva a mensagem ou anexe um arquivo." };
    }

    const now = new Date().toISOString();
    let smId = `sm-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    while (ticket.mensagens.some(m => m.id === smId)) {
      smId = `sm-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    }
    if (data.anexos) {
      const aIds = new Set(ticket.mensagens.flatMap(m => (m.anexos || []).map(a => a.id)));
      data.anexos.forEach(a => {
        while (aIds.has(a.id)) a.id = `${a.id}-${Math.random().toString(36).substr(2, 4)}`;
        aIds.add(a.id);
      });
    }
    ticket.mensagens.push({
      id: smId,
      tipo: data.tipo,
      autorNome: data.autorNome,
      autorRef: data.autorRef,
      texto: data.texto.trim(),
      criadoEm: now,
      anexos: data.anexos && data.anexos.length > 0 ? data.anexos : undefined
    });
    ticket.atualizadoEm = now;
    if (data.tipo === "di" && ticket.status === "aguardando_resposta") {
      ticket.status = "aberto";
    } else if (data.tipo === "suporte" && (ticket.status === "aberto" || ticket.status === "em_andamento" || ticket.status === "aguardando_resposta")) {
      ticket.status = "aguardando_resposta";
    }
    current[index] = ticket;

    const persist = await this.persistSupportTickets(current, data.autorRef, "SUPORTE_MENSAGEM", `Nova mensagem no chamado #${String(ticket.numero).padStart(4, "0")} (${data.tipo}): ${(data.texto.trim() || "Anexos").slice(0, 120)}`, userToken);
    if (!persist.success) return { success: false, error: persist.error };
    return { success: true, ticket };
  }

  public async setSupportTicketStatus(
    ticketId: string,
    status: SupportTicketStatus,
    by: { ref: string; name: string; tipo: "suporte" | "di" },
    userToken?: string
  ): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
    const current = await this.getSupportTickets(userToken);
    const index = current.findIndex(t => t.id === ticketId);
    if (index === -1) return { success: false, error: "Chamado não encontrado." };
    const ticket = current[index];

    if (by.tipo === "di") {
      if (ticket.criadoPor !== by.ref) return { success: false, error: "Este chamado não pertence a você." };
      const terminal = ticket.status === "fechado" || ticket.status === "resolvido" || ticket.status === "arquivado";
      if (status === "aberto") {
        if (!terminal) return { success: false, error: "Este chamado ainda não foi encerrado ou arquivado." };
      } else if (status === "fechado" || status === "arquivado") {
        if (terminal) return { success: false, error: "Este chamado já foi encerrado ou arquivado." };
      } else {
        return { success: false, error: "O solicitante só pode encerrar, arquivar ou reabrir o próprio chamado." };
      }
    }

    ticket.status = status;
    if (status === "fechado") {
      ticket.fechadoEm = new Date().toISOString();
      ticket.fechadoPor = by.name || by.ref;
    } else {
      ticket.fechadoEm = undefined;
      ticket.fechadoPor = undefined;
    }
    ticket.atualizadoEm = new Date().toISOString();
    current[index] = ticket;

    const persist = await this.persistSupportTickets(current, by.ref, "SUPORTE_STATUS", `Chamado #${String(ticket.numero).padStart(4, "0")} alterado para "${status}" por ${by.name || by.ref}`, userToken);
    if (!persist.success) return { success: false, error: persist.error };
    return { success: true, ticket };
  }

  public async getSupportUsers(userToken?: string): Promise<SupportUser[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (isSupabase && client) {
      try {
        const { data: config } = await client.from("config").select("value").eq("key", "supportUsers").maybeSingle();
        if (config && Array.isArray(config.value)) return config.value as SupportUser[];
      } catch (err) {
        console.error("[Supabase] getSupportUsers error:", err);
      }
    }
    const data = this.loadLocal();
    return data.supportUsers || [];
  }

  public async saveSupportUser(
    user: { email: string; nome: string; ativo: boolean; mustChangePassword?: boolean },
    actor: string,
    userToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    const current = await this.getSupportUsers(userToken);
    const email = user.email.trim().toLowerCase();
    const index = current.findIndex(u => u.email.toLowerCase() === email);
    // Cadastro novo: flag vem da rota (default sem exigência). Edição: preserva a
    // flag existente quando a rota não mandar valor explícito (não re-força troca).
    const mustChange = index === -1
      ? (user.mustChangePassword ?? false)
      : (user.mustChangePassword !== undefined ? user.mustChangePassword : current[index].mustChangePassword);
    const entry: SupportUser = {
      email,
      nome: user.nome.trim(),
      ativo: user.ativo,
      criadoEm: index === -1 ? new Date().toISOString() : current[index].criadoEm,
      mustChangePassword: mustChange
    };
    if (index === -1) current.push(entry);
    else current[index] = entry;

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (isSupabase && client) {
      const { error: upErr } = await client.from("config").upsert({ key: "supportUsers", value: current });
      if (upErr) {
        console.error("[Supabase] supportUsers upsert error:", upErr.message);
        return { success: false, error: `Não foi possível salvar no banco de dados: ${upErr.message}` };
      }
      await this.addAuditLog(actor, "SUPORTE_USUARIO", `Usuário de suporte ${entry.ativo ? "cadastrado" : "desativado"}: ${email} (${entry.nome})`, userToken);
    }
    const data = this.loadLocal();
    data.supportUsers = current;
    this.addLocalAuditLog(actor, "SUPORTE_USUARIO", `Usuário de suporte ${entry.ativo ? "cadastrado" : "desativado"}: ${email} (${entry.nome})`);
    this.saveLocal();
    return { success: true };
  }

  // Altera apenas a flag "precisa trocar a senha" de um responsável (usada no
  // primeiro acesso/redefinição). O e-mail localiza o registro; se não existir,
  // retorna erro sem tocar em mais nada.
  public async setSupportUserMustChange(
    email: string,
    flag: boolean,
    actor?: string,
    userToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    const target = email.trim().toLowerCase();
    const current = await this.getSupportUsers(userToken);
    const index = current.findIndex(u => u.email.toLowerCase() === target);
    if (index === -1) {
      return { success: false, error: "Responsável de suporte não encontrado." };
    }
    current[index] = { ...current[index], mustChangePassword: flag };

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (isSupabase && client) {
      const { error: upErr } = await client.from("config").upsert({ key: "supportUsers", value: current });
      if (upErr) {
        console.error("[Supabase] supportUsers flag upsert error:", upErr.message);
        return { success: false, error: `Não foi possível salvar no banco de dados: ${upErr.message}` };
      }
      if (actor) {
        await this.addAuditLog(
          actor,
          "SUPORTE_USUARIO",
          `Responsável de suporte: troca de senha marcada como ${flag ? "pendente" : "concluída"}: ${target}`,
          userToken
        );
      }
    }
    const data = this.loadLocal();
    data.supportUsers = current;
    this.saveLocal();
    return { success: true };
  }

  public async isSupportUser(email: string): Promise<boolean> {
    const list = await this.getSupportUsers();
    const target = email.trim().toLowerCase();
    return list.some(u => u.email.toLowerCase() === target && u.ativo);
  }

  public async getSupportUserByEmail(email: string): Promise<SupportUser | null> {
    const list = await this.getSupportUsers();
    const target = email.trim().toLowerCase();
    return list.find(u => u.email.toLowerCase() === target) || null;
  }

  public async getBanners(userToken?: string): Promise<Banner[]> {
    const data = await this.getData(userToken);
    return data.banners || [];
  }

  public async saveBanner(banner: Banner, user: string, userToken?: string): Promise<void> {
    const data = this.loadLocal();
    if (!data.banners) data.banners = [];
    const index = data.banners.findIndex((b) => b.id === banner.id);
    if (index >= 0) {
      data.banners[index] = banner;
      this.addLocalAuditLog(user, "EDITAR_BANNER", `Banner editado: ${banner.titulo}`);
    } else {
      data.banners.push(banner);
      this.addLocalAuditLog(user, "CRIAR_BANNER", `Banner criado: ${banner.titulo}`);
    }
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const freshData = await this.getData(userToken);
        const banners = freshData.banners || [];
        const idx = banners.findIndex((b) => b.id === banner.id);
        if (idx >= 0) {
          banners[idx] = banner;
        } else {
          banners.push(banner);
        }
        await Promise.all([
          client.from("config").upsert({ key: "banners", value: banners }),
          this.addAuditLog(user, index >= 0 ? "EDITAR_BANNER" : "CRIAR_BANNER", `Banner ${index >= 0 ? "editado" : "criado"}: ${banner.titulo}`, userToken)
        ]);
      } catch (err) {
        console.error("[Supabase] saveBanner falhou:", err);
      }
    }
  }

  public async savePagina(chave: "paginaTecnologias" | "paginaElite" | "paginaBiografia", blocos: PaginaBloco[], user: string, userToken?: string): Promise<void> {
    const data = this.loadLocal();
    (data as any)[chave] = blocos;
    const nomePagina = chave === "paginaTecnologias" ? "Tecnologias" : chave === "paginaElite" ? "Elite Milionária" : "Biografia";
    this.addLocalAuditLog(user, "EDITAR_PAGINA", `Conteúdo de ${nomePagina} atualizado (${blocos.length} blocos)`);
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        await Promise.all([
          client.from("config").upsert({ key: chave, value: blocos }),
          this.addAuditLog(user, "EDITAR_PAGINA", `Conteúdo de ${nomePagina} atualizado (${blocos.length} blocos)`, userToken)
        ]);
        const freshData = await this.getData(userToken);
        if (freshData) (freshData as any)[chave] = blocos;
      } catch (err) {
        console.error(`[Supabase] savePagina(${chave}) falhou:`, err);
      }
    }
  }

  public async deleteBanner(id: string, user: string, userToken?: string): Promise<void> {
    const data = this.loadLocal();
    if (!data.banners) data.banners = [];
    const item = data.banners.find((b) => b.id === id);
    data.banners = data.banners.filter((b) => b.id !== id);
    if (!data.deletedBannerIds) data.deletedBannerIds = [];
    if (!data.deletedBannerIds.includes(id)) data.deletedBannerIds.push(id);
    this.addLocalAuditLog(user, "DELETAR_BANNER", item ? `Banner deletado: ${item.titulo}` : `Banner deletado: ${id}`);
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const freshData = await this.getData(userToken);
        const banners = (freshData.banners || []).filter((b) => b.id !== id);
        await Promise.all([
          client.from("config").upsert({ key: "banners", value: banners }),
          this.addAuditLog(user, "DELETAR_BANNER", item ? `Banner deletado: ${item.titulo}` : `Banner deletado: ${id}`, userToken)
        ]);
      } catch (err) {
        console.error("[Supabase] deleteBanner falhou:", err);
      }
    }
  }

  // --- FENIX SOCIAL MODULE METHODS ---

  public async getPublicFenixPosts(userToken?: string): Promise<FenixPost[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data, error } = await client.from("fenix_posts").select("*").eq("status", "aprovado").order("created_at", { ascending: false });
        if (!error && data) {
          return data.map(this.mapFenixPostFromDb);
        }
      } catch (err) {}
    }
    const data = this.loadLocal();
    const posts = data.fenixPosts || [];
    return posts
      .filter((p) => p.status === "aprovado")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getPendingFenixPosts(userToken?: string): Promise<FenixPost[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data, error } = await client.from("fenix_posts").select("*").eq("status", "pendente").order("created_at", { ascending: false });
        if (!error && data) {
          return data.map(this.mapFenixPostFromDb);
        }
      } catch (err) {}
    }
    const data = this.loadLocal();
    const posts = data.fenixPosts || [];
    return posts
      .filter((p) => p.status === "pendente")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getAllFenixPosts(userToken?: string): Promise<FenixPost[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data, error } = await client.from("fenix_posts").select("*").order("created_at", { ascending: false });
        if (!error && data) {
          return data.map(this.mapFenixPostFromDb);
        }
      } catch (err) {}
    }
    const data = this.loadLocal();
    const posts = data.fenixPosts || [];
    return [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getFenixPostById(id: string, userToken?: string): Promise<FenixPost | null> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data, error } = await client.from("fenix_posts").select("*").eq("id", id).maybeSingle();
        if (!error && data) {
          return this.mapFenixPostFromDb(data);
        }
      } catch (err) {}
    }
    const data = this.loadLocal();
    const posts = data.fenixPosts || [];
    return posts.find((p) => p.id === id) || null;
  }

  private mapFenixPostFromDb(p: any): FenixPost {
    return {
      id: p.id,
      titulo: p.titulo,
      usuarioNome: p.usuario_nome,
      usuarioRole: p.usuario_role,
      tipoMedia: p.tipo_media,
      mediaUrl: p.media_url,
      mediaUrls: p.media_urls || [],
      legenda: p.legenda,
      status: p.status,
      likes: p.likes || 0,
      likedBy: p.liked_by || [],
      comentarios: p.comentarios || [],
      createdAt: p.created_at
    };
  }

  public async createFenixPost(post: Omit<FenixPost, "id" | "likes" | "comentarios" | "status" | "createdAt">, userToken?: string): Promise<FenixPost> {
    const data = this.loadLocal();
    if (!data.fenixPosts) data.fenixPosts = [];

    const newPost: FenixPost = {
      ...post,
      id: `fpost-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      status: "pendente",
      likes: 0,
      likedBy: [],
      comentarios: [],
      createdAt: new Date().toISOString()
    };

    data.fenixPosts.unshift(newPost);
    this.addLocalAuditLog(post.usuarioNome, "CRIAR_POST_FENIX", `Novo post Fênix enviado para moderação: ${post.titulo || 'Sem título'}`);
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        await client.from("fenix_posts").insert([{
          id: newPost.id,
          titulo: newPost.titulo,
          usuario_nome: newPost.usuarioNome,
          usuario_role: newPost.usuarioRole,
          tipo_media: newPost.tipoMedia,
          media_url: newPost.mediaUrl,
          media_urls: newPost.mediaUrls,
          legenda: newPost.legenda,
          status: newPost.status,
          likes: newPost.likes,
          liked_by: newPost.likedBy,
          comentarios: newPost.comentarios,
          created_at: newPost.createdAt
        }]);
        await this.addAuditLog(post.usuarioNome, "CRIAR_POST_FENIX", `Novo post Fênix: ${post.titulo || 'Sem título'}`, userToken);
      } catch (err) {}
    }

    return newPost;
  }

  public async updateFenixPost(id: string, updates: Partial<FenixPost>, user: string, userToken?: string): Promise<FenixPost | null> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data: rows, error } = await client.from("fenix_posts").select("*").eq("id", id);
        if (error) throw error;
        if (!rows || rows.length === 0) return null;

        const updateData: any = {};
        if (updates.titulo !== undefined) updateData.titulo = updates.titulo;
        if (updates.legenda !== undefined) updateData.legenda = updates.legenda;
        if (updates.status !== undefined) updateData.status = updates.status;

        await client.from("fenix_posts").update(updateData).eq("id", id);
        await this.addAuditLog(user, "EDITAR_POST_FENIX", `Post Fênix editado pelo admin: ${id}`, userToken);
        return { ...(rows[0] as any), ...updates } as unknown as FenixPost;
      } catch (err) {
        console.error("[Supabase] updateFenixPost falhou:", err);
        return null;
      }
    }

    const data = this.loadLocal();
    if (!data.fenixPosts) data.fenixPosts = [];
    const index = data.fenixPosts.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const updatedPost = {
      ...data.fenixPosts[index],
      ...updates
    };
    data.fenixPosts[index] = updatedPost;
    this.addLocalAuditLog(user, "EDITAR_POST_FENIX", `Post Fênix editado pelo admin: ${id}`);
    this.saveLocal();

    return updatedPost;
  }

  public async deleteFenixPost(id: string, user: string, userToken?: string): Promise<{ success: boolean; mediaUrls: string[] }> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data, error } = await client.from("fenix_posts").delete().eq("id", id).select("*");
        if (error) throw error;
        if (data && data.length > 0) {
          const post = data[0] as any;
          const urls: string[] = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls : (post.mediaUrl ? [post.mediaUrl] : []);
          await this.addAuditLog(user, "EXCLUIR_POST_FENIX", `Post Fênix excluído: ${id}`, userToken);
          return { success: true, mediaUrls: urls };
        }
        return { success: false, mediaUrls: [] };
      } catch (err) {
        console.error("[Supabase] deleteFenixPost falhou:", err);
        return { success: false, mediaUrls: [] };
      }
    }

    const data = this.loadLocal();
    if (!data.fenixPosts) data.fenixPosts = [];
    const post = data.fenixPosts.find((p) => p.id === id);
    if (!post) return { success: false, mediaUrls: [] };

    const urls: string[] = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls : [post.mediaUrl];
    data.fenixPosts = data.fenixPosts.filter((p) => p.id !== id);
    this.addLocalAuditLog(user, "EXCLUIR_POST_FENIX", `Post Fênix excluído: ${id}`);
    this.saveLocal();

    return { success: true, mediaUrls: urls };
  }

  public async likeFenixPost(id: string, userKey: string = "anonymous", userToken?: string): Promise<{ likes: number; liked: boolean } | null> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data: rows, error } = await client.from("fenix_posts").select("*").eq("id", id);
        if (error) throw error;
        if (!rows || rows.length === 0) return null;

        const post = rows[0] as any;
        const likedBy: string[] = Array.isArray(post.liked_by) ? post.liked_by : [];
        const index = likedBy.indexOf(userKey);
        let liked = false;

        if (index >= 0) {
          likedBy.splice(index, 1);
          liked = false;
        } else {
          likedBy.push(userKey);
          liked = true;
        }

        const likes = Math.max(0, (typeof post.likes === "number" && !isNaN(post.likes) ? post.likes : 0) + (liked ? 1 : -1));
        await client.from("fenix_posts").update({ likes, liked_by: likedBy }).eq("id", id);
        return { likes, liked };
      } catch (err) {
        console.error("[Supabase] likeFenixPost falhou:", err);
        return null;
      }
    }

    const data = this.loadLocal();
    if (!data.fenixPosts) data.fenixPosts = [];
    const post = data.fenixPosts.find((p) => p.id === id);
    if (!post) return null;

    if (!post.likedBy) post.likedBy = [];
    const index = post.likedBy.indexOf(userKey);
    let liked = false;

    if (index >= 0) {
      post.likedBy.splice(index, 1);
      post.likes = Math.max(0, post.likes - 1);
      liked = false;
    } else {
      post.likedBy.push(userKey);
      post.likes += 1;
      liked = true;
    }

    this.saveLocal();

    return { likes: post.likes, liked };
  }

  public async commentFenixPost(id: string, texto: string, usuarioNome: string, userToken?: string): Promise<FenixComment | null> {
    const data = this.loadLocal();
    if (!data.fenixPosts) data.fenixPosts = [];
    const post = data.fenixPosts.find((p) => p.id === id);
    if (!post) return null;

    if (!post.comentarios) post.comentarios = [];
    const comment: FenixComment = {
      id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      usuarioNome,
      texto,
      createdAt: new Date().toISOString()
    };

    post.comentarios.push(comment);
    this.saveLocal();

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        await client.from("fenix_posts").update({ comentarios: post.comentarios }).eq("id", id);
      } catch (err) {}
    }

    return comment;
  }

  public async approveFenixPost(id: string, user: string, userToken?: string): Promise<boolean> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data, error } = await client.from("fenix_posts").update({ status: "aprovado" }).eq("id", id).select("id");
        if (error) throw error;
        if (data && data.length > 0) {
          await this.addAuditLog(user, "APROVAR_POST_FENIX", `Post Fênix Social aprovado: ${id}`, userToken);
          return true;
        }
        return false;
      } catch (err) {
        console.error("[Supabase] approveFenixPost falhou:", err);
        return false;
      }
    }

    const data = this.loadLocal();
    if (!data.fenixPosts) data.fenixPosts = [];
    const post = data.fenixPosts.find((p) => p.id === id);
    if (!post) return false;

    post.status = "aprovado";
    this.addLocalAuditLog(user, "APROVAR_POST_FENIX", `Post Fênix Social aprovado: ${id}`);
    this.saveLocal();

    return true;
  }

  public async rejectFenixPost(id: string, user: string, userToken?: string): Promise<string[] | null> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    let post = null;

    if (isSupabase && client) {
      const { data } = await client.from("fenix_posts").select("*").eq("id", id).maybeSingle();
      post = data;
    } else {
      const data = this.loadLocal();
      if (!data.fenixPosts) data.fenixPosts = [];
      post = data.fenixPosts.find((p) => p.id === id);
    }

    if (!post) return null;

    // Colunas podem vir no formato camelCase (API) ou snake_case (row crua do
    // Supabase: media_url/media_urls) — aceita ambos e filtra vazios.
    const rawUrls: unknown =
      (post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls : undefined) ||
      (Array.isArray(post.media_urls) && post.media_urls.length > 0 ? post.media_urls : undefined) ||
      post.mediaUrl ||
      post.media_url;
    const urls: string[] = rawUrls ? (Array.isArray(rawUrls) ? rawUrls : [rawUrls]) : [];

    if (isSupabase && client) {
      try {
        await client.from("fenix_posts").delete().eq("id", id);
        await this.addAuditLog(user, "RECUSAR_POST_FENIX", `Post Fênix Social recusado e deletado permanentemente: ${id}`, userToken);
      } catch (err) {}
    }

    const data = this.loadLocal();
    if (!data.fenixPosts) data.fenixPosts = [];
    data.fenixPosts = data.fenixPosts.filter((p) => p.id !== id);
    this.addLocalAuditLog(user, "RECUSAR_POST_FENIX", `Post Fênix Social recusado e deletado permanentemente: ${id}`);
    this.saveLocal();

    return urls;
  }

  // --- MODERATOR LINKS METHODS ---

  public async getModeratorLinks(userToken?: string): Promise<ModeratorLink[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);
    if (isSupabase && client) {
      try {
        const { data: config } = await client.from("config").select("value").eq("key", "moderatorLinks").maybeSingle();
        if (config && config.value && Array.isArray(config.value)) {
          return config.value as ModeratorLink[];
        }
      } catch (err) {
        console.error("[Supabase] getModeratorLinks error:", err);
      }
    }
    const data = this.loadLocal();
    return data.moderatorLinks || [];
  }

  public async createModeratorLink(moderadorNome: string, user: string, userToken?: string): Promise<ModeratorLink> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);

    let currentLinks = await this.getModeratorLinks(userToken);

    // Generate clean slug + random token (CSPRNG — Math.random é previsível e
    // a entropia de 6 chars base36 (~31 bits) era brute-forceável)
    const cleanName = moderadorNome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "-");
    const token = `mod-${cleanName}-${crypto.randomBytes(6).toString("hex")}`;

    const newLink: ModeratorLink = {
      id: `modlink-${Date.now()}`,
      moderadorNome,
      token,
      createdAt: new Date().toISOString()
    };

    currentLinks.unshift(newLink);

    if (isSupabase && client) {
      try {
        await Promise.all([
          client.from("config").upsert({ key: "moderatorLinks", value: currentLinks }),
          this.addAuditLog(user, "CRIAR_LINK_MODERADOR", `Link de moderação criado para: ${moderadorNome}`, userToken)
        ]);
      } catch (err) {
        console.error("[Supabase] createModeratorLink error:", err);
      }
    }
    
    const data = this.loadLocal();
    data.moderatorLinks = currentLinks;
    this.addLocalAuditLog(user, "CRIAR_LINK_MODERADOR", `Link de moderação criado para: ${moderadorNome}`);
    this.saveLocal();

    return newLink;
  }

  public async deleteModeratorLink(id: string, user: string, userToken?: string): Promise<boolean> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken);

    let currentLinks = await this.getModeratorLinks(userToken);

    const exists = currentLinks.some((l) => l.id === id);
    if (!exists) return false;

    currentLinks = currentLinks.filter((l) => l.id !== id);

    if (isSupabase && client) {
      try {
        await Promise.all([
          client.from("config").upsert({ key: "moderatorLinks", value: currentLinks }),
          this.addAuditLog(user, "EXCLUIR_LINK_MODERADOR", `Link de moderação removido: ${id}`, userToken)
        ]);
      } catch (err) {
        console.error("[Supabase] deleteModeratorLink error:", err);
      }
    }
    
    const data = this.loadLocal();
    data.moderatorLinks = currentLinks;
    this.addLocalAuditLog(user, "EXCLUIR_LINK_MODERADOR", `Link de moderação removido: ${id}`);
    this.saveLocal();

    return true;
  }

  public async validateModeratorToken(token: string): Promise<ModeratorLink | null> {
    const isSupabase = await this.ensureInitialized();
    if (isSupabase) {
      // Validação de autenticação feita pelo SERVIDOR → service_role (o SELECT
      // em `config` por anon/RLS pode ser negado e derrubaria o link de moderação).
      const client = getSupabaseTrustedClient() || supabase;
      if (client) {
        try {
          const { data } = await client.from("config").select("value").eq("key", "moderatorLinks").maybeSingle();
          if (data && data.value) {
            const links = data.value as ModeratorLink[];
            return links.find((l) => l.token === token) || null;
          }
        } catch(e) {}
      }
    }
    const data = this.loadLocal();
    const links = data.moderatorLinks || [];
    return links.find((l) => l.token === token) || null;
  }

  // --- OUVIDORIA METHODS ---

  public async getOuvidoriaMessages(filterTipo?: string, filterStatus?: string, search?: string, userToken?: string): Promise<OuvidoriaMessage[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    let messages: OuvidoriaMessage[] = [];

    if (isSupabase && client) {
      try {
        const { data } = await client.from("config").select("value").eq("key", "ouvidoriaMessages").maybeSingle();
        if (data && data.value) {
          messages = data.value as OuvidoriaMessage[];
        }
      } catch (e) {}
    } else {
      const data = this.loadLocal();
      messages = data.ouvidoriaMessages || [];
    }

    if (filterTipo && filterTipo !== "todos") {
      messages = messages.filter((m) => m.tipo === filterTipo);
    }
    if (filterStatus && filterStatus !== "todos") {
      messages = messages.filter((m) => m.status === filterStatus);
    }
    if (search && search.trim() !== "") {
      const q = search.toLowerCase().trim();
      messages = messages.filter(
        (m) =>
          m.nome.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.assunto && m.assunto.toLowerCase().includes(q)) ||
          (m.tipoParceria && m.tipoParceria.toLowerCase().includes(q)) ||
          m.mensagem.toLowerCase().includes(q)
      );
    }
    return [...messages].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async saveOuvidoriaMessage(msg: Omit<OuvidoriaMessage, "id" | "status" | "createdAt"> & { ip?: string }, userToken?: string): Promise<OuvidoriaMessage> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    let currentMessages: OuvidoriaMessage[] = [];
    
    if (isSupabase && client) {
      try {
        const { data } = await client.from("config").select("value").eq("key", "ouvidoriaMessages").maybeSingle();
        if (data && data.value) {
          currentMessages = data.value as OuvidoriaMessage[];
        }
      } catch(e) {}
    } else {
      const data = this.loadLocal();
      currentMessages = data.ouvidoriaMessages || [];
    }

    const newMsg: OuvidoriaMessage = {
      id: `ouv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tipo: msg.tipo,
      nome: msg.nome,
      email: msg.email,
      telefone: msg.telefone || "",
      cidade: msg.cidade || "",
      estado: msg.estado || "",
      pais: msg.pais || "",
      assunto: msg.assunto || "",
      tipoParceria: msg.tipoParceria || "",
      mensagem: msg.mensagem,
      status: "pendente",
      ip: msg.ip || "127.0.0.1",
      createdAt: new Date().toISOString()
    };

    currentMessages.unshift(newMsg);

    // Teto de crescimento da caixa (config JSONB): retém as 2000 mensagens mais
    // recentes para a config não inchar sem limite com spam de envios.
    if (currentMessages.length > 2000) {
      currentMessages.length = 2000;
    }

    if (isSupabase && client) {
      try {
        await Promise.all([
          client.from("config").upsert({ key: "ouvidoriaMessages", value: currentMessages }),
          this.addAuditLog(msg.email, "NOVA_MENSAGEM_OUVIDORIA", `Nova mensagem de ${msg.tipo.toUpperCase()} recebida de ${msg.nome} (${msg.email})`, userToken)
        ]);
      } catch (err) {}
    }

    const data = this.loadLocal();
    data.ouvidoriaMessages = currentMessages;
    this.addLocalAuditLog(
      msg.email,
      "NOVA_MENSAGEM_OUVIDORIA",
      `Nova mensagem de ${msg.tipo.toUpperCase()} recebida de ${msg.nome} (${msg.email})`
    );
    this.saveLocal();

    return newMsg;
  }

  public async updateOuvidoriaMessageStatus(id: string, status: OuvidoriaMessage["status"], user: string, userToken?: string): Promise<OuvidoriaMessage | null> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    let currentMessages: OuvidoriaMessage[] = [];
    
    if (isSupabase && client) {
      try {
        const { data } = await client.from("config").select("value").eq("key", "ouvidoriaMessages").maybeSingle();
        if (data && data.value) {
          currentMessages = data.value as OuvidoriaMessage[];
        }
      } catch(e) {}
    } else {
      const data = this.loadLocal();
      currentMessages = data.ouvidoriaMessages || [];
    }

    const index = currentMessages.findIndex((m) => m.id === id);
    if (index === -1) return null;

    currentMessages[index].status = status;

    if (isSupabase && client) {
      try {
        await Promise.all([
          client.from("config").upsert({ key: "ouvidoriaMessages", value: currentMessages }),
          this.addAuditLog(user, "ATUALIZAR_STATUS_OUVIDORIA", `Status da mensagem ${id} alterado para: ${status}`, userToken)
        ]);
      } catch (err) {}
    }

    const data = this.loadLocal();
    data.ouvidoriaMessages = currentMessages;
    this.addLocalAuditLog(user, "ATUALIZAR_STATUS_OUVIDORIA", `Status da mensagem ${id} alterado para: ${status}`);
    this.saveLocal();

    return currentMessages[index];
  }

  public async deleteOuvidoriaMessage(id: string, user: string, userToken?: string): Promise<boolean> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    let currentMessages: OuvidoriaMessage[] = [];
    
    if (isSupabase && client) {
      try {
        const { data } = await client.from("config").select("value").eq("key", "ouvidoriaMessages").maybeSingle();
        if (data && data.value) {
          currentMessages = data.value as OuvidoriaMessage[];
        }
      } catch(e) {}
    } else {
      const data = this.loadLocal();
      currentMessages = data.ouvidoriaMessages || [];
    }

    const exists = currentMessages.some((m) => m.id === id);
    if (!exists) return false;

    currentMessages = currentMessages.filter((m) => m.id !== id);

    if (isSupabase && client) {
      try {
        await Promise.all([
          client.from("config").upsert({ key: "ouvidoriaMessages", value: currentMessages }),
          this.addAuditLog(user, "EXCLUIR_MENSAGEM_OUVIDORIA", `Mensagem de ouvidoria excluída: ${id}`, userToken)
        ]);
      } catch (err) {}
    }

    const data = this.loadLocal();
    data.ouvidoriaMessages = currentMessages;
    this.addLocalAuditLog(user, "EXCLUIR_MENSAGEM_OUVIDORIA", `Mensagem de ouvidoria excluída: ${id}`);
    this.saveLocal();

    return true;
  }

  public async getOuvidoriaConfig(userToken?: string): Promise<OuvidoriaConfig> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data } = await client.from("config").select("value").eq("key", "ouvidoriaConfig").maybeSingle();
        if (data && data.value) return data.value as OuvidoriaConfig;
      } catch (e) {}
    }
    const data = this.loadLocal();
    if (!data.ouvidoriaConfig) {
      data.ouvidoriaConfig = { emailSuporte: "ouvidoria@grupofenix.com", emailParcerias: "parcerias@grupofenix.com", autoResponderEnabled: true };
      this.saveLocal();
    }
    return data.ouvidoriaConfig;
  }

  public async updateOuvidoriaConfig(config: Partial<OuvidoriaConfig>, user: string, userToken?: string): Promise<OuvidoriaConfig> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    const data = this.loadLocal();
    
    data.ouvidoriaConfig = {
      emailSuporte: config.emailSuporte || data.ouvidoriaConfig?.emailSuporte || "ouvidoria@grupofenix.com",
      emailParcerias: config.emailParcerias || data.ouvidoriaConfig?.emailParcerias || "parcerias@grupofenix.com",
      autoResponderEnabled: config.autoResponderEnabled !== undefined ? config.autoResponderEnabled : true,
      notifySuporteEmail: config.notifySuporteEmail !== undefined ? config.notifySuporteEmail : (data.ouvidoriaConfig?.notifySuporteEmail ?? false),
      notifyParceriaEmail: config.notifyParceriaEmail !== undefined ? config.notifyParceriaEmail : (data.ouvidoriaConfig?.notifyParceriaEmail ?? false)
    };
    const currentVal = data.ouvidoriaConfig;
    
    if (isSupabase && client) {
      try {
        await Promise.all([
          client.from("config").upsert({ key: "ouvidoriaConfig", value: currentVal }),
          this.addAuditLog(user, "ATUALIZAR_CONFIG_OUVIDORIA", `Configurações da ouvidoria atualizadas`, userToken)
        ]);
      } catch (e) {}
    }
    
    this.addLocalAuditLog(user, "ATUALIZAR_CONFIG_OUVIDORIA", `Configurações da ouvidoria atualizadas`);
    this.saveLocal();
    return currentVal;
  }

  public async getMinioConfig(userToken?: string): Promise<MinioConfig> {
    const fromEnv = minioConfigFromEnv();
    if (fromEnv) return fromEnv;

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data } = await client.from("config").select("value").eq("key", "minioConfig").maybeSingle();
        if (data && data.value) return data.value as MinioConfig;
      } catch (e) {}
    }
    const data = this.loadLocal();
    if (!data.minioConfig) {
      data.minioConfig = { endpoint: "", port: 9000, useSSL: false, accessKey: "", secretKey: "", bucket: "armazenamento", region: "us-east-1", consoleUrl: "" };
      this.saveLocal();
    }
    return data.minioConfig;
  }

  public async saveMinioConfig(config: MinioConfig, user: string, userToken?: string): Promise<MinioConfig> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    const data = this.loadLocal();
    
    data.minioConfig = { ...config };
    const currentVal = data.minioConfig;
    
    if (isSupabase && client) {
      try {
        await Promise.all([
          client.from("config").upsert({ key: "minioConfig", value: currentVal }),
          this.addAuditLog(user, "ATUALIZAR_CONFIG_MINIO", `Credenciais MinIO atualizadas`, userToken)
        ]);
      } catch (e) {}
    }
    
    this.addLocalAuditLog(user, "ATUALIZAR_CONFIG_MINIO", `Credenciais MinIO atualizadas`);
    this.saveLocal();
    return currentVal;
  }

  public async getVimeoConfig(userToken?: string): Promise<VimeoConfig> {
    const fromEnv = vimeoConfigFromEnv();
    if (fromEnv) return fromEnv;

    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data } = await client.from("config").select("value").eq("key", "vimeoConfig").maybeSingle();
        if (data && data.value) return data.value as VimeoConfig;
      } catch (e) {}
    }
    const data = this.loadLocal();
    if (!data.vimeoConfig) {
      data.vimeoConfig = { accessToken: "", clientId: "", clientSecret: "", autoFetchDetails: true };
      this.saveLocal();
    }
    return data.vimeoConfig;
  }

  public async saveVimeoConfig(config: VimeoConfig, user: string, userToken?: string): Promise<VimeoConfig> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    const data = this.loadLocal();
    
    data.vimeoConfig = { ...config };
    const currentVal = data.vimeoConfig;
    
    if (isSupabase && client) {
      try {
        await Promise.all([
          client.from("config").upsert({ key: "vimeoConfig", value: currentVal }),
          this.addAuditLog(user, "ATUALIZAR_CONFIG_VIMEO", `Configurações da API Vimeo atualizadas por ${user}`, userToken)
        ]);
      } catch (e) {}
    }
    
    this.addLocalAuditLog(user, "ATUALIZAR_CONFIG_VIMEO", `Configurações da API Vimeo atualizadas por ${user}`);
    this.saveLocal();
    return currentVal;
  }

  public async getHiddenHomeCardIds(userToken?: string): Promise<string[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseClient(userToken) || supabase;
    if (isSupabase && client) {
      try {
        const { data } = await client.from("config").select("value").eq("key", "hiddenHomeCardIds").maybeSingle();
        if (data && data.value) return data.value as string[];
      } catch (e) {}
    }
    const data = this.loadLocal();
    if (!data.hiddenHomeCardIds) {
      data.hiddenHomeCardIds = [];
      this.saveLocal();
    }
    return data.hiddenHomeCardIds;
  }

  public async saveHiddenHomeCardIds(ids: string[], user: string, userToken?: string): Promise<string[]> {
    const isSupabase = await this.ensureInitialized();
    const client = getSupabaseTrustedClient(userToken) || supabase;
    const data = this.loadLocal();
    
    data.hiddenHomeCardIds = ids;
    const currentVal = data.hiddenHomeCardIds;
    
    if (isSupabase && client) {
      try {
        await Promise.all([
          client.from("config").upsert({ key: "hiddenHomeCardIds", value: currentVal }),
          this.addAuditLog(user, "ATUALIZAR_CARDS_INICIAL", `Cards ocultados da tela inicial atualizados (${ids.length} ocultos)`, userToken)
        ]);
      } catch (e) {}
    }
    
    this.addLocalAuditLog(user, "ATUALIZAR_CARDS_INICIAL", `Cards ocultados da tela inicial atualizados (${ids.length} ocultos)`);
    this.saveLocal();
    return currentVal;
  }

  /** Indica se o Supabase está ativo após a inicialização (usado pelo middleware de disponibilidade). */
  public isSupabaseActive(): boolean {
    return this.supabaseActive;
  }

  /** Aguarda a inicialização e retorna true se o Supabase está operacional (modo estrito). */
  public async isSupabaseReady(): Promise<boolean> {
    try {
      const ok = await this.ensureInitialized();
      return ok;
    } catch (err) {
      console.error("[Supabase] isSupabaseReady falhou:", err);
      return false;
    }
  }

  /** Sinalizador de modo estrito para o servidor API (503 quando indisponível). */
  public isStrictMode(): boolean {
    return SUPABASE_ONLY;
  }
}

export const dbService = new DBService();
