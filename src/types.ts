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

export interface User {
  role: "admin" | "user" | "support";
  code: string;
  name?: string;
  descricao?: string;
  email?: string;
  token?: string;
  // Para role "support": true enquanto o responsável ainda não escolheu a própria
  // senha (1º acesso ou após redefinição do admin). Flag vinda do servidor.
  mustChangePassword?: boolean;
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
  nome: string; // nome original sanitizado (para exibição)
  tamanhoKb: number;
  mime: string;
  key: string; // object key no MinIO (quando storage="minio")
  localPath?: string; // relativo a data/suporte-anexos/ quando storage="local"
  storage: "minio" | "local";
  isImage: boolean;
}

export interface SupportMessage {
  id: string;
  tipo: "di" | "suporte";
  autorNome: string;
  autorRef: string; // código D.I. ou e-mail do atendente
  texto: string;
  criadoEm: string;
  anexos?: SupportAnexo[];
}

export interface SupportTicket {
  id: string;
  numero: number; // sequencial exibido como #0001
  assunto: string;
  status: SupportTicketStatus;
  criadoPor: string; // código D.I.
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

export interface FenixPost {
  id: string;
  titulo?: string;
  usuarioNome: string; // Autor da publicação
  usuarioRole?: string;
  tipoMedia: "photo" | "video";
  mediaUrl: string; // Capa / Primeira mídia para retrocompatibilidade
  mediaUrls?: string[]; // Suporte para até 3 fotos ou 1 vídeo
  legenda: string; // Descrição da publicação
  status: "pendente" | "aprovado" | "recusado";
  likes: number;
  likedBy?: string[];
  comentarios: FenixComment[];
  dataPublicacao?: string; // Data definida ou data atual
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
  categoriasMateriais?: string[];
  logoUrl?: string;
  diCodes?: DICode[];
  hiddenHomeCardIds?: string[];
  deletedCursoIds?: string[];
  deletedNovidadeIds?: string[];
  deletedMaterialIds?: string[];
  deletedBannerIds?: string[];
  paginaTecnologias?: PaginaBloco[];
  paginaElite?: PaginaBloco[];
  paginaBiografia?: PaginaBloco[];
}

// Conteúdo editável das páginas institucionais (Tecnologias / Elite Milionária / Biografia).
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

export type ViewType = "inicio" | "grupo-fenix" | "tecnologias" | "escola-fenix" | "conteudos" | "fenix-social" | "moderacao-fenix" | "elite-milionario" | "suporte" | "support-app" | "admin" | "admin-login";
export type SubViewType = "cursos" | "hub-marketing" | "admin";
export type AdminTabType = "dashboard" | "banners" | "cards-home" | "cursos" | "materiais" | "fenix-social" | "moderadores" | "ouvidoria" | "servidores" | "cadastrar-di" | "suporte" | "backup" | "paginas";

