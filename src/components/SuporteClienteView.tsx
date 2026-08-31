import React, { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "../store";
import LoginModal from "./LoginModal";
import AnexoLightbox from "./AnexoLightbox";
import { SupportTicket, SupportAnexo } from "../types";
import {
  LifeBuoy,
  Plus,
  SendHorizonal,
  RefreshCw,
  ArrowLeft,
  X,
  MessageSquare,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
  Eye,
  Bell,
  Inbox,
  Archive,
  Check,
  RotateCcw,
  Search
} from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  aberto: "bg-red-500/10 text-red-400 border-red-500/30",
  em_andamento: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  aguardando_resposta: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  resolvido: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  fechado: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  arquivado: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  respondido: "bg-sky-500/10 text-sky-400 border-sky-500/30"
};

// Status exibido ao D.I.: derivado da última mensagem (o status do servidor
// "aguardando_resposta" significa "aguardando a resposta do cliente").
function diStatusOf(t: SupportTicket): { label: string; color: string } {
  if (t.status === "arquivado") {
    return { label: "Arquivado", color: STATUS_COLOR.arquivado };
  }
  if (t.status === "resolvido" || t.status === "fechado") {
    return { label: "Encerrado", color: STATUS_COLOR.fechado };
  }
  const msgs = t.mensagens || [];
  const last = msgs[msgs.length - 1];
  if (last && last.tipo === "suporte") {
    return { label: "Respondido", color: STATUS_COLOR.respondido };
  }
  return { label: "Aguardando resposta", color: STATUS_COLOR.aguardando_resposta };
}

// Terminal = encerrado/arquivado (caixa Arquivados). A caixa Suporte = o resto.
const isArchived = (t: SupportTicket): boolean =>
  t.status === "fechado" || t.status === "resolvido" || t.status === "arquivado";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const AVATAR_COLORS = [
  "bg-[#d12a62]/25 text-[#ff7aa8]",
  "bg-sky-500/20 text-sky-300",
  "bg-amber-500/20 text-amber-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-violet-500/20 text-violet-300",
  "bg-teal-500/20 text-teal-300"
];

