import { create } from "zustand";
import { User, ViewType, SubViewType, AdminTabType, LeaderBio, Novidade, Curso, Material, Tecnologia, AuditLog, Banner, FenixPost, FenixComment, ModeratorLink, DICode, SupportTicket, SupportUser, SupportTicketStatus, OuvidoriaMessage, PaginaBloco } from "./types";
import { defaultData } from "./defaultData";

// Validação mínima de JWT (offline fallback): 3 partes + exp no futuro.
// O servidor continua sendo a autoridade real — isso só evita marcar
// loggedIn=true com um token aleatório/forjado quando a API está fora.
function looksLikeValidJwt(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload || typeof payload.exp !== "number") return false;
    return Date.now() / 1000 < payload.exp;
  } catch {
    return false;
  }
}

let isServerAvailable = true;

// Deduplica chamadas concorrentes de fetchPublicData (cada view monta e chama
// fetchPublicData; aqui um único fetch é compartilhado, evitando N requests).
let publicDataInflight: Promise<void> | null = null;

interface PlatformState {
  // Navigation
  activeView: ViewType;
  subView: SubViewType;
  activeCourse: Curso | null;
  adminActiveTab: AdminTabType;

  // Authentication
  user: User | null;
  loggedIn: boolean;
  authLoading: boolean;
  token: string | null;

  // Content Data
  publicData: {
    leaderBio: LeaderBio;
    novidades: Novidade[];
    cursos: any[]; // Teaser cursos
    materiais: any[]; // Teaser materiais
    banners?: Banner[];
    categoriasMateriais?: string[];
    tecnologias?: Tecnologia[];
    logoUrl?: string;
    hiddenHomeCardIds?: string[];
    paginaTecnologias?: PaginaBloco[];
    paginaElite?: PaginaBloco[];
    paginaBiografia?: PaginaBloco[];
  } | null;
  restrictedData: {
    cursos: Curso[];
    materiais: Material[];
    categoriasMateriais?: string[];
    logoUrl?: string;
  } | null;

  // Admin Data
  adminStats: {
    usuarios: number;
    cursos: number;
    materiais: number;
    downloads: number;
    acessos?: number;
    totalLoginsDI?: number;
  } | null;
  adminDiList?: { codigo: string; count: number; lastAccess: string; status: string }[];
  adminDiCodes: DICode[];
  adminLogs: AuditLog[];

  // Lesson Watch Progress (Stored in LocalStorage)
  completedLessons: string[];
  lessonProgress: { [lessonId: string]: number }; // lessonId => last percentage (0-100)

  // Navigation Setters
  setActiveView: (view: ViewType) => void;
  setSubView: (subView: SubViewType) => void;
  setActiveCourse: (course: Curso | null) => void;
  setAdminActiveTab: (tab: AdminTabType) => void;

