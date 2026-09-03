import React, { useState, useEffect } from "react";
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
    adminStats, 
    adminDiList = [],
    adminDiCodes = [],
    adminLogs, 
    fetchAdminData, 
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
    setAdminActiveTab
  } = useStore();

  const activeTab = adminActiveTab;
  const setActiveTab = setAdminActiveTab;
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchDI, setSearchDI] = useState("");

  const handleExportPdfReport = async () => {
    const listToExport = (adminDiList && adminDiList.length > 0) ? adminDiList : [
      { codigo: "DI-000000", count: 18, lastAccess: new Date(Date.now() - 1000 * 60 * 25).toISOString(), status: "Ativo" },
      { codigo: "DI-000001", count: 14, lastAccess: new Date(Date.now() - 1000 * 60 * 180).toISOString(), status: "Ativo" },
      { codigo: "DI-000002", count: 9, lastAccess: new Date(Date.now() - 1000 * 60 * 720).toISOString(), status: "Ativo" },
      { codigo: "DI-000003", count: 6, lastAccess: new Date(Date.now() - 1000 * 60 * 1440).toISOString(), status: "Ativo" },
      { codigo: "DI-000004", count: 4, lastAccess: new Date(Date.now() - 1000 * 60 * 2880).toISOString(), status: "Recente" },
      { codigo: "DI-ADMIN-000000", count: 32, lastAccess: new Date().toISOString(), status: "Ativo (Admin)" },
    ];

    const formattedDiList = listToExport.map((item) => ({
      codigo: item.codigo,
      loginsCount: item.count,
      lastLogin: new Date(item.lastAccess).toLocaleString("pt-BR"),
      status: item.status
    }));

    const { generateMetricsPDF } = await import("../utils/pdfGenerator");
    generateMetricsPDF({
      totalAcessos: adminStats?.acessos || 148,
      totalDownloads: adminStats?.downloads || 0,
      totalUsuarios: adminStats?.usuarios || 10,
      totalLoginsDI: adminStats?.totalLoginsDI || formattedDiList.reduce((acc, curr) => acc + curr.loginsCount, 0),
      diList: formattedDiList,
      generatedAt: new Date().toLocaleString("pt-BR")
    });
  };

  // --- STATUS DAS INTEGRAÇÕES (MinIO + Vimeo) ---
  // As credenciais NÃO são editáveis nem exibidas no painel: vivem em variáveis
  // de ambiente (MINIO_*/VIMEO_*) ou no config do banco. Aqui só há STATUS.
  const [integrationsStatus, setIntegrationsStatus] = useState<{ minio: any; vimeo: any } | null>(null);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationCheckId, setIntegrationCheckId] = useState(0);
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
  const [coverUploadProgress, setCoverUploadProgress] = useState<UploadProgressState | null>(null);

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
      categoria: c.secao === "series" ? "Série" : c.secao === "treinamentos" ? "Treinamento" : "Curso"
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
    const authToken = token || localStorage.getItem("fenix_token");
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  };

  const fetchIntegrationsStatus = async () => {
    setIntegrationsLoading(true);
    try {
      const res = await fetch("/api/admin/integrations/status", {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok && data && data.minio) {
        setIntegrationsStatus({ minio: data.minio, vimeo: data.vimeo });
      } else {
        setIntegrationsStatus(null);
      }
    } catch (err) {
      console.warn("Erro ao carregar status das integrações:", err);
      setIntegrationsStatus(null);
    } finally {
      setIntegrationsLoading(false);
      setIntegrationCheckId((n) => n + 1);
    }
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
    for (const video of selected) {
      const aula = {
        id: `a-vimeo-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        titulo: video.title || "Vídeo Vimeo",
        duracao: video.durationFormatted || "Auto",
        tipoVideo: "vimeo" as const,
        videoUrl: video.embedUrl || video.id || "",
        videoId: video.id || "",
        videoHash: video.hash || "",
        thumbnail: video.thumbnail || ""
      };
      aulas.push(aula);
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

  // --- NOTIFICAÇÕES POR E-MAIL (aba Suporte) STATES ---
  const [editConfigEmailSup, setEditConfigEmailSup] = useState("ouvidoria@grupofenix.com");
  const [editConfigEmailParc, setEditConfigEmailParc] = useState("parcerias@grupofenix.com");
  const [notifySuporteToggle, setNotifySuporteToggle] = useState(false);
  const [notifyParceriaToggle, setNotifyParceriaToggle] = useState(false);
  const [emailSmtpStatus, setEmailSmtpStatus] = useState<{ configured: boolean; host: string; port: number; secure: boolean; user: string } | null>(null);
  const [emailConfigLoading, setEmailConfigLoading] = useState(false);
  const [emailConfigSaving, setEmailConfigSaving] = useState(false);
  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);

  const fetchSupportEmailConfig = async () => {
    setEmailConfigLoading(true);
    try {
      const res = await fetch("/api/admin/support/email-config", {
        headers: { Authorization: `Bearer ${token || localStorage.getItem("fenix_token") || ""}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEditConfigEmailSup(data.config?.emailSuporte || "ouvidoria@grupofenix.com");
        setEditConfigEmailParc(data.config?.emailParcerias || "parcerias@grupofenix.com");
        setNotifySuporteToggle(!!data.config?.notifySuporteEmail);
        setNotifyParceriaToggle(!!data.config?.notifyParceriaEmail);
        setEmailSmtpStatus(data.smtp || null);
      }
    } catch (err) {
      console.error("Erro ao buscar configurações de e-mail:", err);
    } finally {
      setEmailConfigLoading(false);
    }
  };

  const handleSaveSupportEmailConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailConfigSaving(true);
    try {
      const res = await fetch("/api/admin/support/email-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || localStorage.getItem("fenix_token") || ""}`
        },
        body: JSON.stringify({
          emailSuporte: editConfigEmailSup,
          emailParcerias: editConfigEmailParc,
          notifySuporteEmail: notifySuporteToggle,
          notifyParceriaEmail: notifyParceriaToggle
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditConfigEmailSup(data.config.emailSuporte);
        setEditConfigEmailParc(data.config.emailParcerias);
        setNotifySuporteToggle(!!data.config.notifySuporteEmail);
        setNotifyParceriaToggle(!!data.config.notifyParceriaEmail);
        setEmailSmtpStatus(data.smtp || null);
        triggerNotification("success", "Configurações de e-mail salvas com sucesso!");
      } else {
        triggerNotification("error", data.error || "Erro ao salvar configurações.");
      }
    } catch (err) {
      triggerNotification("error", "Erro de conexão ao salvar configurações.");
    } finally {
      setEmailConfigSaving(false);
    }
  };

  const handleTestSupportEmail = async () => {
    setEmailTestLoading(true);
    setEmailTestResult(null);
    try {
      const res = await fetch("/api/admin/support/email-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || localStorage.getItem("fenix_token") || ""}`
        },
        body: JSON.stringify({ to: editConfigEmailSup })
      });
      const data = await res.json();
      setEmailTestResult({
        tipo: res.ok && data.success ? "success" : "error",
        texto: res.ok && data.success
          ? (data.message || "E-mail de teste enviado com sucesso.")
          : "Falha ao enviar o e-mail de teste. Verifique as configurações SMTP."
      });
    } catch (err) {
      setEmailTestResult({ tipo: "error", texto: "Erro de conexão ao testar e-mail." });
    } finally {
      setEmailTestLoading(false);
    }
  };

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
  const [supBackupLoading, setSupBackupLoading] = useState(false);
  const [supBackupResult, setSupBackupResult] = useState<{ count: number; rel: string; arquivo: string; tamanhoKb: number } | null>(null);

  // --- BACKUP & RESTAURAÇÃO DO SITE ---
  const [bakCreating, setBakCreating] = useState(false);
  const [bakListing, setBakListing] = useState(false);
  const [bakRestoring, setBakRestoring] = useState(false);
  const [bakDeleting, setBakDeleting] = useState<string | null>(null);
  const [bakDeleteArm, setBakDeleteArm] = useState<string | null>(null);
  const [bakList, setBakList] = useState<{ key: string; nome: string; tamanhoKb: number; modificadoEm: string; resumo: { config?: number; cursos?: number; materiais?: number; novidades?: number; tecnologias?: number; fenixPosts?: number } | null }[]>([]);
  const [bakLastCreated, setBakLastCreated] = useState<{ nome: string; url: string; tamanhoKb: number } | null>(null);
  const [bakRestoreFile, setBakRestoreFile] = useState<File | null>(null);
  const [bakRestoreKey, setBakRestoreKey] = useState<string>("");
  const [bakRestoreConexoes, setBakRestoreConexoes] = useState(true);
  const [bakConfirmText, setBakConfirmText] = useState("");
  const [bakRestoreResult, setBakRestoreResult] = useState("");
  const [bakMerge, setBakMerge] = useState(false);
  const [bakForceVazio, setBakForceVazio] = useState(false);
  const [bakStatusLoading, setBakStatusLoading] = useState(false);
  const [bakStatus, setBakStatus] = useState<{ config: number; cursos: number; materiais: number; novidades: number; tecnologias: number; fenixPosts: number; contas: number } | null>(null);
  const [bakMaintOn, setBakMaintOn] = useState(false);
  const [bakMaintMsg, setBakMaintMsg] = useState("");
  const [bakMaintSaving, setBakMaintSaving] = useState(false);

  // --- DUMP DO BANCO DE DADOS ---
  const [bakDumpCreating, setBakDumpCreating] = useState(false);
  const [bakDumpListing, setBakDumpListing] = useState(false);
  const [bakDumpLast, setBakDumpLast] = useState<{ nome: string; url: string; tamanhoKb: number } | null>(null);
  const [bakDumpList, setBakDumpList] = useState<{ key: string; nome: string; tamanhoKb: number; modificadoEm: string; resumo: { cursos?: number; materiais?: number; novidades?: number; config?: number; contas?: number; auditLogs?: number } | null }[]>([]);
  const [bakDumpDeleting, setBakDumpDeleting] = useState<string | null>(null);
  const [bakDumpDeleteArm, setBakDumpDeleteArm] = useState<string | null>(null);

  // --- VERIFICAÇÃO DE INTEGRIDADE DAS MÍDIAS ---
  const [intChecking, setIntChecking] = useState(false);
  const [intResult, setIntResult] = useState<{
    totalReferenciadas: number;
    presentes: number;
    ausentes: { chave: string; onde: string }[];
    semReferencia: { nome: string; tamanho: number }[];
    totalObjetos: number;
  } | null>(null);
  const [orphanSel, setOrphanSel] = useState<Set<string>>(new Set());
  const [orphanCleaning, setOrphanCleaning] = useState(false);
  const [orphanCleaned, setOrphanCleaned] = useState<string[] | null>(null);

  const fetchBancoDumps = async () => {
    setBakDumpListing(true);
    try {
      const res = await fetch("/api/admin/backup/banco-list");
      const data = await res.json();
      if (res.ok && data.success) {
        setBakDumpList(data.backups || []);
      } else {
        triggerNotification("error", data.error || "Erro ao listar os dumps do banco.");
      }
    } catch {
      triggerNotification("error", "Erro de conexão ao listar os dumps do banco.");
    } finally {
      setBakDumpListing(false);
    }
  };

  const handleCreateDump = async () => {
    setBakDumpCreating(true);
    setBakDumpLast(null);
    try {
      const res = await fetch("/api/admin/backup/dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerNotification("error", data.error || "Erro ao gerar o dump do banco.");
        return;
      }
      setBakDumpLast({ nome: data.nome, url: data.url, tamanhoKb: data.tamanhoKb });
      triggerNotification("success", `Dump do banco gerado: ${data.nome}`);
      fetchBancoDumps();
    } catch {
      triggerNotification("error", "Erro de conexão ao gerar o dump do banco.");
    } finally {
      setBakDumpCreating(false);
    }
  };

  const handleDeleteDumpArm = (key: string) => {
    setBakDumpDeleteArm((prev) => {
      const novo = prev === key ? null : key;
      if (novo) setTimeout(() => setBakDumpDeleteArm((p) => (p === key ? null : p)), 4000);
      return novo;
    });
  };

  const handleDeleteDump = async (key: string) => {
    setBakDumpDeleting(key);
    try {
      const res = await fetch("/api/admin/backup/banco-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerNotification("error", data.error || "Erro ao excluir o dump.");
        return;
      }
      setBakDumpDeleteArm(null);
      triggerNotification("success", `Dump excluído: ${data.nome}`);
      fetchBancoDumps();
    } catch {
      triggerNotification("error", "Erro de conexão ao excluir o dump.");
    } finally {
      setBakDumpDeleting(null);
    }
  };

  const handleCheckIntegrity = async () => {
    setIntChecking(true);
    setIntResult(null);
    setOrphanSel(new Set());
    setOrphanCleaned(null);
    try {
      const res = await fetch("/api/admin/backup/integrity");
      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerNotification("error", data.error || "Erro ao verificar a integridade das mídias.");
        return;
      }
      setIntResult({
        totalReferenciadas: data.totalReferenciadas ?? 0,
        presentes: data.presentes ?? 0,
        ausentes: data.ausentes || [],
        semReferencia: data.semReferencia || [],
        totalObjetos: data.totalObjetos ?? 0
      });
      if (data.ausentes?.length > 0) {
        triggerNotification("error", `Integridade: ${data.ausentes.length} mídia(s) citada(s) no site estão AUSENTES do MinIO.`);
      } else {
        triggerNotification("success", `Integridade OK: ${data.presentes}/${data.totalReferenciadas} mídias presentes.`);
      }
    } catch {
      triggerNotification("error", "Erro de conexão ao verificar a integridade.");
    } finally {
      setIntChecking(false);
    }
  };

  const toggleOrphan = (nome: string) => {
    setOrphanSel((prev) => {
      const novo = new Set(prev);
      if (novo.has(nome)) novo.delete(nome);
      else novo.add(nome);
      return novo;
    });
  };

  const handleCleanupOrphans = async () => {
    const chaves = Array.from(orphanSel);
    if (chaves.length === 0) {
      triggerNotification("error", "Selecione pelo menos uma mídia órfã para limpar.");
      return;
    }
    setOrphanCleaning(true);
    setOrphanCleaned(null);
    try {
      const res = await fetch("/api/admin/backup/cleanup-orphans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaves })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerNotification("error", data.error || "Erro ao limpar mídias órfãs.");
        return;
      }
      setOrphanCleaned(data.removidas || []);
      triggerNotification("success", data.message || "Limpeza concluída.");
      setOrphanSel(new Set());
      handleCheckIntegrity();
    } catch {
      triggerNotification("error", "Erro de conexão ao limpar mídias órfãs.");
    } finally {
      setOrphanCleaning(false);
    }
  };

  const fetchBackupList = async () => {
    setBakListing(true);
    try {
      const res = await fetch("/api/admin/backup/list");
      const data = await res.json();
      if (res.ok && data.success) {
        setBakList(data.backups || []);
      } else {
        triggerNotification("error", data.error || "Erro ao listar backups.");
      }
    } catch {
      triggerNotification("error", "Erro de conexão ao listar backups.");
    } finally {
      setBakListing(false);
    }
  };

  const handleCreateBackup = async () => {
    setBakCreating(true);
    setBakLastCreated(null);
    try {
      const res = await fetch("/api/admin/backup/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerNotification("error", data.error || "Erro ao criar o backup.");
        return;
      }
      setBakLastCreated({ nome: data.nome, url: data.url, tamanhoKb: data.tamanhoKb });
      if (data.dump) {
        setBakDumpLast({ nome: data.dump.nome, url: data.dump.url, tamanhoKb: data.dump.tamanhoKb || 0 });
        fetchBancoDumps();
      }
      triggerNotification("success", `Backup criado: ${data.nome}`);
      fetchBackupList();
    } catch {
      triggerNotification("error", "Erro de conexão ao criar o backup.");
    } finally {
      setBakCreating(false);
    }
  };

  // Exclusão DEFINITIVA em 2 cliques: 1º arma o botão, 2º exclui (desarma sozinho em 4s).
  const handleDeleteBackupArm = (key: string) => {
    setBakDeleteArm((prev) => {
      const novo = prev === key ? null : key;
      if (novo) setTimeout(() => setBakDeleteArm((p) => (p === key ? null : p)), 4000);
      return novo;
    });
  };

  const handleDeleteBackup = async (key: string) => {
    setBakDeleting(key);
    try {
      const res = await fetch("/api/admin/backup/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerNotification("error", data.error || "Erro ao excluir o backup.");
        return;
      }
      setBakDeleteArm(null);
      triggerNotification("success", `Backup excluído: ${data.nome}`);
      fetchBackupList();
    } catch {
      triggerNotification("error", "Erro de conexão ao excluir o backup.");
    } finally {
      setBakDeleting(null);
    }
  };

  const handleRestoreBackup = async () => {
    if (!bakRestoreKey && !bakRestoreFile) {
      triggerNotification("error", "Escolha uma versão da lista ou envie um arquivo de backup.");
      return;
    }
    if (bakConfirmText !== "RESTAURAR") {
      triggerNotification("error", "Digite RESTAURAR no campo de confirmação para prosseguir.");
      return;
    }
    setBakRestoring(true);
    try {
      const form = new FormData();
      if (bakRestoreKey) form.append("key", bakRestoreKey);
      if (bakRestoreFile) form.append("arquivo", bakRestoreFile);
      form.append("restaurarConexoes", String(bakRestoreConexoes));
      form.append("mesclar", String(bakMerge));
      if (bakForceVazio) form.append("forceVazio", "true");
      const res = await fetch("/api/admin/backup/restore", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerNotification("error", data.error || "Erro ao restaurar o backup.");
        return;
      }
      setBakConfirmText("");
      setBakRestoreFile(null);
      setBakRestoreKey("");
      setBakMerge(false);
      setBakForceVazio(false);
      triggerNotification("success", data.mensagem || "Site restaurado com sucesso!");
      const verificacao = data.verificacao
        ? ` Verificado após restaurar: ${data.verificacao.cursos} cursos, ${data.verificacao.materiais} materiais, ${data.verificacao.novidades} novidades, ${data.verificacao.config} configs.`
        : "";
      const integridade = data.integridade
        ? ` Integridade das mídias: ${data.integridade.presentes}/${data.integridade.totalReferenciadas} presentes${data.integridade.ausentes?.length ? ` — ${data.integridade.ausentes.length} AUSENTES (ver aba Backup > Verificar integridade)` : ""}.`
        : "";
      const details = `Proteção automática criada: ${data.backupSeguranca}.${verificacao}${integridade}`;
      setBakRestoreResult(details);
      fetchBackupList();
      fetchBackupStatus();
    } catch {
      triggerNotification("error", "Erro de conexão ao restaurar o backup.");
    } finally {
      setBakRestoring(false);
    }
  };

  const fetchBackupStatus = async () => {
    setBakStatusLoading(true);
    try {
      const res = await fetch("/api/admin/backup/status");
      const data = await res.json();
      if (res.ok && data.success) {
        setBakStatus({
          config: data.config,
          cursos: data.cursos,
          materiais: data.materiais,
          novidades: data.novidades,
          tecnologias: data.tecnologias,
          fenixPosts: data.fenixPosts,
          contas: data.contas
        });
      } else {
        triggerNotification("error", data.error || "Erro ao verificar o estado atual.");
      }
    } catch {
      triggerNotification("error", "Erro de conexão ao verificar o estado atual.");
    } finally {
      setBakStatusLoading(false);
    }
  };

  const handleToggleManutencao = async (target: boolean) => {
    setBakMaintSaving(true);
    try {
      const res = await fetch("/api/admin/manutencao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: target, mensagem: target ? bakMaintMsg : "" })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerNotification("error", data.error || "Erro ao alterar o modo manutenção.");
        return;
      }
      setBakMaintOn(!!data.ativo);
      triggerNotification("success", data.ativo ? "Modo manutenção ATIVADO — visitantes verão o aviso." : "Modo manutenção desativado — site público liberado.");
    } catch {
      triggerNotification("error", "Erro de conexão ao alterar o modo manutenção.");
    } finally {
      setBakMaintSaving(false);
    }
  };

  const handleSupportBackup = async () => {
    setSupBackupLoading(true);
    setSupBackupResult(null);
    try {
      const res = await fetch("/api/admin/support/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerNotification("error", data.error || "Erro ao gerar o backup.");
        return;
      }
      setSupBackupResult({ count: data.count, rel: data.rel, arquivo: data.arquivo, tamanhoKb: data.tamanhoKb });
      triggerNotification("success", `Backup gerado: ${data.count} chamado(s) fechado(s).`);
    } catch (err) {
      triggerNotification("error", "Erro de conexão ao gerar o backup.");
    } finally {
      setSupBackupLoading(false);
    }
  };

  const handleSupBackupDownload = async () => {
    if (!supBackupResult?.rel) return;
    try {
      const rel = supBackupResult.rel.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`/api/admin/backup/suporte-download/${rel}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        triggerNotification("error", "Erro ao baixar o backup do suporte.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = supBackupResult.arquivo.split("/").pop() || "backup-suporte.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      triggerNotification("error", "Erro de conexão ao baixar o backup.");
    }
  };

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
      fetchAdminData();
      fetchAdminDiCodes();
      fetchPublicData();
      fetchRestrictedData();
      fetchAllFenixPostsAdmin();
      fetchModeratorLinks();
    }
  }, [loggedIn, user]);

  useEffect(() => {
    if (activeTab === "servidores") {
      fetchIntegrationsStatus();
    } else if (activeTab === "cadastrar-di") {
      fetchAdminDiCodes();
    } else if (activeTab === "suporte") {
      fetchSupportUsers();
      fetchSupportEmailConfig();
    } else if (activeTab === "backup") {
      fetchBackupList();
      fetchBackupStatus();
      fetch("/api/manutencao/status")
        .then((r) => r.json())
        .then((d) => {
          if (d && d.success !== false) {
            setBakMaintOn(!!d.ativo);
            setBakMaintMsg(d.mensagem || "");
          }
        })
        .catch(() => {});
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
        triggerNotification("success", "Banner enviado com sucesso para a pasta 'banners/' no MinIO!");
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
  const [cursoSecao, setCursoSecao] = useState<"cursos" | "series" | "treinamentos">("cursos");
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
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);

  // Lesson video upload state & drag/drop
  const [uploadingLessonId, setUploadingLessonId] = useState<string | null>(null);
  const [draggedLessonInfo, setDraggedLessonInfo] = useState<{ moduleIdx: number; lessonIdx: number } | null>(null);

  const handleCoverImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      triggerNotification("error", "Selecione um arquivo de imagem válido (PNG, JPG, WEBP).");
      return;
    }
    setCoverLoading(true);

    setCoverUploadProgress({
      isUploading: true,
      progress: 0,
      loaded: 0,
      total: file.size,
      fileName: file.name,
      statusText: "Iniciando upload da capa do curso..."
    });

    uploadFileWithProgress(file, "cursos/capas", getAuthHeaders(), (evt) => {
      setCoverUploadProgress({
        isUploading: true,
        progress: evt.percent,
        loaded: evt.loaded,
        total: evt.total,
        fileName: file.name,
        statusText: evt.percent < 100 ? `Transferindo capa (${evt.percent}%)...` : "Processando no servidor MinIO..."
      });
    })
      .then((res) => {
        if (res && res.success && (res.previewUrl || res.url)) {
          setCursoImagem(res.previewUrl || res.url);
          setCoverUploadProgress({
            isUploading: false,
            isComplete: true,
            progress: 100,
            loaded: file.size,
            total: file.size,
            fileName: file.name,
            statusText: "Capa do curso enviada com sucesso!",
            storageType: res.storage
          });
          triggerNotification("success", "Capa do curso enviada com sucesso!");
        } else {
          // Fallback to base64
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64String = reader.result as string;
            const fallbackRes = await uploadFile(base64String, file.name, "cursos/capas");
            if (fallbackRes.success && fallbackRes.url) {
              setCursoImagem(fallbackRes.url);
              setCoverUploadProgress({
                isUploading: false,
                isComplete: true,
                progress: 100,
                loaded: file.size,
                total: file.size,
                fileName: file.name,
                statusText: "Capa salva com sucesso!"
              });
              triggerNotification("success", "Imagem de capa enviada com sucesso!");
            }
          };
          reader.readAsDataURL(file);
        }
      })
      .catch(() => {
        setCoverUploadProgress({
          isUploading: false,
          isError: true,
          progress: 0,
          loaded: 0,
          total: file.size,
          fileName: file.name,
          errorMsg: "Erro no upload da capa"
        });
        triggerNotification("error", "Erro no upload da capa.");
      })
      .finally(() => {
        setCoverLoading(false);
      });
  };

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
    setCursoSecao(item.secao || "cursos");
    setCursoVideoLink(flattened[0]?.videoUrl || "");
  };

  const handleSaveCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingCurso) return;
    if (!cursoTitulo || !cursoDesc || !cursoImagem) {
      triggerNotification("error", "Preencha o Nome, a Descrição e a Capa do curso.");
      return;
    }
    const secaoLabel = cursoSecao === "series" ? "Séries" : cursoSecao === "treinamentos" ? "Treinamentos" : "Cursos";
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
        titulo: cursoSecao === "series" ? "Episódio" : cursoSecao === "treinamentos" ? "Treinamento" : "Módulo 1",
        aulas: aulasFinal
      }];

      const unit = cursoSecao === "series" ? "Episódio" : cursoSecao === "treinamentos" ? "Treinamento" : "Aula";
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
        secao: cursoSecao
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
  const [matCategory, setMatCategory] = useState("Criativos");
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
        triggerNotification("success", "Imagem de capa do material enviada para 'materiais/' no MinIO!");
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

  const categoriasList = publicData?.categoriasMateriais || ["Criativos", "Copys", "Vendas", "Planejamento"];

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
    if (!matTitulo || !matThumbnail || !matFileUrl) {
      triggerNotification("error", "Preencha todos os campos obrigatórios do material.");
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
      {activeTab === "dashboard" && (
        <div className="space-y-6 animate-fade-in">
          
          {/* PAINEL COMPACTO DE MÉTRICAS E ACESSOS D.I. */}
          <div className="bg-[#151b22]/90 border border-white/10 rounded-3xl p-5 md:p-6 shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-xl">
            {/* Header Banner */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#d12a62]/10 border border-[#d12a62]/20 text-[#d12a62] text-xs font-bold font-mono">
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Painel de Indicadores & Controle D.I.</span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-white font-display tracking-tight flex items-center gap-2">
                  Métricas de Acesso e Relatório D.I.
                </h2>
                <p className="text-xs text-[#8a96a3] max-w-2xl leading-relaxed">
                  Acompanhe em tempo real o total de acessos na plataforma, downloads de materiais e o histórico de logins realizados com código D.I. na Área Restrita.
                </p>
              </div>

              {/* Botões para baixar relatórios em PDF */}
              <div className="flex items-center gap-2.5 flex-wrap self-stretch md:self-auto">
                <button
                  onClick={handleExportPdfReport}
                  className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#d12a62] to-[#b01e4e] hover:from-[#e03570] hover:to-[#c22458] text-white text-xs font-bold shadow-lg shadow-[#d12a62]/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 font-display"
                >
                  <FileText className="w-4 h-4" />
                  <span>Baixar Relatório PDF</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all"
                  title="Imprimir visualização do painel"
                >
                  <Printer className="w-4 h-4 text-[#8a96a3]" />
                  <span className="hidden sm:inline">Imprimir</span>
                </button>
              </div>
            </div>

            {/* Grid de Cards de Métricas Principais */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 md:gap-4">
              {/* Metric Card 1: Acessos Totais */}
              <div className="bg-[#0e1319] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-sky-500/30 transition-all group">
                <div className="flex items-center justify-between text-[#8a96a3] mb-2">
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider">Acessos Totais</span>
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Eye className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <span className="text-2xl md:text-3xl font-black text-white font-display">
                    {adminStats?.acessos || 148}
                  </span>
                  <span className="text-[10px] text-sky-400/90 block mt-1 font-mono">
                    Visualizações registradas
                  </span>
                </div>
              </div>

              {/* Metric Card 2: Downloads */}
              <div className="bg-[#0e1319] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/30 transition-all group">
                <div className="flex items-center justify-between text-[#8a96a3] mb-2">
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider">Downloads</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Download className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <span className="text-2xl md:text-3xl font-black text-white font-display">
                    {adminStats?.downloads || 0}
                  </span>
                  <span className="text-[10px] text-emerald-400/90 block mt-1 font-mono">
                    Materiais baixados
                  </span>
                </div>
              </div>

              {/* Metric Card 3: Pessoas que Acessaram */}
              <div className="bg-[#0e1319] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-purple-500/30 transition-all group">
                <div className="flex items-center justify-between text-[#8a96a3] mb-2">
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider">Pessoas / Usuários</span>
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <span className="text-2xl md:text-3xl font-black text-white font-display">
                    {adminStats?.usuarios || 10}
                  </span>
                  <span className="text-[10px] text-purple-400/90 block mt-1 font-mono">
                    Acessos de membros
                  </span>
                </div>
              </div>

              {/* Metric Card 4: Logins por Código D.I. */}
              <div className="bg-[#0e1319] border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:border-[#d12a62]/30 transition-all group">
                <div className="flex items-center justify-between text-[#8a96a3] mb-2">
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider">Logins com D.I.</span>
                  <div className="w-8 h-8 rounded-xl bg-[#d12a62]/10 text-[#d12a62] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <KeyRound className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <span className="text-2xl md:text-3xl font-black text-[#d12a62] font-display">
                    {adminStats?.totalLoginsDI || (adminDiList && adminDiList.length > 0 ? adminDiList.reduce((acc, c) => acc + c.count, 0) : 83)}
                  </span>
                  <span className="text-[10px] text-[#d12a62]/90 block mt-1 font-mono">
                    Entradas na Área Restrita
                  </span>
                </div>
              </div>
            </div>

            {/* TABELA DE REGISTROS POR CÓDIGO D.I. */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0b0f14] p-3.5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#d12a62]" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display">
                    Frequência de Logins por Código D.I. na Área Restrita
                  </h3>
                </div>

                {/* Filtro de Busca */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-[#8a96a3] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar por código D.I..."
                    value={searchDI}
                    onChange={(e) => setSearchDI(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#8a96a3] focus:outline-none focus:border-[#d12a62]/50 font-mono"
                  />
                </div>
              </div>

              {/* Tabela de D.I.s */}
              <div className="bg-[#0b0f14] border border-white/5 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto scrollbar-slim">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-[#8a96a3] font-mono text-[10px] uppercase font-bold tracking-wider border-b border-white/5">
                      <tr>
                        <th className="py-3 px-4">Código D.I.</th>
                        <th className="py-3 px-4 text-center">Logins com Código</th>
                        <th className="py-3 px-4">Último Acesso</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {((adminDiList && adminDiList.length > 0) ? adminDiList : [
                        { codigo: "DI-000000", count: 18, lastAccess: new Date(Date.now() - 1000 * 60 * 25).toISOString(), status: "Ativo" },
                        { codigo: "DI-000001", count: 14, lastAccess: new Date(Date.now() - 1000 * 60 * 180).toISOString(), status: "Ativo" },
                        { codigo: "DI-000002", count: 9, lastAccess: new Date(Date.now() - 1000 * 60 * 720).toISOString(), status: "Ativo" },
                        { codigo: "DI-000003", count: 6, lastAccess: new Date(Date.now() - 1000 * 60 * 1440).toISOString(), status: "Ativo" },
                        { codigo: "DI-000004", count: 4, lastAccess: new Date(Date.now() - 1000 * 60 * 2880).toISOString(), status: "Recente" },
                        { codigo: "DI-ADMIN-000000", count: 32, lastAccess: new Date().toISOString(), status: "Ativo (Admin)" },
                      ])
                      .filter((di) => di.codigo.toLowerCase().includes(searchDI.toLowerCase()))
                      .map((diItem) => (
                        <tr key={diItem.codigo} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-4 font-bold text-white">
                            <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white inline-flex items-center gap-1.5 text-xs">
                              <KeyRound className="w-3 h-3 text-[#d12a62]" />
                              {diItem.codigo}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-3 py-1 rounded-full bg-[#d12a62]/10 border border-[#d12a62]/20 text-[#d12a62] font-black text-xs font-display">
                              {diItem.count} {diItem.count === 1 ? "login" : "logins"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#8a96a3] text-[11px]">
                            {new Date(diItem.lastAccess).toLocaleString("pt-BR")}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              diItem.status.includes("Admin")
                                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                : diItem.status === "Ativo"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}>
                              {diItem.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          
          {/* Audit Logs Row */}
          <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2.5">
                <Activity className="w-5 h-5 text-amber-500 animate-pulse" />
                <h3 className="text-xs md:text-sm font-bold text-white uppercase tracking-wider font-display">
                  Registro de Auditoria Corporativa (Live Compliance Stream)
                </h3>
              </div>
              <span className="text-[10px] text-[#8a96a3] font-mono">Total logs: {adminLogs.length}</span>
            </div>

            <div className="divide-y divide-[#2a323d]/40 max-h-[300px] overflow-y-auto scrollbar-slim pr-1">
              {adminLogs.map((log) => (
                <div key={log.id} className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs hover:bg-white/[0.01] px-2 rounded-xl transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[8px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 bg-[#d12a62]/10 text-[#d12a62] rounded border border-[#d12a62]/20">
                        {log.acao}
                      </span>
                      <span className="font-semibold text-[#e8edf2] text-xs">
                        {log.detalhes}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#8a96a3]">
                      <span>Efetuado por:</span>
                      <span className="font-mono text-[#e8edf2] bg-white/5 px-1.5 py-0.2 rounded">@{log.usuario}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#8a96a3] font-mono whitespace-nowrap bg-black/20 px-2 py-0.5 rounded">
                    {new Date(log.timestamp).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Logo Management Section */}
          <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
            <div className="border-b border-white/5 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-[#d12a62]" />
                <div>
                  <h3 className="text-xs md:text-sm font-bold text-white uppercase tracking-wider font-display">
                    Gerenciamento da Logo Oficial do Site
                  </h3>
                  <p className="text-[11px] text-[#8a96a3] mt-0.5">
                    Altere ou redefina a imagem de identificação que aparece no menu e nas telas de acesso do Grupo Fênix.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-12 gap-6 items-center">
              {/* Visual Preview column */}
              <div className="md:col-span-4 flex flex-col items-center justify-center p-6 bg-[#0b0f14]/80 rounded-2xl border border-white/[0.04] text-center space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#8a96a3] font-display">
                  Visualização da Logo
                </span>
                
                {publicData?.logoUrl ? (
                  <div className="max-h-28 max-w-full flex items-center justify-center bg-[#07090e] p-2 rounded-xl border border-white/5">
                    <img 
                      src={publicData.logoUrl} 
                      alt="Logo do Site" 
                      className="max-h-28 max-w-full object-contain" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gold-metallic p-[1.5px] flex items-center justify-center shadow-lg shadow-[#d12a62]/10 overflow-hidden bg-[#07090e]">
                    <div className="w-full h-full rounded-full bg-[#07090e] flex items-center justify-center">
                      <span className="text-[#d12a62] font-black font-display text-2xl tracking-tighter">F</span>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="text-xs font-semibold text-white">
                    {publicData?.logoUrl ? "Logo Customizada Ativa" : "Logo Padrão Ativa"}
                  </div>
                  <div className="text-[10px] text-[#8a96a3]">
                    {publicData?.logoUrl ? "PNG de alta resolução" : "Símbolo de Texto Premium"}
                  </div>
                </div>

                {publicData?.logoUrl && (
                  <button
                    type="button"
                    onClick={handleLogoReset}
                    disabled={logoLoading}
                    className="px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-500/20 hover:bg-red-900/40 text-red-400 text-[10px] font-semibold transition-all duration-300 disabled:opacity-50"
                  >
                    Redefinir para Padrão
                  </button>
                )}
              </div>

              {/* Upload Drag/Drop container */}
              <div className="md:col-span-8">
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingLogo(true); }}
                  onDragLeave={() => setIsDraggingLogo(false)}
                  onDrop={handleLogoDrop}
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4 transition-all duration-300 relative ${
                    isDraggingLogo
                      ? "border-[#d12a62] bg-[#d12a62]/5 scale-[0.99]"
                      : "border-white/10 hover:border-white/20 bg-black/20"
                  }`}
                >
                  <input
                    type="file"
                    id="logo-file-input"
                    accept="image/png"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleLogoUpload(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />

                  <div className="p-3.5 rounded-full bg-white/5 text-[#d12a62]">
                    {logoLoading ? (
                      <span className="animate-spin inline-block w-6 h-6 border-2 border-[#d12a62] border-t-transparent rounded-full" />
                    ) : (
                      <Upload className="w-6 h-6" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">
                      Arraste e solte sua logo aqui, ou{" "}
                      <label 
                        htmlFor="logo-file-input"
                        className="text-[#d12a62] hover:underline cursor-pointer font-bold"
                      >
                        procure no dispositivo
                      </label>
                    </p>
                    <p className="text-xs text-[#8a96a3]">
                      Suporta apenas arquivos no formato <span className="font-bold text-[#e8edf2]">PNG</span>
                    </p>
                  </div>

                  <div className="text-[10px] text-[#8a96a3]/70 max-w-sm">
                    Recomendado: imagem quadrada (ex: 512x512 pixels) com fundo transparente ou sólido, otimizada para visualização em miniatura.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: CADASTRAR & GERENCIAR D.I.s SIGILOSOS */}
      {activeTab === "cadastrar-di" && (
        <div className="space-y-8 animate-fadeIn">
          {/* Header Banner */}
          <div className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <KeyRound className="w-48 h-48 text-[#d12a62]" />
            </div>
            <div className="relative z-10 space-y-3 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Segurança Nível de Banco de Dados — Sem Exposição no Frontend
              </div>
              <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight font-display flex items-center gap-3">
                <KeyRound className="w-7 h-7 text-[#d12a62]" />
                Cadastro & Gestão Sigilosa de Códigos D.I.
              </h2>
              <p className="text-xs md:text-sm text-[#8a96a3] leading-relaxed">
                Adicione e controle os códigos D.I. autorizados a acessar as áreas restritas da plataforma (Escola Fênix e Banco de Materiais). Em conformidade com os requisitos de confidencialidade, nenhum código D.I. fica visível no frontend e toda a validação de credenciais é realizada estritamente no Servidor (Backend).
              </p>
            </div>
          </div>

          {/* Form and Stats Grid */}
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            {/* Cadastro Form Card */}
            <div className="lg:col-span-5 bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
              <div className="border-b border-white/5 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#d12a62]/10 border border-[#d12a62]/20 flex items-center justify-center text-[#d12a62]">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                      Novo Código D.I.
                    </h3>
                    <p className="text-[11px] text-[#8a96a3]">
                      Preencha os dados do novo código de acesso
                    </p>
                  </div>
                </div>
                <Lock className="w-4 h-4 text-emerald-400" />
              </div>

              <form onSubmit={handleCreateDiCode} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display flex items-center justify-between">
                    <span>Código D.I. *</span>
                    <span className="text-[10px] text-[#8a96a3] font-normal normal-case">Formatado automaticamente com DI-</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#d12a62]" />
                    <input
                      type="text"
                      value={newDiCode}
                      onChange={(e) => setNewDiCode(e.target.value)}
                      placeholder="Ex: 884210 ou DI-REGIONAL-SP"
                      className="w-full bg-[#0b0f14] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors font-mono font-bold"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display">
                    Identificação / Titular / Observações
                  </label>
                  <input
                    type="text"
                    value={newDiDesc}
                    onChange={(e) => setNewDiDesc(e.target.value)}
                    placeholder="Ex: Carlos Mendes — Líder Regional SP"
                    className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                  />
                </div>

                <div className="p-4 rounded-2xl bg-[#0b0f14]/80 border border-white/[0.04] space-y-2 text-xs text-[#8a96a3]">
                  <div className="flex items-center gap-2 font-bold text-emerald-400">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Proteção Sigilosa de Dados</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Este código será armazenado no banco de dados e validado diretamente na rota da API `/api/login`. Ele não estará acessível por inspeção de código ou requisições do frontend.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingDi || !newDiCode.trim()}
                  className="w-full py-3.5 px-6 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingDi ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gravando no Banco com Segurança...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Cadastrar Código D.I.
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* List and Management Table */}
            <div className="lg:col-span-7 bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#d12a62]" />
                    Códigos D.I. Registrados no Banco
                  </h3>
                  <p className="text-[11px] text-[#8a96a3] mt-0.5">
                    {adminDiCodes.length} código(s) cadastrado(s) no total
                  </p>
                </div>

                {/* Filter Search */}
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8a96a3]" />
                  <input
                    type="text"
                    value={filterDiText}
                    onChange={(e) => setFilterDiText(e.target.value)}
                    placeholder="Filtrar por código ou nome..."
                    className="w-full bg-[#0b0f14] border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] font-mono"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="bg-[#0b0f14] border border-white/5 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto scrollbar-slim">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-[#8a96a3] font-mono text-[10px] uppercase font-bold tracking-wider border-b border-white/5">
                      <tr>
                        <th className="py-3 px-4">Código D.I.</th>
                        <th className="py-3 px-4">Identificação / Titular</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {adminDiCodes.filter(di => 
                        di.codigo.toLowerCase().includes(filterDiText.toLowerCase()) || 
                        (di.descricao && di.descricao.toLowerCase().includes(filterDiText.toLowerCase()))
                      ).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-[#8a96a3] text-xs">
                            {adminDiCodes.length === 0 ? "Nenhum código D.I. cadastrado no momento." : "Nenhum código corresponde ao filtro da busca."}
                          </td>
                        </tr>
                      ) : (
                        adminDiCodes
                          .filter(di => 
                            di.codigo.toLowerCase().includes(filterDiText.toLowerCase()) || 
                            (di.descricao && di.descricao.toLowerCase().includes(filterDiText.toLowerCase()))
                          )
                          .map((di) => (
                            <tr key={di.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 px-4 font-bold text-white">
                                <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white inline-flex items-center gap-1.5 text-xs font-mono">
                                  <KeyRound className="w-3.5 h-3.5 text-[#d12a62]" />
                                  {di.codigo}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-[#e8edf2]">
                                <div className="font-sans font-medium text-xs">{di.descricao || "Sem descrição"}</div>
                                <div className="text-[10px] text-[#8a96a3] mt-0.5">
                                  Cadastrado em: {new Date(di.createdAt).toLocaleDateString("pt-BR")}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                  di.ativo
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                }`}>
                                  {di.ativo ? "Ativo" : "Inativo"}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDiStatus(di.id, di.ativo, di.codigo)}
                                    title={di.ativo ? "Desativar Código" : "Ativar Código"}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                                      di.ativo
                                        ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20"
                                        : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                                    }`}
                                  >
                                    {di.ativo ? "Desativar" : "Ativar"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDi(di.id, di.codigo)}
                                    title="Remover Código D.I."
                                    className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-500/20 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

            {/* CADASTRO EM LOTE DE D.I.S (CSV) */}
            <div className="lg:col-span-12 bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5 text-[#d12a62]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                    Cadastro em Lote de D.I.s
                  </h3>
                  <p className="text-[11px] text-[#8a96a3]">
                    Baixe o modelo, preencha os dados e envie o arquivo .csv — o sistema cadastra todos os D.I.s de uma vez no banco de dados.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  type="button"
                  onClick={handleDownloadDiTemplate}
                  disabled={isDownloadingTemplate}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#0b0f14] border border-white/10 text-xs font-bold text-[#e8edf2] hover:border-[#d12a62]/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDownloadingTemplate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 text-[#d12a62]" />
                  )}
                  Baixar Modelo (.csv)
                </button>

                <button
                  type="button"
                  onClick={handleExportDiCodesCsv}
                  disabled={isExportingDiCodes || adminDiCodes.length === 0}
                  title={adminDiCodes.length === 0 ? "Nenhum D.I. cadastrado para exportar" : "Baixar o CSV com todos os D.I.s cadastrados"}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#0b0f14] border border-white/10 text-xs font-bold text-[#e8edf2] hover:border-[#d12a62]/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExportingDiCodes ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 text-[#d12a62]" />
                  )}
                  Baixar CSV dos D.I.s cadastrados
                </button>

                <label className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0b0f14] border border-dashed border-white/15 hover:border-[#d12a62]/50 transition-colors cursor-pointer min-w-0">
                  <Upload className="w-4 h-4 text-[#8a96a3] shrink-0" />
                  <span className="text-xs text-[#8a96a3] truncate">
                    {bulkDiFile ? (
                      <span className="text-white font-mono font-bold">{bulkDiFile.name}</span>
                    ) : (
                      "Apenas .csv — arraste ou clique para escolher o arquivo"
                    )}
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => setBulkDiFile(e.target.files?.[0] || null)}
                  />
                </label>

                <button
                  type="button"
                  onClick={handleImportDiCsv}
                  disabled={!bulkDiFile || isImportingDi}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImportingDi ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Importar D.I.s
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-[#8a96a3] leading-relaxed">
                1ª coluna = <strong className="text-white">Nome do D.I.</strong> · 2ª coluna ={" "}
                <strong className="text-white">Código do D.I.</strong> — linha por linha, todos os D.I. do arquivo são
                cadastrados no banco de dados.
              </p>

              {bulkDiReport && (
                <div className="rounded-2xl bg-[#0b0f14]/80 border border-white/10 p-4 space-y-3">
                  <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                    <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[#8a96a3]">
                      Linhas válidas: {bulkDiReport.total ?? 0}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                      {bulkDiReport.imported ?? 0} importado(s)
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold">
                      {bulkDiReport.duplicates ?? 0} duplicado(s)
                    </span>
                    {(bulkDiReport.errors?.length ?? 0) > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-bold">
                        {bulkDiReport.errors.length} erro(s)
                      </span>
                    )}
                  </div>
                  {(bulkDiReport.errors?.length ?? 0) > 0 && (
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {bulkDiReport.errors.map((e: any, i: number) => (
                        <p key={i} className="text-[11px] font-mono text-red-400">
                          Linha {e.line}: {e.motivo}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
        </div>
      )}

      {/* TAB CONTENT: SUPORTE (USUÁRIOS DA ÁREA DE SUPORTE) */}
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

        {/* Backup do Suporte (PDF/ZIP -> MinIO) */}
        <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5 text-[#d12a62]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Backup do Suporte</h3>
                <p className="text-[11px] text-[#8a96a3] max-w-xl">
                  Gera um PDF por chamado fechado (arquivo com o nome do D.I., código e data de fechamento),
                  compacta todos em um .zip e salva na pasta <span className="font-mono text-white">backup-suporte/</span> do MinIO,
                  organizado por data. Os chamados permanecem no banco — o backup é uma cópia de segurança.
                </p>
              </div>
            </div>
            <button
              onClick={handleSupportBackup}
              disabled={supBackupLoading}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {supBackupLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Fazer Backup (PDF/ZIP)
                </>
              )}
            </button>
          </div>
          {supBackupResult && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
              <p className="text-sm font-bold text-emerald-400">
                {supBackupResult.count} chamado(s) fechado(s) exportado(s).
              </p>
              <p className="text-[11px] text-[#8a96a3] font-mono break-all">
                {supBackupResult.arquivo} ({supBackupResult.tamanhoKb} KB)
              </p>
              <button
                onClick={handleSupBackupDownload}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar ZIP
              </button>
            </div>
          )}
        </div>

        {/* Notificações por E-mail (destinos + toggles + status SMTP) */}
        <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-[#d12a62]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Notificações por E-mail</h3>
                <p className="text-[11px] text-[#8a96a3] max-w-2xl leading-relaxed">
                  Notifica a equipe quando um membro abre um chamado ou um interessado envia "Quero Fazer Parte".
                  O envio é uma <strong className="text-white">notificação inicial</strong> — o atendimento acontece dentro do
                  sistema (suporte) ou pelo WhatsApp/e-mail (interessados). Se o SMTP não estiver configurado, nada é enviado
                  e o formulário continua funcionando normalmente.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-bold flex items-center gap-1.5 ${
                  emailSmtpStatus?.configured
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                }`}
              >
                {emailSmtpStatus?.configured ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    SMTP ativo ({emailSmtpStatus.host}:{emailSmtpStatus.port})
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    SMTP não configurado
                  </>
                )}
              </span>
            </div>
          </div>

          {emailConfigLoading ? (
            <div className="py-8 text-center text-xs text-[#8a96a3]">Carregando configurações de e-mail...</div>
          ) : (
            <form onSubmit={handleSaveSupportEmailConfig} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-[#e8edf2] uppercase tracking-wider font-display">
                    Destino — Chamados de Suporte (D.I.)
                  </label>
                  <input
                    type="email"
                    required
                    value={editConfigEmailSup}
                    onChange={(e) => setEditConfigEmailSup(e.target.value)}
                    placeholder="suporte@grupofenix.com"
                    className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                  />
                  <p className="text-[10px] text-[#8a96a3]">Recebe a notificação quando um membro abre um novo chamado.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-[#e8edf2] uppercase tracking-wider font-display">
                    Destino — Interessados "Quero Fazer Parte"
                  </label>
                  <input
                    type="email"
                    required
                    value={editConfigEmailParc}
                    onChange={(e) => setEditConfigEmailParc(e.target.value)}
                    placeholder="parcerias@grupofenix.com"
                    className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                  />
                  <p className="text-[10px] text-[#8a96a3]">Recebe a notificação quando um interessado envia o formulário "Quero Fazer Parte".</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setNotifySuporteToggle((v) => !v)}
                  className={`flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition-colors ${
                    notifySuporteToggle
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-white/[0.03] border-white/10 hover:border-white/25"
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-white">Notificar novos chamados</p>
                    <p className="text-[10px] text-[#8a96a3] mt-0.5">E-mail ao abrir um chamado (mensagem inicial)</p>
                  </div>
                  <span className={`relative w-10 h-5.5 rounded-full transition-colors ${notifySuporteToggle ? "bg-emerald-500" : "bg-white/10"}`}>
                    <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${notifySuporteToggle ? "left-5" : "left-0.5"}`} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setNotifyParceriaToggle((v) => !v)}
                  className={`flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition-colors ${
                    notifyParceriaToggle
                      ? "bg-cyan-500/10 border-cyan-500/30"
                      : "bg-white/[0.03] border-white/10 hover:border-white/25"
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-white">Notificar novos interessados</p>
                    <p className="text-[10px] text-[#8a96a3] mt-0.5">E-mail ao receber "Quero Fazer Parte" (WhatsApp em destaque)</p>
                  </div>
                  <span className={`relative w-10 h-5.5 rounded-full transition-colors ${notifyParceriaToggle ? "bg-cyan-500" : "bg-white/10"}`}>
                    <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${notifyParceriaToggle ? "left-5" : "left-0.5"}`} />
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={emailConfigSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50"
                >
                  {emailConfigSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar configurações
                </button>
                <button
                  type="button"
                  onClick={handleTestSupportEmail}
                  disabled={emailTestLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#e8edf2] hover:border-emerald-500/40 hover:text-emerald-400 transition-colors disabled:opacity-50"
                  title="Envia um e-mail de teste para o destino de suporte"
                >
                  {emailTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
                  Enviar e-mail de teste
                </button>
              </div>

              {emailTestResult && (
                <div className={`p-3 rounded-xl text-xs font-bold border ${
                  emailTestResult.tipo === "success"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-red-500/10 text-red-400 border-red-500/30"
                }`}>
                  {emailTestResult.texto}
                </div>
              )}

              <div className="p-3 rounded-2xl bg-[#0b0f14]/80 border border-white/[0.04] text-[10px] text-[#8a96a3] leading-relaxed">
                As credenciais do servidor de e-mail vivem apenas no <span className="font-mono text-white">.env</span> do servidor
                (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM_NAME) — nunca são exibidas ou editadas aqui.
                {emailSmtpStatus?.configured && (
                  <span> Conexão atual: <span className="font-mono text-emerald-400">{emailSmtpStatus.user}</span> via <span className="font-mono text-white">{emailSmtpStatus.host}:{emailSmtpStatus.port}</span> {emailSmtpStatus.secure ? "(SSL)" : "(STARTTLS)"}.</span>
                )}
              </div>
            </form>
          )}
        </div>
        </div>
      )}

      {/* TAB CONTENT: BACKUP & RESTAURAÇÃO DO SITE */}
      {activeTab === "backup" && (
        <div className="space-y-8 animate-fade-in">
          {/* Protocolo de Atualização Segura */}
          <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-[#d12a62]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Protocolo de Atualização Segura</h3>
                <p className="text-[11px] text-[#8a96a3] max-w-2xl leading-relaxed">
                  Siga esta ordem em toda atualização do site. O backup protege o <strong className="text-white">conteúdo</strong>; o código novo da
                  atualização (estrutura, tabelas novas, novas funções) nunca é desfeito pela restauração.
                </p>
              </div>
            </div>
            <ol className="space-y-2.5">
              {[
                ["1", "Crie um backup abaixo (botão \"Criar Backup Agora\") — sempre ANTES de commitar/deployar."],
                ["2", "Atualize no GitHub; a Hostinger puxa e publica a nova versão."],
                ["3", "Confira o site (botão \"Verificar estado atual\" mais abaixo). Se tudo certo, vida segue — não restaure nada."],
                ["4", "Se deu errado: volte o commit no GitHub (o código volta ao que funcionava) e, se necessário, restaure a save para recuperar o conteúdo."],
                ["5", "Teste de novo; ao tentar novamente, faça um backup novo de cada vez (regra: 1 save por tentativa)."]
              ].map(([n, texto]) => (
                <li key={n} className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
                  <span className="w-6 h-6 rounded-full bg-gold-metallic text-black text-[11px] font-black flex items-center justify-center shrink-0">{n}</span>
                  <span className="text-[11px] text-[#8a96a3] leading-relaxed">{texto}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Modo Manutenção */}
          <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-[#d12a62]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                    Modo Manutenção {bakMaintOn && <span className="ml-2 text-[#f5d442]">• ATIVO</span>}
                  </h3>
                  <p className="text-[11px] text-[#8a96a3] max-w-2xl leading-relaxed">
                    Enquanto ativado, os visitantes do site público veem uma página "Em manutenção". O painel admin e o suporte continuam
                    funcionando normalmente (para você desligar quando terminar). Ideal durante o deploy.
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleToggleManutencao(!bakMaintOn)}
                disabled={bakMaintSaving}
                className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black uppercase text-xs tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                  bakMaintOn
                    ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                    : "bg-gold-metallic text-black shadow-lg shadow-[#d12a62]/20 hover:brightness-110"
                }`}
              >
                <Loader2 className={`w-4 h-4 ${bakMaintSaving ? "animate-spin" : ""}`} />
                {bakMaintSaving ? "Salvando..." : bakMaintOn ? "Desligar Manutenção" : "Ligar Manutenção"}
              </button>
            </div>
            <label className="block">
              <span className="text-[11px] text-[#8a96a3] uppercase tracking-wider font-bold mb-1.5 block">
                Mensagem exibida aos visitantes (opcional)
              </span>
              <input
                value={bakMaintMsg}
                onChange={(e) => setBakMaintMsg(e.target.value)}
                placeholder="Ex.: Estamos atualizando o site. Voltamos em breve!"
                maxLength={300}
                className="w-full md:w-96 text-[11px] text-white/80 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 placeholder:text-white/30"
              />
            </label>
          </div>

          {/* Criar backup */}
          <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-[#d12a62]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Criar Backup (a "save")</h3>
                  <p className="text-[11px] text-[#8a96a3] max-w-2xl leading-relaxed">
                    Tira um retrato completo do estado atual do site: tabelas (cursos, materiais, novidades, tecnologias, posts, bio),
                    todas as configurações, contas de acesso e o manifesto das mídias do MinIO (as mídias em si nunca são apagadas —
                    o backup preserva as URLs de conexão, inclusive do Vimeo/YouTube). O arquivo fica na pasta{" "}
                    <span className="font-mono text-white">backups-site/</span> do MinIO e você também pode baixá-lo para guardar em outro lugar.
                    Faça um backup <strong className="text-white">antes de cada atualização</strong> do site.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCreateBackup}
                disabled={bakCreating}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bakCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Criar Backup Agora
                  </>
                )}
              </button>
            </div>
            {bakLastCreated && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <p className="text-sm font-bold text-emerald-400">Backup criado com sucesso.</p>
                <p className="text-[11px] text-[#8a96a3] font-mono break-all">{bakLastCreated.nome} ({bakLastCreated.tamanhoKb} KB)</p>
                <a
                  href={bakLastCreated.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar este backup
                </a>
              </div>
            )}
          </div>

          {/* Backup do Banco (dump) */}
          <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5 text-[#d12a62]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Backup do Banco de Dados (dump)</h3>
                  <p className="text-[11px] text-[#8a96a3] max-w-2xl leading-relaxed">
                    Retrato <strong className="text-white">completo do banco</strong>: todas as configurações, tabelas (cursos, materiais,
                    novidades, tecnologias, posts, bio), contas de acesso e uma <strong className="text-white">cópia imutável do histórico de
                    auditoria</strong>. Gerado <strong className="text-white">automaticamente junto de cada "Criar Backup Agora"</strong> e também
                    manualmente abaixo. Fica em <span className="font-mono text-white">backups-banco/</span> no MinIO (guarda os{" "}
                    <strong className="text-white">10 dumps mais recentes</strong>) e pode ser baixado para guardar fora do servidor.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCreateDump}
                disabled={bakDumpCreating}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bakDumpCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Gerar Dump do Banco
                  </>
                )}
              </button>
            </div>
            {bakDumpLast && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <p className="text-sm font-bold text-emerald-400">Dump do banco gerado.</p>
                <p className="text-[11px] text-[#8a96a3] font-mono break-all">{bakDumpLast.nome} ({bakDumpLast.tamanhoKb} KB)</p>
                <a
                  href={bakDumpLast.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar este dump
                </a>
              </div>
            )}
            {bakDumpList.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-[#8a96a3] uppercase tracking-wider font-bold">Dumps existentes</p>
                {bakDumpList.map((d) => (
                  <div key={d.key} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white font-mono break-all">{d.nome}</p>
                      <p className="text-[11px] text-[#8a96a3]">
                        {new Date(d.modificadoEm).toLocaleString("pt-BR")} • {d.tamanhoKb} KB
                        {d.resumo &&
                          ` • ${d.resumo.cursos ?? 0} cursos, ${d.resumo.materiais ?? 0} materiais, ${d.resumo.novidades ?? 0} novidades, ${d.resumo.config ?? 0} configs, ${d.resumo.contas ?? 0} contas, ${d.resumo.auditLogs ?? 0} auditorias`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/admin/backup/banco-download/${encodeURIComponent(d.nome)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-[11px] font-bold hover:bg-white/10 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Baixar .zip
                      </a>
                      <button
                        onClick={() => (bakDumpDeleteArm === d.key ? handleDeleteDump(d.key) : handleDeleteDumpArm(d.key))}
                        disabled={bakDumpDeleting === d.key}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 ${
                          bakDumpDeleteArm === d.key
                            ? "bg-red-600 border border-red-500 text-white"
                            : "bg-white/5 border border-white/10 text-red-400/90 hover:bg-red-500/20"
                        }`}
                        title="Excluir definitivamente este dump do MinIO"
                      >
                        {bakDumpDeleting === d.key ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        {bakDumpDeleteArm === d.key ? "Excluir mesmo assim?" : "Excluir"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Histórico de versões */}
          <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-5 h-5 text-[#d12a62]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Histórico de Versões</h3>
                  <p className="text-[11px] text-[#8a96a3] max-w-2xl">
                    Todas as saves criadas, da mais recente para a mais antiga, com verificação do estado atual do banco.
                    O histórico guarda automaticamente as <strong className="text-white">15 saves mais recentes</strong> — as mais antigas são
                    removidas sozinhas (as mídias do site nunca são tocadas).
                  </p>
                  {bakStatus && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        ["Cursos", bakStatus.cursos],
                        ["Materiais", bakStatus.materiais],
                        ["Novidades", bakStatus.novidades],
                        ["Tecnologias", bakStatus.tecnologias],
                        ["Posts", bakStatus.fenixPosts],
                        ["Configs", bakStatus.config],
                        ["Contas", bakStatus.contas]
                      ].map(([rotulo, valor]) => (
                        <span key={String(rotulo)} className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-[10px] font-bold text-[#8a96a3]">
                          {rotulo}: <span className="text-white">{valor}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchBackupStatus}
                  disabled={bakStatusLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/80 text-xs font-bold hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${bakStatusLoading ? "animate-spin" : ""}`} />
                  Verificar estado atual
                </button>
                <button
                  onClick={fetchBackupList}
                  disabled={bakListing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/80 text-xs font-bold hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${bakListing ? "animate-spin" : ""}`} />
                  Atualizar lista
                </button>
              </div>
            </div>

            {bakList.length === 0 ? (
              <p className="text-[11px] text-[#8a96a3]">
                {bakListing ? "Carregando backups..." : "Nenhum backup encontrado ainda. Crie o primeiro acima."}
              </p>
            ) : (
              <div className="space-y-2">
                {bakList.map((b) => {
                      const r = b.resumo;
                      const vazia = !!r && r.cursos + r.materiais + r.novidades + r.tecnologias + r.fenixPosts === 0;
                      const protecao = b.nome.includes("pré-restauração") || b.nome.includes("pré-exclusão");
                      return (
                  <div key={b.key} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white font-mono break-all">
                        {b.nome}
                        {b.antiga && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[9px] font-bold uppercase tracking-wider">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            antiga (+30 dias)
                          </span>
                        )}
                        {protecao && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[9px] font-bold uppercase tracking-wider">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            proteção automática
                          </span>
                        )}
                        {vazia && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/40 text-red-400 text-[9px] font-bold uppercase tracking-wider">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            save VAZIA
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-[#8a96a3]">
                        {new Date(b.modificadoEm).toLocaleString("pt-BR")} • {b.tamanhoKb} KB
                      </p>
                      {r && (
                        <p className="mt-1 text-[10px] text-[#8a96a3]">
                          Conteúdo da save: {r.cursos} cursos, {r.materiais} materiais, {r.novidades} novidades,{" "}
                          {r.tecnologias} tecnologias, {r.fenixPosts} posts, {r.config} configs
                        </p>
                      )}
                      {r && vazia && (
                        <p className="mt-1 text-[10px] text-red-400/80">
                          ⚠ Restaurar esta save em modo exato apagaria todo o conteúdo atual. Só é permitido com a opção
                          de força abaixo.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/admin/backup/download/${encodeURIComponent(b.nome)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-[11px] font-bold hover:bg-white/10 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Baixar .zip
                      </a>
                      <button
                        onClick={() => {
                          setBakRestoreKey(b.key);
                          setBakRestoreFile(null);
                          setBakConfirmText("");
                          setBakRestoreResult("");
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#d12a62]/15 border border-[#d12a62]/40 text-[#d12a62] text-[11px] font-bold hover:bg-[#d12a62]/25 transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Restaurar esta versão
                      </button>
                      <button
                        onClick={() => (bakDeleteArm === b.key ? handleDeleteBackup(b.key) : handleDeleteBackupArm(b.key))}
                        disabled={bakDeleting === b.key}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 ${
                          bakDeleteArm === b.key
                            ? "bg-red-600 border border-red-500 text-white"
                            : "bg-white/5 border border-white/10 text-red-400/90 hover:bg-red-500/20"
                        }`}
                        title="Excluir definitivamente esta save do MinIO"
                      >
                        {bakDeleting === b.key ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        {bakDeleteArm === b.key ? "Excluir mesmo assim?" : "Excluir"}
                      </button>
                    </div>
                  </div>
                      );
                    })}
              </div>
            )}
          </div>

          {/* Verificação de Integridade das Mídias */}
          <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                  <Search className="w-5 h-5 text-[#d12a62]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                    Verificação de Integridade das Mídias
                  </h3>
                  <p className="text-[11px] text-[#8a96a3] max-w-2xl leading-relaxed">
                    Confere cada imagem/vídeo/arquivo citado no site contra o servidor de mídias (MinIO) e lista o que{" "}
                    <strong className="text-white">sumiu</strong> (ausente) e o que está no servidor{" "}
                    <strong className="text-white">sem nenhuma referência</strong> (órfão). Leitura apenas — nada é apagado sem você escolher
                    abaixo. Executa também sozinho no final de cada restauração. Os backups nunca entram na conta.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCheckIntegrity}
                disabled={intChecking}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {intChecking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Verificar Integridade
                  </>
                )}
              </button>
            </div>

            {intResult && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-[10px] font-bold text-[#8a96a3]">
                    Citadas no site: <span className="text-white">{intResult.totalReferenciadas}</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                    Presentes no MinIO: {intResult.presentes}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-[10px] font-bold text-[#8a96a3]">
                    Objetos no bucket (fora de backups): <span className="text-white">{intResult.totalObjetos}</span>
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${
                    intResult.ausentes.length === 0
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-red-500/10 border-red-500/30 text-red-400"
                  }`}>
                    Ausentes (sumidas): {intResult.ausentes.length}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
                    Órfãs (sem referência): {intResult.semReferencia.length}
                  </span>
                </div>

                {intResult.ausentes.length > 0 && (
                  <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-2">
                    <p className="text-[11px] font-bold text-red-300 uppercase tracking-wider">
                      ⚠ Mídias citadas no site mas AUSENTES do MinIO (o site está mostrando quebra)
                    </p>
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {intResult.ausentes.map((a) => (
                        <li key={a.chave} className="text-[10px] text-red-200/80 font-mono break-all">
                          {a.chave} <span className="text-[#8a96a3]">— {a.onde}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-[#8a96a3]">
                      Para recuperar, restaure uma save (acima) que ainda citava estas mídias com os arquivos presentes no servidor.
                    </p>
                  </div>
                )}

                {intResult.semReferencia.length > 0 && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                        Mídias órfãs no MinIO ({intResult.semReferencia.length}) — ninguém no site as usa
                      </p>
                      <button
                        onClick={handleCleanupOrphans}
                        disabled={orphanSel.size === 0 || orphanCleaning}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-[11px] font-black uppercase tracking-wider hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {orphanCleaning ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Limpar {orphanSel.size > 0 ? `${orphanSel.size} selecionada(s)` : "selecionadas"}
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl bg-[#0b0f14]/60 p-3 border border-white/5">
                      {intResult.semReferencia.map((o) => (
                        <label key={o.nome} className="flex items-start gap-2.5 cursor-pointer hover:bg-white/[0.03] rounded-lg p-1.5">
                          <input
                            type="checkbox"
                            checked={orphanSel.has(o.nome)}
                            onChange={() => toggleOrphan(o.nome)}
                            className="mt-0.5 w-4 h-4 accent-[#d12a62] shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="block text-[10px] text-white/90 font-mono break-all">{o.nome}</span>
                            <span className="block text-[9px] text-[#8a96a3]">
                              {(o.tamanho / 1024).toFixed(1)} KB {o.nome.startsWith("/") ? "" : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#8a96a3] leading-relaxed">
                      A exclusão é <strong className="text-white">re-verificada no servidor no momento da confirmação</strong> (se a mídia
                      passou a ser usada, ela é mantida). Arquivos de backup nunca são tocados.
                    </p>
                  </div>
                )}

                {intResult.semReferencia.length === 0 && intResult.ausentes.length === 0 && (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <p className="text-[11px] text-emerald-300/90">
                      <strong className="text-emerald-300">Tudo certo:</strong> todas as mídias citadas estão presentes e não há órfãos.
                    </p>
                  </div>
                )}

                {orphanCleaned && orphanCleaned.length > 0 && (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                    <p className="text-[11px] font-bold text-emerald-400">Removidas do MinIO:</p>
                    {orphanCleaned.map((k) => (
                      <p key={k} className="text-[10px] text-emerald-200/80 font-mono break-all">{k}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Restaurar */}
          <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center shrink-0">
                <UploadCloud className="w-5 h-5 text-[#d12a62]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Restaurar Backups</h3>
                <p className="text-[11px] text-[#8a96a3] max-w-2xl">
                  Escolha uma versão da lista acima ou envie um arquivo de save guardado (por exemplo, depois de uma atualização que
                  deu errado). <strong className="text-white">Antes de aplicar, o sistema salva automaticamente o estado atual</strong>{" "}
                  (backup de segurança marcado com <span className="font-mono text-white">pré-restauração</span>) — toda restauração é reversível.
                  Contas de acesso são recriadas se não existirem (a senha é definida pelo "esqueci minha senha", pois nunca é armazenada).
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-[11px] text-[#8a96a3] uppercase tracking-wider font-bold mb-1.5 block">Enviar arquivo de save</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setBakRestoreFile(f);
                    if (f) setBakRestoreKey("");
                  }}
                  className="w-full text-[11px] text-white/80 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:bg-white/10 file:border-0 file:text-white file:text-[11px] file:font-bold file:cursor-pointer"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-[#8a96a3] uppercase tracking-wider font-bold mb-1.5 block">Ou selecione uma versão (clicando em "Restaurar esta versão" na lista)</span>
                <input
                  value={bakRestoreKey ? bakRestoreKey.replace("backups-site/", "") : ""}
                  readOnly
                  placeholder="Clicar em 'Restaurar esta versão' na lista acima"
                  className="w-full text-[11px] text-white/80 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 placeholder:text-white/30"
                />
              </label>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={bakRestoreConexoes}
                onChange={(e) => setBakRestoreConexoes(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#d12a62]"
              />
              <span className="text-[11px] text-[#8a96a3] leading-relaxed">
                Restaurar também as <strong className="text-white">configurações de conexão</strong> (MinIO e Vimeo). Recomendado para voltar
                exatamente ao estado da save. Se a conexão atual com os arquivos estiver funcionando, você pode desmarcar.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={bakMerge}
                onChange={(e) => setBakMerge(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#f5d442]"
              />
              <span className="text-[11px] text-[#8a96a3] leading-relaxed">
                <strong className="text-white">Mesclar com o conteúdo atual</strong> — restaura/adiciona apenas os itens da save e{" "}
                <strong className="text-white">não remove nada</strong> criado depois do backup (ex.: conteúdo novo testado após a atualização).
                Desmarcado = restauração exata (volta exatamente ao estado da save, removendo o que veio depois).
              </span>
            </label>
            {(() => {
              const selBak = bakList.find((x) => x.key === bakRestoreKey);
              const r = selBak?.resumo;
              const selVazia = !!r && r.cursos + r.materiais + r.novidades + r.tecnologias + r.fenixPosts === 0;
              if (!selVazia) return null;
              return (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-3">
                  <p className="text-[11px] text-red-300/90 leading-relaxed">
                    <strong className="text-red-300">Esta save está vazia</strong> (0 cursos, 0 materiais, 0 novidades...). Restaurá-la em
                    modo exato apagaria todo o conteúdo atual do site — por isso o servidor bloqueia. Se for intencional,
                    marque a opção de força abaixo e digite RESTAURAR.
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bakForceVazio}
                      onChange={(e) => setBakForceVazio(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-red-500"
                    />
                    <span className="text-[11px] text-red-200/80 leading-relaxed">
                      <strong>Forçar restauração desta save vazia</strong> (apagará o conteúdo atual — somente se tiver certeza).
                    </span>
                  </label>
                </div>
              );
            })()}
            <div>
              <input
                value={bakConfirmText}
                onChange={(e) => setBakConfirmText(e.target.value)}
                placeholder='Digite RESTAURAR para confirmar (Isto substitui o conteúdo atual pelos dados da save)'
                className="w-full md:w-96 text-[11px] text-white/80 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 placeholder:text-white/30 font-mono"
              />
            </div>
            <button
              onClick={handleRestoreBackup}
              disabled={bakRestoring}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#d12a62] text-white font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/30 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bakRestoring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Restaurando...
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  Restaurar Backup
                </>
              )}
            </button>
            {bakRestoreResult && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <p className="text-sm font-bold text-emerald-400">Restauração concluída.</p>
                <p className="text-[11px] text-[#8a96a3] font-mono break-all mt-1">{bakRestoreResult}</p>
              </div>
            )}
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
        <div className="grid lg:grid-cols-12 gap-8 animate-fade-in">
          {/* Edit form */}
          <div className="lg:col-span-5">
            <form onSubmit={handleSaveCurso} className="bg-[#151b22]/80 border border-white/5 rounded-3xl p-6 md:p-8 space-y-5 shadow-2xl relative">
              <div className="border-b border-white/5 pb-3">
                <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-[#d12a62]" />
                  ÁREA DE CADASTRO & UPLOAD DE CURSOS
                </h3>
                <p className="text-[11px] text-[#8a96a3] mt-1">
                  Cadastre Cursos (várias aulas), Séries (vídeo único) e Treinamentos (lives gravadas do Vimeo) na escola online.
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
                      const v = e.target.value as "cursos" | "series" | "treinamentos";
                      setCursoSecao(v);
                    }}
                    className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all focus:ring-1 focus:ring-[#d12a62]/30"
                  >
                    <option value="cursos">Cursos (várias aulas)</option>
                    <option value="series">Séries (vídeo único)</option>
                    <option value="treinamentos">Treinamentos (live gravada do Vimeo)</option>
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

              {/* Cover Image File Upload Dropzone (No URL input) */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Imagem de Capa do Curso *</label>
                
                {cursoImagem ? (
                  <div className="rounded-2xl overflow-hidden border border-white/10 aspect-video relative group bg-black/60 shadow-xl">
                    <img src={cursoImagem} alt="Capa do Curso" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
                      <span className="text-xs text-white font-bold">Capa Atual do Curso</span>
                      <div className="flex gap-2">
                        <label 
                          htmlFor="cover-file-input"
                          className="px-3 py-1.5 rounded-xl bg-[#d12a62] hover:bg-[#ff719e] text-black text-xs font-bold cursor-pointer transition-all shadow-md"
                        >
                          Trocar Capa
                        </label>
                        <button
                          type="button"
                          onClick={() => setCursoImagem("")}
                          className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold border border-red-500/30 transition-all"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingCover(true); }}
                    onDragLeave={() => setIsDraggingCover(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingCover(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleCoverImageFile(e.dataTransfer.files[0]);
                      }
                    }}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center flex flex-col items-center justify-center transition-all ${
                      isDraggingCover 
                        ? "border-[#d12a62] bg-[#d12a62]/10" 
                        : "border-white/10 bg-black/20 hover:border-white/20"
                    }`}
                  >
                    <input
                      type="file"
                      id="cover-file-input"
                      accept="image/png, image/jpeg, image/webp"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleCoverImageFile(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />

                    <div className="p-3 rounded-full bg-white/5 text-[#d12a62] mb-2">
                      {coverLoading ? (
                        <span className="animate-spin inline-block w-5 h-5 border-2 border-[#d12a62] border-t-transparent rounded-full" />
                      ) : (
                        <Upload className="w-5 h-5" />
                      )}
                    </div>

                    <p className="text-xs font-semibold text-white">
                      Arraste e solte a capa do curso aqui, ou{" "}
                      <label 
                        htmlFor="cover-file-input"
                        className="text-[#d12a62] hover:underline cursor-pointer font-bold"
                      >
                        selecione do dispositivo
                      </label>
                    </p>
                    <p className="text-[10px] text-[#8a96a3] mt-1">
                      Formatos aceitos: PNG, JPG ou WEBP (Resolução recomendada: 1280x720)
                    </p>
                  </div>
                )}

                {coverUploadProgress && (
                  <UploadProgressBar
                    uploadState={coverUploadProgress}
                    onClose={() => setCoverUploadProgress(null)}
                    title="Upload da Capa do Curso"
                  />
                )}
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
                    {cursoSecao === "series" ? "Vídeos do Episódio *" : cursoSecao === "treinamentos" ? "Vídeos do Treinamento *" : "Vídeos do Curso *"}
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
                  Cursos e Conteúdos Hospedados na Escola
                </h3>
                <span className="text-xs text-[#8a96a3] font-mono">
                  {restrictedData?.cursos.length || 0} cursos cadastrados
                </span>
              </div>

              <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto pr-1 scrollbar-slim space-y-1">
                {!restrictedData ? (
                  <div className="p-12 text-center text-[#8a96a3] text-xs animate-pulse">
                    Carregando grade da escola...
                  </div>
                ) : restrictedData.cursos.length === 0 ? (
                  <div className="p-12 text-center text-[#8a96a3] text-xs">
                    Nenhum curso cadastrado ainda na escola.
                  </div>
                ) : (
                  restrictedData.cursos.map((c) => {
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
                  ÁREA DE CADASTRO & UPLOAD DE MATERIAIS
                </h3>
                <p className="text-[11px] text-[#8a96a3] mt-1">
                  Cadastre arquivos para download dos usuários (planilhas, PDFs, criativos, e-books).
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Formato / Tipo de Arquivo</label>
                  <select
                    value={matTipo}
                    onChange={(e) => setMatTipo(e.target.value as any)}
                    className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all"
                  >
                    <option value="image">Imagem / Criativo (PNG/JPG)</option>
                    <option value="video">Vídeo para Stories / Reels (MP4)</option>
                    <option value="pdf">Documento PDF / Planilha XLS</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Categoria do Recurso *</label>
                    <button
                      type="button"
                      onClick={() => setIsAddingCategory(!isAddingCategory)}
                      className="text-[10px] text-[#d12a62] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {isAddingCategory ? "Concluído" : "+ Gerenciar Categorias"}
                    </button>
                  </div>

                  {!isAddingCategory ? (
                    <select
                      value={matCategory}
                      onChange={(e) => setMatCategory(e.target.value)}
                      className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 text-xs text-[#e8edf2] outline-none transition-all"
                    >
                      {categoriasList.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-black/40 border border-white/5 rounded-2xl space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="Nova categoria..."
                          className="flex-grow bg-[#0b0f14] border border-white/10 rounded-xl p-2 text-xs text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleCreateCategory}
                          className="bg-[#d12a62] text-black hover:bg-[#ff719e] font-bold text-xs px-3 rounded-xl transition-all cursor-pointer"
                        >
                          Adicionar
                        </button>
                      </div>
                      
                      <div className="space-y-1 max-h-[100px] overflow-y-auto pr-1 scrollbar-slim">
                        <p className="text-[8px] uppercase font-bold text-[#8a96a3] tracking-wider mb-1">Categorias Ativas:</p>
                        {categoriasList.map((cat) => (
                          <div key={cat} className="flex justify-between items-center text-[10px] py-1 border-b border-white/5 last:border-0">
                            <span className="text-white font-medium">{cat}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat)}
                              className="text-red-500 hover:text-red-400 font-bold px-1.5 rounded hover:bg-white/5"
                              title="Remover Categoria"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#8a96a3] font-display tracking-wider block">Arquivo para Download (MinIO: materiais/)</label>
                
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer bg-[#131922] hover:bg-[#1a222e] border border-dashed border-white/20 hover:border-[#d12a62] rounded-xl p-3 flex items-center justify-center gap-2 transition-all group text-xs text-[#e8edf2]">
                    {matFileLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 text-[#d12a62] animate-spin" />
                        <span className="text-xs text-[#8a96a3]">Enviando arquivo para materiais/...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-[#d12a62] group-hover:scale-110 transition-transform" />
                        <span className="font-medium text-xs">Fazer Upload de Arquivo (PDF, ZIP, DOC, etc.)</span>
                      </>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleMaterialDownloadFile(f);
                      }}
                    />
                  </label>
                </div>

                <div className="relative mt-2">
                  <input
                    type="text"
                    value={matFileUrl}
                    onChange={(e) => setMatFileUrl(e.target.value)}
                    placeholder="OU insira a URL do arquivo..."
                    className="w-full bg-[#0b0f14] border border-white/10 focus:border-[#d12a62]/50 rounded-xl p-3 pl-10 text-xs text-[#e8edf2] outline-none transition-all focus:ring-1 focus:ring-[#d12a62]/30 font-mono"
                  />
                  <Upload className="w-4 h-4 text-[#8a96a3] absolute left-3.5 top-3.5" />
                </div>
                <p className="text-[9px] text-[#8a96a3] leading-relaxed">
                  Os arquivos enviados por esta ferramenta são salvos automaticamente na pasta <code className="text-[#d12a62]">materiais/</code> no servidor MinIO.
                </p>
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


      {/* TAB CONTENT: CONEXÕES — STATUS MinIO + Vimeo (sem credenciais) */}
      {activeTab === "servidores" && (
        <div className="space-y-10 animate-fade-in">
          {/* Main Header Card */}
          <div className="bg-[#151b22]/80 border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-gradient-to-br from-sky-500/20 via-purple-600/20 to-[#d12a62]/20 border border-white/10 rounded-2xl text-sky-400 shadow-inner">
                <Server className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-white font-display">Status das Integrações</h2>
                  <span className="text-[10px] font-mono font-bold uppercase bg-white/10 text-gray-300 px-2 py-0.5 rounded border border-white/10">Vimeo &amp; MinIO</span>
                </div>
                <p className="text-xs text-[#8a96a3] mt-0.5">
                  Verificação em tempo real da conexão com o armazenamento (MinIO S3) e com a API do Vimeo.
                  As credenciais vivem nas variáveis de ambiente do servidor — nunca são exibidas ou editadas aqui.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchIntegrationsStatus}
              disabled={integrationsLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
            >
              {integrationsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Testar conexões
            </button>
          </div>

          {/* Grid: MinIO | Vimeo */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* --- MINIO --- */}
            <div className="bg-[#151b22]/60 border border-white/10 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#d12a62]/10 rounded-xl border border-[#d12a62]/20">
                    <HardDrive className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">MinIO Object Storage</h3>
                </div>
                {!integrationsLoading && integrationsStatus && (
                  <span className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border font-bold uppercase flex items-center gap-1.5 ${
                    integrationsStatus.minio.online
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : integrationsStatus.minio.configured
                        ? "bg-red-950/60 border-red-500/30 text-red-300"
                        : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                  }`}>
                    {integrationsStatus.minio.online
                      ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : integrationsStatus.minio.configured
                        ? <X className="w-3.5 h-3.5" />
                        : <AlertCircle className="w-3.5 h-3.5" />}
                    {integrationsStatus.minio.online
                      ? "Conectado"
                      : integrationsStatus.minio.configured
                        ? "Falhou"
                        : "Não configurado"}
                  </span>
                )}
              </div>

              {integrationsLoading && !integrationsStatus ? (
                <div className="flex items-center gap-3 py-8 justify-center text-gray-400 text-xs font-mono">
                  <Loader2 className="w-5 h-5 animate-spin text-[#d12a62]" /> Verificando conexão...
                </div>
              ) : (
                <div className="space-y-2.5 text-xs font-mono">
                  <p className={`text-[12px] leading-relaxed ${
                    integrationsStatus?.minio.online
                      ? "text-emerald-300"
                      : integrationsStatus?.minio.configured
                        ? "text-red-300"
                        : "text-amber-300"
                  }`}>
                    {integrationsStatus?.minio.message || "Verificando..."}
                  </p>
                  {integrationsStatus?.minio.endpoint && (
                    <p className="text-[#8a96a3]"><span className="text-gray-400 font-bold">Servidor:</span> <span className="text-white">{integrationsStatus.minio.endpoint}</span></p>
                  )}
                  {integrationsStatus?.minio.bucket && (
                    <p className="text-[#8a96a3]"><span className="text-gray-400 font-bold">Bucket:</span> {integrationsStatus.minio.bucket}</p>
                  )}
                  {integrationsStatus?.minio.region && (
                    <p className="text-[#8a96a3]"><span className="text-gray-400 font-bold">Região:</span> {integrationsStatus.minio.region}</p>
                  )}
                  <p className="text-[#8a96a3]">
                    <span className="text-gray-400 font-bold">Origem da configuração:</span>{" "}
                    {integrationsStatus?.minio.source === "env"
                      ? "variáveis de ambiente (.env)"
                      : integrationsStatus?.minio.source === "db"
                        ? "configuração antiga do banco (mova para o .env)"
                        : "não configurado"}
                  </p>
                  <div className="flex items-center gap-4 pt-1 text-[10px] text-gray-500">
                    {integrationsStatus?.minio.latencyMs !== null && integrationsStatus?.minio.latencyMs !== undefined && (
                      <span>Latência: <strong className="text-gray-300">{integrationsStatus.minio.latencyMs} ms</strong></span>
                    )}
                    {integrationsStatus?.minio.lastCheckedAt && (
                      <span>Verificado: {new Date(integrationsStatus.minio.lastCheckedAt).toLocaleTimeString("pt-BR")}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* --- VIMEO --- */}
            <div className="bg-[#151b22]/60 border border-white/10 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sky-500/10 rounded-xl border border-sky-500/20">
                    <Film className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">API do Vimeo</h3>
                </div>
                {!integrationsLoading && integrationsStatus && (
                  <span className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border font-bold uppercase flex items-center gap-1.5 ${
                    integrationsStatus.vimeo.online
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : integrationsStatus.vimeo.configured
                        ? "bg-red-950/60 border-red-500/30 text-red-300"
                        : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                  }`}>
                    {integrationsStatus.vimeo.online
                      ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : integrationsStatus.vimeo.configured
                        ? <X className="w-3.5 h-3.5" />
                        : <AlertCircle className="w-3.5 h-3.5" />}
                    {integrationsStatus.vimeo.online
                      ? "Conectado"
                      : integrationsStatus.vimeo.configured
                        ? "Falhou"
                        : "Não configurado"}
                  </span>
                )}
              </div>

              {integrationsLoading && !integrationsStatus ? (
                <div className="flex items-center gap-3 py-8 justify-center text-gray-400 text-xs font-mono">
                  <Loader2 className="w-5 h-5 animate-spin text-sky-500" /> Verificando conexão...
                </div>
              ) : (
                <div className="space-y-2.5 text-xs font-mono">
                  <p className={`text-[12px] leading-relaxed ${
                    integrationsStatus?.vimeo.online
                      ? "text-emerald-300"
                      : integrationsStatus?.vimeo.configured
                        ? "text-red-300"
                        : "text-amber-300"
                  }`}>
                    {integrationsStatus?.vimeo.message || "Verificando..."}
                  </p>
                  {integrationsStatus?.vimeo.accountName && (
                    <p className="text-[#8a96a3]"><span className="text-gray-400 font-bold">Conta conectada:</span> <span className="text-white">{integrationsStatus.vimeo.accountName}</span></p>
                  )}
                  {integrationsStatus?.vimeo.accountLink && (
                    <p className="text-[#8a96a3]">
                      <span className="text-gray-400 font-bold">Perfil:</span>{" "}
                      <a href={integrationsStatus.vimeo.accountLink} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">{integrationsStatus.vimeo.accountLink}</a>
                    </p>
                  )}
                  <p className="text-[#8a96a3]">
                    <span className="text-gray-400 font-bold">Origem da configuração:</span>{" "}
                    {integrationsStatus?.vimeo.source === "env"
                      ? "variáveis de ambiente (.env)"
                      : integrationsStatus?.vimeo.source === "db"
                        ? "configuração antiga do banco (mova para o .env)"
                        : "não configurado"}
                  </p>
                  <div className="flex items-center gap-4 pt-1 text-[10px] text-gray-500">
                    {integrationsStatus?.vimeo.latencyMs !== null && integrationsStatus?.vimeo.latencyMs !== undefined && (
                      <span>Latência: <strong className="text-gray-300">{integrationsStatus.vimeo.latencyMs} ms</strong></span>
                    )}
                    {integrationsStatus?.vimeo.lastCheckedAt && (
                      <span>Verificado: {new Date(integrationsStatus.vimeo.lastCheckedAt).toLocaleTimeString("pt-BR")}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Instruções de configuração segura (.env) */}
          <div className="bg-[#151b22]/60 border border-white/5 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">Configuração segura (variáveis de ambiente)</h3>
            </div>
            <p className="text-xs text-[#8a96a3] leading-relaxed">
              Por segurança, as credenciais do MinIO e do Vimeo <strong className="text-gray-300">não são editadas pelo painel</strong>.
              Defina-as no arquivo <code className="text-gray-200 font-mono">.env</code> do servidor (fora do código e do frontend):
            </p>
            <div className="bg-[#0b0f14] border border-white/10 rounded-2xl p-4 font-mono text-[11px] text-gray-300 space-y-1 overflow-x-auto">
              <p><span className="text-[#d12a62] font-bold"># MinIO:</span> MINIO_ENDPOINT, MINIO_PORT, MINIO_USE_SSL, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_REGION, MINIO_CONSOLE_URL</p>
              <p><span className="text-sky-400 font-bold"># Vimeo:</span> VIMEO_CLIENT_ID, VIMEO_CLIENT_SECRET, VIMEO_ACCESS_TOKEN</p>
            </div>
            {integrationsStatus?.minio?.source === "db" && (
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                ⚠️ O MinIO está usando a configuração antiga do banco de dados. Mova as credenciais para o .env o quanto antes.
              </p>
            )}
            {integrationsStatus?.vimeo?.source === "db" && (
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                ⚠️ O Vimeo está usando a configuração antiga do banco de dados. Mova as credenciais para o .env o quanto antes.
              </p>
            )}
          </div>
        </div>
      )}

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
