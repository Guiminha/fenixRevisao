import React, { useState, useEffect, useRef } from "react";
import { AdminOverview } from './AdminOverview';
import { ExternalServers } from './ExternalServers';
import { UploadProgressBar, UploadProgressState } from "./UploadProgressBar";
import { uploadFileWithProgress } from "../utils/uploadWithProgress";
import { useStore } from "../store";
import { parseVimeoInput } from "../utils/vimeoHelper";
import { 
  Plus, 
  Trash, 
  Edit, 
  BarChart3, 
  FolderDown, 
  GraduationCap, 
  Users, 
  Flame, 
  Clock, 
  Activity, 
  Save, 
  Undo2, 
  AlertTriangle,
  AlertCircle,
  Upload,
  Loader2,
  Globe,
  Settings,
  Sparkles,
  ArrowUpRight,
  FileText,
  Lock,
  Calendar,
  CheckCircle2,
  XCircle,
  Trash2,
  ListPlus,
  PlayCircle,
  Video,
  FileSpreadsheet,
  Image as ImageIcon,
  GripVertical,
  ArrowUp,
  ArrowDown,
  FileVideo,
  Film,
  Youtube,
  ListVideo,
  Play,
  UserCheck,
  LifeBuoy,
  Link2,
  Eye,
  EyeOff,
  Pencil,
  Mail,
  Search,
  Download,
  Check,
  Filter,
  X,
  HardDrive,
  Database,
  Server,
  Wifi,
  WifiOff,
  FolderKanban,
  UploadCloud,
  ExternalLink,
  Copy,
  RefreshCw,
  Key,
  Printer,
  KeyRound,
  ShieldCheck,
  SendHorizonal
} from "lucide-react";
import FenixMediaCarousel from "./FenixMediaCarousel";
import PaginaEditor from "./PaginaEditor";
import { Curso, Material, Novidade, Banner } from "../types";
import { Layers } from "lucide-react";