  // Auth Actions
  fetchUser: () => Promise<boolean>;
  login: (credentials: { code?: string; email?: string; password?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  moderationToken: string | null;
  setModerationToken: (token: string | null) => void;

  // Data Fetching Actions
  fetchPublicData: () => Promise<void>;
  fetchRestrictedData: () => Promise<void>;
  fetchAdminData: () => Promise<void>;
  fetchAdminDiCodes: () => Promise<void>;
  createDiCode: (codigo: string, descricao: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  toggleDiCodeStatus: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteDiCode: (id: string) => Promise<{ success: boolean; error?: string }>;
  downloadDiTemplate: () => Promise<{ success: boolean; error?: string }>;
  exportDiCodes: () => Promise<{ success: boolean; error?: string }>;
  importDiCodes: (file: File) => Promise<{ success: boolean; error?: string; report?: any }>;

  // Support Tickets
  supportTickets: SupportTicket[];
  supportCounts: any;
  supportLeads: OuvidoriaMessage[];
  supportUsers: SupportUser[];
  fetchSupportTickets: () => Promise<{ success: boolean; tickets?: SupportTicket[]; counts?: any; error?: string }>;
  createSupportTicket: (assunto: string, texto: string, files?: File[]) => Promise<{ success: boolean; ticket?: SupportTicket; error?: string }>;
  addSupportMessage: (id: string, texto: string) => Promise<{ success: boolean; ticket?: SupportTicket; error?: string }>;
  attachSupportFiles: (id: string, files: File[], texto: string) => Promise<{ success: boolean; ticket?: SupportTicket; error?: string }>;
  setSupportTicketStatus: (id: string, status: SupportTicketStatus) => Promise<{ success: boolean; ticket?: SupportTicket; error?: string }>;
  fetchSupportInbox: () => Promise<{ success: boolean; error?: string }>;
  setSupportLeadStatus: (id: string, status: OuvidoriaMessage["status"]) => Promise<{ success: boolean; message?: OuvidoriaMessage; error?: string }>;
  fetchSupportUsers: () => Promise<{ success: boolean; users?: SupportUser[]; error?: string }>;
  saveSupportUser: (data: { email: string; nome: string; senha?: string; ativo: boolean }) => Promise<{ success: boolean; error?: string; message?: string }>;
  resetSupportPassword: (email: string, novaSenha: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  changeSupportPassword: (novaSenha: string) => Promise<{ success: boolean; error?: string; message?: string }>;

  // Material Actions
  recordDownload: (id: string) => Promise<void>;

  // Admin Mutations
  saveBanner: (banner: Banner) => Promise<{ success: boolean; error?: string }>;
  deleteBanner: (id: string) => Promise<boolean>;
  saveNovidade: (novidade: Partial<Novidade>) => Promise<{ success: boolean; error?: string }>;
  deleteNovidade: (id: string) => Promise<boolean>;
  saveCurso: (curso: Partial<Curso>) => Promise<{ success: boolean; error?: string }>;
  deleteCurso: (id: string) => Promise<boolean>;
  saveMaterial: (material: Partial<Material>) => Promise<{ success: boolean; error?: string }>;
  deleteMaterial: (id: string) => Promise<boolean>;
  updateLeaderBio: (bio: LeaderBio) => Promise<{ success: boolean; error?: string }>;
  saveCategoriasMateriais: (categorias: string[]) => Promise<{ success: boolean; error?: string }>;
  uploadLogo: (logoBase64: string) => Promise<{ success: boolean; logoUrl?: string; error?: string }>;
  resetLogo: () => Promise<boolean>;
  uploadFile: (fileBase64: string, fileName?: string, folder?: string) => Promise<{ success: boolean; url?: string; error?: string }>;

  // Fenix Social Data
  fenixPosts: FenixPost[];
  pendingFenixPosts: FenixPost[];
  allFenixPosts: FenixPost[];
  moderatorLinks: ModeratorLink[];

  // Fenix Social Actions
  fetchFenixPosts: () => Promise<void>;
  fetchPendingFenixPosts: (modToken?: string) => Promise<void>;
  fetchAllFenixPostsAdmin: () => Promise<void>;
  createFenixPost: (postData: { titulo: string; legenda: string; dataPublicacao?: string; usuarioNome?: string; filesBase64: string[]; fileBase64?: string; tipoMedia?: "photo" | "video" }) => Promise<{ success: boolean; message?: string; error?: string }>;
  likeFenixPost: (id: string) => Promise<boolean>;
  commentFenixPost: (id: string, texto: string, usuarioNome?: string) => Promise<boolean>;
  approveFenixPost: (id: string, modToken?: string) => Promise<boolean>;
  rejectFenixPost: (id: string, modToken?: string) => Promise<boolean>;
  updateFenixPostAdmin: (id: string, updates: Partial<FenixPost>) => Promise<boolean>;
  deleteFenixPostAdmin: (id: string) => Promise<boolean>;

  // Moderator Links Actions
  fetchModeratorLinks: () => Promise<void>;
  createModeratorLink: (moderadorNome: string) => Promise<{ success: boolean; link?: ModeratorLink; error?: string }>;
  deleteModeratorLink: (id: string) => Promise<boolean>;

  // Progress Watch Actions
  toggleLessonCompleted: (lessonId: string) => void;
  saveLessonProgress: (lessonId: string, percentage: number) => void;

  // Home Card Management Actions
  hiddenHomeCardIds: string[];
  hideHomeCard: (cardId: string) => Promise<void>;
  restoreHomeCard: (cardId: string) => Promise<void>;
  toggleHideHomeCard: (cardId: string) => Promise<void>;
}

export const useStore = create<PlatformState>((set, get) => {
  // Initialize progress and session from localStorage
  let initialCompleted: string[] = [];
  let initialProgress: { [lessonId: string]: number } = {};
  let initialHiddenCards: string[] = [];
  let initialUser = null;
  let initialLoggedIn = false;
  let initialToken = null;
  try {
    const comp = localStorage.getItem("fenix_completed_lessons");
    if (comp) initialCompleted = JSON.parse(comp);
    const prog = localStorage.getItem("fenix_lesson_progress");
    if (prog) initialProgress = JSON.parse(prog);
    const hidden = localStorage.getItem("fenix_hidden_home_cards");
    if (hidden) initialHiddenCards = JSON.parse(hidden);

    const storedUser = localStorage.getItem("fenix_user");
    const storedToken = localStorage.getItem("fenix_token");
    if (storedUser && storedToken) {
      initialUser = JSON.parse(storedUser);
      initialLoggedIn = true;
      initialToken = storedToken;
    }
  } catch (e) {
    console.error("Failed to parse local storage data on store initialization", e);
  }

  return {
    // Navigation
    activeView: "inicio",
    subView: "cursos",
    activeCourse: null,
    adminActiveTab: "dashboard",

    // Auth
    user: initialUser,
    loggedIn: initialLoggedIn,
    authLoading: false,
    token: initialToken,
    moderationToken: null,

    // Content Data
    publicData: {
      leaderBio: defaultData.leaderBio,
      novidades: defaultData.novidades,
      cursos: defaultData.cursos.map(c => ({
        id: c.id,
        titulo: c.titulo,
        descricao: c.descricao,
        categoria: c.categoria,
        nivel: c.nivel,
        imagem: c.imagem,
        duracao: c.duracao,
        moduloCount: c.modulos?.length || 0
      })),
      materiais: defaultData.materiais.map(m => ({
        id: m.id,
        titulo: m.titulo,
        tipo: m.tipo,
        categoria: m.categoria,
        thumbnail: m.thumbnail,
        downloads: m.downloads,
        isPublic: m.isPublic,
        createdAt: m.createdAt
      })),
      banners: defaultData.banners || [],
      categoriasMateriais: defaultData.categoriasMateriais || ["Negócios", "Produtos", "Apresentação", "Planejamento"],
      tecnologias: defaultData.tecnologias || [],
      logoUrl: undefined,
      paginaTecnologias: defaultData.paginaTecnologias || [],
      paginaElite: defaultData.paginaElite || [],
      paginaBiografia: defaultData.paginaBiografia || []
    },
    restrictedData: null,

    // Admin Data
    adminStats: null,
    adminDiCodes: [],
    adminLogs: [],

    // Support Tickets
    supportTickets: [],
    supportCounts: null,
    supportLeads: [],
    supportUsers: [],

    // Fenix Social Data
    fenixPosts: [],
    pendingFenixPosts: [],
    allFenixPosts: [],
    moderatorLinks: [],

    // Progress
    completedLessons: initialCompleted,
    lessonProgress: initialProgress,
    hiddenHomeCardIds: initialHiddenCards,

    // Navigation Setters
    setActiveView: (view) => set({ activeView: view, activeCourse: null }),
    setSubView: (subView) => set({ subView }),
    setActiveCourse: (course) => set({ activeCourse: course }),
    setAdminActiveTab: (tab) => set({ adminActiveTab: tab }),

    // Auth Actions
    fetchUser: async () => {
      set({ authLoading: true });
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = {};
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/auth/me", { headers });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              const data = await res.json();
              if (data.loggedIn) {
                set({ user: data.user, loggedIn: true, authLoading: false });
                get().fetchRestrictedData();
                return true;
              } else {
                localStorage.removeItem("fenix_user");
                localStorage.removeItem("fenix_token");
                set({ user: null, loggedIn: false, token: null, authLoading: false });
                return false;
              }
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Otherwise use what we have in localStorage (fallback offline).
        // Sanidade mínima: só aceita token com formato JWT (3 partes) cujo exp
        // ainda não passou — um token forjado/aleatório não marca loggedIn.
        const storedUser = localStorage.getItem("fenix_user");
        const storedToken = localStorage.getItem("fenix_token");
        if (storedUser && storedToken && looksLikeValidJwt(storedToken)) {
          set({ user: JSON.parse(storedUser), loggedIn: true, token: storedToken, authLoading: false });
          return true;
        }

        set({ user: null, loggedIn: false, token: null, authLoading: false });
        return false;
      } catch (e) {
        set({ user: null, loggedIn: false, authLoading: false });
        return false;
      }
    },

    login: async (credentials) => {
      try {
        if (isServerAvailable) {
          try {
            const res = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(credentials)
            });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              const data = await res.json();
              if (data.success) {
                localStorage.setItem("fenix_user", JSON.stringify(data.user));
                localStorage.setItem("fenix_token", data.token);
                set({ user: data.user, loggedIn: true, token: data.token });
                get().fetchRestrictedData();
                return { success: true };
              } else {
                return { success: false, error: data.error || "Erro de login desconhecido." };
              }
            } else if (contentType.includes("application/json")) {
              const data = await res.json();
              return { success: false, error: data.error || "Erro de login desconhecido." };
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Autenticação 100% via servidor: sem fallback direto ao Supabase no browser.
        return { success: false, error: "Código D. I. não encontrado. Verifique o seu código." };
      } catch (e) {
        // Erro genérico: nunca expor detalhes internos (stack/mensagens do engine).
        console.error("Login error", e);
        return { success: false, error: "Falha na conexão com o servidor. Tente novamente." };
      }
    },

    logout: async () => {
      if (isServerAvailable) {
        try {
          const headers: HeadersInit = {};
          const token = get().token;
          if (token) headers["Authorization"] = `Bearer ${token}`;
          await fetch("/api/auth/logout", { method: "POST", headers });
        } catch (e) {
          console.error("Logout fetch failed", e);
        }
      }
      localStorage.removeItem("fenix_user");
      localStorage.removeItem("fenix_token");
      set({
        user: null,
        loggedIn: false,
        token: null,
        moderationToken: null,
        restrictedData: null,
        adminStats: null,
        adminLogs: [],
        activeView: "inicio",
        activeCourse: null
      });
    },

    setModerationToken: (moderationToken) => {
      set({ moderationToken });
    },

    // Data Fetching Actions
    fetchPublicData: async () => {
      if (publicDataInflight) return publicDataInflight;
      publicDataInflight = (async () => {
      isServerAvailable = true;
      try {
        if (isServerAvailable) {
          try {
            const res = await fetch("/api/content/public");
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              const data = await res.json();
              if (data.hiddenHomeCardIds && Array.isArray(data.hiddenHomeCardIds)) {
                const currentLocal = get().hiddenHomeCardIds || [];
                const merged = Array.from(new Set([...currentLocal, ...data.hiddenHomeCardIds]));
                set({ hiddenHomeCardIds: merged });
                try {
                  localStorage.setItem("fenix_hidden_home_cards", JSON.stringify(merged));
                } catch (e) {}
              }
              set({ publicData: data });
              return;
            } else {
              console.warn("Express backend not available (returned non-JSON/HTML). Servidor indisponível — dados padrão.");
              isServerAvailable = false;
            }
          } catch (fetchErr) {
            console.warn("Express backend connection failed. Servidor indisponível — dados padrão.");
            isServerAvailable = false;
          }
        }

        // Sem fallback direto ao Supabase: o frontend NÃO acessa o banco.
        // Em caso de servidor indisponível, usa dados padrão (read-only).
        console.warn("Servidor indisponível. Usando dados padrão locais (read-only).");
        set({
            publicData: {
              leaderBio: defaultData.leaderBio,
              novidades: defaultData.novidades,
              cursos: defaultData.cursos.map(c => ({
                id: c.id,
                titulo: c.titulo,
                descricao: c.descricao,
                categoria: c.categoria,
                nivel: c.nivel,
                imagem: c.imagem,
                duracao: c.duracao,
                moduloCount: c.modulos?.length || 0
              })),
              materiais: defaultData.materiais.map(m => ({
                id: m.id,
                titulo: m.titulo,
                tipo: m.tipo,
                categoria: m.categoria,
                thumbnail: m.thumbnail,
                downloads: m.downloads,
                isPublic: m.isPublic,
                createdAt: m.createdAt
              })),
              banners: defaultData.banners || [],
              categoriasMateriais: defaultData.categoriasMateriais || ["Negócios", "Produtos", "Apresentação", "Planejamento"],
              tecnologias: defaultData.tecnologias || [],
              logoUrl: undefined,
              paginaTecnologias: defaultData.paginaTecnologias || [],
              paginaElite: defaultData.paginaElite || [],
              paginaBiografia: defaultData.paginaBiografia || []
            }
          });
      } catch (e) {
        console.error("Failed to fetch public data in fallback flow", e);
        set({
          publicData: {
            leaderBio: defaultData.leaderBio,
            novidades: defaultData.novidades,
            cursos: defaultData.cursos.map(c => ({
              id: c.id,
              titulo: c.titulo,
              descricao: c.descricao,
              categoria: c.categoria,
              nivel: c.nivel,
              imagem: c.imagem,
              duracao: c.duracao,
              moduloCount: c.modulos?.length || 0
            })),
            materiais: defaultData.materiais.map(m => ({
              id: m.id,
              titulo: m.titulo,
              tipo: m.tipo,
              categoria: m.categoria,
              thumbnail: m.thumbnail,
              downloads: m.downloads,
              isPublic: m.isPublic,
              createdAt: m.createdAt
            })),
            banners: defaultData.banners || [],
            categoriasMateriais: defaultData.categoriasMateriais || ["Negócios", "Produtos", "Apresentação", "Planejamento"],
            tecnologias: defaultData.tecnologias || [],
            logoUrl: undefined,
            paginaTecnologias: defaultData.paginaTecnologias || [],
            paginaElite: defaultData.paginaElite || [],
            paginaBiografia: defaultData.paginaBiografia || []
          }
        });
      }
      })();
      try {
        await publicDataInflight;
      } finally {
        publicDataInflight = null;
      }
    },

    fetchRestrictedData: async () => {
      if (!get().loggedIn) return;
      isServerAvailable = true;
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = {};
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/content/restricted", { headers });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              const data = await res.json();
              set({ restrictedData: data });
              const active = get().activeCourse;
              if (active) {
                const updated = data.cursos.find((c: Curso) => c.id === active.id);
                if (updated) {
                  set({ activeCourse: updated });
                }
              }
              return;
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Sem fallback direto ao Supabase: dados restritos vêm apenas da API do servidor.
        // Servidor indisponível → dados padrão (read-only), sem acesso ao banco.
        set({
          restrictedData: {
            cursos: defaultData.cursos,
            materiais: defaultData.materiais,
            categoriasMateriais: defaultData.categoriasMateriais || ["Negócios", "Produtos", "Apresentação", "Planejamento"],
            logoUrl: undefined
          }
        });
      } catch (e) {
        console.error("Failed to fetch restricted data in fallback flow", e);
      }
    },

    fetchAdminData: async () => {
      if (!get().loggedIn || get().user?.role !== "admin") return;
      get().fetchAdminDiCodes();
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = {};
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/admin/stats-and-logs", { headers });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              const data = await res.json();
              set({ adminStats: data.stats, adminDiList: data.diList || [], adminLogs: data.auditLogs || [] });
              return;
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Sem fallback direto ao Supabase: estatísticas admin só via API do servidor.
      } catch (e) {
        console.error("Failed to fetch admin statistics in fallback flow", e);
      }
    },

    fetchAdminDiCodes: async () => {
      if (!get().loggedIn || get().user?.role !== "admin") return;
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/admin/dis", { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.diCodes)) {
            set({ adminDiCodes: data.diCodes });
          }
        }
      } catch (e) {
        console.error("Failed to fetch admin D.I. codes", e);
      }
    },

    createDiCode: async (codigo: string, descricao: string) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/admin/dis", {
          method: "POST",
          headers,
          body: JSON.stringify({ codigo, descricao })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await get().fetchAdminDiCodes();
          await get().fetchAdminData();
          return { success: true, message: data.message };
        }
        return { success: false, error: data.error || "Erro ao cadastrar código D.I." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao cadastrar D.I." };
      }
    },

    toggleDiCodeStatus: async (id: string) => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/admin/dis/${id}/toggle`, {
          method: "PUT",
          headers
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await get().fetchAdminDiCodes();
          return { success: true };
        }
        return { success: false, error: data.error || "Erro ao alterar status do D.I." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro ao conectar com servidor." };
      }
    },

    deleteDiCode: async (id: string) => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/admin/dis/${id}`, {
          method: "DELETE",
          headers
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await get().fetchAdminDiCodes();
          await get().fetchAdminData();
          return { success: true };
        }
        return { success: false, error: data.error || "Erro ao excluir D.I." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro ao conectar com servidor." };
      }
    },

    downloadDiTemplate: async () => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/admin/dis/template", { headers });
        if (!res.ok) {
          return { success: false, error: "Não foi possível baixar o modelo CSV." };
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "modelo-cadastro-dis.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro ao baixar o modelo CSV." };
      }
    },

    exportDiCodes: async () => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/admin/dis/export-csv", { headers });
        if (!res.ok) {
          return { success: false, error: "Não foi possível baixar o CSV dos D.I.s cadastrados." };
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "dis-cadastrados.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro ao baixar o CSV dos D.I.s." };
      }
    },

    importDiCodes: async (file: File) => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/dis/import", {
          method: "POST",
          headers,
          body: fd
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await get().fetchAdminDiCodes();
          await get().fetchAdminData();
          return { success: true, report: data };
        }
        return { success: false, error: data.error || "Erro ao importar D.I.s.", report: data };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao importar D.I.s." };
      }
    },

    fetchSupportTickets: async () => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/support/tickets", { headers });
        const data = await res.json();
        if (res.ok && data.success) {
          set({ supportTickets: data.tickets, supportCounts: data.counts });
          return { success: true, tickets: data.tickets, counts: data.counts };
        }
        return { success: false, error: data.error || "Erro ao carregar chamados." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao carregar chamados." };
      }
    },

    createSupportTicket: async (assunto: string, texto: string, files?: File[]) => {
      try {
        const token = get().token;
        const hasFiles = !!files && files.length > 0;
        let body: BodyInit;
        const headers: HeadersInit = {};
        if (hasFiles) {
          const fd = new FormData();
          files.forEach((f) => fd.append("files", f));
          fd.append("assunto", assunto.trim());
          fd.append("texto", texto.trim());
          body = fd;
        } else {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify({ assunto, texto });
        }
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/support/tickets", {
          method: "POST",
          headers,
          body
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await get().fetchSupportTickets();
          return { success: true, ticket: data.ticket };
        }
        return { success: false, error: data.error || "Erro ao abrir chamado." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao abrir chamado." };
      }
    },

    addSupportMessage: async (id: string, texto: string) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/support/tickets/${id}/mensagens`, {
          method: "POST",
          headers,
          body: JSON.stringify({ texto })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await get().fetchSupportTickets();
          return { success: true, ticket: data.ticket };
        }
        return { success: false, error: data.error || "Erro ao enviar mensagem." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao enviar mensagem." };
      }
    },

    attachSupportFiles: async (id: string, files: File[], texto: string) => {
      try {
        const token = get().token;
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        if (texto.trim()) fd.append("texto", texto.trim());
        const headers: HeadersInit = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/support/tickets/${id}/anexos`, {
          method: "POST",
          headers,
          body: fd
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await get().fetchSupportTickets();
          return { success: true, ticket: data.ticket };
        }
        return { success: false, error: data.error || "Erro ao enviar anexos." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao enviar anexos." };
      }
    },

    setSupportTicketStatus: async (id: string, status: SupportTicketStatus) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/support/tickets/${id}/status`, {
          method: "POST",
          headers,
          body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await get().fetchSupportTickets();
          return { success: true, ticket: data.ticket };
        }
        return { success: false, error: data.error || "Erro ao alterar status." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao alterar status." };
      }
    },

    fetchSupportInbox: async () => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/support/inbox", { headers });
        const data = await res.json();
        if (res.ok && data.success) {
          set({
            supportTickets: data.tickets || [],
            supportCounts: data.counts || null,
            supportLeads: data.leads || []
          });
          return { success: true };
        }
        return { success: false, error: data.error || "Erro ao carregar a caixa de entrada." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao carregar a caixa de entrada." };
      }
    },

    setSupportLeadStatus: async (id: string, status: OuvidoriaMessage["status"]) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/support/ouvidoria/${id}/status`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          set({
            supportLeads: get().supportLeads.map((l) => (l.id === id ? { ...l, status } : l))
          });
          await get().fetchSupportInbox();
          return { success: true, message: data.message };
        }
        return { success: false, error: data.error || "Erro ao atualizar status do contato." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao atualizar status." };
      }
    },

    fetchSupportUsers: async () => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/admin/support-users", { headers });
        const data = await res.json();
        if (res.ok && data.success) {
          set({ supportUsers: data.users || [] });
          return { success: true, users: data.users || [] };
        }
        return { success: false, error: data.error || "Erro ao carregar usuários de suporte." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão." };
      }
    },

    saveSupportUser: async (data: { email: string; nome: string; senha?: string; ativo: boolean }) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/admin/support-users", {
          method: "POST",
          headers,
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (res.ok && result.success) {
          await get().fetchSupportUsers();
          return { success: true, message: result.message };
        }
        return { success: false, error: result.error || "Erro ao salvar usuário de suporte." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão." };
      }
    },

    // Admin redefine a senha de um responsável (nova senha temporária + troca
    // pendente no próximo acesso do responsável).
    resetSupportPassword: async (email: string, novaSenha: string) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/admin/support-users/${encodeURIComponent(email)}/reset-password`, {
          method: "POST",
          headers,
          body: JSON.stringify({ novaSenha })
        });
        const result = await res.json();
        if (res.ok && result.success) {
          await get().fetchSupportUsers();
          return { success: true, message: result.message };
        }
        return { success: false, error: result.error || "Erro ao redefinir a senha." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão." };
      }
    },

    // O responsável de suporte define a própria senha (1º acesso/após reset).
    changeSupportPassword: async (novaSenha: string) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/support/change-password", {
          method: "POST",
          headers,
          body: JSON.stringify({ novaSenha })
        });
        const result = await res.json();
        if (res.ok && result.success) {
          const u = get().user;
          if (u) set({ user: { ...u, mustChangePassword: false } });
          return { success: true, message: result.message };
        }
        return { success: false, error: result.error || "Erro ao alterar a senha." };
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão." };
      }
    },

    // Downloads
    recordDownload: async (id) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = {};
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch(`/api/content/download/${id}`, { method: "POST", headers });
            if (res.ok) {
              // Update counts locally (instant feedback)
              if (get().restrictedData) {
                const updatedMateriais = get().restrictedData!.materiais.map((m) => {
                  if (m.id === id) {
                    return { ...m, downloads: m.downloads + 1 };
                  }
                  return m;
                });
                set({
                  restrictedData: {
                    ...get().restrictedData!,
                    materiais: updatedMateriais
                  }
                });
              }
              if (get().publicData) {
                const updatedTeaser = get().publicData!.materiais.map((m) => {
                  if (m.id === id) {
                    return { ...m, downloads: m.downloads + 1 };
                  }
                  return m;
                });
                set({
                  publicData: {
                    ...get().publicData!,
                    materiais: updatedTeaser
                  }
                });
              }
              return;
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Sem fallback direto: contagem de downloads é registrada somente pelo servidor.
      } catch (e) {
        console.error("Failed to register download in fallback flow", e);
      }
    },

    // Admin mutations
    saveBanner: async (banner) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = { "Content-Type": "application/json" };
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/admin/banners", {
              method: "POST",
              headers,
              body: JSON.stringify(banner)
            });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              const data = await res.json();
              if (data.success) {
                await get().fetchPublicData();
                await get().fetchAdminData();
                return { success: true };
              } else {
                return { success: false, error: data.error };
              }
            }
          } catch (e) {
            console.warn("saveBanner server fetch error:", e);
          }
        }

        return { success: false, error: "Serviço de banco de dados indisponível (sem acesso direto do browser)." };
      } catch (e: any) {
        return { success: false, error: e.message || "Falha ao salvar banner." };
      }
    },

    deleteBanner: async (id) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = {};
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            await fetch(`/api/admin/banners/${id}`, { method: "DELETE", headers });
          } catch (e) {
            console.warn("deleteBanner server fetch error:", e);
          }
        }

        // Sem fallback direto ao Supabase: exclusão de banner apenas via API do servidor.

        await get().fetchPublicData();
        await get().fetchAdminData();
        return true;
      } catch (e) {
        console.error("Erro ao deletar banner:", e);
        return false;
      }
    },

    saveNovidade: async (novidade) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = { "Content-Type": "application/json" };
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/admin/novidades", {
              method: "POST",
              headers,
              body: JSON.stringify(novidade)
            });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              await get().fetchPublicData();
              await get().fetchAdminData();
              return { success: true };
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Sem fallback direto ao Supabase: novidade só é salva via API do servidor.
        return { success: false, error: "Serviço de banco de dados indisponível (sem acesso direto do browser)." };
      } catch (e: any) {
        return { success: false, error: e.message || "Falha de conexão ao salvar novidade." };
      }
    },

    deleteNovidade: async (id) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = {};
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            await fetch(`/api/admin/novidades/${id}`, { method: "DELETE", headers });
          } catch (e) {
            console.warn("deleteNovidade server fetch error:", e);
          }
        }

        // Sem fallback direto ao Supabase: exclusão de novidade apenas via servidor.

        const currentPublic = get().publicData || { leaderBio: {} as any, novidades: [], tecnologias: [], cursos: [], materiais: [], categoriasMateriais: [], solucoesInstitucionais: [] };

        set({
          publicData: {
            ...currentPublic,
            novidades: (currentPublic.novidades || []).filter((n) => n.id !== id)
          }
        });

        get().fetchPublicData().catch(() => {});
        get().fetchAdminData().catch(() => {});

        return true;
      } catch (e) {
        console.error("Failed to delete novidade", e);
      }
      return false;
    },

    saveCurso: async (curso) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = { "Content-Type": "application/json" };
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/admin/cursos", {
              method: "POST",
              headers,
              body: JSON.stringify(curso)
            });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              const resData = await res.json();
              if (resData.item) {
                const saved = resData.item;
                const currentActive = get().activeCourse;
                if (currentActive && (currentActive.id === saved.id || (currentActive.titulo || "").trim().toLowerCase() === (saved.titulo || "").trim().toLowerCase())) {
                  set({ activeCourse: saved });
                }
              }
              await get().fetchPublicData();
              await get().fetchRestrictedData();
              await get().fetchAdminData();
              return { success: true };
            } else if (contentType.includes("application/json")) {
              const errData = await res.json();
              return { success: false, error: errData.error || "Erro ao salvar curso no servidor." };
            } else if (res.status === 413) {
              return { success: false, error: "O tamanho do curso (arquivos de mídia) excede o limite permitido." };
            } else {
              return { success: false, error: `Erro no servidor (${res.status}).` };
            }
          } catch (e: any) {
            console.warn("Server API fetch error in saveCurso:", e);
            isServerAvailable = false;
          }
        }

        // Sem fallback direto ao Supabase: curso só é salvo via API do servidor (sem validação no browser).
        return { success: false, error: "Serviço de banco de dados indisponível (sem acesso direto do browser)." };
      } catch (e: any) {
        return { success: false, error: e.message || "Falha de conexão ao salvar curso." };
      }
    },

    deleteCurso: async (id) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = {};
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            await fetch(`/api/admin/cursos/${id}`, { method: "DELETE", headers });
          } catch (e) {
            console.warn("deleteCurso server fetch error:", e);
          }
        }

        // Sem fallback direto ao Supabase: exclusão de curso apenas via servidor.

        const currentRestricted = get().restrictedData || { cursos: [], materiais: [], categoriasMateriais: [] };
        const currentPublic = get().publicData || { leaderBio: {} as any, novidades: [], tecnologias: [], cursos: [], materiais: [], categoriasMateriais: [], solucoesInstitucionais: [] };

        set({
          restrictedData: {
            ...currentRestricted,
            cursos: (currentRestricted.cursos || []).filter((c: any) => c.id !== id)
          },
          publicData: {
            ...currentPublic,
            cursos: (currentPublic.cursos || []).filter((c: any) => c.id !== id)
          }
        });

        get().fetchPublicData().catch(() => {});
        get().fetchRestrictedData().catch(() => {});
        get().fetchAdminData().catch(() => {});

        return true;
      } catch (e) {
        console.error("Failed to delete curso", e);
      }
      return false;
    },

    saveMaterial: async (material) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = { "Content-Type": "application/json" };
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/admin/materiais", {
              method: "POST",
              headers,
              body: JSON.stringify(material)
            });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              await get().fetchPublicData();
              await get().fetchRestrictedData();
              await get().fetchAdminData();
              return { success: true };
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Sem fallback direto ao Supabase: material só é salvo via API do servidor.
        return { success: false, error: "Serviço de banco de dados indisponível (sem acesso direto do browser)." };
      } catch (e: any) {
        return { success: false, error: e.message || "Falha de conexão ao salvar material." };
      }
    },

    deleteMaterial: async (id) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = {};
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            await fetch(`/api/admin/materiais/${id}`, { method: "DELETE", headers });
          } catch (e) {
            console.warn("deleteMaterial server fetch error:", e);
          }
        }

        // Sem fallback direto ao Supabase: exclusão de material apenas via servidor.

        const currentRestricted = get().restrictedData || { cursos: [], materiais: [], categoriasMateriais: [] };
        const currentPublic = get().publicData || { leaderBio: {} as any, novidades: [], tecnologias: [], cursos: [], materiais: [], categoriasMateriais: [], solucoesInstitucionais: [] };

        set({
          restrictedData: {
            ...currentRestricted,
            materiais: (currentRestricted.materiais || []).filter((m: any) => m.id !== id)
          },
          publicData: {
            ...currentPublic,
            materiais: (currentPublic.materiais || []).filter((m: any) => m.id !== id)
          }
        });

        get().fetchPublicData().catch(() => {});
        get().fetchRestrictedData().catch(() => {});
        get().fetchAdminData().catch(() => {});

        return true;
      } catch (e) {
        console.error("Failed to delete material", e);
      }
      return false;
    },

    updateLeaderBio: async (bio) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = { "Content-Type": "application/json" };
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/admin/leader-bio", {
              method: "POST",
              headers,
              body: JSON.stringify(bio)
            });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              await get().fetchPublicData();
              await get().fetchAdminData();
              return { success: true };
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Sem fallback direto ao Supabase: bio só via API do servidor.
        return { success: false, error: "Serviço de banco de dados indisponível (sem acesso direto do browser)." };
      } catch (e: any) {
        return { success: false, error: e.message || "Falha de conexão ao salvar biografia." };
      }
    },

    saveCategoriasMateriais: async (categorias) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = { "Content-Type": "application/json" };
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/admin/categorias-materiais", {
              method: "POST",
              headers,
              body: JSON.stringify({ categorias })
            });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              await get().fetchPublicData();
              await get().fetchRestrictedData();
              await get().fetchAdminData();
              return { success: true };
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Sem fallback direto ao Supabase: categorias só via API do servidor.
        return { success: false, error: "Serviço de banco de dados indisponível (sem acesso direto do browser)." };
      } catch (e: any) {
        return { success: false, error: e.message || "Falha de conexão ao salvar categorias." };
      }
    },

    uploadLogo: async (logoBase64) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = { "Content-Type": "application/json" };
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/admin/logo", {
              method: "POST",
              headers,
              body: JSON.stringify({ logoBase64 })
            });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              const data = await res.json();
              await get().fetchPublicData();
              await get().fetchRestrictedData();
              await get().fetchAdminData();
              return { success: true, logoUrl: data.logoUrl };
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Sem fallback direto ao Supabase: logo só via API do servidor.
        return { success: false, error: "Serviço de banco de dados indisponível (sem acesso direto do browser)." };
      } catch (e: any) {
        return { success: false, error: e.message || "Falha de conexão ao salvar logo." };
      }
    },

    uploadFile: async (fileBase64, fileName, folder) => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = { "Content-Type": "application/json" };
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/admin/upload-file", {
              method: "POST",
              headers,
              body: JSON.stringify({ fileBase64, fileName, folder })
            });
            const contentType = res.headers.get("content-type") || "";
            if (res.ok && contentType.includes("application/json")) {
              const data = await res.json();
              return { success: true, url: data.url };
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }
        return { success: true, url: fileBase64 };
      } catch (e: any) {
        return { success: false, error: e.message || "Falha de conexão ao fazer upload do arquivo." };
      }
    },

    resetLogo: async () => {
      try {
        if (isServerAvailable) {
          try {
            const headers: HeadersInit = {};
            const token = get().token;
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/admin/logo/reset", {
              method: "POST",
              headers
            });
            if (res.ok) {
              await get().fetchPublicData();
              await get().fetchRestrictedData();
              await get().fetchAdminData();
              return true;
            } else {
              isServerAvailable = false;
            }
          } catch (e) {
            isServerAvailable = false;
          }
        }

        // Sem fallback direto ao Supabase: reset de logo só via API do servidor.
      } catch (e) {
        console.error("Failed to reset logo", e);
      }
      return false;
    },

    // Fenix Social Actions
    fetchFenixPosts: async () => {
      try {
        const res = await fetch("/api/fenix-social/posts");
        if (res.ok) {
          const data = await res.json();
          set({ fenixPosts: data.posts || [] });
        }
      } catch (e) {
        console.error("Failed to fetch fenix posts:", e);
      }
    },

    fetchPendingFenixPosts: async (modToken?: string) => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (modToken) headers["x-moderator-token"] = modToken;

        const url = "/api/fenix-social/moderacao";
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          set({ pendingFenixPosts: data.posts || [] });
        }
      } catch (e) {
        console.error("Failed to fetch pending fenix posts:", e);
      }
    },

    fetchAllFenixPostsAdmin: async () => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/fenix-social/admin/all-posts", { headers });
        if (res.ok) {
          const data = await res.json();
          set({ allFenixPosts: data.posts || [] });
        }
      } catch (e) {
        console.error("Failed to fetch all fenix posts for admin:", e);
      }
    },

    createFenixPost: async (postData) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/fenix-social/posts", {
          method: "POST",
          headers,
          body: JSON.stringify(postData)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          return { success: true, message: data.message };
        } else {
          return { success: false, error: data.error || "Falha ao enviar publicação." };
        }
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao enviar publicação." };
      }
    },

    likeFenixPost: async (id) => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/fenix-social/posts/${id}/like`, { method: "POST", headers });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            set((state) => ({
              fenixPosts: state.fenixPosts.map((p) =>
                p.id === id ? { ...p, likes: data.likes } : p
              )
            }));
            return true;
          }
        }
      } catch (e) {
        console.error("Failed to like fenix post:", e);
      }
      return false;
    },

    commentFenixPost: async (id, texto, usuarioNome) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/fenix-social/posts/${id}/comment`, {
          method: "POST",
          headers,
          body: JSON.stringify({ texto, usuarioNome })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.comment) {
            set((state) => ({
              fenixPosts: state.fenixPosts.map((p) =>
                p.id === id ? { ...p, comentarios: [...(p.comentarios || []), data.comment] } : p
              )
            }));
            return true;
          }
        }
      } catch (e) {
        console.error("Failed to comment on fenix post:", e);
      }
      return false;
    },

    approveFenixPost: async (id, modToken?: string) => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (modToken) headers["x-moderator-token"] = modToken;

        const url = `/api/fenix-social/moderacao/${id}/aprovar`;
        const res = await fetch(url, { method: "POST", headers });
        if (res.ok) {
          set((state) => ({
            pendingFenixPosts: state.pendingFenixPosts.filter((p) => p.id !== id),
            allFenixPosts: state.allFenixPosts.map((p) => (p.id === id ? { ...p, status: "aprovado" } : p))
          }));
          get().fetchFenixPosts();
          if (get().user?.role === "admin") {
            get().fetchAllFenixPostsAdmin();
          }
          return true;
        } else {
          console.warn("Server approve response not ok:", res.status);
        }
      } catch (e) {
        console.warn("Server fetch error in approveFenixPost:", e);
      }

      return false;
    },

    rejectFenixPost: async (id, modToken?: string) => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (modToken) headers["x-moderator-token"] = modToken;

        const url = `/api/fenix-social/moderacao/${id}/recusar`;
        const res = await fetch(url, { method: "POST", headers });
        if (res.ok) {
          set((state) => ({
            pendingFenixPosts: state.pendingFenixPosts.filter((p) => p.id !== id),
            allFenixPosts: state.allFenixPosts.filter((p) => p.id !== id),
            fenixPosts: state.fenixPosts.filter((p) => p.id !== id)
          }));
          if (get().user?.role === "admin") {
            get().fetchAllFenixPostsAdmin();
          }
          return true;
        } else {
          console.warn("Server reject response not ok:", res.status);
        }
      } catch (e) {
        console.warn("Server fetch error in rejectFenixPost:", e);
      }

      return false;
    },

    updateFenixPostAdmin: async (id, updates) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`/api/fenix-social/admin/posts/${id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(updates)
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.post) {
            set((state) => ({
              allFenixPosts: state.allFenixPosts.map((p) => (p.id === id ? data.post : p))
            }));
            get().fetchFenixPosts();
            return true;
          }
        }
      } catch (e) {
        console.error("Failed to update fenix post in admin:", e);
      }
      return false;
    },

    deleteFenixPostAdmin: async (id) => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`/api/fenix-social/admin/posts/${id}`, {
          method: "DELETE",
          headers
        });

        if (res.ok) {
          set((state) => ({
            allFenixPosts: state.allFenixPosts.filter((p) => p.id !== id),
            fenixPosts: state.fenixPosts.filter((p) => p.id !== id),
            pendingFenixPosts: state.pendingFenixPosts.filter((p) => p.id !== id)
          }));
          return true;
        }
      } catch (e) {
        console.error("Failed to delete fenix post in admin:", e);
      }
      return false;
    },

    fetchModeratorLinks: async () => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch("/api/fenix-social/admin/moderator-links", { headers });
        if (res.ok) {
          const data = await res.json();
          set({ moderatorLinks: data.links || [] });
        }
      } catch (e) {
        console.error("Failed to fetch moderator links:", e);
      }
    },

    createModeratorLink: async (moderadorNome) => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch("/api/fenix-social/admin/moderator-links", {
          method: "POST",
          headers,
          body: JSON.stringify({ moderadorNome })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          set((state) => ({
            moderatorLinks: [data.link, ...state.moderatorLinks]
          }));
          return { success: true, link: data.link };
        } else {
          return { success: false, error: data.error || "Falha ao criar link de moderador." };
        }
      } catch (e: any) {
        return { success: false, error: e.message || "Erro de conexão ao criar link." };
      }
    },

    deleteModeratorLink: async (id) => {
      try {
        const headers: HeadersInit = {};
        const token = get().token;
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`/api/fenix-social/admin/moderator-links/${id}`, {
          method: "DELETE",
          headers
        });

        if (res.ok) {
          set((state) => ({
            moderatorLinks: state.moderatorLinks.filter((l) => l.id !== id)
          }));
          return true;
        }
      } catch (e) {
        console.error("Failed to delete moderator link:", e);
      }
      return false;
    },

    // Progress actions
    toggleLessonCompleted: (lessonId) => {
      const current = get().completedLessons;
      const isCompleted = current.includes(lessonId);
      const updated = isCompleted
        ? current.filter((id) => id !== lessonId)
        : [...current, lessonId];

      set({ completedLessons: updated });
      try {
        localStorage.setItem("fenix_completed_lessons", JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
    },

    saveLessonProgress: (lessonId, percentage) => {
      const current = get().lessonProgress;
      const updated = { ...current, [lessonId]: percentage };
      set({ lessonProgress: updated });
      try {
        localStorage.setItem("fenix_lesson_progress", JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
    },

    // Home Card Management Actions
    hideHomeCard: async (cardId: string) => {
      const current = get().hiddenHomeCardIds || [];
      if (!current.includes(cardId)) {
        const next = [...current, cardId];
        set({ hiddenHomeCardIds: next });
        try {
          localStorage.setItem("fenix_hidden_home_cards", JSON.stringify(next));
        } catch (e) {}

        if (isServerAvailable) {
          try {
            const headers: HeadersInit = { "Content-Type": "application/json" };
            const token = get().token || localStorage.getItem("fenix_token");
            if (token) headers["Authorization"] = `Bearer ${token}`;
            await fetch("/api/admin/hidden-home-cards", {
              method: "POST",
              headers,
              body: JSON.stringify({ hiddenHomeCardIds: next })
            });
          } catch (e) {
            console.warn("Failed to sync hidden cards to server", e);
          }
        }
      }
    },

    restoreHomeCard: async (cardId: string) => {
      const current = get().hiddenHomeCardIds || [];
      const next = current.filter((id) => id !== cardId);
      set({ hiddenHomeCardIds: next });
      try {
        localStorage.setItem("fenix_hidden_home_cards", JSON.stringify(next));
      } catch (e) {}

      if (isServerAvailable) {
        try {
          const headers: HeadersInit = { "Content-Type": "application/json" };
          const token = get().token || localStorage.getItem("fenix_token");
          if (token) headers["Authorization"] = `Bearer ${token}`;
          await fetch("/api/admin/hidden-home-cards", {
            method: "POST",
            headers,
            body: JSON.stringify({ hiddenHomeCardIds: next })
          });
        } catch (e) {
          console.warn("Failed to sync hidden cards to server", e);
        }
      }
    },

    toggleHideHomeCard: async (cardId: string) => {
      const current = get().hiddenHomeCardIds || [];
      if (current.includes(cardId)) {
        await get().restoreHomeCard(cardId);
      } else {
        await get().hideHomeCard(cardId);
      }
    }
  };
});