function avatarColorOf(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initialsOf(name: string): string {
  const parts = (name || "?").trim().split(/\s+/);
  const a = parts[0] ? parts[0][0] : "";
  const b = parts.length > 1 && parts[parts.length - 1][0] ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

type FolderId = "suporte" | "arquivados";

export default function SuporteClienteView() {
  const {
    loggedIn,
    user,
    supportTickets,
    fetchSupportTickets,
    createSupportTicket,
    addSupportMessage,
    attachSupportFiles,
    setSupportTicketStatus
  } = useStore();

  const [loginOpen, setLoginOpen] = useState(false);
  const [folder, setFolder] = useState<FolderId>("suporte");
  const [busca, setBusca] = useState("");
  const [assunto, setAssunto] = useState("");
  const [texto, setTexto] = useState("");
  const [criando, setCriando] = useState(false);
  const [compondo, setCompondo] = useState(false);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [anexosSel, setAnexosSel] = useState<File[]>([]);
  const [anexosNovos, setAnexosNovos] = useState<File[]>([]);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);
  // "Visto em" por chamado (epoch ms) — avisos de mensagem nova do suporte.
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({});
  const prevUnreadRef = useRef(0);
  const [lightbox, setLightbox] = useState<{ ticketId: string; anexo: SupportAnexo } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createFileInputRef = useRef<HTMLInputElement>(null);
  const ACCEPT_TYPES = ".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx";

  useEffect(() => {
    if (loggedIn) {
      fetchSupportTickets().then(() => seedSeen());
    }
  }, [loggedIn]);

  // Realtime: mensagem do suporte chega na hora (SSE).
  useEffect(() => {
    if (!loggedIn) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/support/realtime");
      es.addEventListener("support-changed", () => {
        fetchSupportTickets().then(() => {
          seedSeen();
          syncOpenItem();
        });
      });
    } catch {
      es = null;
    }
    return () => {
      if (es) es.close();
    };
  }, [loggedIn, selected]);

  // Fallback: polling a cada 30s caso o SSE caia.
  useEffect(() => {
    if (!loggedIn) return;
    const id = setInterval(() => {
      fetchSupportTickets().then(() => {
        seedSeen();
        syncOpenItem();
      });
    }, 30000);
    return () => clearInterval(id);
  }, [loggedIn, selected]);

  // Refetch ao voltar a aba/janela em foco.
  useEffect(() => {
    const onFocus = () => {
      if (loggedIn) fetchSupportTickets().then(() => { seedSeen(); syncOpenItem(); });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) onFocus();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loggedIn, selected]);

  // Esc: fecha o lightbox primeiro; sem lightbox, fecha o chamado aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightbox) {
          setLightbox(null);
          return;
        }
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const notify = (tipo: "success" | "error", texto: string) => {
    setMsg({ tipo, texto });
    setTimeout(() => setMsg(null), 3500);
  };

  const markSeen = (id: string) => {
    setLastSeen((prev) => ({ ...prev, [id]: Date.now() }));
  };

  const seedSeen = () => {
    const now = Date.now();
    setLastSeen((prev) => {
      const next = { ...prev };
      (useStore.getState().supportTickets || []).forEach((t) => {
        if (!next[t.id]) next[t.id] = now;
      });
      return next;
    });
  };

  const syncOpenItem = () => {
    if (!selected) return;
    const fresh = (useStore.getState().supportTickets || []).find((t) => t.id === selected.id);
    if (fresh) setSelected(fresh);
  };

  // Caixa Suporte (ativos) e Arquivados (encerrado/resolvido/arquivado).
  // Ordenação pela atividade mais recente (`atualizadoEm` desc): o chamado que
  // recebe mensagem nova vai ao topo; dentro da mesma data, pelo criadoEm.
  const sortedTickets = [...(supportTickets || [])].sort((a, b) => {
    const da = new Date(a.atualizadoEm || a.criadoEm).getTime();
    const db = new Date(b.atualizadoEm || b.criadoEm).getTime();
    if (db !== da) return db - da;
    return new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime();
  });
  const folderTickets = sortedTickets.filter((t) =>
    folder === "arquivados" ? isArchived(t) : !isArchived(t)
  );
  const suporteCount = sortedTickets.filter((t) => !isArchived(t)).length;
  const arquivadosCount = sortedTickets.filter((t) => isArchived(t)).length;

  const visibleTickets = folderTickets.filter((t) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return (
      String(t.numero).includes(q) ||
      t.assunto.toLowerCase().includes(q) ||
      (t.mensagens || []).some((m) => m.texto.toLowerCase().includes(q))
    );
  });

  // Não lidas = mensagens do suporte mais recentes que a última abertura.
  const unreadOf = (t: SupportTicket): number => {
    const seen = lastSeen[t.id] || 0;
    if (seen === 0) return 0;
    return (t.mensagens || []).filter((m) => m.tipo === "suporte" && new Date(m.criadoEm).getTime() > seen).length;
  };
  const hasUnread = (t: SupportTicket): boolean => unreadOf(t) > 0;

  // Aviso de novas mensagens do suporte na sessão.
  const unreadTotalNow = (supportTickets || []).reduce((acc, t) => acc + unreadOf(t), 0);
  useEffect(() => {
    if (!loggedIn) return;
    if (unreadTotalNow > 0 && prevUnreadRef.current === 0) {
      notify("success", `🔔 ${unreadTotalNow === 1 ? "Nova mensagem do suporte" : `${unreadTotalNow} novas mensagens do suporte`}.`);
    }
    prevUnreadRef.current = unreadTotalNow;
  }, [unreadTotalNow, loggedIn]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assunto.trim() || !texto.trim()) {
      notify("error", "Preencha o assunto e a mensagem do chamado.");
      return;
    }
    setCriando(true);
    try {
      const res = await createSupportTicket(assunto.trim(), texto.trim(), anexosNovos.length > 0 ? anexosNovos : undefined);
      if (res.success) {
        notify("success", `Chamado #${String(res.ticket?.numero || "").padStart(4, "0")} aberto com sucesso.`);
        setAssunto("");
        setTexto("");
        setAnexosNovos([]);
        setCompondo(false);
        setFolder("suporte");
        setSelected(res.ticket || null);
      } else {
        notify("error", res.error || "Erro ao abrir chamado.");
      }
    } catch {
      notify("error", "Erro de conexão ao abrir chamado.");
    } finally {
      setCriando(false);
    }
  };

  const handleReply = async () => {
    if (!selected) return;
    if (!replyText.trim()) return;
    const targetId = selected.id;
    setEnviando(true);
    try {
      let res: { success: boolean; ticket?: SupportTicket; error?: string };
      if (anexosSel.length > 0) {
        res = await attachSupportFiles(targetId, anexosSel, replyText.trim());
      } else {
        res = await addSupportMessage(targetId, replyText.trim());
      }
      if (res.success) {
        setReplyText("");
        setAnexosSel([]);
        // Só atualiza o painel se o usuário ainda o tiver aberto — se ele
        // fechou durante o await, NÃO reabrir (corrida assíncrona).
        setSelected((cur) => (cur && cur.id === targetId ? (res.ticket || cur) : cur));
        markSeen(targetId);
      } else {
        notify("error", res.error || "Erro ao enviar mensagem.");
      }
    } catch {
      notify("error", "Erro de conexão ao enviar mensagem.");
    } finally {
      setEnviando(false);
    }
  };

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    let rest = files;
    if (anexosSel.length + files.length > 5) {
      const room = 5 - anexosSel.length;
      if (room <= 0) {
        notify("error", "Máximo de 5 arquivos por mensagem.");
        e.target.value = "";
        return;
      }
      rest = files.slice(0, room);
      notify("error", "Máximo de 5 arquivos por mensagem.");
    }
    setAnexosSel((prev) => [...prev, ...rest].slice(0, 5));
    e.target.value = "";
  };

  const handlePickCreateFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    let rest = files;
    if (anexosNovos.length + files.length > 5) {
      const room = 5 - anexosNovos.length;
      if (room <= 0) {
        notify("error", "Máximo de 5 arquivos por chamado.");
        e.target.value = "";
        return;
      }
      rest = files.slice(0, room);
      notify("error", "Máximo de 5 arquivos por chamado.");
    }
    setAnexosNovos((prev) => [...prev, ...rest].slice(0, 5));
    e.target.value = "";
  };

  // D.I. encerra (fechado), arquiva (arquivado) ou reabre (aberto) o próprio chamado.
  const handleStatus = async (t: SupportTicket, st: "fechado" | "arquivado" | "aberto") => {
    setStatusLoading(t.id);
    try {
      const res = await setSupportTicketStatus(t.id, st);
      if (res.success) {
        if (selected?.id === t.id) setSelected(res.ticket || null);
        const rotulo = st === "fechado" ? "encerrado" : st === "arquivado" ? "arquivado" : "reaberto";
        notify("success", `Chamado #${String(t.numero).padStart(4, "0")} ${rotulo}.`);
      } else {
        notify("error", res.error || "Erro ao alterar status do chamado.");
      }
    } catch {
      notify("error", "Erro de conexão ao alterar status.");
    } finally {
      setStatusLoading(null);
    }
  };

  const openTicket = (t: SupportTicket) => {
    setSelected(t);
    markSeen(t.id);
  };

  const closeThread = useCallback(() => setSelected(null), []);
  const switchFolder = (f: FolderId) => {
    setFolder(f);
    setSelected(null);
    setCompondo(false);
  };

  const lastMessageOf = (t: SupportTicket): string => {
    const msgs = t.mensagens || [];
    if (msgs.length === 0) return "Sem mensagens ainda.";
    const last = msgs[msgs.length - 1];
    const autor = last.tipo === "suporte" ? "Suporte" : "Você";
    return `${autor}: ${last.texto}`;
  };

  const downloadAnexoUrl = (ticketId: string, anexoId: string) =>
    `/api/support/tickets/${encodeURIComponent(ticketId)}/anexos/${encodeURIComponent(anexoId)}?download=1`;

  const renderAnexoChips = (anexos: SupportAnexo[] | undefined, ticketId: string) => {
    if (!anexos || anexos.length === 0) return null;
    return (
      <div className="mt-2.5 space-y-1.5">
        {anexos.map((a) => {
          const viewable = a.isImage || String(a.mime || "").toLowerCase().includes("pdf");
          return (
            <div
              key={a.id}
              className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-[#e8edf2]"
            >
              <span className="w-7 h-7 rounded-lg bg-[#d12a62]/15 flex items-center justify-center shrink-0">
                {a.isImage ? <ImageIcon className="w-3.5 h-3.5 text-[#d12a62]" /> : <FileText className="w-3.5 h-3.5 text-[#d12a62]" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-[#e8edf2] truncate">{a.nome}</span>
                <span className="block text-[10px] mt-0.5 text-[#8a96a3]">{a.tamanhoKb} KB</span>
              </span>
              {viewable && (
                <button
                  onClick={() => setLightbox({ ticketId, anexo: a })}
                  title="Visualizar no site"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-[#e8edf2] hover:border-[#d12a62]/50 hover:text-white transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  Ver
                </button>
              )}
              <a
                href={downloadAnexoUrl(ticketId, a.id)}
                title={`Baixar ${a.nome}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-[#e8edf2] hover:border-[#d12a62]/50 hover:text-white transition-colors"
              >
                <Download className="w-3 h-3" />
                Baixar
              </a>
            </div>
          );
        })}
      </div>
    );
  };

  const folders: { id: FolderId; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "suporte", label: "Suporte", icon: <Inbox className="w-4 h-4" />, count: suporteCount },
    { id: "arquivados", label: "Arquivados", icon: <Archive className="w-4 h-4" />, count: arquivadosCount }
  ];

  if (!loggedIn) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center">
          <LifeBuoy className="w-8 h-8 text-[#d12a62]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white font-display">Central de Suporte</h2>
          <p className="text-sm text-[#8a96a3] mt-2">
            Abra um chamado, acompanhe o atendimento e fale com o suporte. Acesse com o seu código D.I. para continuar.
          </p>
        </div>
        <button
          onClick={() => setLoginOpen(true)}
          className="px-8 py-3.5 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300"
        >
          Entrar com código D.I.
        </button>
        {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-3 animate-fade-in">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center">
            <LifeBuoy className="w-5 h-5 text-[#d12a62]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white font-display">Central de Suporte</h2>
            <p className="text-[11px] text-[#8a96a3]">Caixa de entrada · chamados de {user?.name || user?.code}</p>
          </div>
        </div>
        <button
          onClick={() => { setCompondo(true); setSelected(null); setFolder("suporte"); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300"
        >
          <Plus className="w-4 h-4" />
          Novo chamado
        </button>
      </header>

      {msg && (
        <div
          className={`px-4 py-3 rounded-xl text-xs font-bold border ${
            msg.tipo === "success"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/10 text-red-400 border-red-500/30"
          }`}
        >
          {msg.texto}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-stretch">
        {/* Pastas — desktop */}
        <aside className="hidden lg:flex flex-col gap-1.5 bg-[#151b22]/60 border border-white/5 rounded-2xl p-2.5 self-start sticky top-24">
          <p className="px-3 pt-2 pb-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-[#8a96a3]/70">
            Pastas
          </p>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => switchFolder(f.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-bold border transition-colors w-full ${
                folder === f.id
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-transparent text-[#8a96a3] border-transparent hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              {f.icon}
              <span className="flex-1 text-left">{f.label}</span>
              <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[9px] font-mono text-[#8a96a3]">{f.count}</span>
            </button>
          ))}
        </aside>

        {/* Pastas — mobile */}
        <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => switchFolder(f.id)}
              className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                folder === f.id
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-[#151b22]/60 text-[#8a96a3] border-white/10"
              }`}
            >
              {f.icon}
              {f.label}
              <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[9px] font-mono">{f.count}</span>
            </button>
          ))}
        </div>

        {/* Conteúdo: lista + leitura */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-stretch">
          {/* LISTA */}
          <section
            className={`rounded-2xl bg-[#151b22]/60 border border-white/5 overflow-hidden flex-col lg:max-h-[calc(100vh-140px)] ${
              compondo ? "hidden lg:flex" : selected ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="p-3 space-y-2.5 border-b border-white/5">
              <div className="flex items-center justify-between gap-2 px-1">
                <h3 className="text-sm font-bold text-white font-display">
                  {folder === "arquivados" ? "Arquivados" : "Chamados de suporte"}
                </h3>
                <span className="text-[10px] text-[#8a96a3] font-mono">{visibleTickets.length} item(ns)</span>
              </div>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a96a3]" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por assunto, número ou mensagem..."
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-[60vh] lg:min-h-0 lg:max-h-[calc(100vh-230px)] p-2.5 space-y-2.5">
              {visibleTickets.length === 0 ? (
                <p className="p-8 text-center text-xs text-[#8a96a3]">
                  {folder === "arquivados"
                    ? "Nenhum chamado arquivado no momento."
                    : "Nenhum chamado de suporte no momento."}
                </p>
              ) : (
                visibleTickets.map((t) => {
                  const unread = unreadOf(t);
                  // Contorno verde VÍVIDO SÓ quando há MENSAGEM NÃO LIDA do suporte
                  // (chegou depois da última abertura pelo D.I.). Depois de abrir o
                  // chamado (markSeen), o contorno volta ao branco sutil.
                  const msgs = t.mensagens || [];
                  const hasAnexos = msgs.some((m) => (m.anexos || []).length > 0);
                  const isNew = unread > 0;
                  return (
                    <React.Fragment key={t.id}>
                      <button
                        onClick={() => openTicket(t)}
                        className={`w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left cursor-pointer transition-colors hover:bg-white/[0.02] ${
                          isNew
                            ? "border-2 border-emerald-400/90 bg-emerald-500/[0.03]"
                            : "border border-white/30 bg-transparent"
                        }`}
                      >
                        <span className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5 ${avatarColorOf(user?.code || "?")}`}>
                          {initialsOf(user?.name || user?.code || "?")}
                          {unread > 0 && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-[#151b22]" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`truncate ${unread > 0 ? "font-black text-white" : "font-bold text-white/80"}`}>
                              <span className="font-mono text-[#d12a62]">#{String(t.numero).padStart(4, "0")}</span> — {t.assunto}
                              {hasAnexos && <span className="ml-1.5 text-[#8a96a3]">📎</span>}
                            </span>
                            {unread > 0 && (
                              <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/15 border border-red-500/40 text-red-400 text-[9px] font-mono font-bold">
                                <Bell className="w-2.5 h-2.5" />
                                {unread} nova{unread > 1 ? "s" : ""}
                              </span>
                            )}
                            <span className="ml-auto shrink-0 text-[10px] font-mono whitespace-nowrap text-[#8a96a3]">
                              {formatTime(t.atualizadoEm)}
                            </span>
                          </div>
                          <p className={`truncate text-[12px] mt-1 ${unread > 0 ? "text-white font-bold" : "text-[#8a96a3]"}`}>
                            {lastMessageOf(t)}
                          </p>
                        </div>
                        <span className={`shrink-0 px-2.5 py-1 rounded-lg border text-[9px] font-mono font-bold mt-0.5 ${diStatusOf(t).color} ${isArchived(t) ? "opacity-70" : ""}`}>
                          {diStatusOf(t).label}
                        </span>
                      </button>
                    </React.Fragment>
                  );
                })
              )}
            </div>
          </section>

          {/* LEITURA */}
          <section
            className={`rounded-2xl bg-[#151b22]/60 border border-white/5 overflow-hidden flex-col lg:max-h-[calc(100vh-140px)] ${
              compondo || selected ? "flex" : "hidden lg:flex"
            }`}
          >
            {compondo ? (
              <form onSubmit={handleCreate} className="flex flex-col gap-4 p-4 md:p-5 overflow-y-auto">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCompondo(false)}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 text-[#e8edf2] hover:border-[#d12a62]/50 transition-colors shrink-0"
                    title="Voltar à lista"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#d12a62]" />
                    Abrir novo chamado
                  </h3>
                </div>

                <input
                  type="text"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  placeholder="Assunto / resumo do problema (ex: não consigo acessar o curso)"
                  maxLength={200}
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                  required
                />
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Explique o que está acontecendo..."
                  rows={5}
                  maxLength={5000}
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors resize-none"
                  required
                />
                {anexosNovos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {anexosNovos.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0b0f14] border border-[#d12a62]/30 text-[11px] font-mono text-[#e8edf2]"
                      >
                        {f.type.startsWith("image/") ? <ImageIcon className="w-3 h-3 text-[#d12a62]" /> : <FileText className="w-3 h-3 text-[#d12a62]" />}
                        <span className="max-w-[160px] truncate">{f.name}</span>
                        <span className="text-[#8a96a3]">({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                        <button
                          type="button"
                          onClick={() => setAnexosNovos((prev) => prev.filter((_, j) => j !== i))}
                          className="text-[#8a96a3] hover:text-white transition-colors"
                          aria-label="Remover arquivo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-auto">
                  <input
                    ref={createFileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPT_TYPES}
                    className="hidden"
                    onChange={handlePickCreateFiles}
                  />
                  <button
                    type="button"
                    onClick={() => createFileInputRef.current?.click()}
                    disabled={anexosNovos.length >= 5}
                    title="Anexar fotos ou documentos ao chamado (até 5 arquivos, 10 MB cada)"
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#8a96a3] hover:text-white hover:border-[#d12a62]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Paperclip className="w-4 h-4" />
                    Anexar arquivos
                  </button>
                  <button
                    type="submit"
                    disabled={criando}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
                  >
                    {criando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Abrir chamado
                  </button>
                </div>
              </form>
            ) : selected ? (
              <div className="flex flex-col min-h-[70vh] lg:min-h-0">
                {/* Cabeçalho do thread */}
                <div className="flex items-center gap-3 px-4 md:px-5 py-3.5 border-b border-white/5">
                  <button
                    onClick={closeThread}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 text-[#e8edf2] hover:border-[#d12a62]/50 transition-colors shrink-0"
                    title="Voltar à lista"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${avatarColorOf(user?.code || "?")}`}>
                    {initialsOf(user?.name || user?.code || "?")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-white font-display truncate">
                        #{String(selected.numero).padStart(4, "0")} — {selected.assunto}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-mono font-bold ${diStatusOf(selected).color}`}>
                        {diStatusOf(selected).label}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#8a96a3] mt-0.5 truncate">
                      Aberto em {formatDate(selected.criadoEm)} · Última atividade {formatDate(selected.atualizadoEm)}
                      {selected.fechadoEm ? ` · Fechado em ${formatDate(selected.fechadoEm)} por ${selected.fechadoPor || "suporte"}` : ""}
                    </p>
                  </div>
                  {/* Ações rápidas do D.I. no próprio chamado */}
                  <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                    {!isArchived(selected) && (
                      <>
                        <button
                          onClick={() => handleStatus(selected, "arquivado")}
                          disabled={statusLoading === selected.id}
                          title="Arquivar chamado"
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-[#e8edf2] hover:border-sky-500/50 hover:text-sky-300 transition-colors disabled:opacity-50"
                        >
                          {statusLoading === selected.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                          <span className="hidden sm:inline">Arquivar</span>
                        </button>
                        <button
                          onClick={() => handleStatus(selected, "fechado")}
                          disabled={statusLoading === selected.id}
                          title="Encerrar chamado"
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-[11px] font-bold text-emerald-400 hover:brightness-110 transition-colors disabled:opacity-50"
                        >
                          {statusLoading === selected.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span className="hidden sm:inline">Encerrar</span>
                        </button>
                      </>
                    )}
                    {isArchived(selected) && (
                      <button
                        onClick={() => handleStatus(selected, "aberto")}
                        disabled={statusLoading === selected.id}
                        title="Reabrir chamado"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-[#e8edf2] hover:border-[#d12a62]/50 hover:text-white transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reabrir
                      </button>
                    )}
                  </div>
                </div>

                {/* Mensagens */}
                <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4 space-y-4 min-h-[38vh] max-h-[48vh]">
                  {selected.mensagens.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-end gap-2 ${m.tipo === "di" ? "justify-end" : "justify-start"}`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                          m.tipo === "di"
                            ? avatarColorOf(user?.code || "?")
                            : "bg-white/10 text-[#8a96a3]"
                        } ${m.tipo === "di" ? "order-2" : ""}`}
                      >
                        {initialsOf(m.tipo === "di" ? user?.name || user?.code || "?" : "Suporte")}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 border ${
                          m.tipo === "di"
                            ? "bg-[#d12a62]/10 border-[#d12a62]/25 rounded-tr-sm"
                            : "bg-[#0b0f14] border-white/10 rounded-tl-sm"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${m.tipo === "di" ? "text-[#d12a62]" : "text-[#8a96a3]"}`}>
                            {m.tipo === "di" ? "Você" : "Suporte"}
                          </span>
                          {m.tipo === "suporte" && <span className="text-[10px] text-[#8a96a3]">· {m.autorNome}</span>}
                          <span className="text-[10px] text-[#8a96a3]">· {formatTime(m.criadoEm)}</span>
                        </div>
                        <p className="text-sm text-[#e8edf2] whitespace-pre-wrap break-words">{m.texto}</p>
                        {renderAnexoChips(m.anexos, selected.id)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rodapé: composer (ativo) ou reabrir (terminal) */}
                {isArchived(selected) ? (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-[#0b0f14]/80 border-t border-white/10">
                    <p className="text-xs text-[#8a96a3]">
                      Este chamado está {diStatusOf(selected).label.toLowerCase()}. O histórico permanece guardado.
                    </p>
                    <button
                      onClick={() => handleStatus(selected, "aberto")}
                      disabled={statusLoading === selected.id}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white hover:border-[#d12a62]/50 transition-colors disabled:opacity-50"
                    >
                      {statusLoading === selected.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      Reabrir chamado
                    </button>
                  </div>
                ) : (
                  <div className="px-4 md:px-5 py-3.5 border-t border-white/5">
                    {anexosSel.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {anexosSel.map((f, i) => (
                          <span
                            key={`${f.name}-${i}`}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0b0f14] border border-[#d12a62]/30 text-[11px] font-mono text-[#e8edf2]"
                          >
                            {f.type.startsWith("image/") ? <ImageIcon className="w-3 h-3 text-[#d12a62]" /> : <FileText className="w-3 h-3 text-[#d12a62]" />}
                            <span className="max-w-[160px] truncate">{f.name}</span>
                            <span className="text-[#8a96a3]">({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                            <button
                              type="button"
                              onClick={() => setAnexosSel((prev) => prev.filter((_, j) => j !== i))}
                              className="text-[#8a96a3] hover:text-white transition-colors"
                              aria-label="Remover arquivo"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={ACCEPT_TYPES}
                        className="hidden"
                        onChange={handlePickFiles}
                      />
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Escreva sua mensagem para o suporte... (obrigatório)"
                        rows={3}
                        className="flex-1 bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#d12a62] transition-colors resize-none"
                      />
                      <div className="self-end flex flex-col gap-2 items-end">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={anexosSel.length >= 5}
                          title="Anexar fotos ou documentos (até 5 arquivos, 10 MB cada)"
                          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-[#8a96a3] hover:text-white hover:border-[#d12a62]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleReply}
                          disabled={enviando || !replyText.trim()}
                          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {enviando ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <SendHorizonal className="w-4 h-4" />
                          )}
                          Enviar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[50vh] text-center p-8">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center">
                  <Inbox className="w-6 h-6 text-[#8a96a3]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Selecione um chamado</p>
                  <p className="text-xs text-[#8a96a3] mt-1">
                    Escolha um chamado na lista ao lado para acompanhar a conversa.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Lightbox de anexos */}
      {lightbox && (
        <AnexoLightbox
          ticketId={lightbox.ticketId}
          anexo={lightbox.anexo}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}