export default function AdminView() {
  const { 
    user, 
    loggedIn, 
    token,
    adminDiCodes = [],
    fetchAdminDiCodes,
    createDiCode,
    toggleDiCodeStatus,
    deleteDiCode,
    downloadDiTemplate,
    exportDiCodes,
    importDiCodes,
    publicData,
    restrictedData,
    fetchPublicData,
    fetchRestrictedData,
    saveBanner,
    deleteBanner,
    saveNovidade, 
    deleteNovidade,
    saveCurso, 
    deleteCurso,
    saveMaterial, 
    deleteMaterial,
    saveCategoriasMateriais,
    uploadLogo,
    resetLogo,
    uploadFile,
    allFenixPosts,
    fetchAllFenixPostsAdmin,
    updateFenixPostAdmin,
    deleteFenixPostAdmin,
    approveFenixPost,
    rejectFenixPost,
    moderatorLinks,
    fetchModeratorLinks,
    createModeratorLink,
    deleteModeratorLink,
    supportUsers,
    fetchSupportUsers,
    saveSupportUser,
    resetSupportPassword,
    hiddenHomeCardIds = [],
    hideHomeCard,
    restoreHomeCard,
    toggleHideHomeCard,
    fenixPosts,
    setActiveView,
    setActiveCourse,
    setSubView,
    adminActiveTab,
    setAdminActiveTab,
    fetchNfStatus,
    dispararNfSync,
    fetchDisFenixPage,
    fetchSituacoesPermitidas,
    saveSituacoesPermitidas,
    nfStatus
  } = useStore();

  const activeTab = adminActiveTab;
  const setActiveTab = setAdminActiveTab;
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchDI, setSearchDI] = useState("");

  // ---- Nipponflex (D.I.s via API) state & handlers ----
  const [nfEstado, setNfEstado] = useState<any>(null);
  const [nfMetricas, setNfMetricas] = useState<any>(null);
  const [nfSituacoes, setNfSituacoes] = useState<string[]>(["A"]);
  const [nfItens, setNfItens] = useState<any[]>([]);
  const [nfTotal, setNfTotal] = useState(0);
  const [nfTotalPaginas, setNfTotalPaginas] = useState(0);
  const [nfPagina, setNfPagina] = useState(1);
  const [nfBusca, setNfBusca] = useState("");
  const [nfFiltroSit, setNfFiltroSit] = useState("todos");
  const [nfCarregando, setNfCarregando] = useState(false);
  const [nfSyncing, setNfSyncing] = useState(false);
  const [nfCarregandoStatus, setNfCarregandoStatus] = useState(false);
  const [nfLogs, setNfLogs] = useState<any[]>([]);
  // Quando "Limpar Logs" é clicado, guardamos um "marco": logs que existiam antes
  // da limpeza. Assim o auto-refresh/recarregar só exibe logs NOVOS (que vieram
  // depois da limpeza), mantendo a janela limpa até o próximo log.
  const nfLogsAncoradosRef = useRef<any[] | null>(null);

  // Filtra logs recebidos do backend: se houve limpeza nesta sessão, mostra só os
  // que NÃO estavam no snapshot da limpeza; caso contrário, mostra tudo.
  const filtrarLogsNovos = (incoming: any[]) => {
    const ancora = nfLogsAncoradosRef.current;
    if (!ancora || !Array.isArray(incoming)) return incoming;
    return incoming.filter(
      (l) => !ancora.some((a) => a && (l?.id ? a.id === l.id : a.ts === l?.ts && a.msg === l?.msg))
    );
  };

  const NfSitBadge = ({ situacao }: { situacao: string }) => {
    const mapa: Record<string, { l: string; c: string }> = {
      A: { l: "Ativo", c: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
      I: { l: "Inativo", c: "text-slate-300 bg-white/5 border-white/10" },
      P: { l: "Pendente", c: "text-amber-400 bg-amber-500/10 border-amber-500/25" },
      S: { l: "Suspenso", c: "text-orange-400 bg-orange-500/10 border-orange-500/25" },
      D: { l: "Descredenciado", c: "text-red-400 bg-red-500/10 border-red-500/25" }
    };
    const info = mapa[situacao] || mapa.I;
    return <span className={`inline-block px-2.5 py-1 rounded-full border text-[10px] font-bold ${info.c}`}>{info.l} ({situacao})</span>;
  };

  const nfStatusBadge = nfEstado?.status === "ok" && nfEstado?.ultimaSincronizacao
    ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider"><CheckCircle2 className="w-3.5 h-3.5" /> Ok</span>
    : nfEstado?.status === "ok"
    ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[#94a3b8] text-[10px] font-bold uppercase tracking-wider"><Database className="w-3.5 h-3.5" /> Sem dados</span>
    : nfEstado?.status === "em_andamento"
    ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase tracking-wider"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Em andamento</span>
    : <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider"><XCircle className="w-3.5 h-3.5" /> Erro</span>;

  const nfUltimaAtualizacao = nfEstado?.ultimaSincronizacao
    ? new Date(nfEstado.ultimaSincronizacao).toLocaleString("pt-BR")
    : nfEstado?.status === "em_andamento"
    ? "Sincronizando..."
    : "Nunca sincronizado";

  // Verifica se existe relatório com dados de alterações para exibir o card
  const nfTemRelatorio = nfEstado?.relatorioVersao === 2 && !!nfEstado?.ultimaSincronizacao && nfEstado?.status !== 'em_andamento';
  const nfNovosDetalhes: { codigo: string; nome: string; situacao: string }[] = (nfEstado as any)?.novosDetalhes || [];
  const nfSituacoesAlteradas: { codigo: string; nome: string; anterior: string; nova: string }[] = nfEstado?.situacoesAlteradas || [];
  // Agrupa as transições de situação: "A→I", "I→A", etc.
  const nfTransicoesAgrupadas = nfSituacoesAlteradas.reduce((acc: Record<string, number>, alt) => {
    const chave = `${alt.anterior}→${alt.nova}`;
    acc[chave] = (acc[chave] || 0) + 1;
    return acc;
  }, {});

  const carregarNfStatus = async () => {
    if (nfCarregandoStatus) return;
    setNfCarregandoStatus(true);
    const res = await fetchNfStatus();
    if (res.success) {
      setNfEstado(res.estado);
      setNfMetricas(res.metricas);
      setNfLogs(filtrarLogsNovos(res.logs || []));
    }
    setNfCarregandoStatus(false);
  };

  const carregarNfDados = async () => {
    setNfCarregando(true);
    const res = await fetchDisFenixPage({ pagina: nfPagina, busca: nfBusca, situacao: nfFiltroSit });
    if (res.success) {
      setNfItens(res.itens || []);
      setNfTotal(res.total || 0);
      setNfTotalPaginas(res.totalPaginas || 0);
    }
    setNfCarregando(false);
  };

  const handleNfSync = async () => {
    if (!window.confirm("Iniciar a sincronização com a API Nipponflex agora? Isso pode levar alguns minutos.")) return;
    setNfSyncing(true);
    const res = await dispararNfSync();
    setNfSyncing(false);
    if (res.success) {
      triggerNotification("success", "Sincronização iniciada. Acompanhe o status do sistema.");
    } else {
      triggerNotification("error", res.erro || "Não foi possível iniciar a sincronização.");
    }
    // Carrega o status para refletir "em andamento"
    await carregarNfStatus();
  };

  const toggleNfSituacao = (v: string) => {
    setNfSituacoes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  };

  const handleSalvarSituacoes = async () => {
    const res = await saveSituacoesPermitidas(nfSituacoes);
    if (res.success) {
      triggerNotification("success", "Configuração de acesso salva.");
    } else {
      triggerNotification("error", res.error || "Erro ao salvar.");
    }
  };

  const baixarLogMd = () => {
    const data = new Date().toLocaleString("pt-BR");
    const linhas = nfLogs.length
      ? nfLogs.map((l) => `- \`${l.ts}\` **${l.nivel}**: ${l.msg}`).join("\n")
      : "Nenhum log registrado.";
    const conteudo = `# Log da Sincronização Nipponflex\n\n- **Data de exportação:** ${data}\n- **Status:** ${nfEstado?.status || "—"}\n- **Última atualização:** ${nfEstado?.ultimaSincronizacao ? new Date(nfEstado.ultimaSincronizacao).toLocaleString("pt-BR") : "—"}\n\n## Logs\n\n${linhas}\n`;
    const blob = new Blob([conteudo], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const nome = `log-nipponflex-${new Date().toISOString().slice(0, 10)}.md`;
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Limpa apenas a lista de logs exibida nesta tela (sem tocar no backend).
  // Guarda o "marco" para que, enquanto esta sessão não recarregar a página,
  // apenas logs NOVOS voltem a aparecer (fica limpo até o próximo log).
  const handleLimparLogs = () => {
    nfLogsAncoradosRef.current = nfLogs;
    setNfLogs([]);
  };

  useEffect(() => {
    if (activeTab === "cadastrar-di") {
      carregarNfStatus();
      fetchSituacoesPermitidas().then((r) => { if (r.success && r.situacoes) setNfSituacoes(r.situacoes); });
    }
  }, [activeTab]);

  // Auto-atualização do status/logs enquanto houver sincronização em andamento
  useEffect(() => {
    if (activeTab !== "cadastrar-di") return;
    if (nfEstado?.status !== "em_andamento") return;
    const id = setInterval(async () => {
      const res = await fetchNfStatus();
      if (res.success) {
        setNfEstado(res.estado);
        setNfMetricas(res.metricas);
        setNfLogs(filtrarLogsNovos(res.logs || []));
        // Quando termina, recarrega a lista de D.I.s
        if (res.estado?.status !== "em_andamento") {
          carregarNfDados();
        }
      }
    }, 5000);
    return () => clearInterval(id);
  }, [activeTab, nfEstado?.status]);

  useEffect(() => {
    if (activeTab === "cadastrar-di") {
      const t = setTimeout(() => carregarNfDados(), 300);
      return () => clearTimeout(t);
    }
  }, [activeTab, nfPagina, nfBusca, nfFiltroSit]);


  // --- STATUS DAS INTEGRAÇÕES (Supabase Storage + Vimeo) ---
  // As credenciais NÃO são editáveis nem exibidas no painel: vivem em variáveis
  // de ambiente (SUPABASE_*/VIMEO_*). Aqui só há STATUS.
  const [fetchingVimeoLessonId, setFetchingVimeoLessonId] = useState<string | null>(null);

  // --- VIMEO VIDEO PICKER MODAL STATES (multiseleção) ---
  const [showVimeoPickerModal, setShowVimeoPickerModal] = useState(false);
  const [vimeoPickerSelected, setVimeoPickerSelected] = useState<Record<string, boolean>>({});
  const [vimeoAccountVideos, setVimeoAccountVideos] = useState<any[]>([]);
  const [vimeoAccountInfo, setVimeoAccountInfo] = useState<any>(null);
  const [vimeoPickerLoading, setVimeoPickerLoading] = useState(false);
  const [vimeoPickerError, setVimeoPickerError] = useState<string | null>(null);
  const [vimeoPickerSearch, setVimeoPickerSearch] = useState("");
  const [vimeoPickerPage, setVimeoPickerPage] = useState(1);
  const [vimeoPickerTotal, setVimeoPickerTotal] = useState(0);

  const [lessonUploadProgress, setLessonUploadProgress] = useState<Record<string, UploadProgressState>>({});

  // --- CARDS HOME MANAGEMENT STATES & HELPERS ---
  const [cardsHomeFilterCategory, setCardsHomeFilterCategory] = useState<"todos" | "curso" | "material" | "novidade" | "fenix-social" | "exibidos" | "ocultos">("todos");
  const [cardsHomeSearch, setCardsHomeSearch] = useState("");
  const [copiedCardUrlId, setCopiedCardUrlId] = useState<string | null>(null);

  const getCardPublicationPath = (item: any): string => {
    if (!item) return "/inicio";

    const type = item.cardType || item.contentType || item.displayType;

    if (type === "curso" || type === "course" || item.modulos) {
      return `/escola-fenix?curso=${item.id}`;
    }
    if (type === "material" || item.fileUrl) {
      return `/conteudos?material=${item.id}`;
    }
    if (type === "fenix-social") {
      return `/fenix-social?post=${item.id}`;
    }
    if (type === "novidade" || type === "news") {
      if (item.linkType === "curso" && item.linkTarget) {
        return `/escola-fenix?curso=${item.linkTarget}`;
      }
      if (item.linkType === "material") {
        return `/conteudos?material=${item.linkTarget || ""}`;
      }
      if (item.linkType === "fenix-social") {
        return `/fenix-social?post=${item.linkTarget || ""}`;
      }
      if (item.linkType === "pagina" && item.linkTarget) {
        return `/${item.linkTarget}`;
      }
      if (item.linkType === "externo" && item.linkTarget) {
        return item.linkTarget;
      }
      return `/inicio#novidade-${item.id}`;
    }

    return `/inicio`;
  };

  const copyCardUrl = (card: any) => {
    const relPath = getCardPublicationPath(card);
    const fullUrl = relPath.startsWith("http") ? relPath : `${window.location.origin}${relPath}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedCardUrlId(card.id);
    setTimeout(() => setCopiedCardUrlId(null), 2500);
  };

  const allHomeCards = React.useMemo(() => {
    const novs = (publicData?.novidades || []).map((n) => ({
      ...n,
      cardType: "novidade" as const,
      typeName: "Novidade",
      typeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      imagem: n.imagem || "/uploads/grupo_fenix_lider_bio.jpg",
      titulo: n.titulo,
      categoria: n.categoria || "Novidade"
    }));

    const cur = (restrictedData?.cursos || publicData?.cursos || []).map((c) => ({
      ...c,
      cardType: "curso" as const,
      typeName: "Curso",
      typeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      imagem: c.imagem || "/uploads/grupo_fenix_lider_bio.jpg",
      titulo: c.titulo,
      categoria: c.secao === "series" || c.secao === "treinamentos" ? "Treinamento" : "Curso"
    }));

    const mat = (restrictedData?.materiais || publicData?.materiais || []).map((m) => ({
      ...m,
      cardType: "material" as const,
      typeName: "Material",
      typeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      imagem: m.thumbnail || m.fileUrl || "/uploads/grupo_fenix_lider_bio.jpg",
      titulo: m.titulo,
      categoria: m.categoria ? `Material • ${m.categoria}` : "Material"
    }));

    const posts = (fenixPosts || [])
      .filter((p) => p.status === "aprovado" || !p.status)
      .map((p) => ({
        ...p,
        cardType: "fenix-social" as const,
        typeName: "Fênix Social",
        typeColor: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        imagem: p.mediaUrl || (p.mediaUrls && p.mediaUrls[0]) || "/uploads/grupo_fenix_lider_bio.jpg",
        titulo: p.titulo || p.legenda || `Post de ${p.usuarioNome}`,
        categoria: `Fênix Social • ${p.usuarioNome || "Comunidade"}`
      }));

    return [...novs, ...cur, ...mat, ...posts];
  }, [publicData, restrictedData, fenixPosts]);

  const filteredHomeCards = allHomeCards.filter((card) => {
    const isHidden = (hiddenHomeCardIds || []).includes(card.id) || (hiddenHomeCardIds || []).includes(`${card.cardType}:${card.id}`);

    if (cardsHomeFilterCategory === "exibidos" && isHidden) return false;
    if (cardsHomeFilterCategory === "ocultos" && !isHidden) return false;
    if (
      cardsHomeFilterCategory !== "todos" &&
      cardsHomeFilterCategory !== "exibidos" &&
      cardsHomeFilterCategory !== "ocultos" &&
      card.cardType !== cardsHomeFilterCategory
    ) {
      return false;
    }

    if (cardsHomeSearch.trim() !== "") {
      const q = cardsHomeSearch.toLowerCase();
      const pubPath = getCardPublicationPath(card).toLowerCase();
      const title = (card.titulo || "").toLowerCase();
      const cat = (card.categoria || "").toLowerCase();
      return title.includes(q) || pubPath.includes(q) || cat.includes(q);
    }

    return true;
  });

  const getAuthHeaders = () => {
    const authToken = token;
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  };


  const loadMyVimeoVideos = async (page = 1, search = "") => {
    setVimeoPickerLoading(true);
    setVimeoPickerError(null);
    try {
      const query = new URLSearchParams({
        page: String(page),
        perPage: "18",
        search: search || ""
      });
      const res = await fetch(`/api/admin/vimeo/my-videos?${query}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setVimeoAccountVideos(data.videos || []);
        setVimeoPickerTotal(data.total || 0);
        setVimeoPickerPage(page);
      } else {
        setVimeoPickerError(data.error || "Erro ao carregar vídeos da conta Vimeo.");
      }
    } catch (err: any) {
      setVimeoPickerError("Erro de comunicação com o servidor.");
    } finally {
      setVimeoPickerLoading(false);
    }
  };

  const loadVimeoAccountInfo = async () => {
    try {
      const res = await fetch("/api/admin/vimeo/me", {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setVimeoAccountInfo(data.account);
      }
} catch (err) {
      triggerNotification("error", "Erro de conexão ao excluir.");
    }
  };

  // --- DI BULK IMPORT (CSV) STATES & HANDLERS ---
  const [bulkDiFile, setBulkDiFile] = useState<File | null>(null);
  const [isImportingDi, setIsImportingDi] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isExportingDiCodes, setIsExportingDiCodes] = useState(false);
  const [bulkDiReport, setBulkDiReport] = useState<any>(null);

  const handleDownloadDiTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      const res = await downloadDiTemplate();
      if (res.success) {
        triggerNotification("success", "Modelo CSV baixado com sucesso.");
      } else {
        triggerNotification("error", res.error || "Erro ao baixar o modelo CSV.");
      }
    } catch (err) {
      triggerNotification("error", "Erro de conexão ao baixar o modelo.");
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleExportDiCodesCsv = async () => {
    setIsExportingDiCodes(true);
    try {
      const res = await exportDiCodes();
      if (res.success) {
        triggerNotification("success", "CSV dos D.I.s cadastrados baixado com sucesso.");
      } else {
        triggerNotification("error", res.error || "Erro ao baixar o CSV dos D.I.s.");
      }
    } catch (err) {
      triggerNotification("error", "Erro de conexão ao baixar o CSV dos D.I.s.");
    } finally {
      setIsExportingDiCodes(false);
    }
  };

  const handleImportDiCsv = async () => {
    if (!bulkDiFile) {
      triggerNotification("error", "Selecione um arquivo .csv antes de importar.");
      return;
    }
    if (!/\.csv$/i.test(bulkDiFile.name)) {
      triggerNotification("error", "Somente arquivos .csv são aceitos.");
      return;
    }
    setIsImportingDi(true);
    setBulkDiReport(null);
    try {
      const res = await importDiCodes(bulkDiFile);
      if (res.success) {
        setBulkDiReport(res.report);
        triggerNotification("success", `Importação concluída: ${res.report.imported} D.I. cadastrado(s).`);
      } else {
        setBulkDiReport(res.report || null);
        triggerNotification("error", res.error || "Erro ao importar arquivo.");
      }
      setBulkDiFile(null);
    } catch (err) {
      triggerNotification("error", "Erro de conexão ao importar arquivo.");
    } finally {
      setIsImportingDi(false);
    }
  };

  const handleOpenVimeoPickerModal = () => {
    setVimeoPickerSelected({});
    setShowVimeoPickerModal(true);
    setVimeoPickerSearch("");
    loadMyVimeoVideos(1, "");
    loadVimeoAccountInfo();
  };

  const toggleVimeoPickerVideo = (videoId: string) => {
    setVimeoPickerSelected((prev) => {
      const next = { ...prev };
      if (next[videoId]) delete next[videoId];
      else next[videoId] = true;
      return next;
    });
  };

  const handleAddSelectedVimeoVideos = () => {
    const selected = vimeoAccountVideos.filter((v) => vimeoPickerSelected[v.id]);
    if (selected.length === 0) {
      triggerNotification("error", "Selecione pelo menos um vídeo da sua conta Vimeo.");
      return;
    }
    const updated = [...cursoModulos];
    const target = updated[0] || { id: `m-single-${Date.now()}`, titulo: "Módulo 1", aulas: [] };
    const aulas = [...(target.aulas || [])];

    // Extrai "YYYY-MM-DD - Título" para título limpo + data da live (treinamentos)
    const extrairDataTitulo = (name: string) => {
      const m = (name || "").trim().match(/^(\d{4}-\d{2}-\d{2})\s*[-–—]\s*(.*)$/);
      if (m) return { data: m[1], titulo: m[2].trim() };
      return { data: "", titulo: (name || "").trim() };
    };

    for (const video of selected) {
      const { data, titulo } = extrairDataTitulo(video.title || "");
      const aulaTitulo = titulo || video.title || "Vídeo Vimeo";
      const aula = {
        id: `a-vimeo-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        titulo: aulaTitulo,
        duracao: video.durationFormatted || "Auto",
        tipoVideo: "vimeo" as const,
        videoUrl: video.embedUrl || video.id || "",
        videoId: video.id || "",
        videoHash: video.hash || "",
        thumbnail: video.thumbnail || ""
      };
      aulas.push(aula);

      // Para treinamento (vídeo único), preenche título e data automaticamente
      if (cursoSecao === "treinamentos") {
        if (data) setCursoDataLive(data);
        if (aulaTitulo && !cursoTitulo) setCursoTitulo(aulaTitulo);
      }
    }
    target.aulas = aulas;
    if (updated.length === 0) updated.push(target);
    else updated[0] = target;
    setCursoModulos(updated);
    setShowVimeoPickerModal(false);
    setVimeoPickerSelected({});
    triggerNotification("success", `${selected.length} vídeo(s) adicionado(s) à grade!`);
  };

  const [deleteTarget, setDeleteTarget] = useState<{
    type: "novidade" | "curso" | "material" | "categoria" | "logo" | "banner" | "fenix-post" | "moderator-link";
    id: string;
    title: string;
  } | null>(null);

  // Banner Form States
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [bannerTitulo, setBannerTitulo] = useState("");
  const [bannerDescricao, setBannerDescricao] = useState("");
  const [bannerCorTitulo, setBannerCorTitulo] = useState("#ffffff");
  const [bannerCorDescricao, setBannerCorDescricao] = useState("#ffffff");
  const [bannerImagem, setBannerImagem] = useState("");
  const [bannerBotoesAtivos, setBannerBotoesAtivos] = useState(true);
  const [bannerBtn1Texto, setBannerBtn1Texto] = useState("");
  const [bannerBtn1Tipo, setBannerBtn1Tipo] = useState<"pagina" | "curso" | "material" | "externo" | "nenhum">("nenhum");
  const [bannerBtn1Destino, setBannerBtn1Destino] = useState("");
  const [bannerBtn2Texto, setBannerBtn2Texto] = useState("");
  const [bannerBtn2Tipo, setBannerBtn2Tipo] = useState<"pagina" | "curso" | "material" | "externo" | "nenhum">("nenhum");
  const [bannerBtn2Destino, setBannerBtn2Destino] = useState("");
  const [bannerOrdem, setBannerOrdem] = useState(1);

  // --- FENIX SOCIAL & MODERATION LINKS STATES ---
  const [fenixDateFilter, setFenixDateFilter] = useState("");
  const [viewingFenixPost, setViewingFenixPost] = useState<any | null>(null);
  const [editingFenixPost, setEditingFenixPost] = useState<any | null>(null);
  const [editFenixTitulo, setEditFenixTitulo] = useState("");
  const [editFenixLegenda, setEditFenixLegenda] = useState("");
  const [editFenixAutor, setEditFenixAutor] = useState("");
  const [editFenixData, setEditFenixData] = useState("");
  const [editFenixStatus, setEditFenixStatus] = useState<"aprovado" | "pendente" | "recusado">("aprovado");

  const [novoModeradorNome, setNovoModeradorNome] = useState("");
  const [creatingModLink, setCreatingModLink] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // --- SUPORTE: USUÁRIOS DA ÁREA DE SUPORTE ---
  const [newSupNome, setNewSupNome] = useState("");
  const [newSupEmail, setNewSupEmail] = useState("");
  const [newSupSenha, setNewSupSenha] = useState("");
  const [supSubmitting, setSupSubmitting] = useState(false);
  // Redefinição de senha de um responsável (novo acesso temporário + troca pendente)
  const [resetSupEmail, setResetSupEmail] = useState<string | null>(null);
  const [resetSupNome, setResetSupNome] = useState("");
  const [resetSupNovaSenha, setResetSupNovaSenha] = useState("");
  const [resetSupConfirma, setResetSupConfirma] = useState("");
  const [resetSupLoading, setResetSupLoading] = useState(false);
  const [resetSupError, setResetSupError] = useState<string | null>(null);

  const handleSaveSupportUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupNome.trim() || !newSupEmail.trim()) {
      triggerNotification("error", "Preencha o nome e o e-mail do usuário de suporte.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newSupEmail.trim())) {
      triggerNotification("error", "Informe um e-mail válido.");
      return;
    }
    setSupSubmitting(true);
    try {
      const res = await saveSupportUser({
        email: newSupEmail.trim(),
        nome: newSupNome.trim(),
        senha: newSupSenha || undefined,
        ativo: true
      });
      if (res.success) {
        triggerNotification("success", res.message || "Usuário de suporte salvo com sucesso.");
        setNewSupNome("");
        setNewSupEmail("");
        setNewSupSenha("");
      } else {
        triggerNotification("error", res.error || "Erro ao salvar usuário de suporte.");
      }
    } catch (err) {
      triggerNotification("error", "Erro de conexão ao salvar usuário.");
    } finally {
      setSupSubmitting(false);
    }
  };

  const handleToggleSupportUser = async (email: string, nome: string, ativo: boolean) => {
    try {
      const res = await saveSupportUser({ email, nome, ativo: !ativo });
      if (res.success) {
        triggerNotification("success", `Usuário ${email} ${!ativo ? "ativado" : "desativado"}.`);
      } else {
        triggerNotification("error", res.error || "Erro ao alterar usuário de suporte.");
      }
    } catch (err) {
      triggerNotification("error", "Erro de conexão ao alterar usuário.");
    }
  };

  const openResetSupportPassword = (u: { email: string; nome: string }) => {
    setResetSupEmail(u.email);
    setResetSupNome(u.nome);
    setResetSupNovaSenha("");
    setResetSupConfirma("");
    setResetSupError(null);
  };

  const closeResetSupportPassword = () => {
    setResetSupEmail(null);
    setResetSupNovaSenha("");
    setResetSupConfirma("");
    setResetSupError(null);
  };

  // Redefine a senha temporária e marca a troca como pendente (próximo login do
  // responsável abrirá o modal para definir a própria senha).
  const handleResetSupportPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetSupEmail) return;
    const nova = resetSupNovaSenha.trim();
    if (nova.length < 8 || !/[a-zA-Z]/.test(nova) || !/[0-9]/.test(nova)) {
      setResetSupError("Mínimo 8 caracteres, com letras e números.");
      return;
    }
    if (nova !== resetSupConfirma) {
      setResetSupError("As senhas não conferem.");
      return;
    }
    setResetSupLoading(true);
    setResetSupError(null);
    try {
      const res = await resetSupportPassword(resetSupEmail, nova);
      if (res.success) {
        triggerNotification("success", res.message || "Senha redefinida com sucesso.");
        closeResetSupportPassword();
      } else {
        setResetSupError(res.error || "Erro ao redefinir a senha.");
      }
    } catch (err) {
      setResetSupError("Erro de conexão ao redefinir a senha.");
    } finally {
      setResetSupLoading(false);
    }
  };

  // Load Admin stats and logs
  useEffect(() => {
    if (loggedIn && user?.role === "admin") {
      fetchAdminDiCodes();
      fetchPublicData();
      fetchRestrictedData();
      fetchAllFenixPostsAdmin();
      fetchModeratorLinks();
    }
  }, [loggedIn, user]);

  useEffect(() => {
    if (activeTab === "cadastrar-di") {
      fetchAdminDiCodes();
    } else if (activeTab === "suporte") {
      fetchSupportUsers();
    }
  }, [activeTab]);

  const triggerNotification = (type: "success" | "error", msg: string) => {
    if (type === "success") {
      setSuccessMsg(msg);
      setErrorMsg(null);
    } else {
      setErrorMsg(msg);
      setSuccessMsg(null);
    }
    setTimeout(() => {
      setSuccessMsg(null);
      setErrorMsg(null);
    }, 4000);
  };

  // --- DI CODE REGISTRATION STATES & HANDLERS ---
  const [newDiCode, setNewDiCode] = useState("");
  const [newDiDesc, setNewDiDesc] = useState("");
  const [isSubmittingDi, setIsSubmittingDi] = useState(false);
  const [filterDiText, setFilterDiText] = useState("");

  const handleCreateDiCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiCode.trim()) {
      triggerNotification("error", "Por favor, digite o código D.I.");
      return;
    }
    setIsSubmittingDi(true);
    try {
      const res = await createDiCode(newDiCode, newDiDesc);
      if (res.success) {
        triggerNotification("success", res.message || "Código D.I. cadastrado com segurança no banco de dados!");
        setNewDiCode("");
        setNewDiDesc("");
      } else {
        triggerNotification("error", res.error || "Erro ao cadastrar código D.I.");
      }
    } catch (err: any) {
      triggerNotification("error", "Erro ao comunicar com o servidor.");
    } finally {
      setIsSubmittingDi(false);
    }
  };

  const handleToggleDiStatus = async (id: string, currentStatus: boolean, codigo: string) => {
    try {
      const res = await toggleDiCodeStatus(id);
      if (res.success) {
        triggerNotification("success", `Status do código ${codigo} alterado para ${!currentStatus ? "Ativo" : "Inativo"}.`);
      } else {
        triggerNotification("error", res.error || "Erro ao alterar status.");
      }
    } catch (err) {
      triggerNotification("error", "Erro de conexão ao alterar status.");
    }
  };

  const handleDeleteDi = async (id: string, codigo: string) => {
    if (!window.confirm(`Tem certeza que deseja remover o código D.I. "${codigo}"? O titular perderá o acesso às páginas restritas.`)) {
      return;
    }
    try {
      const res = await deleteDiCode(id);
      if (res.success) {
        triggerNotification("success", `Código D.I. ${codigo} excluído com sucesso.`);
      } else {
        triggerNotification("error", res.error || "Erro ao excluir código D.I.");
      }
    } catch (err) {
      triggerNotification("error", "Erro de conexão ao excluir.");
    }
  };

  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);

  const handleLogoUpload = async (file: File) => {
    if (file.type !== "image/png") {
      triggerNotification("error", "Apenas imagens no formato PNG são permitidas.");
      return;
    }

    setLogoLoading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        const res = await uploadLogo(base64String);
        if (res.success) {
          triggerNotification("success", "Logo do site atualizada com sucesso!");
        } else {
          triggerNotification("error", res.error || "Erro ao fazer upload da logo.");
        }
        setLogoLoading(false);
      };
      reader.onerror = () => {
        triggerNotification("error", "Falha ao ler o arquivo de imagem.");
        setLogoLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      triggerNotification("error", "Ocorreu um erro no upload da logo.");
      setLogoLoading(false);
    }
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingLogo(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleLogoUpload(e.dataTransfer.files[0]);
    }
  };

  const handleLogoReset = () => {
    setDeleteTarget({
      type: "logo",
      id: "logo",
      title: "Logo padrão do site"
    });
  };

  // Guard Clause: Not admin
  if (!loggedIn || user?.role !== "admin") {
    return (
      <div id="admin-restrict-guard" className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-950/20 border border-red-500/20 flex items-center justify-center text-[#dc2626] animate-bounce">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">Acesso Restrito</h2>
        <p className="text-xs md:text-sm text-[#8a96a3] max-w-sm leading-relaxed">
          Esta área exige um código de acesso com privilégios de administrador. Por favor, acesse novamente com o código correto.
        </p>
      </div>
    );
  }

  // --- BANNERS STATE & HANDLERS ---
  const [bannerImageLoading, setBannerImageLoading] = useState(false);
  const [isDraggingBannerImage, setIsDraggingBannerImage] = useState(false);

  const handleBannerImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      triggerNotification("error", "Selecione um arquivo de imagem válido (PNG, JPG, WEBP).");
      return;
    }
    setBannerImageLoading(true);
    try {
      const res = await uploadFileWithProgress(file, "banners", getAuthHeaders());
      if (res && res.success && (res.previewUrl || res.url)) {
        setBannerImagem(res.previewUrl || res.url);
        triggerNotification("success", "Banner enviado com sucesso para a pasta 'banners/' no Supabase Storage!");
      } else {
        triggerNotification("error", res?.error || "Erro ao fazer upload da imagem do banner.");
      }
    } catch (err: any) {
      triggerNotification("error", "Erro ao fazer upload do banner.");
    } finally {
      setBannerImageLoading(false);
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerTitulo.trim()) {
      triggerNotification("error", "O título do banner é obrigatório.");
      return;
    }
    if (!bannerDescricao.trim()) {
      triggerNotification("error", "A descrição do banner é obrigatória.");
      return;
    }
    if (!bannerImagem) {
      triggerNotification("error", "Por favor, faça upload de uma imagem para o banner.");
      return;
    }

    const item: Banner = {
      id: editingBanner?.id || `b-${Date.now()}`,
      titulo: bannerTitulo,
      descricao: bannerDescricao,
      imagem: bannerImagem,
      corTitulo: bannerCorTitulo || "#ffffff",
      corDescricao: bannerCorDescricao || "#ffffff",
      botoesAtivos: bannerBotoesAtivos,
      btn1Texto: bannerBtn1Texto,
      btn1Tipo: bannerBtn1Tipo,
      btn1Destino: bannerBtn1Destino,
      btn2Texto: bannerBtn2Texto,
      btn2Tipo: bannerBtn2Tipo,
      btn2Destino: bannerBtn2Destino,
      ordem: Number(bannerOrdem) || 1,
      createdAt: editingBanner?.createdAt || new Date().toISOString()
    };

    const res = await saveBanner(item);
    if (res.success) {
      triggerNotification("success", editingBanner ? "Banner atualizado com sucesso!" : "Banner criado com sucesso!");
      // Reset form states
      setEditingBanner(null);
      setBannerTitulo("");
      setBannerDescricao("");
      setBannerCorTitulo("#ffffff");
      setBannerCorDescricao("#ffffff");
      setBannerImagem("");
      setBannerBotoesAtivos(true);
      setBannerBtn1Texto("");
      setBannerBtn1Tipo("nenhum");
      setBannerBtn1Destino("");
      setBannerBtn2Texto("");
      setBannerBtn2Tipo("nenhum");
      setBannerBtn2Destino("");
      setBannerOrdem(1);
    } else {
      triggerNotification("error", res.error || "Erro ao salvar o banner.");
    }
  };

  const handleEditBanner = (b: Banner) => {
    setEditingBanner(b);
    setBannerTitulo(b.titulo);
    setBannerDescricao(b.descricao);
    setBannerCorTitulo(b.corTitulo || "#ffffff");
    setBannerCorDescricao(b.corDescricao || "#ffffff");
    setBannerImagem(b.imagem);
    setBannerBotoesAtivos(b.botoesAtivos);
    setBannerBtn1Texto(b.btn1Texto || "");
    setBannerBtn1Tipo(b.btn1Tipo || "nenhum");
    setBannerBtn1Destino(b.btn1Destino || "");
    setBannerBtn2Texto(b.btn2Texto || "");
    setBannerBtn2Tipo(b.btn2Tipo || "nenhum");
    setBannerBtn2Destino(b.btn2Destino || "");
    setBannerOrdem(b.ordem || 1);
  };

  const handleCancelEditBanner = () => {
    setEditingBanner(null);
    setBannerTitulo("");
    setBannerDescricao("");
    setBannerCorTitulo("#ffffff");
    setBannerCorDescricao("#ffffff");
    setBannerImagem("");
    setBannerBotoesAtivos(true);
    setBannerBtn1Texto("");
    setBannerBtn1Tipo("nenhum");
    setBannerBtn1Destino("");
    setBannerBtn2Texto("");
    setBannerBtn2Tipo("nenhum");
    setBannerBtn2Destino("");
    setBannerOrdem(1);
  };

  // --- NOVIDADES STATE & HANDLERS ---
  const [newsId, setNewsId] = useState("");
  const [newsTitulo, setNewsTitulo] = useState("");
  const [newsDesc, setNewsDesc] = useState("");
  const [newsCategory, setNewsCategory] = useState("Novidades");
  const [newsImagem, setNewsImagem] = useState("");
  const [newsIsPremium, setNewsIsPremium] = useState(false);
  const [newsIsFeatured, setNewsIsFeatured] = useState(false);
  const [newsImageLoading, setNewsImageLoading] = useState(false);
  const [isDraggingNewsImage, setIsDraggingNewsImage] = useState(false);
  const [newsLinkType, setNewsLinkType] = useState<"curso" | "material" | "externo" | "nenhum">("nenhum");
  const [newsLinkTarget, setNewsLinkTarget] = useState("");

  const handleNewsImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      triggerNotification("error", "Selecione um arquivo de imagem válido (PNG, JPG, WEBP).");
      return;
    }
    setNewsImageLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      const res = await uploadFile(base64String, file.name, "banners");
      if (res.success && res.url) {
        setNewsImagem(res.url);
        triggerNotification("success", "Imagem de capa da novidade carregada com sucesso!");
      } else {
        triggerNotification("error", res.error || "Erro ao fazer upload da imagem.");
      }
      setNewsImageLoading(false);
    };
    reader.onerror = () => {
      triggerNotification("error", "Erro ao ler o arquivo de imagem.");
      setNewsImageLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleEditNews = (item: Novidade) => {
    setNewsId(item.id);
    setNewsTitulo(item.titulo);
    setNewsDesc(item.descricao);
    setNewsCategory(item.categoria);
    setNewsImagem(item.imagem);
    setNewsIsPremium(item.isPremium);
    setNewsIsFeatured(item.isFeatured);
    setNewsLinkType(item.linkType || "nenhum");
    setNewsLinkTarget(item.linkTarget || "");
  };

  const handleSaveNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitulo || !newsDesc || !newsImagem) {
      triggerNotification("error", "Preencha todos os campos obrigatórios da novidade.");
      return;
    }

    const payload = {
      id: newsId || undefined,
      titulo: newsTitulo,
      descricao: newsDesc,
      categoria: newsCategory,
      imagem: newsImagem,
      isPremium: newsIsPremium,
      isFeatured: newsIsFeatured,
      linkType: newsLinkType,
      linkTarget: newsLinkTarget
    };

    const result = await saveNovidade(payload);
    if (result.success) {
      triggerNotification("success", "Novidade salva com sucesso!");
      // Reset
      setNewsId("");
      setNewsTitulo("");
      setNewsDesc("");
      setNewsImagem("");
      setNewsIsPremium(false);
      setNewsIsFeatured(false);
      setNewsLinkType("nenhum");
      setNewsLinkTarget("");
    } else {
      triggerNotification("error", result.error || "Erro ao salvar novidade.");
    }
  };

  // --- CURSOS STATE & HANDLERS ---
  const [cursoId, setCursoId] = useState("");
  const [cursoTitulo, setCursoTitulo] = useState("");
  const [cursoDesc, setCursoDesc] = useState("");
  const [cursoCategory, setCursoCategory] = useState("Cursos");
  const [cursoSecao, setCursoSecao] = useState<"cursos" | "treinamentos">("cursos");
  const [cursoDataLive, setCursoDataLive] = useState("");
  const [cursoVideoLink, setCursoVideoLink] = useState("");
  const [cursoImagem, setCursoImagem] = useState("");
  const [cursoDuracao, setCursoDuracao] = useState("8h (12 Aulas)");
  const [professorNome, setProfessorNome] = useState("");
  const [professorEspecialidade, setProfessorEspecialidade] = useState("");
  const [professorBio, setProfessorBio] = useState("");
  const [professorFoto, setProfessorFoto] = useState("");
  const [professorFotoLoading, setProfessorFotoLoading] = useState(false);
  const [professorAtivo, setProfessorAtivo] = useState(false);
  const [cursoModulos, setCursoModulos] = useState<any[]>([
    {
      id: `m-temp-1`,
      titulo: "Módulo 1",
      aulas: []
    }
  ]);

  // Cover image upload state

  // Lesson video upload state & drag/drop
  const [uploadingLessonId, setUploadingLessonId] = useState<string | null>(null);
  const [draggedLessonInfo, setDraggedLessonInfo] = useState<{ moduleIdx: number; lessonIdx: number } | null>(null);


  const handleProfessorFotoFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      triggerNotification("error", "Selecione um arquivo de imagem válido (PNG, JPG, WEBP).");
      return;
    }
    setProfessorFotoLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      const res = await uploadFile(base64String, file.name, "professores");
      if (res.success && res.url) {
        setProfessorFoto(res.url);
        triggerNotification("success", "Foto do professor carregada com sucesso!");
      } else {
        triggerNotification("error", res.error || "Erro ao fazer upload da foto.");
      }
      setProfessorFotoLoading(false);
    };
    reader.onerror = () => {
      triggerNotification("error", "Erro ao carregar a foto do professor.");
      setProfessorFotoLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const formatSecondsToDuration = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds <= 0) return "--:--";
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const autoDetectDurationFromFile = (file: File, callback: (dur: string) => void) => {
    try {
      const videoEl = document.createElement("video");
      videoEl.preload = "metadata";
      const objectUrl = URL.createObjectURL(file);
      videoEl.src = objectUrl;
      videoEl.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        if (videoEl.duration && !isNaN(videoEl.duration)) {
          callback(formatSecondsToDuration(videoEl.duration));
        } else {
          callback("Vídeo");
        }
      };
      videoEl.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        callback("Vídeo");
      };
    } catch {
      callback("Vídeo");
    }
  };

  const handleLessonVideoFile = (moduleIdx: number, lessonIdx: number, file: File) => {
    if (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
      triggerNotification("error", "Formato inválido. Selecione um arquivo de vídeo (.mp4, .webm, .mov, .mkv).");
      return;
    }
    const lessonId = cursoModulos[moduleIdx].aulas[lessonIdx].id;
    setUploadingLessonId(lessonId);

    setLessonUploadProgress(prev => ({
      ...prev,
      [lessonId]: {
        isUploading: true,
        progress: 0,
        loaded: 0,
        total: file.size,
        fileName: file.name,
        statusText: "Iniciando upload do vídeo da aula..."
      }
    }));

    autoDetectDurationFromFile(file, async (detectedDur) => {
      try {
        const resData = await uploadFileWithProgress(file, "cursos/videos", getAuthHeaders(), (evt) => {
          setLessonUploadProgress(prev => ({
            ...prev,
            [lessonId]: {
              isUploading: true,
              progress: evt.percent,
              loaded: evt.loaded,
              total: evt.total,
              fileName: file.name,
              statusText: evt.percent < 100 ? `Transferindo vídeo (${evt.percent}%)...` : "Indexando no bucket e gerando player..."
            }
          }));
        });

        if (resData && resData.success) {
          const videoUrl = resData.hlsUrl || resData.streamUrl || resData.url || resData.previewUrl;
          const updated = [...cursoModulos];
          updated[moduleIdx].aulas[lessonIdx].videoUrl = videoUrl;
          updated[moduleIdx].aulas[lessonIdx].tipoVideo = "upload";
          updated[moduleIdx].aulas[lessonIdx].duracao = detectedDur || "Auto";
          setCursoModulos(updated);

          setLessonUploadProgress(prev => ({
            ...prev,
            [lessonId]: {
              isUploading: false,
              isComplete: true,
              progress: 100,
              loaded: file.size,
              total: file.size,
              fileName: file.name,
              statusText: "Vídeo salvo e vinculado com sucesso!",
              storageType: resData.storage
            }
          }));

          triggerNotification("success", `Vídeo '${file.name}' carregado e vinculado com sucesso!`);
        } else {
          // Fallback to base64 upload
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = reader.result as string;
            const updated = [...cursoModulos];
            updated[moduleIdx].aulas[lessonIdx].videoUrl = base64String;
            updated[moduleIdx].aulas[lessonIdx].tipoVideo = "upload";
            updated[moduleIdx].aulas[lessonIdx].duracao = detectedDur || "Auto";
            setCursoModulos(updated);

            setLessonUploadProgress(prev => ({
              ...prev,
              [lessonId]: {
                isUploading: false,
                isComplete: true,
                progress: 100,
                loaded: file.size,
                total: file.size,
                fileName: file.name,
                statusText: "Vídeo salvo com sucesso!"
              }
            }));

            triggerNotification("success", "Arquivo de vídeo da aula carregado com sucesso!");
          };
          reader.readAsDataURL(file);
        }
      } catch (err: any) {
        setLessonUploadProgress(prev => ({
          ...prev,
          [lessonId]: {
            isUploading: false,
            isError: true,
            progress: 0,
            loaded: 0,
            total: file.size,
            fileName: file.name,
            errorMsg: err?.message || "Erro no upload do vídeo"
          }
        }));
        triggerNotification("error", "Erro ao carregar o arquivo de vídeo.");
      } finally {
        setUploadingLessonId(null);
      }
    });
  };

  const handleAddModule = () => {
    const nextIdx = cursoModulos.length + 1;
    setCursoModulos([
      ...cursoModulos,
      {
        id: `m-temp-${Date.now()}`,
        titulo: `Módulo ${nextIdx}: Nova etapa`,
        aulas: []
      }
    ]);
  };

  const [isSavingCurso, setIsSavingCurso] = useState(false);

  // Auto-renumber lessons so title numbers (Aula 1, Aula 2, etc.) stay strictly sequential
  const autoRenumberLessons = (aulas: any[]) => {
    return (aulas || []).map((aula, idx) => {
      const num = idx + 1;
      const titleStr = (aula.titulo || "").trim();
      const clean = titleStr.replace(/^aula\s*\d+\s*[:\-.]*\s*/i, "").trim();
      const newTitle = clean ? `Aula ${num}: ${clean}` : `Aula ${num}: Novo conteúdo`;
      return {
        ...aula,
        titulo: newTitle
      };
    });
  };

  const handleAddLesson = (moduleIdx: number) => {
    const updated = [...cursoModulos];
    const nextIdx = updated[moduleIdx].aulas.length + 1;
    updated[moduleIdx].aulas.push({
      id: `a-temp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      titulo: `Aula ${nextIdx}: Novo conteúdo`,
      duracao: "Auto",
      tipoVideo: "vimeo",
      videoUrl: ""
    });
    updated[moduleIdx].aulas = autoRenumberLessons(updated[moduleIdx].aulas);
    setCursoModulos(updated);
  };

  // Reorder lessons
  const moveLessonUp = (moduleIdx: number, lessonIdx: number) => {
    if (lessonIdx <= 0) return;
    const updated = [...cursoModulos];
    const lessons = [...updated[moduleIdx].aulas];
    const temp = lessons[lessonIdx];
    lessons[lessonIdx] = lessons[lessonIdx - 1];
    lessons[lessonIdx - 1] = temp;
    updated[moduleIdx].aulas = autoRenumberLessons(lessons);
    setCursoModulos(updated);
  };

  const moveLessonDown = (moduleIdx: number, lessonIdx: number) => {
    const updated = [...cursoModulos];
    const lessons = [...updated[moduleIdx].aulas];
    if (lessonIdx >= lessons.length - 1) return;
    const temp = lessons[lessonIdx];
    lessons[lessonIdx] = lessons[lessonIdx + 1];
    lessons[lessonIdx + 1] = temp;
    updated[moduleIdx].aulas = autoRenumberLessons(lessons);
    setCursoModulos(updated);
  };

  const handleLessonDragStart = (e: React.DragEvent, moduleIdx: number, lessonIdx: number) => {
    setDraggedLessonInfo({ moduleIdx, lessonIdx });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleLessonDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleLessonDrop = (e: React.DragEvent, targetModuleIdx: number, targetLessonIdx: number) => {
    e.preventDefault();
    if (!draggedLessonInfo) return;
    const { moduleIdx: srcModIdx, lessonIdx: srcLessonIdx } = draggedLessonInfo;
    if (srcModIdx !== targetModuleIdx) return; // Keep within same module
    if (srcLessonIdx === targetLessonIdx) return;

    const updated = [...cursoModulos];
    const lessons = [...updated[srcModIdx].aulas];
    const [movedLesson] = lessons.splice(srcLessonIdx, 1);
    lessons.splice(targetLessonIdx, 0, movedLesson);
    updated[srcModIdx].aulas = autoRenumberLessons(lessons);
    setCursoModulos(updated);
    setDraggedLessonInfo(null);
  };

  const handleEditCurso = (item: Curso) => {
    setCursoId(item.id);
    setCursoTitulo(item.titulo);
    setCursoDesc(item.descricao);
    setCursoCategory(item.categoria);
    setCursoImagem(item.imagem);
    setProfessorNome(item.professorNome || (item as any).professor_nome || "");
    setProfessorEspecialidade(item.professorEspecialidade || (item as any).professor_especialidade || "");
    setProfessorBio(item.professorBio || (item as any).professor_bio || "");
    setProfessorFoto(item.professorFoto || (item as any).professor_foto || "");
    setProfessorAtivo(!!(item.professorNome || item.professorBio || item.professorFoto || (item as any).professor_nome));
    // Achata todos os módulos em uma única lista de vídeos (Vimeo API)
    const flattened = (item.modulos || []).flatMap((mod: any) => mod.aulas || []);
    setCursoModulos([{
      id: `m-edit-${Date.now()}`,
      titulo: "Módulo 1",
      aulas: flattened
    }]);
    setCursoSecao(item.secao === "treinamentos" ? "treinamentos" : "cursos");
    setCursoVideoLink(flattened[0]?.videoUrl || "");
  };

  const handleSaveCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingCurso) return;
    if (!cursoTitulo || !cursoDesc) {
      triggerNotification("error", "Preencha o Nome e a Descrição do curso.");
      return;
    }
    const secaoLabel = cursoSecao === "treinamentos" ? "Treinamentos" : "Cursos";
    const todasAulas = (cursoModulos?.[0]?.aulas || []).filter((a: any) => a?.videoUrl);
    if (todasAulas.length === 0) {
      triggerNotification("error", "Adicione pelo menos um vídeo Vimeo pelo botão \"Adicionar vídeos\".");
      return;
    }

    setIsSavingCurso(true);
    try {
      const aulasFinal = todasAulas.map((a: any, i: number) => ({
        id: a.id || `a-${Date.now()}-${i}`,
        titulo: a.titulo || `Vídeo ${i + 1}`,
        duracao: a.duracao || "Auto",
        tipoVideo: "vimeo",
        videoUrl: a.videoUrl || "",
        videoId: a.videoId || "",
        videoHash: a.videoHash || "",
        thumbnail: a.thumbnail || ""
      }));

      const modulosFinal = [{
        id: cursoModulos?.[0]?.id || `m-${Date.now()}`,
        titulo: cursoSecao === "treinamentos" ? "Treinamento" : "Módulo 1",
        aulas: aulasFinal
      }];

      const unit = cursoSecao === "treinamentos" ? "Treinamento" : "Aula";
      const duracaoFinal = `${aulasFinal.length} ${aulasFinal.length === 1 ? unit : `${unit}s`}`;

      const payload = {
        id: cursoId || undefined,
        titulo: cursoTitulo,
        descricao: cursoDesc,
        categoria: secaoLabel,
        nivel: "Iniciante",
        imagem: cursoImagem,
        professorNome: professorAtivo ? (professorNome || "") : "",
        professorEspecialidade: professorAtivo ? (professorEspecialidade || "") : "",
        professorBio: professorAtivo ? (professorBio || "") : "",
        professorFoto: professorAtivo ? (professorFoto || "") : "",
        duracao: duracaoFinal,
        modulos: modulosFinal,
        secao: cursoSecao,
        createdAt: cursoDataLive ? `${cursoDataLive}T12:00:00.000Z` : undefined
      };

      const result = await saveCurso(payload);
      if (result.success) {
        triggerNotification("success", "Conteúdo salvo com sucesso!");
        // Reset
        setCursoId("");
        setCursoTitulo("");
        setCursoDesc("");
        setCursoImagem("");
        setProfessorNome("");
        setProfessorEspecialidade("");
        setProfessorBio("");
        setProfessorFoto("");
        setProfessorAtivo(false);
        setCursoCategory("Cursos");
        setCursoSecao("cursos");
        setCursoDataLive("");
        setCursoVideoLink("");
        setCursoModulos([{ id: `m-temp-${Date.now()}`, titulo: "Módulo 1", aulas: [] }]);
      } else {
        triggerNotification("error", result.error || "Erro ao salvar curso.");
      }
    } finally {
      setIsSavingCurso(false);
    }
  };

  // --- MATERIAIS STATE & HANDLERS ---
  const [matId, setMatId] = useState("");
  const [matTitulo, setMatTitulo] = useState("");
  const [matTipo, setMatTipo] = useState<"image" | "video" | "pdf">("image");
  const [matCategory, setMatCategory] = useState("Folders");
  const [matThumbnail, setMatThumbnail] = useState("");
  const [matThumbnailLoading, setMatThumbnailLoading] = useState(false);
  const [isDraggingMatThumbnail, setIsDraggingMatThumbnail] = useState(false);

  const handleMaterialThumbnailFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      triggerNotification("error", "Selecione um arquivo de imagem válido (PNG, JPG, WEBP).");
      return;
    }
    setMatThumbnailLoading(true);
    try {
      const res = await uploadFileWithProgress(file, "materiais", getAuthHeaders());
      if (res && res.success && (res.previewUrl || res.url)) {
        setMatThumbnail(res.previewUrl || res.url);
        triggerNotification("success", "Imagem de capa do material enviada para 'materiais/' no Supabase Storage!");
      } else {
        triggerNotification("error", res?.error || "Erro ao enviar capa do material.");
      }
    } catch (err: any) {
      triggerNotification("error", "Erro ao fazer upload da capa do material.");
    } finally {
      setMatThumbnailLoading(false);
    }
  };

  const [matFileLoading, setMatFileLoading] = useState(false);
  const handleMaterialDownloadFile = async (file: File) => {
    setMatFileLoading(true);
    try {
      const res = await uploadFileWithProgress(file, "materiais", getAuthHeaders());
      if (res && res.success && (res.previewUrl || res.url)) {
        setMatFileUrl(res.previewUrl || res.url);
        const isImg = file.type.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(file.name);
        setMatTipo(isImg ? "image" : "pdf");
        triggerNotification("success", `Arquivo '${file.name}' enviado com sucesso para a pasta 'materiais/'!`);
      } else {
        triggerNotification("error", res?.error || "Erro ao enviar arquivo.");
      }
    } catch (err: any) {
      triggerNotification("error", "Erro ao fazer upload do arquivo de material.");
    } finally {
      setMatFileLoading(false);
    }
  };
  const [matFileUrl, setMatFileUrl] = useState("");
  const [matIsPublic, setMatIsPublic] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  const categoriasList = ["Folders", "Manuais"];


  const handleCreateCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      triggerNotification("error", "O nome da categoria não pode ser vazio.");
      return;
    }
    if (categoriasList.includes(trimmed)) {
      triggerNotification("error", "Esta categoria já existe.");
      return;
    }
    const updated = [...categoriasList, trimmed];
    const res = await saveCategoriasMateriais(updated);
    if (res.success) {
      triggerNotification("success", `Categoria "${trimmed}" criada!`);
      setMatCategory(trimmed);
      setNewCatName("");
      setIsAddingCategory(false);
    } else {
      triggerNotification("error", res.error || "Erro ao salvar categoria.");
    }
  };

  const handleDeleteCategory = (catToDelete: string) => {
    setDeleteTarget({
      type: "categoria",
      id: catToDelete,
      title: `Categoria "${catToDelete}"`
    });
  };

  const handleEditMaterial = (item: Material) => {
    setMatId(item.id);
    setMatTitulo(item.titulo);
    setMatTipo(item.tipo);
    setMatCategory(item.categoria);
    setMatThumbnail(item.thumbnail);
    setMatFileUrl(item.fileUrl);
    setMatIsPublic(item.isPublic);
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const isYTVideo = matTipo === "video";
    if (!matTitulo || !matThumbnail) {
      triggerNotification("error", "Preencha todos os campos obrigatórios do material.");
      return;
    }
    if (!matFileUrl) {
      triggerNotification("error", isYTVideo ? "Insira o link do YouTube para o vídeo." : "Insira ou faça upload do arquivo do material.");
      return;
    }
    if (isYTVideo && !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(matFileUrl)) {
      triggerNotification("error", "O link informado não é um link válido do YouTube.");
      return;
    }

    const payload = {
      id: matId || undefined,
      titulo: matTitulo,
      tipo: matTipo,
      categoria: matCategory,
      thumbnail: matThumbnail,
      fileUrl: matFileUrl,
      isPublic: matIsPublic
    };

    const result = await saveMaterial(payload);
    if (result.success) {
      triggerNotification("success", "Material salvo com sucesso!");
      setMatId("");
      setMatTitulo("");
      setMatThumbnail("");
      setMatFileUrl("");
      setMatIsPublic(false);
    } else {
      triggerNotification("error", result.error || "Erro ao salvar material.");
    }
  };

  const adminCursosFiltrados = (restrictedData?.cursos || []).filter((c: any) => (c.secao === "treinamentos") === (cursoSecao === "treinamentos"));

  return (
    <div id="admin-dashboard-container" className="space-y-8 pb-16 animate-fade-in select-none relative">
      
      {/* Subtle Glowing Background Elements */}
      <div className="absolute -top-12 -left-12 w-72 h-72 bg-[#d12a62]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/4 -right-12 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Glass-like Premium Finish */}
      <div className="bg-gradient-to-r from-[#151b22]/90 to-[#0e1319]/90 border border-white/5 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,212,66,0.03),transparent)]" />
        
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-2">
            <span className="bg-gradient-to-r from-amber-500/25 to-[#d12a62]/25 text-[#d12a62] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-[#d12a62]/30 flex items-center gap-1.5 shadow-md">
              <Sparkles className="w-3.5 h-3.5" />
              Painel de Controle Corporativo
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold font-display text-white tracking-tight leading-none bg-gradient-to-r from-white to-[#cbd5e1] bg-clip-text text-transparent">
            Gerenciamento Grupo Fênix
          </h2>
          <p className="text-xs md:text-sm text-[#8a96a3] max-w-2xl leading-relaxed">
            Plataforma corporativa de escrita e aceleração. Cadastre novidades de mercado, configure a escola com novos cursos e aulas, gerencie biblioteca de materiais, ou atualize a biografia executiva do líder fundador.
          </p>
        </div>
        
        <button
          onClick={() => {
            const { logout } = useStore.getState();
            logout();
          }}
          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 px-5 py-3 rounded-2xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 relative z-10 shadow-lg cursor-pointer"
        >
          <Undo2 className="w-4 h-4 rotate-180" />
          Sair do Painel
        </button>
      </div>

      {/* Modern Floating Notification Toast */}
      {(successMsg || errorMsg) && (
        <div className="fixed bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-50 animate-slide-in max-w-sm">
          <div className={`p-4 rounded-2xl shadow-2xl backdrop-blur-xl border ${
            successMsg 
              ? "bg-green-950/80 border-green-500/30 text-green-300 shadow-green-950/25" 
              : "bg-red-950/80 border-red-500/30 text-red-300 shadow-red-950/25"
          }`}>
            <div className="flex items-start gap-3">
              <div className={`p-1.5 rounded-lg ${successMsg ? "bg-green-500/20" : "bg-red-500/20"}`}>
                {successMsg ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold font-display text-white">
                  {successMsg ? "Sucesso!" : "Ocorreu um Erro"}
                </h4>
                <p className="text-[11px] leading-relaxed opacity-90">{successMsg || errorMsg}</p>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* TAB CONTENT 1: DASHBOARD */}
      {activeTab === "dashboard" && <AdminOverview />}

      {/* TAB CONTENT: D.I.s (via API Nipponflex) */}
      {activeTab === "cadastrar-di" && (
        <div className="space-y-8 animate-fadeIn">
          {/* Header Banner */}
          <div className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <KeyRound className="w-44 h-44 text-[#d12a62]" />
            </div>
            <div className="relative z-10 space-y-3 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Sincronização automática via API Nipponflex
              </div>
              <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight font-display flex items-center gap-3">
                <KeyRound className="w-7 h-7 text-[#d12a62]" />
                D.I.s do Grupo Fênix
              </h2>
              <p className="text-xs md:text-sm text-[#8a96a3] leading-relaxed">
                Os D.I.s são cadastrados automaticamente a partir da API Nipponflex (diariamente às 02:30). Aqui você acompanha o estado da sincronização, as métricas e quem pode acessar a área restrita.
              </p>
            </div>
          </div>

          {/* CARD ESTADO DO SISTEMA (topo direito) + métricas */}
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              {/* Métricas por situação */}
              <div className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-5 shadow-xl">
                <h3 className="text-sm font-bold text-white font-display mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#d12a62]" />
                  Quantidade de D.I.s no Grupo Fênix
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { chave: "A", label: "Ativos", cor: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                    { chave: "I", label: "Inativos", cor: "text-slate-300", bg: "bg-white/5 border-white/10" },
                    { chave: "P", label: "Pendentes", cor: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
                    { chave: "S", label: "Suspensos", cor: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
                    { chave: "D", label: "Descredenciados", cor: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
                    ...(nfMetricas?.porSituacao?.outros ? [{ chave: "outros", label: "Outros", cor: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" }] : []),
                  ].map((s) => (
                    <div key={s.chave} className={`rounded-2xl p-4 border ${s.bg}`}>
                      <div className={`text-2xl font-black font-mono ${s.cor}`}>{(nfMetricas?.porSituacao?.[s.chave] || 0).toLocaleString("pt-BR")}</div>
                      <div className="text-[10px] uppercase tracking-wider text-[#8a96a3] mt-1 font-bold">{s.label}</div>
                    </div>
                  ))}
                  <div className="rounded-2xl p-4 border bg-[#d12a62]/10 border-[#d12a62]/20">
                    <div className="text-2xl font-black font-mono text-[#ff719e]">{(nfMetricas?.total || 0).toLocaleString("pt-BR")}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[#8a96a3] mt-1 font-bold">Total</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Estado do Sistema */}
            <div className="lg:col-span-5">
              <div className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-5 shadow-xl h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#d12a62]" />
                    Estado do Sistema
                  </h3>
                  {nfStatusBadge}
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between gap-2"><span className="text-[#8a96a3]">Última atualização</span><strong className="text-white">{nfUltimaAtualizacao}</strong></div>
                  {nfEstado?.erro && (
                    <div className="mt-2 p-2.5 rounded-xl bg-red-950/30 border border-red-500/25 text-red-400 text-[11px] leading-relaxed">
                      <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                      {nfEstado.erro}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleNfSync}
                  disabled={nfSyncing || nfEstado?.status === "em_andamento"}
                  className="mt-5 w-full btn-gold-metallic py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                >
                  {nfSyncing || nfEstado?.status === "em_andamento" ? (<><RefreshCw className="w-4 h-4 animate-spin" /> Sincronizando...</>) : (<><RefreshCw className="w-4 h-4" /> SINCRONIZAR DADOS</>)}
                </button>

                {/* Card de Alterações da Última Atualização */}
                {!nfTemRelatorio && <p className="text-xs text-[#8a96a3] mt-3">O resumo de novos cadastros e mudanças de situação será exibido após a próxima sincronização concluída.</p>}
                {nfTemRelatorio && (() => {
                  const semAlteracoes = nfNovosDetalhes.length === 0 && nfSituacoesAlteradas.length === 0;
                  const nomeSit = (s: string) => ({ A: "Ativo", I: "Inativo", P: "Pendente", S: "Suspenso", D: "Descredenciado" } as Record<string, string>)[s] || s;
                  const corSit = (s: string) => ({
                    A: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
                    I: "text-slate-300 bg-white/5 border-white/15",
                    P: "text-amber-400 bg-amber-500/10 border-amber-500/25",
                    S: "text-orange-400 bg-orange-500/10 border-orange-500/25",
                    D: "text-red-400 bg-red-500/10 border-red-500/25"
                  } as Record<string, string>)[s] || "text-slate-300 bg-white/5 border-white/15";
                  return (
                    <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.025] overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                        <Activity className="w-3.5 h-3.5 text-[#d12a62]" />
                        <span className="text-[11px] font-bold text-white tracking-wide">Alterações da Última Atualização</span>
                        <span className="ml-auto text-[10px] text-[#8a96a3] font-mono">{nfUltimaAtualizacao}</span>
                      </div>
                      {semAlteracoes ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-5 px-4 text-center">
                          <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                          <p className="text-[12px] font-semibold text-emerald-300">Base 100% em dia</p>
                          <p className="text-[11px] text-[#8a96a3] leading-relaxed max-w-[220px]">
                            Nenhuma alteração cadastral identificada — todos os D.I.s já estavam sincronizados.
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className={`rounded-xl border p-3 ${nfNovosDetalhes.length > 0 ? "bg-emerald-500/8 border-emerald-500/20" : "bg-white/[0.03] border-white/8"}`}>
                              <div className={`text-xl font-black font-mono ${nfNovosDetalhes.length > 0 ? "text-emerald-400" : "text-[#8a96a3]"}`}>
                                +{nfNovosDetalhes.length.toLocaleString("pt-BR")}
                              </div>
                              <div className="text-[10px] uppercase tracking-wider text-[#8a96a3] mt-0.5 font-bold">Novos ingressantes</div>
                            </div>
                            <div className={`rounded-xl border p-3 ${nfSituacoesAlteradas.length > 0 ? "bg-amber-500/8 border-amber-500/20" : "bg-white/[0.03] border-white/8"}`}>
                              <div className={`text-xl font-black font-mono ${nfSituacoesAlteradas.length > 0 ? "text-amber-400" : "text-[#8a96a3]"}`}>
                                {nfSituacoesAlteradas.length.toLocaleString("pt-BR")}
                              </div>
                              <div className="text-[10px] uppercase tracking-wider text-[#8a96a3] mt-0.5 font-bold">Mudanças de status</div>
                            </div>
                          </div>
                          {Object.keys(nfTransicoesAgrupadas).length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-[10px] uppercase tracking-widest text-[#8a96a3] font-bold">Tipo de Alteração</p>
                              {Object.entries(nfTransicoesAgrupadas).map(([transicao, qtd]) => {
                                const [ant, nov] = transicao.split("→");
                                return (
                                  <div key={transicao} className="flex items-center gap-2 text-[11px]">
                                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${corSit(ant)}`}>{nomeSit(ant)}</span>
                                    <ArrowUpRight className="w-3 h-3 text-[#8a96a3] flex-shrink-0" />
                                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${corSit(nov)}`}>{nomeSit(nov)}</span>
                                    <span className="ml-auto text-[#8a96a3] font-mono font-bold">{(qtd as number).toLocaleString("pt-BR")} D.I.{(qtd as number) !== 1 ? "s" : ""}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {nfNovosDetalhes.length > 0 && (
                            <details open={nfNovosDetalhes.length <= 5}>
                              <summary className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#8a96a3] font-bold cursor-pointer hover:text-white transition-colors py-1">
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-0.5" />
                                Novos D.I.s ({nfNovosDetalhes.length})
                              </summary>
                              <div className="mt-2 max-h-40 overflow-y-auto scrollbar-slim space-y-1">
                                {nfNovosDetalhes.map((di) => (
                                  <div key={di.codigo} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                    <span className="font-mono text-[10px] text-emerald-400 font-bold w-12 flex-shrink-0">{di.codigo}</span>
                                    <span className="text-[11px] text-[#e8edf2] flex-grow truncate">{di.nome}</span>
                                    <span className={`px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${corSit(di.situacao)} flex-shrink-0`}>{nomeSit(di.situacao)}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                          {nfSituacoesAlteradas.length > 0 && (
                            <details open={nfSituacoesAlteradas.length <= 5}>
                              <summary className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#8a96a3] font-bold cursor-pointer hover:text-white transition-colors py-1">
                                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-0.5" />
                                Mudanças de Situação ({nfSituacoesAlteradas.length})
                              </summary>
                              <div className="mt-2 max-h-40 overflow-y-auto scrollbar-slim space-y-1">
                                {nfSituacoesAlteradas.map((alt) => (
                                  <div key={alt.codigo} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                                    <span className="font-mono text-[10px] text-[#a8b3bf] font-bold w-12 flex-shrink-0">{alt.codigo}</span>
                                    <span className="text-[11px] text-[#e8edf2] flex-grow truncate">{alt.nome}</span>
                                    <span className={`px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${corSit(alt.anterior)} flex-shrink-0`}>{nomeSit(alt.anterior)}</span>
                                    <ArrowUpRight className="w-3 h-3 text-[#8a96a3] flex-shrink-0" />
                                    <span className={`px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${corSit(alt.nova)} flex-shrink-0`}>{nomeSit(alt.nova)}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          <div className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#d12a62]" />
                Logs da Sincronização
              </h3>
              {nfEstado?.status === "em_andamento" && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Ao vivo
                </span>
              )}
              <button
                type="button"
                onClick={baixarLogMd}
                disabled={nfLogs.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[#a8b3bf] hover:text-white text-[11px] font-bold transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar Log
              </button>
              <button
                type="button"
                onClick={handleLimparLogs}
                disabled={nfLogs.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[#a8b3bf] hover:text-white hover:border-red-500/30 text-[11px] font-bold transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar Logs
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl bg-[#0b0f14] border border-white/5 p-3 font-mono text-[11px] leading-relaxed scrollbar-slim">
              {nfLogs.length === 0 ? (
                <span className="text-[#5c6672]">Nenhum log ainda. Clique em "SINCRONIZAR DADOS" para iniciar o processo.</span>
              ) : nfLogs.map((log, i) => (
                <div key={i} className={`flex gap-2 ${log.nivel === "erro" ? "text-red-400" : log.nivel === "ok" ? "text-emerald-400" : log.nivel === "aviso" ? "text-amber-400" : "text-[#a8b3bf]"}`}>
                  <span className="text-[#5c6672] shrink-0">[{log.ts}]</span>
                  <span>{log.msg}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Configuração: situações que podem logar */}
          <div className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-white font-display mb-1 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#d12a62]" />
              Quem pode acessar a área restrita
            </h3>
            <p className="text-[11px] text-[#8a96a3] mb-4">Marque as situações que podem logar no site. D.I.s com situação não marcada, mesmo cadastrados, não conseguem entrar.</p>
            <div className="flex flex-wrap gap-3">
              {[
                { v: "A", l: "Ativos (A)" },
                { v: "I", l: "Inativos (I)" },
                { v: "P", l: "Pendentes (P)" },
                { v: "S", l: "Suspensos (S)" },
                { v: "D", l: "Descredenciados (D)" }
              ].map((op) => (
                <label key={op.v} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${nfSituacoes.includes(op.v) ? "bg-[#d12a62]/15 border-[#d12a62]/40 text-[#ff719e]" : "bg-white/5 border-white/10 text-[#8a96a3]"}`}>
                  <input type="checkbox" checked={nfSituacoes.includes(op.v)} onChange={() => toggleNfSituacao(op.v)} className="accent-[#d12a62]" />
                  {op.l}
                </label>
              ))}
            </div>
            <button type="button" onClick={handleSalvarSituacoes} className="mt-4 px-6 py-2.5 rounded-xl bg-[#d12a62]/15 border border-[#d12a62]/30 text-[#ff719e] text-xs font-bold cursor-pointer hover:bg-[#d12a62]/25 transition-colors">Salvar configuração</button>
          </div>

          {/* Lista de D.I.s */}
          <div className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-bold text-white font-display">Lista de D.I.s</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5c6672]" />
                  <input
                    value={nfBusca}
                    onChange={(e) => { setNfBusca(e.target.value); setNfPagina(1); }}
                    placeholder="Buscar por nome ou código..."
                    className="w-56 bg-[#0b0f14] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-[#d12a62]/50"
                  />
                </div>
                <select value={nfFiltroSit} onChange={(e) => { setNfFiltroSit(e.target.value); setNfPagina(1); }} className="bg-[#0b0f14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none">
                  <option value="todos">Todas as situações</option>
                  <option value="A">Ativos</option>
                  <option value="I">Inativos</option>
                  <option value="P">Pendentes</option>
                  <option value="S">Suspensos</option>
                  <option value="D">Descredenciados</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#8a96a3] uppercase tracking-wider text-[10px] border-b border-white/5">
                    <th className="py-2 pr-2">Nome do D.I.</th>
                    <th className="py-2 pr-2">Código D.I.</th>
                    <th className="py-2">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {nfItens.length === 0 ? (
                    <tr><td colSpan={3} className="py-10 text-center text-[#8a96a3]">{nfCarregando ? "Carregando..." : "Nenhum D.I. encontrado. Rode a sincronização para popular a lista."}</td></tr>
                  ) : nfItens.map((di) => (
                    <tr key={di.codigo} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 pr-2 text-white font-medium">{di.nome}</td>
                      <td className="py-2.5 pr-2 text-[#a8b3bf] font-mono">{di.codigo}</td>
                      <td className="py-2.5"><NfSitBadge situacao={di.situacao} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
              <span className="text-[11px] text-[#8a96a3]">{(nfTotal || 0).toLocaleString("pt-BR")} D.I.s</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={nfPagina <= 1} onClick={() => setNfPagina((p) => Math.max(1, p - 1))} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs disabled:opacity-40 cursor-pointer">← Anterior</button>
                <span className="text-[11px] text-[#8a96a3]">Pág. {nfPagina} de {nfTotalPaginas || 1}</span>
                <button type="button" disabled={nfPagina >= (nfTotalPaginas || 1)} onClick={() => setNfPagina((p) => p + 1)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs disabled:opacity-40 cursor-pointer">Próxima →</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === "suporte" && (
        <div className="space-y-8 animate-fade-in">
        <div className="grid lg:grid-cols-12 gap-8">
          {/* Cadastro de usuário de suporte */}
          <div className="lg:col-span-5 bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                <LifeBuoy className="w-5 h-5 text-[#d12a62]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                  Usuários do Suporte
                </h3>
                <p className="text-[11px] text-[#8a96a3]">
                  Cadastre as contas que acessam a área de suporte (subdomínio próprio). Chamados e histórico nunca podem ser apagados.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSupportUser} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display">Nome do atendente *</label>
                <input
                  type="text"
                  value={newSupNome}
                  onChange={(e) => setNewSupNome(e.target.value)}
                  placeholder="Ex: Atendimento Fênix"
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display">E-mail de acesso *</label>
                <input
                  type="email"
                  value={newSupEmail}
                  onChange={(e) => setNewSupEmail(e.target.value)}
                  placeholder="atendente@grupofenix.online"
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display">
                  Senha <span className="text-[10px] text-[#8a96a3] font-normal normal-case">(somente ao criar um novo e-mail — o responsável definirá a própria senha no 1º acesso)</span>
                </label>
                <input
                  type="password"
                  value={newSupSenha}
                  onChange={(e) => setNewSupSenha(e.target.value)}
                  placeholder="Mínimo 8, com letras e números"
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={supSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {supSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    Cadastrar Usuário de Suporte
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Lista de usuários de suporte */}
          <div className="lg:col-span-7 bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Contas cadastradas</h3>
            {supportUsers.length === 0 ? (
              <p className="text-xs text-[#8a96a3]">Nenhum usuário de suporte cadastrado ainda. Cadastre a primeira conta ao lado.</p>
            ) : (
              <div className="space-y-3">
                {supportUsers.map((u) => (
                  <div key={u.email} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#0b0f14]/80 border border-white/[0.04]">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{u.nome}</p>
                      <p className="text-[11px] text-[#8a96a3] font-mono truncate">{u.email}</p>
                      <p className="text-[10px] text-[#8a96a3] mt-1">Cadastrado em {new Date(u.criadoEm).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {u.mustChangePassword && (
                        <span className="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] font-mono font-bold">
                          1º acesso pendente
                        </span>
                      )}
                      <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold ${u.ativo ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-white/5 text-[#8a96a3] border-white/10"}`}>
                        {u.ativo ? "Ativo" : "Desativado"}
                      </span>
                      <button
                        onClick={() => openResetSupportPassword(u)}
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                          u.ativo
                            ? "bg-white/5 border-white/10 text-[#c9d2dc] hover:bg-white/10 hover:text-white"
                            : "bg-white/5 border-white/10 text-[#8a96a3]"
                        }`}
                      >
                        Redefinir senha
                      </button>
                      <button
                        onClick={() => handleToggleSupportUser(u.email, u.nome, u.ativo)}
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                          u.ativo
                            ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                        }`}
                      >
                        {u.ativo ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-[#8a96a3] leading-relaxed">
              A pessoa acessa a área de suporte pelo subdomínio próprio (ex.: <span className="font-mono text-white">suporte.grupofenix.online</span>)
              com o e-mail e a senha cadastrados. Todos os chamados e mensagens permanecem intactos para auditoria — não existe opção de exclusão.
            </p>
          </div>
        </div>

        </div>
      )}

      

      {/* TAB CONTENT: BANNERS CRUD */}
      {activeTab === "banners" && (
        <div className="grid lg:grid-cols-12 gap-8 animate-fade-in">
          {/* Edit Form */}
          <div className="lg:col-span-5">
            <form onSubmit={handleSaveBanner} className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-6 md:p-8 space-y-5 shadow-2xl relative">
              <div className="border-b border-white/5 pb-3">
                <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#d12a62]" />
                  {editingBanner ? "Editar Banner" : "Criar Banner do Topo"}
                </h3>
                <p className="text-[11px] text-[#8a96a3] mt-1">
                  Gerencie o slideshow no topo da página inicial com chamadas de destaque personalizadas.
                </p>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#e8edf2] font-mono uppercase tracking-wider flex items-center gap-1.5">
                  Título do Banner <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={bannerTitulo}
                  onChange={(e) => setBannerTitulo(e.target.value)}
                  placeholder="Ex: Domine o Tráfego Pago"
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#d12a62] transition-colors font-sans"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#e8edf2] font-mono uppercase tracking-wider">
                  Descrição <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={bannerDescricao}
                  onChange={(e) => setBannerDescricao(e.target.value)}
                  placeholder="Ex: Aprenda as melhores estratégias e mude o rumo dos seus negócios em 2026."
                  rows={3}
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#d12a62] transition-colors font-sans resize-none"
                />
              </div>

              {/* Text Colors Configuration */}
              <div className="bg-[#0b0f14]/80 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">Configuração de Cores dos Textos</h4>
                    <p className="text-[10px] text-[#8a96a3]">Defina a cor do título e da descrição para garantir perfeita legibilidade sobre a imagem.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBannerCorTitulo("#ffffff");
                      setBannerCorDescricao("#ffffff");
                    }}
                    className="text-[10px] text-[#d12a62] hover:underline font-mono"
                  >
                    Resetar Branco
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Cor do Título */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-300 flex items-center justify-between">
                      <span>Cor do Título</span>
                      <span className="font-mono text-[10px] text-gray-400">{bannerCorTitulo}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={bannerCorTitulo}
                        onChange={(e) => setBannerCorTitulo(e.target.value)}
                        className="w-9 h-9 rounded-lg border border-white/20 bg-[#0b0f14] cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={bannerCorTitulo}
                        onChange={(e) => setBannerCorTitulo(e.target.value)}
                        placeholder="#ffffff"
                        className="flex-1 bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-mono focus:outline-none focus:border-[#d12a62]"
                      />
                    </div>
                  </div>

                  {/* Cor da Descrição */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-300 flex items-center justify-between">
                      <span>Cor da Descrição</span>
                      <span className="font-mono text-[10px] text-gray-400">{bannerCorDescricao}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={bannerCorDescricao}
                        onChange={(e) => setBannerCorDescricao(e.target.value)}
                        className="w-9 h-9 rounded-lg border border-white/20 bg-[#0b0f14] cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={bannerCorDescricao}
                        onChange={(e) => setBannerCorDescricao(e.target.value)}
                        placeholder="#ffffff"
                        className="flex-1 bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-mono focus:outline-none focus:border-[#d12a62]"
                      />
                    </div>
                  </div>
                </div>

                {/* Color presets for fast picking */}
                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-gray-400 mr-1">Paleta Rápida:</span>
                  {[
                    { label: "Branco", color: "#ffffff" },
                    { label: "Ouro", color: "#f59e0b" },
                    { label: "Rosa Fênix", color: "#d12a62" },
                    { label: "Ciano", color: "#38bdf8" },
                    { label: "Amarelo", color: "#facc15" },
                    { label: "Prata", color: "#cbd5e1" }
                  ].map((p) => (
                    <button
                      key={p.color}
                      type="button"
                      onClick={() => {
                        setBannerCorTitulo(p.color);
                        setBannerCorDescricao(p.color);
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-medium border border-white/10 hover:border-white/30 transition-all flex items-center gap-1 bg-white/5 text-gray-200"
                    >
                      <span className="w-2.5 h-2.5 rounded-full border border-white/20 inline-block" style={{ backgroundColor: p.color }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image upload */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#e8edf2] font-mono uppercase tracking-wider block">
                  Imagem de Capa (Recomendado: 1920x800 ou proporção widescreen) <span className="text-red-500">*</span>
                </label>
                
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingBannerImage(true); }}
                  onDragLeave={() => setIsDraggingBannerImage(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingBannerImage(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleBannerImageFile(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                    isDraggingBannerImage
                      ? "border-[#d12a62] bg-[#d12a62]/10"
                      : "border-white/10 hover:border-white/20 bg-[#0b0f14]/50 hover:bg-[#0b0f14]"
                  }`}
                  onClick={() => {
                    const el = document.getElementById("banner-file-input");
                    if (el) el.click();
                  }}
                >
                  <input
                    id="banner-file-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleBannerImageFile(e.target.files[0]);
                      }
                    }}
                  />
                  
                  {bannerImageLoading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-t-transparent border-[#d12a62] rounded-full animate-spin"></div>
                      <span className="text-[11px] text-[#8a96a3]">Fazendo upload da imagem...</span>
                    </div>
                  ) : (
                    <>
                      {bannerImagem ? (
                        <div className="space-y-2">
                          <img
                            src={bannerImagem}
                            alt="Preview do Banner"
                            className="w-full max-h-32 object-cover rounded-lg border border-white/10 shadow-md animate-fade-in"
                            referrerPolicy="no-referrer"
                          />
                          <p className="text-[10px] text-green-400 font-mono">✓ Imagem carregada. Clique para alterar.</p>
                        </div>
                      ) : (
                        <>
                          <div className="p-3 bg-white/5 rounded-xl text-[#8a96a3]">
                            <ImageIcon className="w-5 h-5 text-[#d12a62]" />
                          </div>
                          <p className="text-xs text-gray-300">
                            Arraste uma imagem ou <span className="text-[#d12a62] hover:underline font-bold">procure no dispositivo</span>
                          </p>
                          <p className="text-[10px] text-[#8a96a3]">JPG, PNG, WEBP (Recomendado menos de 2MB)</p>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Order */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#e8edf2] font-mono uppercase tracking-wider block">
                  Ordem de Exibição
                </label>
                <input
                  type="number"
                  min={1}
                  value={bannerOrdem}
                  onChange={(e) => setBannerOrdem(Number(e.target.value) || 1)}
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#d12a62] transition-colors font-sans"
                />
                <p className="text-[10px] text-[#8a96a3]">Determina a sequência no carrossel (menor para maior).</p>
              </div>

              {/* Activate Buttons Toggle */}
              <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl p-4">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-white">Ativar Botões de Ação</h4>
                  <p className="text-[10px] text-[#8a96a3]">Exibe até 2 botões de CTA sobre a imagem do banner.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBannerBotoesAtivos(!bannerBotoesAtivos)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    bannerBotoesAtivos ? "bg-[#d12a62]" : "bg-white/10"
                  }`}
                >
                  <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                    bannerBotoesAtivos ? "translate-x-5" : ""
                  }`} />
                </button>
              </div>

              {/* Action Buttons Setup */}
              {bannerBotoesAtivos && (
                <div className="space-y-5 pt-2 border-t border-white/5">
                  
                  {/* BUTTON 1 CONFIG */}
                  <div className="bg-[#0b0f14]/50 border border-white/5 rounded-2xl p-4 space-y-4">
                    <h4 className="text-xs font-bold text-[#d12a62] font-mono uppercase tracking-wider">Configuração do Botão 1</h4>
                    
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">Texto do Botão</label>
                      <input
                        type="text"
                        value={bannerBtn1Texto}
                        onChange={(e) => setBannerBtn1Texto(e.target.value)}
                        placeholder="Ex: Começar Agora"
                        className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">Destino do Clique</label>
                      <select
                        value={bannerBtn1Tipo}
                        onChange={(e) => {
                          setBannerBtn1Tipo(e.target.value as any);
                          setBannerBtn1Destino("");
                        }}
                        className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                      >
                        <option value="nenhum">Nenhum (Inativo)</option>
                        <option value="pagina">Ir para uma Página do Site</option>
                        <option value="curso">Ir para um Curso do App</option>
                        <option value="material">Ir para um Material para Download</option>
                        <option value="externo">Site Externo / URL Personalizada</option>
                      </select>
                    </div>

                    {bannerBtn1Tipo === "pagina" && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">Selecione a Página do Site</label>
                        <select
                          value={bannerBtn1Destino}
                          onChange={(e) => setBannerBtn1Destino(e.target.value)}
                          className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                        >
                          <option value="">Selecione uma página...</option>
                          <option value="inicio">Início (Página Principal)</option>
                          <option value="escola-fenix">Escola Fênix (Cursos e Treinamentos)</option>
                          <option value="conteudos">Conteúdos (Biblioteca & Materiais)</option>
                          <option value="tecnologias">Tecnologias Fênix</option>
                          <option value="grupo-fenix">Grupo Fênix (Institucional / Sobre Nós)</option>
                          <option value="fenix-social">Fênix Social (Comunidade)</option>
                          <option value="elite-milionario">Elite Milionária</option>
                          <option value="admin">Painel Administrativo</option>
                        </select>
                      </div>
                    )}

                    {bannerBtn1Tipo === "curso" && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">Selecione o Curso</label>
                        <select
                          value={bannerBtn1Destino}
                          onChange={(e) => setBannerBtn1Destino(e.target.value)}
                          className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                        >
                          <option value="">Selecione um curso...</option>
                          {(publicData?.cursos || []).map((c: any) => (
                            <option key={c.id} value={c.id}>{c.titulo}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {bannerBtn1Tipo === "material" && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">Selecione o Material</label>
                        <select
                          value={bannerBtn1Destino}
                          onChange={(e) => setBannerBtn1Destino(e.target.value)}
                          className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                        >
                          <option value="">Selecione um material...</option>
                          {(publicData?.materiais || []).map((m: any) => (
                            <option key={m.id} value={m.id}>{m.titulo}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {bannerBtn1Tipo === "externo" && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">URL Externa (Inicie com http:// ou https://)</label>
                        <input
                          type="text"
                          value={bannerBtn1Destino}
                          onChange={(e) => setBannerBtn1Destino(e.target.value)}
                          placeholder="Ex: https://instagram.com/felipefenix"
                          className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                        />
                      </div>
                    )}
                  </div>

                  {/* BUTTON 2 CONFIG */}
                  <div className="bg-[#0b0f14]/50 border border-white/5 rounded-2xl p-4 space-y-4">
                    <h4 className="text-xs font-bold text-[#d12a62] font-mono uppercase tracking-wider">Configuração do Botão 2</h4>
                    
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">Texto do Botão</label>
                      <input
                        type="text"
                        value={bannerBtn2Texto}
                        onChange={(e) => setBannerBtn2Texto(e.target.value)}
                        placeholder="Ex: Saiba Mais"
                        className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">Destino do Clique</label>
                      <select
                        value={bannerBtn2Tipo}
                        onChange={(e) => {
                          setBannerBtn2Tipo(e.target.value as any);
                          setBannerBtn2Destino("");
                        }}
                        className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                      >
                        <option value="nenhum">Nenhum (Inativo)</option>
                        <option value="pagina">Ir para uma Página do Site</option>
                        <option value="curso">Ir para um Curso do App</option>
                        <option value="material">Ir para um Material para Download</option>
                        <option value="externo">Site Externo / URL Personalizada</option>
                      </select>
                    </div>

                    {bannerBtn2Tipo === "pagina" && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">Selecione a Página do Site</label>
                        <select
                          value={bannerBtn2Destino}
                          onChange={(e) => setBannerBtn2Destino(e.target.value)}
                          className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                        >
                          <option value="">Selecione uma página...</option>
                          <option value="inicio">Início (Página Principal)</option>
                          <option value="escola-fenix">Escola Fênix (Cursos e Treinamentos)</option>
                          <option value="conteudos">Conteúdos (Biblioteca & Materiais)</option>
                          <option value="tecnologias">Tecnologias Fênix</option>
                          <option value="grupo-fenix">Grupo Fênix (Institucional / Sobre Nós)</option>
                          <option value="fenix-social">Fênix Social (Comunidade)</option>
                          <option value="elite-milionario">Elite Milionária</option>
                          <option value="admin">Painel Administrativo</option>
                        </select>
                      </div>
                    )}

                    {bannerBtn2Tipo === "curso" && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">Selecione o Curso</label>
                        <select
                          value={bannerBtn2Destino}
                          onChange={(e) => setBannerBtn2Destino(e.target.value)}
                          className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                        >
                          <option value="">Selecione um curso...</option>
                          {(publicData?.cursos || []).map((c: any) => (
                            <option key={c.id} value={c.id}>{c.titulo}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {bannerBtn2Tipo === "material" && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">Selecione o Material</label>
                        <select
                          value={bannerBtn2Destino}
                          onChange={(e) => setBannerBtn2Destino(e.target.value)}
                          className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                        >
                          <option value="">Selecione um material...</option>
                          {(publicData?.materiais || []).map((m: any) => (
                            <option key={m.id} value={m.id}>{m.titulo}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {bannerBtn2Tipo === "externo" && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-[#e8edf2] uppercase font-mono">URL Externa (Inicie com http:// ou https://)</label>
                        <input
                          type="text"
                          value={bannerBtn2Destino}
                          onChange={(e) => setBannerBtn2Destino(e.target.value)}
                          placeholder="Ex: https://t.me/grupo_fenix"
                          className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Form Actions */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  className="flex-1 cursor-pointer bg-[#d12a62] hover:bg-[#b02251] text-white px-5 py-3.5 rounded-xl font-bold text-xs font-display flex items-center justify-center gap-2 shadow-lg shadow-[#d12a62]/20 transition-all active:scale-[0.98]"
                >
                  <Save className="w-4 h-4" />
                  Salvar Alterações
                </button>
                
                {editingBanner && (
                  <button
                    type="button"
                    onClick={handleCancelEditBanner}
                    className="cursor-pointer bg-white/5 hover:bg-white/10 text-gray-300 px-4 py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-white/5"
                  >
                    <Undo2 className="w-4 h-4" />
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Registered Banners List */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl">
              <div>
                <h3 className="text-base font-bold text-white font-display">Banners Cadastrados</h3>
                <p className="text-[11px] text-[#8a96a3] mt-1">
                  Estes banners aparecerão no slideshow rotativo no topo da tela de início.
                </p>
              </div>

              <div className="space-y-4">
                {(!publicData?.banners || publicData.banners.length === 0) ? (
                  <div className="text-center py-12 border border-dashed border-white/5 rounded-2xl bg-black/10">
                    <Layers className="w-8 h-8 text-white/10 mx-auto mb-3" />
                    <p className="text-xs text-gray-400 font-medium">Nenhum banner cadastrado</p>
                    <p className="text-[10px] text-gray-500 mt-1">Crie um banner usando o formulário ao lado.</p>
                  </div>
                ) : (
                  [...publicData.banners]
                    .sort((a, b) => (a.ordem || 1) - (b.ordem || 1))
                    .map((b) => {
                      return (
                        <div key={b.id} className="bg-[#0b0f14]/80 border border-white/5 hover:border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 transition-all">
                          {/* Banner Capa */}
                          <div className="w-full sm:w-36 h-20 rounded-xl overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 relative">
                            <img
                              src={b.imagem}
                              alt={b.titulo}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-1 left-1 bg-black/70 text-white border border-white/10 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">
                              Ordem: {b.ordem || 1}
                            </div>
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between space-y-2">
                            <div>
                              <h4 className="text-xs font-bold text-white truncate">{b.titulo}</h4>
                              <p className="text-[11px] text-[#8a96a3] line-clamp-2 mt-1">{b.descricao}</p>
                            </div>

                            {/* Buttons summary badge */}
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {b.botoesAtivos ? (
                                <>
                                  {b.btn1Texto && b.btn1Tipo !== "nenhum" && (
                                    <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#d12a62]/10 border border-[#d12a62]/20 text-[#d12a62]">
                                      {b.btn1Texto} ({b.btn1Tipo})
                                    </span>
                                  )}
                                  {b.btn2Texto && b.btn2Tipo !== "nenhum" && (
                                    <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[#8a96a3]">
                                      {b.btn2Texto} ({b.btn2Tipo})
                                    </span>
                                  )}
                                  {(!b.btn1Texto || b.btn1Tipo === "nenhum") && (!b.btn2Texto || b.btn2Tipo === "nenhum") && (
                                    <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">
                                      Botões ativos sem links
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[#8a96a3]/50">
                                  Botões Desativados
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action triggers */}
                          <div className="flex sm:flex-col items-center justify-end gap-2 border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => handleEditBanner(b)}
                              className="cursor-pointer p-2 rounded-xl text-[#8a96a3] hover:text-[#e8edf2] hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-xs font-medium flex items-center gap-1 flex-1 sm:flex-initial justify-center"
                              title="Editar"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span className="sm:hidden">Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ type: "banner", id: b.id, title: b.titulo })}
                              className="cursor-pointer p-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/10 transition-all text-xs font-medium flex items-center gap-1 flex-1 sm:flex-initial justify-center"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="sm:hidden">Excluir</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: CARDS DA PÁGINA INICIAL */}
      {activeTab === "cards-home" && (
        <div className="space-y-6 animate-fade-in">
          {/* Search & Filter Controls */}
          <div className="bg-[#151b22]/70 border border-white/5 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
            {/* Search Bar */}
            <div className="relative flex-grow max-w-md">
              <Search className="w-4 h-4 text-[#8a96a3] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar card por título, categoria ou URL..."
                value={cardsHomeSearch}
                onChange={(e) => setCardsHomeSearch(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-9 py-2.5 text-xs text-white placeholder-[#8a96a3] focus:outline-none focus:border-[#d12a62] transition-colors"
              />
              {cardsHomeSearch && (
                <button
                  onClick={() => setCardsHomeSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a96a3] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
              {[
                { id: "todos", label: "Todos" },
                { id: "exibidos", label: "Exibidos" },
                { id: "ocultos", label: "Ocultos" },
                { id: "curso", label: "Cursos" },
                { id: "material", label: "Materiais" },
                { id: "novidade", label: "Novidades" },
                { id: "fenix-social", label: "Fênix Social" }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setCardsHomeFilterCategory(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    cardsHomeFilterCategory === f.id
                      ? "bg-[#d12a62] text-white shadow-lg"
                      : "bg-black/30 text-[#8a96a3] hover:text-white hover:bg-white/5 border border-white/5"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cards List */}
          {filteredHomeCards.length === 0 ? (
            <div className="bg-[#151b22]/50 border border-white/5 rounded-3xl p-12 text-center space-y-3">
              <EyeOff className="w-10 h-10 text-[#8a96a3] mx-auto opacity-50" />
              <h4 className="text-sm font-bold text-white">Nenhum card encontrado</h4>
              <p className="text-xs text-[#8a96a3]">
                {cardsHomeSearch
                  ? `Nenhum card corresponde à pesquisa "${cardsHomeSearch}".`
                  : "Não há cards nesta categoria de filtro."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredHomeCards.map((card) => {
                const isHidden = (hiddenHomeCardIds || []).includes(card.id) || (hiddenHomeCardIds || []).includes(`${card.cardType}:${card.id}`);
                const relPath = getCardPublicationPath(card);
                const isCopied = copiedCardUrlId === card.id;

                return (
                  <div
                    key={`${card.cardType}-${card.id}`}
                    className={`bg-[#151b22]/80 border rounded-2xl p-5 transition-all shadow-xl flex flex-col md:flex-row gap-5 items-start md:items-center justify-between ${
                      isHidden
                        ? "border-amber-500/20 bg-amber-950/10 opacity-80 hover:opacity-100"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    {/* Left: Thumbnail & Info */}
                    <div className="flex flex-col sm:flex-row items-start gap-4 min-w-0 flex-grow w-full md:w-auto">
                      {/* Thumbnail Preview */}
                      <div className="w-full sm:w-44 aspect-video rounded-xl bg-black overflow-hidden relative border border-white/10 flex-shrink-0 group">
                        <img
                          src={card.imagem}
                          alt={card.titulo}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLElement).setAttribute("src", "/uploads/grupo_fenix_lider_bio.jpg");
                          }}
                        />
                        <div className="absolute top-2 left-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border backdrop-blur-md shadow-md ${card.typeColor}`}>
                            {card.typeName}
                          </span>
                        </div>
                      </div>

                      {/* Details & URL */}
                      <div className="space-y-2 min-w-0 flex-grow">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-[#8a96a3] uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                            {card.categoria}
                          </span>
                          {isHidden ? (
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md text-[10px] font-mono font-bold flex items-center gap-1">
                              <EyeOff className="w-3 h-3" /> Oculto da Inicial
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-md text-[10px] font-mono font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Exibido na Inicial
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm md:text-base font-bold text-white font-display leading-snug line-clamp-2">
                          {card.titulo}
                        </h3>

                        {/* Publication Path & Copy Button */}
                        <div className="space-y-1 pt-1">
                          <span className="text-[10px] text-[#8a96a3] font-mono block">Caminho / URL da Publicação:</span>
                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                            <div className="bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] font-mono text-sky-400 flex-grow truncate min-w-0 select-all">
                              {relPath}
                            </div>
                            <button
                              onClick={() => copyCardUrl(card)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
                                isCopied
                                  ? "bg-green-500/20 text-green-300 border border-green-500/40"
                                  : "bg-white/5 hover:bg-white/10 text-[#8a96a3] hover:text-white border border-white/10"
                              }`}
                              title="Copiar link completo da publicação"
                            >
                              {isCopied ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-green-400" />
                                  <span>Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copiar Link</span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                if (card.cardType === "curso") {
                                  setActiveCourse(card as any);
                                  setActiveView("escola-fenix");
                                } else if (card.cardType === "material") {
                                  setActiveView("conteudos");
                                } else if (card.cardType === "fenix-social") {
                                  setActiveView("fenix-social");
                                } else if (card.cardType === "novidade") {
                                  if (card.linkType === "curso") {
                                    setActiveView("escola-fenix");
                                  } else if (card.linkType === "material") {
                                    setActiveView("conteudos");
                                  } else if (card.linkType === "fenix-social") {
                                    setActiveView("fenix-social");
                                  } else if (card.linkType === "pagina" && card.linkTarget) {
                                    setActiveView(card.linkTarget as any);
                                  } else {
                                    setActiveView("inicio");
                                  }
                                }
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-sky-400 border border-sky-500/20 hover:border-sky-500/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                              title="Ir para a publicação referente"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Abrir</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-col items-end gap-2 w-full md:w-auto flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
                      <button
                        onClick={() => {
                          let deleteType: any = card.cardType;
                          if (card.cardType === "fenix-social") {
                            deleteType = "fenix-post";
                          }
                          setDeleteTarget({
                            id: card.id,
                            type: deleteType,
                            title: card.titulo || "Conteúdo Sem Título"
                          });
                        }}
                        className="w-full md:w-auto px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Excluir Definitivamente</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 3: CURSOS CRUD */}
      {activeTab === "cursos" && (
        <div className="space-y-6 animate-fade-in">
          {/* Sub-abas: Cursos | Treinamentos */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCursoSecao("cursos")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                cursoSecao === "cursos"
                  ? "bg-[#d12a62]/15 text-[#d12a62] border border-[#d12a62]/30"
                  : "bg-white/5 text-[#94a3b8] border border-white/10 hover:text-white"
              }`}
            >
              Cursos
            </button>
            <button
              type="button"
              onClick={() => setCursoSecao("treinamentos")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                cursoSecao === "treinamentos"
                  ? "bg-[#d12a62]/15 text-[#d12a62] border border-[#d12a62]/30"
                  : "bg-white/5 text-[#94a3b8] border border-white/10 hover:text-white"
              }`}
            >
              Treinamentos
            </button>
          </div>

        <div className="grid lg:grid-cols-12 gap-8 animate-fade-in">
          {/* Edit form */}
          <div className="lg:col-span-5">
            <form onSubmit={handleSaveCurso} className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-6 md:p-8 space-y-5 shadow-2xl relative">
              <div className="border-b border-white/5 pb-3">
                <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-[#d12a62]" />
                  ÁREA DE CADASTRO & UPLOAD DE CURSOS E TREINAMENTOS
                </h3>
                <p className="text-[11px] text-[#8a96a3] mt-1">
                  Cadastre Cursos (várias aulas) e Treinamentos (vídeo do Vimeo) na escola online.
                </p>
              </div>

              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-[#ffdd55] leading-relaxed">
                  <strong>Restrição de Segurança:</strong> As vídeo-aulas configuradas aqui são hospedadas em streaming de alta segurança para visualização web em tempo real. <strong>Não é permitido o download direto de cursos</strong> pelos alunos.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Nome do Curso *</label>
                <input
                  type="text"
                  value={cursoTitulo}
                  onChange={(e) => setCursoTitulo(e.target.value)}
                  placeholder="Ex: Copywriting de Alta Performance"
                  className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all focus:ring-1 focus:ring-[#d12a62]/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Grade e Descrição do Curso *</label>
                <textarea
                  value={cursoDesc}
                  onChange={(e) => setCursoDesc(e.target.value)}
                  placeholder="Explique os objetivos de aprendizagem, público-alvo e resultados esperados..."
                  rows={3}
                  className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all resize-none focus:ring-1 focus:ring-[#d12a62]/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Seção do Conteúdo *</label>
                  <select
                    value={cursoSecao}
                    onChange={(e) => {
                      const v = e.target.value as "cursos" | "treinamentos";
                      setCursoSecao(v);
                    }}
                    className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all focus:ring-1 focus:ring-[#d12a62]/30"
                  >
                    <option value="cursos">Cursos (várias aulas)</option>
                    <option value="treinamentos">Treinamentos (vídeo do Vimeo)</option>
                  </select>
                </div>
              </div>

              {cursoSecao === "cursos" && (
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Carga Horária / Total de Aulas (Automático)</label>
                  <div className="w-full bg-[#0b0f14] border border-white/10 rounded-xl p-3 text-xs text-white font-mono flex items-center justify-between">
                    <span className="text-[#8a96a3] text-[11px] font-sans">Reconhecimento automático da grade:</span>
                    <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold rounded-lg flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#d12a62]" />
                      {cursoModulos.reduce((acc, mod) => acc + (mod.aulas ? mod.aulas.length : 0), 0)} {cursoModulos.reduce((acc, mod) => acc + (mod.aulas ? mod.aulas.length : 0), 0) === 1 ? "Aula" : "Aulas"}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2 rounded-xl border border-white/10 p-4">
                <p className="text-sm font-bold text-white">Capa automática do Vimeo</p>
                <p className="text-xs text-[#8a96a3]">A capa será a mesma do primeiro vídeo da lista. Para trocá-la, altere a miniatura no Vimeo ou a ordem dos vídeos.</p>
              </div>

              {/* Professor / Mentor do Curso */}
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#d12a62]" />
                    <span className="text-[10px] uppercase font-bold text-white font-display tracking-wider block">
                      Professor / Mentor do Curso
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfessorAtivo(!professorAtivo)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${professorAtivo ? "bg-emerald-500" : "bg-white/15"}`}
                    title={professorAtivo ? "Desativar informações do professor" : "Adicionar informações do professor"}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${professorAtivo ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>

                {!professorAtivo && (
                  <p className="text-[10px] text-[#8a96a3] leading-relaxed">
                    Informações do professor desativadas. O conteúdo será publicado sem foto, nome e bio do professor.
                  </p>
                )}

                {professorAtivo && (
                <>

                {/* Foto do Professor */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">
                    Foto do Professor
                  </label>
                  <div className="flex items-center gap-3 bg-[#0b0f14] p-3 rounded-xl border border-white/10">
                    <div className="w-14 h-14 rounded-full bg-black/40 border-2 border-white/10 overflow-hidden flex-shrink-0 relative group">
                      {professorFoto ? (
                        <img src={professorFoto} alt="Professor" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 bg-white/5">
                          <UserCheck className="w-6 h-6" />
                        </div>
                      )}
                      {professorFoto && (
                        <button
                          type="button"
                          onClick={() => setProfessorFoto("")}
                          className="absolute inset-0 bg-black/70 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] font-bold transition-opacity"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <div className="flex-1 flex items-center gap-3 flex-wrap">
                      <label
                        htmlFor="professor-foto-file"
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white cursor-pointer transition-all flex items-center gap-2 hover:border-[#d12a62]/40"
                      >
                        <Upload className="w-4 h-4 text-[#d12a62]" />
                        <span>{professorFoto ? "Alterar foto do professor" : "Upload de foto do professor"}</span>
                      </label>
                      <input
                        type="file"
                        id="professor-foto-file"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleProfessorFotoFile(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                      {professorFotoLoading && (
                        <span className="text-xs text-[#d12a62] animate-pulse font-medium">Carregando foto...</span>
                      )}
                      {professorFoto && !professorFotoLoading && (
                        <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                          ✓ Foto enviada
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">
                      Nome do Professor
                    </label>
                    <input
                      type="text"
                      value={professorNome}
                      onChange={(e) => setProfessorNome(e.target.value)}
                      placeholder="Ex: Dr. Roberto Alcantara"
                      className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all focus:ring-1 focus:ring-[#d12a62]/30"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">
                      Especialidade / Cargo
                    </label>
                    <input
                      type="text"
                      value={professorEspecialidade}
                      onChange={(e) => setProfessorEspecialidade(e.target.value)}
                      placeholder="Ex: Especialista em Biohacking"
                      className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all focus:ring-1 focus:ring-[#d12a62]/30"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">
                    Breve Bio do Mentor
                  </label>
                  <textarea
                    value={professorBio}
                    onChange={(e) => setProfessorBio(e.target.value)}
                    placeholder="Breve resumo da trajetória e autoridade do mentor no assunto..."
                    rows={2}
                    className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all resize-none focus:ring-1 focus:ring-[#d12a62]/30"
                  />
                </div>
                </>
                )}
              </div>

              {/* Vídeos do Conteúdo (API Node Vimeo — única forma de adicionar vídeos) */}
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase font-bold text-white font-display tracking-wider flex items-center gap-1.5">
                    <ListVideo className="w-4 h-4 text-[#d12a62]" />
                    {cursoSecao === "treinamentos" ? "Vídeos do Treinamento *" : "Vídeos do Curso *"}
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenVimeoPickerModal}
                    className="text-[10px] font-extrabold text-sky-400 hover:text-sky-300 transition-all bg-sky-500/10 border border-sky-500/30 px-3 py-1.5 rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar vídeos
                  </button>
                </div>

                <p className="text-[10px] text-[#8a96a3] leading-relaxed">
                  Selecione os vídeos da sua conta Vimeo pela API Node. Com 1 vídeo, a página exibe só o player; com 2 ou mais, cria a lista de reprodução automaticamente.
                </p>

                {/* Lista de vídeos selecionados */}
                {(cursoModulos?.[0]?.aulas || []).length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-white/10 rounded-2xl bg-black/20">
                    <ListVideo className="w-8 h-8 text-[#8a96a3] mx-auto mb-2" />
                    <p className="text-xs text-[#8a96a3] font-medium">
                      Nenhum vídeo adicionado ainda.
                    </p>
                    <p className="text-[10px] text-[#5f6a78] mt-1">
                      Clique em "Adicionar vídeos" para buscar os vídeos da sua conta Vimeo.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1 scrollbar-slim">
                    {cursoModulos[0].aulas.map((aula: any, aIdx: number) => (
                      <div
                        key={aula.id}
                        className="flex items-center gap-3 bg-[#151b22]/90 p-3 rounded-2xl border border-white/10"
                      >
                        {aula.thumbnail ? (
                          <img src={aula.thumbnail} alt="" className="w-16 h-10 object-cover rounded-lg border border-white/10 flex-shrink-0" />
                        ) : (
                          <div className="w-16 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-[#8a96a3] flex-shrink-0">
                            <Play className="w-4 h-4" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                              #{aIdx + 1}
                            </span>
                            <input
                              type="text"
                              value={aula.titulo}
                              onChange={(e) => {
                                const updated = [...cursoModulos];
                                updated[0].aulas[aIdx].titulo = e.target.value;
                                setCursoModulos(updated);
                              }}
                              className="bg-transparent text-xs text-white outline-none w-full font-bold focus:border-b focus:border-white/20"
                            />
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-[#8a96a3]">
                            <Clock className="w-3 h-3" />
                            <span>{aula.duracao || "Auto"}</span>
                            <span className="text-sky-400 font-mono">ID: {aula.videoId || ""}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveLessonUp(0, aIdx)}
                            disabled={aIdx === 0}
                            className="p-1 text-[#8a96a3] hover:text-white disabled:opacity-30 rounded hover:bg-white/5"
                            title="Mover para cima"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveLessonDown(0, aIdx)}
                            disabled={aIdx === (cursoModulos[0].aulas.length - 1)}
                            className="p-1 text-[#8a96a3] hover:text-white disabled:opacity-30 rounded hover:bg-white/5"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...cursoModulos];
                              updated[0].aulas = updated[0].aulas.filter((_: any, idx: number) => idx !== aIdx);
                              setCursoModulos(updated);
                            }}
                            className="text-red-500 hover:text-red-400 p-1 hover:bg-red-500/10 rounded transition-colors ml-1"
                            title="Remover vídeo"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-3 border-t border-white/5">
                <button
                  type="submit"
                  disabled={isSavingCurso}
                  className="flex-grow btn-gold-metallic py-3 rounded-2xl text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer transition-all"
                >
                  {isSavingCurso ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full" />
                      Salvando Curso...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Salvar Curso Completamente
                    </>
                  )}
                </button>
                {cursoId && (
                  <button
                    type="button"
                    onClick={() => {
                      setCursoId("");
                      setCursoTitulo("");
                      setCursoDesc("");
                      setCursoImagem("");
                      setProfessorNome("");
                      setProfessorEspecialidade("");
                      setProfessorBio("");
                      setProfessorFoto("");
                      setProfessorAtivo(false);
                      setCursoSecao("cursos");
                      setCursoVideoLink("");
                      setCursoModulos([{ id: "m-temp-1", titulo: "Módulo 1", aulas: [] }]);
                    }}
                    className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                    title="Descartar edição"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List display */}
          <div className="lg:col-span-7">
            <div className="bg-[#151b22]/50 border border-white/5 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="border-b border-white/5 pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-white font-display">
                  {cursoSecao === "treinamentos" ? "Treinamentos Cadastrados" : "Cursos Cadastrados"}
                </h3>
                <span className="text-xs text-[#8a96a3] font-mono">
                  {adminCursosFiltrados.length} {cursoSecao === "treinamentos" ? "treinamentos" : "cursos"} cadastrados
                </span>
              </div>

              <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto pr-1 scrollbar-slim space-y-1">
                {!restrictedData ? (
                  <div className="p-12 text-center text-[#8a96a3] text-xs animate-pulse">
                    Carregando grade da escola...
                  </div>
                ) : adminCursosFiltrados.length === 0 ? (
                  <div className="p-12 text-center text-[#8a96a3] text-xs">
                    {cursoSecao === "treinamentos" ? "Nenhum treinamento cadastrado ainda." : "Nenhum curso cadastrado ainda na escola."}
                  </div>
                ) : (
                  adminCursosFiltrados.map((c) => {
                    const profName = c.professorNome || (c as any).professor_nome || "";
                    const profFoto = c.professorFoto || (c as any).professor_foto || "";
                    const profSpec = c.professorEspecialidade || (c as any).professor_especialidade || "";

                    return (
                      <div key={c.id} className="py-4 flex items-center justify-between gap-4 text-xs group hover:bg-white/[0.01] px-2 rounded-xl transition-all">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="relative flex-shrink-0">
                            <img
                              src={c.imagem}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-14 h-14 object-cover rounded-xl border border-white/5 shadow-md"
                            />
                            {profFoto && (
                              <img
                                src={profFoto}
                                alt={profName || "Professor"}
                                title={profName}
                                referrerPolicy="no-referrer"
                                className="w-6 h-6 rounded-full object-cover absolute -bottom-1 -right-1 border-2 border-[#0b0f14] shadow-md"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-[#e8edf2] truncate text-sm">{c.titulo}</h4>
                            <p className="text-[11px] text-[#8a96a3] truncate mt-0.5">{c.descricao}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="bg-[#d12a62]/10 text-[#d12a62] text-[9px] px-2 py-0.5 rounded border border-[#d12a62]/20 font-bold uppercase tracking-wider">
                                {c.categoria}
                              </span>
                              {profName && (
                                <span className="bg-white/5 text-[#e8edf2] text-[9px] px-2 py-0.5 rounded border border-white/10 font-bold flex items-center gap-1">
                                  <span>Prof:</span>
                                  <strong className="text-white">{profName}</strong>
                                  {profSpec && <span className="text-[#8a96a3] font-normal">({profSpec})</span>}
                                </span>
                              )}
                              <span className="text-[10px] text-[#8a96a3] font-mono flex items-center gap-1.5">
                                <span>{c.modulos?.length || 0} módulos</span>
                                <span>•</span>
                                <span className="text-white font-semibold">{c.duracao}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleEditCurso(c)}
                            className="p-2 hover:bg-white/5 border border-white/5 hover:border-white/20 rounded-xl text-blue-400 hover:text-blue-300 transition-all cursor-pointer"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget({
                                type: "curso",
                                id: c.id,
                                title: c.titulo
                              });
                            }}
                            className="p-2 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-xl text-red-500 hover:text-red-400 transition-all cursor-pointer"
                            title="Excluir"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* TAB CONTENT 4: MATERIAIS CRUD */}
      {activeTab === "materiais" && (
        <div className="grid lg:grid-cols-12 gap-8 animate-fade-in">
          {/* Form */}
          <div className="lg:col-span-5">
            <form onSubmit={handleSaveMaterial} className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-6 md:p-8 space-y-5 shadow-2xl relative">
              <div className="border-b border-white/5 pb-3">
                <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                  <FolderDown className="w-5 h-5 text-[#d12a62]" />
                  ÁREA DE CADASTRO — MATERIAIS DE APOIO
                </h3>
                <p className="text-[11px] text-[#8a96a3] mt-1">
                  Cadastre folders, manuais e vídeos do YouTube para download e visualização pelos D.I.s.
                </p>
              </div>

              <p className="text-[10px] text-blue-400 bg-blue-500/5 border border-blue-500/20 p-3 rounded-2xl leading-relaxed">
                <FolderDown className="w-3.5 h-3.5 inline mr-1" />
                Os arquivos configurados neste painel estarão instantaneamente <strong>disponíveis para download</strong> na aba Biblioteca dos usuários logados com suas chaves de acesso.
              </p>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Título do Material *</label>
                <input
                  type="text"
                  value={matTitulo}
                  onChange={(e) => setMatTitulo(e.target.value)}
                  placeholder="Ex: Planilha de Conversão de Tráfego e ROI..."
                  className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all focus:ring-1 focus:ring-[#d12a62]/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Categoria do Recurso *</label>
                <select
                  value={matCategory}
                  onChange={(e) => setMatCategory(e.target.value)}
                  className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all"
                >
                  <option value="Folders">Folders</option>
                  <option value="Manuais">Manuais</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Imagem de Capa / Thumbnail (Upload) *</label>
                
                {/* Drag and Drop Zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingMatThumbnail(true);
                  }}
                  onDragLeave={() => setIsDraggingMatThumbnail(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingMatThumbnail(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleMaterialThumbnailFile(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                    isDraggingMatThumbnail
                      ? "border-[#d12a62] bg-[#d12a62]/10"
                      : "border-white/10 hover:border-white/20 bg-[#0b0f14]/50 hover:bg-[#0b0f14]"
                  }`}
                  onClick={() => {
                    const el = document.getElementById("mat-thumb-file-input");
                    if (el) el.click();
                  }}
                >
                  <input
                    id="mat-thumb-file-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleMaterialThumbnailFile(e.target.files[0]);
                      }
                    }}
                  />
                  
                  {matThumbnailLoading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-t-transparent border-[#d12a62] rounded-full animate-spin"></div>
                      <span className="text-[11px] text-[#8a96a3]">Fazendo upload da imagem...</span>
                    </div>
                  ) : (
                    <>
                      <Upload className={`w-6 h-6 ${isDraggingMatThumbnail ? "text-[#d12a62]" : "text-[#8a96a3]"}`} />
                      <div className="text-xs text-white font-medium">
                        Arraste uma foto aqui ou <span className="text-[#d12a62] font-semibold underline">escolha um arquivo</span>
                      </div>
                      <p className="text-[10px] text-[#8a96a3]">Formatos suportados: PNG, JPG, WEBP</p>
                    </>
                  )}
                </div>

                {/* Manual Text Input Fallback */}
                <div className="relative mt-2">
                  <input
                    type="text"
                    value={matThumbnail}
                    onChange={(e) => setMatThumbnail(e.target.value)}
                    placeholder="Caminho da imagem..."
                    className="w-full bg-[#0b0f14] border border-[#1f2937] focus:border-[#d12a62]/50 rounded-xl p-3 pl-10 text-xs text-[#e8edf2] outline-none transition-all focus:ring-1 focus:ring-[#d12a62]/30 font-mono"
                  />
                  <ImageIcon className="w-4 h-4 text-[#8a96a3] absolute left-3.5 top-3.5" />
                </div>
              </div>

              {/* Seletor se é Vídeo do YouTube ou Arquivo */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">
                  Tipo de Conteúdo do Material *
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-[#0b0f14] rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      if (matTipo === "video") setMatTipo("pdf");
                    }}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      matTipo !== "video"
                        ? "bg-[#d12a62]/20 text-white border border-[#d12a62]/40 shadow-sm"
                        : "text-[#8a96a3] hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-[#ff719e]" />
                    Arquivo (PDF, Fotos, DOC, Excel)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatTipo("video")}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      matTipo === "video"
                        ? "bg-red-600/20 text-red-400 border border-red-500/40 shadow-sm"
                        : "text-[#8a96a3] hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Youtube className="w-3.5 h-3.5 text-red-500" />
                    Vídeo do YouTube
                  </button>
                </div>
              </div>

              {/* Campo Condicional: Vídeo do YouTube ou Upload Único de Arquivo */}
              <div className="space-y-2">
                {matTipo === "video" ? (
                  <>
                    <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                      Link do Vídeo do YouTube *
                    </label>
                    <div className="relative">
                      <input
                        type="url"
                        value={matFileUrl}
                        onChange={(e) => setMatFileUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full bg-[#0b0f14] border border-white/10 focus:border-red-500/50 rounded-xl p-3 pl-10 text-xs text-[#e8edf2] outline-none transition-all focus:ring-1 focus:ring-red-500/30 font-mono"
                      />
                      <Youtube className="w-4 h-4 text-red-500 absolute left-3.5 top-3.5" />
                    </div>
                    <p className="text-[9px] text-[#8a96a3] leading-relaxed">
                      Upload de arquivos desabilitado. Este material é um vídeo — os D.I.s assistirão em um modal embutido.
                    </p>
                    {matFileUrl && /youtube\.com|youtu\.be/.test(matFileUrl) && (
                      <div className="flex items-center gap-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl">
                        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                        <span className="text-green-400 text-[11px] font-semibold">Link do YouTube reconhecido</span>
                      </div>
                    )}
                    {matFileUrl && !/youtube\.com|youtu\.be/.test(matFileUrl) && (
                      <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="text-red-400 text-[11px] font-semibold">Link não reconhecido como YouTube</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">
                      Upload de Arquivo (Fotos, PDF, DOC, Excel) *
                    </label>
                    
                    {matFileUrl && !matFileLoading ? (
                      <div className="p-3 bg-[#0b0f14] border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">
                              Arquivo pronto para download
                            </p>
                            <p className="text-[10px] text-[#8a96a3] font-mono truncate">
                              {matFileUrl}
                            </p>
                          </div>
                        </div>
                        <label className="cursor-pointer px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium rounded-lg transition-colors flex-shrink-0 flex items-center gap-1.5">
                          <Upload className="w-3 h-3" />
                          Trocar Arquivo
                          <input
                            type="file"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleMaterialDownloadFile(f);
                            }}
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="cursor-pointer bg-[#0b0f14]/60 hover:bg-[#0b0f14] border border-dashed border-white/20 hover:border-[#d12a62] rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all group text-center block">
                        {matFileLoading ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 text-[#d12a62] animate-spin" />
                            <span className="text-xs text-[#8a96a3]">Enviando arquivo para o Storage (materiais/)...</span>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-6 h-6 text-[#d12a62] group-hover:scale-110 transition-transform" />
                            <div className="text-xs text-white font-medium">
                              Arraste um arquivo ou <span className="text-[#d12a62] font-semibold underline">clique para selecionar</span>
                            </div>
                            <p className="text-[10px] text-[#8a96a3]">
                              Formatos aceitos: Fotos (PNG/JPG), PDF, DOC, DOCX, XLS, XLSX, ZIP
                            </p>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleMaterialDownloadFile(f);
                          }}
                        />
                      </label>
                    )}
                    <p className="text-[9px] text-[#8a96a3] leading-relaxed">
                      Os arquivos enviados por esta ferramenta são salvos automaticamente na pasta <code className="text-[#d12a62]">materiais/</code> no Supabase Storage.
                    </p>
                  </>
                )}
              </div>


              {matThumbnail ? (
                <div className="rounded-xl overflow-hidden border border-white/5 aspect-video relative group">
                  <img src={matThumbnail} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-end p-3">
                    <span className="text-[9px] font-mono text-white bg-black/60 px-2 py-0.5 rounded border border-white/10">Preview de Capa Carregada</span>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-white/10 rounded-2xl p-5 text-center flex flex-col items-center justify-center bg-black/15">
                  <Upload className="w-6 h-6 text-[#8a96a3] mb-1 animate-pulse" />
                  <span className="text-[10px] text-[#8a96a3] uppercase font-bold">Simulação de Upload de Arquivo</span>
                  <p className="text-[9px] text-[#8a96a3]/70 mt-1 max-w-[200px]">Os arquivos são protegidos por criptografia em repouso na CDN.</p>
                </div>
              )}

              <div className="p-3 bg-black/20 rounded-xl border border-white/5 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={true}
                  readOnly
                  className="accent-[#d12a62] w-4 h-4 rounded"
                />
                <div className="text-[11px]">
                  <p className="text-white font-semibold">Exige Login Autenticado</p>
                  <p className="text-[#8a96a3] text-[9px]">Sempre ativo por padrão para segurança de IP.</p>
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-white/5">
                <button
                  type="submit"
                  className="flex-grow btn-gold-metallic py-3 rounded-2xl text-xs flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Salvar Material
                </button>
                {matId && (
                  <button
                    type="button"
                    onClick={() => {
                      setMatId("");
                      setMatTitulo("");
                      setMatThumbnail("");
                      setMatFileUrl("");
                      setMatIsPublic(false);
                    }}
                    className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                    title="Descartar edição"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List display */}
          <div className="lg:col-span-7">
            <div className="bg-[#151b22]/50 border border-white/5 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="border-b border-white/5 pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-white font-display">
                  Biblioteca de Materiais de Apoio
                </h3>
                <span className="text-xs text-[#8a96a3] font-mono">
                  {restrictedData?.materiais.length || 0} recursos listados
                </span>
              </div>

              <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto pr-1 scrollbar-slim space-y-1">
                {!restrictedData ? (
                  <div className="p-12 text-center text-[#8a96a3] text-xs animate-pulse">
                    Carregando biblioteca...
                  </div>
                ) : restrictedData.materiais.length === 0 ? (
                  <div className="p-12 text-center text-[#8a96a3] text-xs">
                    Nenhum material de marketing ou arquivo adicionado.
                  </div>
                ) : (
                  restrictedData.materiais.map((m) => {
                    return (
                      <div key={m.id} className="py-4 flex items-center justify-between gap-4 text-xs group hover:bg-white/[0.01] px-2 rounded-xl transition-all">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="relative flex-shrink-0">
                            <img
                              src={m.thumbnail}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-14 h-14 object-cover rounded-xl border border-white/5 shadow-md"
                            />
                            <div className="absolute -bottom-1 -right-1 bg-black border border-white/10 p-1 rounded-lg">
                              {m.tipo === "image" && <ImageIcon className="w-3 h-3 text-[#d12a62]" />}
                              {m.tipo === "video" && <Video className="w-3 h-3 text-blue-400" />}
                              {m.tipo === "pdf" && <FileSpreadsheet className="w-3 h-3 text-green-400" />}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-[#e8edf2] truncate text-sm">{m.titulo}</h4>
                            <p className="text-[10px] text-[#8a96a3] truncate mt-0.5 font-mono">{m.fileUrl}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="bg-[#d12a62]/10 text-[#d12a62] text-[9px] px-2 py-0.5 rounded border border-[#d12a62]/20 font-bold uppercase tracking-wider">
                                {m.categoria}
                              </span>
                              <span className="text-[10px] text-[#8a96a3] font-mono">
                                Downloads Efetuados: <span className="text-white font-bold">{m.downloads}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleEditMaterial(m)}
                            className="p-2 hover:bg-white/5 border border-white/5 hover:border-white/20 rounded-xl text-blue-400 hover:text-blue-300 transition-all cursor-pointer"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget({
                                type: "material",
                                id: m.id,
                                title: m.titulo
                              });
                            }}
                            className="p-2 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-xl text-red-500 hover:text-red-400 transition-all cursor-pointer"
                            title="Excluir"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: FENIX SOCIAL ADMIN */}
      {activeTab === "fenix-social" && (
        <div className="space-y-8 animate-fade-in">
          {/* PARTE SUPERIOR: GERENCIADOR DE LINKS DE MODERAÇÃO */}
          <div className="space-y-4 border-b border-white/10 pb-8">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-400" />
              <h4 className="text-base font-bold text-white font-display">Links Pessoais de Moderação</h4>
            </div>
            <p className="text-xs text-[#8a96a3]">
              Crie links exclusivos para moderadores da equipe. Cada link concede acesso exclusivo à fila de análise sem precisar de conta de Administrador Geral.
            </p>

            {/* Form to Create Moderator Link */}
            <div className="bg-[#121820] border border-white/10 rounded-2xl p-5 space-y-3">
              <label className="block text-xs font-bold text-gray-200">Criar Novo Link de Moderador</label>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  value={novoModeradorNome}
                  onChange={(e) => setNovoModeradorNome(e.target.value)}
                  placeholder="Nome do moderador (Ex: Carlos Silva)"
                  className="flex-grow w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
                />
                <button
                  disabled={creatingModLink}
                  onClick={async () => {
                    if (!novoModeradorNome.trim()) {
                      triggerNotification("error", "Informe o nome de quem receberá o link de moderação.");
                      return;
                    }
                    setCreatingModLink(true);
                    const res = await createModeratorLink(novoModeradorNome.trim());
                    setCreatingModLink(false);
                    if (res.success) {
                      triggerNotification("success", "Link de moderador gerado com sucesso!");
                      setNovoModeradorNome("");
                    } else {
                      triggerNotification("error", res.error || "Erro ao gerar link de moderador.");
                    }
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 flex-shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  {creatingModLink ? "Gerando..." : "Gerar Link Pessoal"}
                </button>
              </div>
            </div>

            {/* Moderator Links Table / List */}
            <div className="bg-[#121820] border border-white/10 rounded-2xl p-5 space-y-3">
              <h5 className="text-xs font-bold text-gray-200">Links de Moderadores Ativos</h5>

              {moderatorLinks.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-2">Nenhum link de moderador gerado até o momento.</p>
              ) : (
                <div className="space-y-3">
                  {moderatorLinks.map((modLink) => {
                    const fullUrl = `${window.location.origin}/?modToken=${modLink.token}`;

                    return (
                      <div key={modLink.id} className="p-3.5 bg-white/5 border border-white/10 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white">{modLink.moderadorNome}</span>
                            <span className="text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono">
                              Moderador Pessoal
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-gray-400 break-all">
                            <Link2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                            <span>{fullUrl}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(fullUrl);
                              setCopiedLinkId(modLink.id);
                              setTimeout(() => setCopiedLinkId(null), 2500);
                            }}
                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            {copiedLinkId === modLink.id ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Link2 className="w-3.5 h-3.5" />
                                <span>Copiar Link</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => {
                              setDeleteTarget({
                                type: "moderator-link",
                                id: modLink.id,
                                title: `Link de ${modLink.moderadorNome}`
                              });
                            }}
                            className="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg transition-colors cursor-pointer"
                            title="Excluir link de moderador"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* PARTE INFERIOR: GESTÃO DE PUBLICAÇÕES APROVADAS */}
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h4 className="text-base font-bold text-white font-display flex items-center gap-2">
                  <Flame className="w-5 h-5 text-[#d12a62]" /> Gerenciamento de Publicações Aprovadas do Feed
                </h4>
                <p className="text-xs text-[#8a96a3] mt-0.5">
                  Lista de publicações já verificadas e aprovadas pelos moderadores. A análise e moderação de novas postagens é realizada exclusivamente pelos moderadores com o link pessoal.
                </p>
              </div>

              {/* Date Filter Bar */}
              <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/10 flex-shrink-0">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-white font-medium">Filtrar por data:</span>
                <input
                  type="date"
                  value={fenixDateFilter}
                  onChange={(e) => setFenixDateFilter(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#d12a62]"
                />
                {fenixDateFilter && (
                  <button
                    onClick={() => setFenixDateFilter("")}
                    className="px-2 py-1 bg-white/10 hover:bg-white/20 text-xs text-white rounded-lg transition-colors cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Approved Posts Compact List View */}
            {(() => {
              const approvedPosts = allFenixPosts.filter((p) => {
                if (p.status !== "aprovado") return false;
                if (!fenixDateFilter) return true;
                const pDate = p.dataPublicacao || new Date(p.createdAt).toISOString().substring(0, 10);
                return pDate === fenixDateFilter;
              });

              if (approvedPosts.length === 0) {
                return (
                  <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-sm text-gray-400">
                      {fenixDateFilter ? "Nenhuma publicação aprovada encontrada para esta data." : "Nenhuma publicação aprovada disponível no feed."}
                    </p>
                  </div>
                );
              }

              return (
                <div className="bg-[#121820] border border-white/10 rounded-2xl overflow-hidden shadow-xl w-full overflow-x-auto">
                  <div className="min-w-[800px]">
                    <table className="w-full text-left text-xs text-gray-300">
                      <thead className="bg-white/5 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/10">
                        <tr>
                          <th className="px-4 py-3">Mídia</th>
                          <th className="px-4 py-3">Autor</th>
                          <th className="px-4 py-3">Título / Legenda</th>
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {approvedPosts.map((post) => {
                          const mediaList = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls : [post.mediaUrl];
                          const firstMedia = mediaList[0];

                          return (
                            <tr key={post.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-3">
                                <div 
                                  onClick={() => setViewingFenixPost(post)}
                                  className="w-12 h-12 rounded-lg bg-black/60 overflow-hidden relative cursor-pointer group border border-white/10 flex-shrink-0"
                                  title="Clique para visualizar em tela cheia"
                                >
                                  {post.tipoMedia === "video" ? (
                                    <video src={firstMedia} className="w-full h-full object-cover" />
                                  ) : (
                                    <img src={firstMedia} alt="Mídia" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  )}
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <Eye className="w-4 h-4 text-white" />
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="font-bold text-white">{post.usuarioNome || "Autor"}</div>
                                <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Aprovado</div>
                              </td>
                              <td className="px-4 py-3 max-w-xs sm:max-w-md">
                                {post.titulo && (
                                  <div className="font-bold text-amber-300 text-xs mb-0.5">{post.titulo}</div>
                                )}
                                <div className="text-gray-300 truncate text-xs">{post.legenda}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-400 font-mono text-[11px]">
                                {post.dataPublicacao || new Date(post.createdAt).toLocaleDateString("pt-BR")}
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => setViewingFenixPost(post)}
                                    className="p-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-200 rounded-xl text-xs font-semibold border border-emerald-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                                    title="Visualizar Mídia e Conteúdo"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Visualizar</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setEditingFenixPost(post);
                                      setEditFenixTitulo(post.titulo || "");
                                      setEditFenixLegenda(post.legenda || "");
                                      setEditFenixAutor(post.usuarioNome || "");
                                      setEditFenixData(post.dataPublicacao || new Date(post.createdAt).toISOString().substring(0, 10));
                                      setEditFenixStatus(post.status);
                                    }}
                                    className="p-1.5 px-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 hover:text-blue-200 rounded-xl text-xs font-semibold border border-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                                    title="Editar Informações"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    <span>Editar</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setDeleteTarget({
                                        type: "fenix-post",
                                        id: post.id,
                                        title: post.titulo || post.legenda
                                      });
                                    }}
                                    className="p-1.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-xl text-xs font-semibold border border-red-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                                    title="Excluir Publicação"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Excluir</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* View Modal for Fenix Post */}
          {viewingFenixPost && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
              <div className="bg-[#121820] border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Aprovado
                    </span>
                    <h3 className="text-base font-bold text-white mt-1">
                      {viewingFenixPost.titulo || "Publicação Fênix"}
                    </h3>
                  </div>
                  <button
                    onClick={() => setViewingFenixPost(null)}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Author & Date */}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Autor: <strong className="text-white">{viewingFenixPost.usuarioNome}</strong></span>
                  <span className="font-mono">
                    {viewingFenixPost.dataPublicacao || new Date(viewingFenixPost.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>

                {/* Media Preview */}
                <div className="bg-black/60 rounded-xl overflow-hidden p-2 border border-white/5">
                  <FenixMediaCarousel
                    mediaUrls={viewingFenixPost.mediaUrls && viewingFenixPost.mediaUrls.length > 0 ? viewingFenixPost.mediaUrls : [viewingFenixPost.mediaUrl]}
                    tipoMedia={viewingFenixPost.tipoMedia}
                    caption={viewingFenixPost.legenda}
                  />
                </div>

                {/* Caption */}
                <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                  <h5 className="text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Descrição / Legenda:</h5>
                  <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-line">{viewingFenixPost.legenda}</p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
                  <button
                    onClick={() => {
                      const postToEdit = viewingFenixPost;
                      setViewingFenixPost(null);
                      setEditingFenixPost(postToEdit);
                      setEditFenixTitulo(postToEdit.titulo || "");
                      setEditFenixLegenda(postToEdit.legenda || "");
                      setEditFenixAutor(postToEdit.usuarioNome || "");
                      setEditFenixData(postToEdit.dataPublicacao || new Date(postToEdit.createdAt).toISOString().substring(0, 10));
                      setEditFenixStatus(postToEdit.status);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar Publicação
                  </button>
                  <button
                    onClick={() => setViewingFenixPost(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Modal for Fenix Post */}
          {editingFenixPost && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
              <div className="bg-[#121820] border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <h3 className="text-lg font-bold text-white">Editar Publicação Fênix</h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">Título</label>
                    <input
                      type="text"
                      value={editFenixTitulo}
                      onChange={(e) => setEditFenixTitulo(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-[#d12a62]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-300 mb-1">Descrição / Legenda</label>
                    <textarea
                      rows={3}
                      value={editFenixLegenda}
                      onChange={(e) => setEditFenixLegenda(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-[#d12a62]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-300 mb-1">Nome do Autor</label>
                    <input
                      type="text"
                      value={editFenixAutor}
                      onChange={(e) => setEditFenixAutor(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-[#d12a62]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">Data da Publicação</label>
                      <input
                        type="date"
                        value={editFenixData}
                        onChange={(e) => setEditFenixData(e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-[#d12a62]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-300 mb-1">Status</label>
                      <select
                        value={editFenixStatus}
                        onChange={(e) => setEditFenixStatus(e.target.value as any)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-[#d12a62]"
                      >
                        <option value="aprovado">Aprovado</option>
                        <option value="pendente">Pendente</option>
                        <option value="recusado">Recusado</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/5">
                  <button
                    onClick={() => setEditingFenixPost(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-gray-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await updateFenixPostAdmin(editingFenixPost.id, {
                        titulo: editFenixTitulo,
                        legenda: editFenixLegenda,
                        usuarioNome: editFenixAutor,
                        dataPublicacao: editFenixData,
                        status: editFenixStatus
                      });
                      if (ok) {
                        triggerNotification("success", "Publicação atualizada com sucesso!");
                        setEditingFenixPost(null);
                        fetchAllFenixPostsAdmin();
                      } else {
                        triggerNotification("error", "Erro ao atualizar publicação.");
                      }
                    }}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-[#d12a62] hover:bg-[#b91c1c] text-white shadow-lg shadow-[#d12a62]/20 cursor-pointer"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {/* TAB CONTENT: CONEXÕES — STATUS Supabase Storage + Vimeo (sem credenciais) */}
      {activeTab === "servidores" && <ExternalServers />}

{resetSupEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#121820] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gold-metallic rounded-xl">
                <RefreshCw className="w-6 h-6 text-black" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-display">Redefinir senha</h3>
                <p className="text-[11px] text-[#8a96a3]">
                  Passa uma nova senha temporária a {resetSupNome || resetSupEmail}. No próximo acesso,
                  o responsável definirá a própria senha.
                </p>
              </div>
            </div>
            <form onSubmit={handleResetSupportPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display">Nova senha temporária</label>
                <input
                  type="password"
                  value={resetSupNovaSenha}
                  onChange={(e) => setResetSupNovaSenha(e.target.value)}
                  placeholder="Mínimo 8, com letras e números"
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display">Confirmar senha temporária</label>
                <input
                  type="password"
                  value={resetSupConfirma}
                  onChange={(e) => setResetSupConfirma(e.target.value)}
                  placeholder="Repita a senha"
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                  required
                />
              </div>
              {resetSupError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{resetSupError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeResetSupportPassword}
                  className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#c9d2dc] hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetSupLoading}
                  className="px-4 py-2.5 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider hover:brightness-110 transition-all duration-300 flex items-center gap-2 disabled:opacity-50"
                >
                  {resetSupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Redefinir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

{deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#121820] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                <Trash className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Confirmar Exclusão</h3>
                <p className="text-xs text-[#8a96a3]">Esta ação não poderá ser desfeita.</p>
              </div>
            </div>

            <p className="text-sm text-gray-300 bg-white/5 p-3 rounded-xl border border-white/5">
              Tem certeza que deseja excluir <strong className="text-white">"{deleteTarget.title}"</strong>?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-gray-300 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = deleteTarget;
                  setDeleteTarget(null);
                  if (target.type === "curso") {
                    const deleted = await deleteCurso(target.id);
                    if (deleted) triggerNotification("success", "Curso removido com sucesso!");
                    else triggerNotification("error", "Erro ao remover curso.");
                  } else if (target.type === "banner") {
                    const deleted = await deleteBanner(target.id);
                    if (deleted) triggerNotification("success", "Banner removido com sucesso!");
                    else triggerNotification("error", "Erro ao remover banner.");
                  } else if (target.type === "novidade") {
                    const deleted = await deleteNovidade(target.id);
                    if (deleted) triggerNotification("success", "Novidade removida com sucesso!");
                    else triggerNotification("error", "Erro ao remover novidade.");
                  } else if (target.type === "material") {
                    const deleted = await deleteMaterial(target.id);
                    if (deleted) triggerNotification("success", "Material removido com sucesso!");
                    else triggerNotification("error", "Erro ao remover material.");
                  } else if (target.type === "logo") {
                    setLogoLoading(true);
                    const ok = await resetLogo();
                    if (ok) triggerNotification("success", "Logo restaurada para o padrão.");
                    else triggerNotification("error", "Não foi possível restaurar a logo padrão.");
                    setLogoLoading(false);
                  } else if (target.type === "categoria") {
                    const updated = categoriasList.filter(c => c !== target.id);
                    const res = await saveCategoriasMateriais(updated);
                    if (res.success) {
                      triggerNotification("success", `Categoria "${target.id}" removida!`);
                      if (matCategory === target.id) {
                        setMatCategory(updated[0] || "Geral");
                      }
                    } else {
                      triggerNotification("error", res.error || "Erro ao remover categoria.");
                    }
                  } else if (target.type === "fenix-post") {
                    const ok = await deleteFenixPostAdmin(target.id);
                    if (ok) triggerNotification("success", "Publicação removida com sucesso!");
                    else triggerNotification("error", "Erro ao remover publicação.");
                  } else if (target.type === "moderator-link") {
                    const ok = await deleteModeratorLink(target.id);
                    if (ok) triggerNotification("success", "Link de moderador removido com sucesso!");
                    else triggerNotification("error", "Erro ao remover link de moderador.");
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 transition-all cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIMEO ACCOUNT VIDEO PICKER MODAL */}
      {showVimeoPickerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#121820] border border-sky-500/30 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 bg-[#171f2b] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-sky-500/20 to-blue-600/20 border border-sky-500/30 rounded-2xl text-sky-400">
                  <Film className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-white">Minha Conta Vimeo (API Node.js)</h3>
                    {vimeoAccountInfo && (
                      <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded border border-sky-500/30">
                        {vimeoAccountInfo.accountType}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8a96a3]">
                    Marque um ou mais vídeos da sua conta Vimeo e clique em "Adicionar" para incluí-los na grade.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowVimeoPickerModal(false)}
                className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Account Info Bar & Search */}
            <div className="p-4 bg-[#0d1218] border-b border-white/5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={vimeoPickerSearch}
                  onChange={(e) => {
                    setVimeoPickerSearch(e.target.value);
                    loadMyVimeoVideos(1, e.target.value);
                  }}
                  placeholder="Pesquisar vídeo por título ou palavra-chave..."
                  className="w-full bg-[#151b22] border border-white/10 rounded-xl p-2.5 pl-9 text-xs text-white outline-none focus:border-sky-500"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadMyVimeoVideos(vimeoPickerPage, vimeoPickerSearch)}
                  disabled={vimeoPickerLoading}
                  className="p-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Atualizar lista de vídeos"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${vimeoPickerLoading ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Atualizar</span>
                </button>
              </div>
            </div>

            {/* Modal Content / Video List */}
            <div className="p-5 flex-1 overflow-y-auto space-y-3">
              {vimeoPickerLoading ? (
                <div className="py-16 text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-sky-400 mx-auto" />
                  <p className="text-xs text-sky-300 font-bold">Conectando à API do Vimeo e buscando vídeos da sua conta...</p>
                </div>
              ) : vimeoPickerError ? (
                <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-center space-y-3">
                  <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                  <div>
                    <p className="text-xs font-bold text-red-300">{vimeoPickerError}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Certifique-se de configurar seu Personal Access Token na aba <strong>Servidores Externos</strong> no painel de administração.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVimeoPickerModal(false);
                      setActiveTab("servidores");
                    }}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-black font-extrabold text-xs rounded-xl shadow cursor-pointer"
                  >
                    Ir para Configurações de Servidores Externos
                  </button>
                </div>
              ) : vimeoAccountVideos.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Film className="w-10 h-10 text-gray-600 mx-auto" />
                  <p className="text-xs font-bold text-gray-300">Nenhum vídeo encontrado na sua conta Vimeo.</p>
                  <p className="text-[11px] text-gray-500">Faça o upload de novos vídeos no Vimeo ou tente outra busca.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {vimeoAccountVideos.map((vid: any) => {
                    const isSelected = !!vimeoPickerSelected[vid.id];
                    return (
                      <button
                        type="button"
                        key={vid.id}
                        onClick={() => toggleVimeoPickerVideo(vid.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-sky-500/15 border-sky-500/60"
                            : "bg-[#171f2b] border-white/10 hover:border-sky-500/40"
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="relative w-20 h-12 rounded-lg overflow-hidden bg-black flex-shrink-0">
                          {vid.thumbnail ? (
                            <img src={vid.thumbnail} alt={vid.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-600">
                              <Film className="w-5 h-5" />
                            </div>
                          )}
                          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-mono font-bold px-1 py-0.5 rounded">
                            {vid.durationFormatted}
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-white truncate">{vid.title}</h4>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-[#8a96a3]">
                            <span className="font-mono text-sky-400">ID: {vid.id}</span>
                            {vid.privacy?.view && (
                              <span className="bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">{vid.privacy.view}</span>
                            )}
                          </div>
                        </div>

                        {/* Checkbox */}
                        <div className={`w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all ${
                          isSelected ? "bg-sky-500 border-sky-500" : "bg-white/5 border-white/20"
                        }`}>
                          {isSelected && <Check className="w-4 h-4 text-black" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer / Pagination */}
            <div className="p-4 border-t border-white/10 bg-[#171f2b] flex items-center justify-between gap-3 text-xs text-gray-400 flex-wrap">
              <span>
                {Object.keys(vimeoPickerSelected).length > 0 ? (
                  <span className="text-sky-300 font-bold">{Object.keys(vimeoPickerSelected).length} selecionado(s)</span>
                ) : (
                  <>Total de vídeos na conta: <strong className="text-white">{vimeoPickerTotal}</strong></>
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadMyVimeoVideos(vimeoPickerPage - 1, vimeoPickerSearch)}
                  disabled={vimeoPickerPage <= 1 || vimeoPickerLoading}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg font-bold disabled:opacity-40 cursor-pointer"
                >
                  Anterior
                </button>
                <span className="text-white font-mono text-xs">Página {vimeoPickerPage}</span>
                <button
                  type="button"
                  onClick={() => loadMyVimeoVideos(vimeoPickerPage + 1, vimeoPickerSearch)}
                  disabled={vimeoAccountVideos.length < 18 || vimeoPickerLoading}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg font-bold disabled:opacity-40 cursor-pointer"
                >
                  Próxima
                </button>
                <button
                  type="button"
                  onClick={handleAddSelectedVimeoVideos}
                  disabled={vimeoPickerLoading || Object.keys(vimeoPickerSelected).length === 0}
                  className="ml-2 px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-black font-extrabold text-xs rounded-lg shadow cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" />
                  Adicionar ({Object.keys(vimeoPickerSelected).length})
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* TAB CONTENT: PÁGINAS (EDITOR UNIFICADO DE CONTEÚDO INSTITUCIONAL) */}
      {activeTab === "paginas" && (
        <div className="space-y-8 animate-fade-in">
          <PaginaEditor />
        </div>
      )}
    </div>
  );
}
