import React, { useState, useEffect, useMemo, useRef } from "react";
import { useStore } from "../store";
import { SupportTicket, SupportTicketStatus, OuvidoriaMessage, SupportAnexo } from "../types";
import AnexoLightbox from "./AnexoLightbox";
import {
  LogOut,
  Loader2,
  SendHorizonal,
  Search,
  Lock,
  Inbox,
  Handshake,
  Phone,
  Mail,
  MapPin,
  X,
  Copy,
  MessageCircle,
  RefreshCw,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
  Eye,
  Bell,
  ChevronLeft,
  Archive,
  Star,
  LifeBuoy,
  KeyRound
} from "lucide-react";

const INTERESSADO_STATUS_ORDER: Record<string, number> = {
  pendente: 0,
  lida: 1,
  resolvida: 2,
  arquivada: 3
};

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_resposta: "Aguardando resposta",
  resolvido: "Encerrado",
  fechado: "Encerrado",
  arquivado: "Encerrado"
};

const STATUS_COLOR: Record<string, string> = {
  aberto: "bg-red-500/10 text-red-400 border-red-500/30",
  em_andamento: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  aguardando_resposta: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  resolvido: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  fechado: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  arquivado: "bg-sky-500/10 text-sky-400 border-sky-500/30"
};

const AVATAR_COLORS = [
  "bg-[#d12a62]/25 text-[#ff7aa8]",
  "bg-sky-500/20 text-sky-300",
  "bg-amber-500/20 text-amber-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-violet-500/20 text-violet-300",
  "bg-teal-500/20 text-teal-300"
];

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

function formatBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

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

// Chamados arquivados/encerrados ficam ocultos da caixa ativa (acessíveis na pasta Arquivados).
const TERMINAL_STATUSES = ["fechado", "resolvido", "arquivado"];
function isTerminalTicket(t: { status: string }): boolean {
  return TERMINAL_STATUSES.includes(t.status);
}

// Normaliza para wa.me: número brasileiro com DDD (55 + 10/11 dígitos).
function whatsappDigits(value: string): string {
  const d = String(value || "").replace(/\D/g, "");
  if (!d) return "";
  return d.length <= 11 ? `55${d}` : d;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export default function SupportApp() {
  const {
    loggedIn,
    user,
    login,
    logout,
    supportTickets,
    supportLeads,
    fetchSupportInbox,
    addSupportMessage,
    attachSupportFiles,
    setSupportTicketStatus,
    setSupportLeadStatus,
    changeSupportPassword,
    fetchPublicData,
    publicData,
    restrictedData
  } = useStore();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  // Modal de "defina a sua senha de acesso" (1º acesso ou após redefinição do admin)
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwNovaSenha, setPwNovaSenha] = useState("");
  const [pwConfirma, setPwConfirma] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ativos");
  const [queueFilter, setQueueFilter] = useState<"tudo" | "interessados" | "chamados">("tudo");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [selectedLead, setSelectedLead] = useState<OuvidoriaMessage | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [leadStatusLoading, setLeadStatusLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);
  const [loading, setLoading] = useState(true);
  // "Visto em" por item (epoch ms) — controla os avisos de mensagem nova na sessão.
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({});
  // Chamados marcados manualmente como "não lida" (distintos dos que receberam
  // mensagem nova de verdade: ficam abaixo destas, mas acima de lidos/respondidos).
  const [manuUnread, setManuUnread] = useState<Record<string, boolean>>({});
  const prevUnreadRef = useRef(0);
  // Anexos que o atendente vai enviar junto com a resposta.
  const [staffFiles, setStaffFiles] = useState<File[]>([]);
  const staffFileInputRef = useRef<HTMLInputElement>(null);
  // Lightbox de visualização de anexos (imagem/PDF) — nada abre direto no chat.
  const [lightbox, setLightbox] = useState<{ ticketId: string; anexo: SupportAnexo } | null>(null);
  // Espelhos do item aberto (evitam closures obsoletas em callbacks do realtime/polling).
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectedLeadRef = useRef(selectedLead);
  selectedLeadRef.current = selectedLead;
  const ACCEPT_TYPES = ".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx";

  const logoUrl = publicData?.logoUrl || restrictedData?.logoUrl;
  const isStaff = user?.role === "support";

  const notify = (tipo: "success" | "error", texto: string) => {
    setToast({ tipo, texto });
    setTimeout(() => setToast(null), 3500);
  };

  const markSeen = (id: string) => {
    setLastSeen((prev) => ({ ...prev, [id]: Date.now() }));
    setManuUnread((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // "Marcar como não lida": volta a última abertura para um valor mínimo para que
  // as mensagens do cliente voltem a contar como novas (card verde + badge + toast),
  // como se a mensagem tivesse acabado de chegar.
  const markUnread = (id: string) => {
    setLastSeen((prev) => ({ ...prev, [id]: 1 }));
    setManuUnread((prev) => ({ ...prev, [id]: true }));
    notify("success", "Chamado marcado como não lido.");
  };

  const seedSeen = () => {
    const now = Date.now();
    setLastSeen((prev) => {
      const next = { ...prev };
      (useStore.getState().supportTickets || []).forEach((t) => {
        if (!next[t.id]) next[t.id] = now;
      });
      (useStore.getState().supportLeads || []).forEach((l) => {
        if (!next[l.id]) next[l.id] = now;
      });
      return next;
    });
  };

  // Sincroniza o item aberto com dados recém-carregados (novas mensagens no thread).
  const syncOpenItem = () => {
    const st = useStore.getState();
    const curSelected = selectedRef.current;
    if (curSelected) {
      const fresh = (st.supportTickets || []).find((t) => t.id === curSelected.id);
      if (fresh && selectedRef.current?.id === curSelected.id) setSelected(fresh);
    }
    const curLead = selectedLeadRef.current;
    if (curLead) {
      const fresh = (st.supportLeads || []).find((l) => l.id === curLead.id);
      if (fresh && selectedLeadRef.current?.id === curLead.id) setSelectedLead(fresh);
    }
  };

  useEffect(() => {
    fetchPublicData().catch(() => {});
  }, [fetchPublicData]);

  useEffect(() => {
    if (loggedIn && isStaff) {
      fetchSupportInbox()
        .then(() => {
          seedSeen();
          syncOpenItem();
        })
        .finally(() => setLoading(false));
    }
  }, [loggedIn, fetchSupportInbox]);

  // Realtime: mensagem/anexo/status novo chega na hora (SSE). Cada evento refaz
  // o fetch da caixa — o servidor filtra por papel/dono.
  useEffect(() => {
    if (!loggedIn || !isStaff) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/support/realtime");
      es.addEventListener("support-changed", () => {
        fetchSupportInbox().then(() => {
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
  }, [loggedIn, isStaff, selected, selectedLead]);

  // Auto-refresh da fila a cada 30s (fallback caso o SSE caia).
  useEffect(() => {
    if (!loggedIn || !isStaff) return;
    const id = setInterval(() => {
      fetchSupportInbox().then(() => {
        seedSeen();
        syncOpenItem();
      });
    }, 30000);
    return () => clearInterval(id);
  }, [loggedIn, isStaff, selected, selectedLead]);

  // Refetch imediato ao voltar a aba/janela em foco.
  useEffect(() => {
    const onFocus = () => {
      if (loggedIn && isStaff) fetchSupportInbox().then(() => { seedSeen(); syncOpenItem(); });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) onFocus();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loggedIn, isStaff, selected, selectedLead]);

  // Esc: fecha o lightbox primeiro; sem lightbox, fecha o painel de leitura.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightbox) {
          setLightbox(null);
          return;
        }
        setSelected(null);
        setSelectedLead(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await login({ email, password: senha });
      if (!res.success) {
        setLoginError(res.error || "Credenciais inválidas.");
        return;
      }
      if (user?.role !== "support") {
        setLoginError("Esta conta não possui acesso à área de suporte. Área exclusiva dos responsáveis cadastrados.");
        return;
      }
      setLoading(true);
      await fetchSupportInbox().then(() => seedSeen()).finally(() => setLoading(false));
    } catch {
      setLoginError("Erro de conexão. Tente novamente.");
    } finally {
      setLoginLoading(false);
    }
  };

  // Se o responsável ainda precisa definir a própria senha (1º acesso / após
  // redefinição do admin), abre o modal — inclusive ao restaurar a sessão (reload).
  useEffect(() => {
    if (user?.role === "support" && user.mustChangePassword && !pwLoading) {
      setPwModalOpen(true);
    }
  }, [user]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const nova = pwNovaSenha.trim();
    if (nova.length < 8 || !/[a-zA-Z]/.test(nova) || !/[0-9]/.test(nova)) {
      setPwError("A senha deve ter no mínimo 8 caracteres, com letras e números.");
      return;
    }
    if (nova !== pwConfirma) {
      setPwError("As senhas não conferem.");
      return;
    }
    setPwLoading(true);
    setPwError(null);
    const res = await changeSupportPassword(nova);
    setPwLoading(false);
    if (!res.success) {
      setPwError(res.error || "Erro ao alterar a senha. Tente novamente.");
      return;
    }
    notify("success", "Senha atualizada com sucesso.");
    setPwModalOpen(false);
    setPwNovaSenha("");
    setPwConfirma("");
  };

  const sortedTickets = useMemo(() => {
    const rank = (t: SupportTicket): number => {
      // 0 = mensagem nova REAL (chegou via SSE depois da sessão); 1 = não lida
      // marcada manualmente; 2 = lida/respondida (fica abaixo).
      const seenAt = lastSeen[t.id] || 0;
      const hasNewMsg = seenAt > 0 &&
        (t.mensagens || []).some((m) => m.tipo !== "suporte" && new Date(m.criadoEm).getTime() > seenAt);
      if (hasNewMsg && !manuUnread[t.id]) return 0;
      if (manuUnread[t.id]) return 1;
      return 2;
    };
    return [...(supportTickets || [])].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      // Mesma lógica dos cards D.I.: a mensagem mais recente fica no topo
      // (ordem de chegada, atividade = atualizadoEm desc).
      const da = new Date(a.atualizadoEm || a.criadoEm).getTime();
      const db = new Date(b.atualizadoEm || b.criadoEm).getTime();
      if (db !== da) return db - da;
      return new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime();
    });
  }, [supportTickets, lastSeen, manuUnread]);

  const filteredTickets = useMemo(() => {
    return sortedTickets.filter((t) => {
      const isArc = isTerminalTicket(t);
      if (statusFilter === "arquivados" ? !isArc : isArc) return false;
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${t.assunto} ${t.criadoPorNome} ${t.criadoPor} ${String(t.numero)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sortedTickets, statusFilter, search]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(supportLeads || [])]
      .filter((l) => {
        const isArc = l.status === "arquivada" || l.status === "resolvida";
        if (statusFilter === "arquivados" ? !isArc : isArc) return false;
        if (q) {
          const hay = `${l.nome} ${l.email} ${l.telefone || ""} ${l.tipoParceria || ""} ${l.cidade || ""} ${l.estado || ""} ${l.pais || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const s = INTERESSADO_STATUS_ORDER[a.status] - INTERESSADO_STATUS_ORDER[b.status];
        if (s !== 0) return s;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [supportLeads, search, statusFilter]);

  // Avisos de mensagem nova desde a última abertura.
  const unread = useMemo(() => {
    const leadsNew = filteredLeads.filter((l) => {
      const seen = lastSeen[l.id] || 0;
      return seen > 0 && new Date(l.createdAt).getTime() > seen;
    }).length;
    const ticketsNew = filteredTickets.filter((t) => {
      const seen = lastSeen[t.id] || 0;
      if (seen === 0) return false;
      return (t.mensagens || []).some((m) => m.tipo !== "suporte" && new Date(m.criadoEm).getTime() > seen);
    }).length;
    return { leadsNew, ticketsNew, total: leadsNew + ticketsNew };
  }, [filteredLeads, filteredTickets, lastSeen]);

  // Toast ao receber novas mensagens durante a sessão.
  useEffect(() => {
    if (!loggedIn || !isStaff) return;
    if (unread.total > 0 && prevUnreadRef.current === 0) {
      notify("success", `🔔 ${unread.total === 1 ? "Nova mensagem recebida" : `${unread.total} novas mensagens recebidas`}.`);
    }
    prevUnreadRef.current = unread.total;
  }, [unread.total, loggedIn, isStaff]);

  const handleLogout = async () => {
    await logout();
    setSelected(null);
    setSelectedLead(null);
    setEmail("");
    setSenha("");
    setLastSeen({});
    setLightbox(null);
    prevUnreadRef.current = 0;
  };

  const sendReply = async () => {
    if (!selected || sending) return;
    if (!replyText.trim()) return;
    const targetId = selected.id;
    setSending(true);
    try {
      let res: { success: boolean; ticket?: SupportTicket; error?: string };
      if (staffFiles.length > 0) {
        res = await attachSupportFiles(targetId, staffFiles, replyText.trim());
      } else {
        res = await addSupportMessage(targetId, replyText.trim());
      }
      if (res.success) {
        setReplyText("");
        setStaffFiles([]);
        // Só atualiza o painel se o usuário ainda o tiver aberto — se ele
        // fechou durante o await, NÃO reabrir (corrida assíncrona).
        setSelected((cur) => (cur && cur.id === targetId ? (res.ticket || cur) : cur));
        markSeen(targetId);
      } else {
        notify("error", res.error || "Erro ao enviar mensagem.");
      }
    } catch {
      notify("error", "Erro de conexão.");
    } finally {
      setSending(false);
    }
  };

  const handleStaffPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    let rest = files;
    if (staffFiles.length + files.length > 5) {
      const room = 5 - staffFiles.length;
      if (room <= 0) {
        notify("error", "Máximo de 5 arquivos por mensagem.");
        e.target.value = "";
        return;
      }
      rest = files.slice(0, room);
      notify("error", "Máximo de 5 arquivos por mensagem.");
    }
    setStaffFiles((prev) => [...prev, ...rest].slice(0, 5));
    e.target.value = "";
  };

  const changeStatus = async (st: SupportTicketStatus, msg: string) => {
    if (!selected) return;
    const targetId = selected.id;
    setStatusLoading(st);
    try {
      const res = await setSupportTicketStatus(targetId, st);
      if (res.success) {
        // Só atualiza o painel se o usuário ainda o tiver aberto — se ele
        // fechou durante o await, NÃO reabrir (corrida assíncrona).
        setSelected((cur) => (cur && cur.id === targetId ? (res.ticket || { ...cur, status: st }) : cur));
        notify("success", msg);
      } else {
        notify("error", res.error || "Erro ao alterar status.");
      }
    } catch {
      notify("error", "Erro de conexão.");
    } finally {
      setStatusLoading(null);
    }
  };

  const changeLeadStatus = async (st: OuvidoriaMessage["status"], msg: string) => {
    if (!selectedLead) return;
    const targetId = selectedLead.id;
    setLeadStatusLoading(st);
    try {
      const res = await setSupportLeadStatus(targetId, st);
      if (res.success) {
        // Só atualiza o painel se o usuário ainda o tiver aberto — se ele
        // fechou durante o await, NÃO reabrir (corrida assíncrona).
        setSelectedLead((cur) => (cur && cur.id === targetId ? { ...cur, status: st } : cur));
        notify("success", msg);
      } else {
        notify("error", res.error || "Erro ao alterar status.");
      }
    } catch {
      notify("error", "Erro de conexão.");
    } finally {
      setLeadStatusLoading(null);
    }
  };

  // ---------- LOGIN ----------
  if (!loggedIn || !isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-[#151b22]/80 border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6 animate-fade-in backdrop-blur-xl">
          <div className="flex flex-col items-center text-center space-y-4">
            <img
              src={logoUrl}
              alt="Logo Fênix"
              className="max-h-20 max-w-[220px] object-contain"
              referrerPolicy="no-referrer"
            />
            <div>
              <h1 className="text-xl font-bold text-white font-display">Suporte Fênix</h1>
              <p className="text-xs text-[#8a96a3] mt-1">Área restrita dos atendentes — acesse com sua conta de suporte.</p>
            </div>
          </div>

          {loggedIn && !isStaff && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-center">
          Você está logado com uma conta que não é de suporte. Área exclusiva dos responsáveis
          cadastrados — encerre a sessão atual e entre com a conta fornecida pela administração.
        </p>
      )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="atendente@grupofenix.online"
                className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display">Senha</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                required
              />
            </div>
            {loginError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 px-6 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Entrar no suporte
            </button>
          </form>
          <p className="text-center text-[10px] text-[#8a96a3]">
            Acesso exclusivo de atendentes. Conta cadastrada pela administração.
          </p>
        </div>
      </div>
    );
  }

  // ---------- PAINEL (caixa de e-mail: pastas | lista | leitura) ----------
  const staffInitials = initialsOf(user?.name || user?.email || "?");
  const showLeads = queueFilter !== "chamados";
  const showTickets = queueFilter !== "interessados";

  const folders: { id: string; label: string; icon: React.ReactNode; active: boolean; count: number; onClick: () => void }[] = [
    {
      id: "entrada",
      label: "Entrada",
      icon: <Inbox className="w-4 h-4" />,
      active: statusFilter === "ativos" && queueFilter === "tudo",
      count: unread.total,
      onClick: () => {
        setQueueFilter("tudo");
        setStatusFilter("ativos");
      }
    },
    {
      id: "interessados",
      label: "Interessados · Prioridade",
      icon: <Star className="w-4 h-4" />,
      active: queueFilter === "interessados",
      count: unread.leadsNew,
      onClick: () => {
        setQueueFilter("interessados");
        setStatusFilter("ativos");
      }
    },
    {
      id: "chamados",
      label: "Chamados",
      icon: <LifeBuoy className="w-4 h-4" />,
      active: queueFilter === "chamados",
      count: unread.ticketsNew,
      onClick: () => {
        setQueueFilter("chamados");
        setStatusFilter("ativos");
      }
    },
    {
      id: "arquivados",
      label: "Arquivados",
      icon: <Archive className="w-4 h-4" />,
      active: statusFilter === "arquivados",
      count: 0,
      onClick: () => setStatusFilter("arquivados")
    }
  ];

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

  const lastMessageOf = (t: SupportTicket): string => {
    const msgs = t.mensagens || [];
    if (msgs.length === 0) return "Sem mensagens ainda.";
    const last = msgs[msgs.length - 1];
    const autor = last.tipo === "suporte" ? "Suporte" : last.autorNome || "D.I.";
    return `${autor}: ${last.texto}`;
  };

  const renderTicketRow = (t: SupportTicket) => {
    const seenAt = lastSeen[t.id] || 0;
    const newMsgs = seenAt > 0
      ? (t.mensagens || []).filter((m) => m.tipo !== "suporte" && new Date(m.criadoEm).getTime() > seenAt).length
      : 0;
    const hasAnexos = (t.mensagens || []).some((m) => (m.anexos || []).length > 0);
    // Semântica espelhada dos cards D.I.: mensagem NOVA (não lida) do cliente →
    // contorno verde VÍVIDO 2px + notificação; já lida → contorno branco sutil e
    // card "apagado" (textos esmaecidos, avatar dessaturado). Interessados não mudam.
    const isNew = newMsgs > 0;
    return (
      <button
        key={t.id}
        onClick={() => {
          setSelected(t);
          setSelectedLead(null);
          markSeen(t.id);
        }}
        className={`w-full flex items-start gap-3 px-3.5 py-3 text-left transition-colors rounded-xl hover:bg-white/[0.03] ${
          selected?.id === t.id
            ? "bg-[#d12a62]/10 border border-[#d12a62]/25"
            : isNew
              ? "border-2 border-emerald-400/90 bg-emerald-500/[0.03]"
              : "border border-white/30 bg-transparent"
        }`}
      >
        <span className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5 ${avatarColorOf(t.criadoPor || t.criadoPorNome || "?")} ${isNew ? "" : "opacity-55 grayscale"}`}>
          {initialsOf(t.criadoPorNome)}
          {newMsgs > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#d12a62] ring-2 ring-[#151b22]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`truncate ${isNew ? "font-black text-white" : "font-bold text-white/60"}`}>
              {t.criadoPorNome}
            </span>
            {newMsgs > 0 && (
              <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/15 border border-red-500/40 text-red-400 text-[9px] font-mono font-bold">
                <Bell className="w-2.5 h-2.5" />
                {newMsgs} nova{newMsgs > 1 ? "s" : ""}
              </span>
            )}
            <span className={`ml-auto shrink-0 text-[10px] font-mono whitespace-nowrap ${isNew ? "text-[#8a96a3]" : "text-[#5f6a78]"}`}>{formatTime(t.atualizadoEm)}</span>
          </div>
          <p className={`truncate text-[12px] mt-0.5 ${isNew ? "text-white font-bold" : "text-[#5f6a78]"}`}>
            <span className={`font-mono ${isNew ? "text-[#d12a62]" : "text-[#5f6a78]"}`}>#{String(t.numero).padStart(4, "0")}</span> — {t.assunto}
            {hasAnexos && <span className={`ml-1.5 ${isNew ? "text-[#8a96a3]" : "text-[#5f6a78]"}`}>📎</span>}
          </p>
          <p className={`truncate text-[11px] mt-0.5 ${isNew ? "text-[#8a96a3]" : "text-[#5f6a78]"}`}>{lastMessageOf(t)}</p>
        </div>
        <span className={`shrink-0 px-2 py-1 rounded-lg border text-[9px] font-mono font-bold mt-0.5 ${STATUS_COLOR[t.status] || ""} ${isNew ? "" : "opacity-45"}`}>
          {STATUS_LABEL[t.status] || t.status}
        </span>
      </button>
    );
  };

  const renderLeadRow = (l: OuvidoriaMessage) => {
    const isNew = (lastSeen[l.id] || 0) > 0 && new Date(l.createdAt).getTime() > (lastSeen[l.id] || 0);
    // Pendente = aguardando contato → contorno dourado no card até o atendente
    // marcar "Já contatei" (lida) → card opaco/sem cor.
    const pending = l.status === "pendente";
    const contacted = l.status === "lida";
    return (
      <button
        key={l.id}
        onClick={() => {
          setSelectedLead(l);
          setSelected(null);
          markSeen(l.id);
        }}
        className={`w-full flex items-start gap-3 px-3.5 py-3 text-left transition-colors rounded-[14px] hover:bg-white/[0.03] ${
          selectedLead?.id === l.id
            ? "bg-amber-500/10 border border-amber-500/25"
            : pending
              ? "border-2 border-amber-400/90 bg-transparent"
              : contacted
                ? "border border-white/5 bg-transparent"
                : "border border-transparent"
        }`}
      >
        <span className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5 ${
          pending
            ? "bg-gold-metallic/20 text-gold-metallic border border-gold-metallic/30"
            : contacted
              ? "bg-white/[0.06] text-[#5f6a78] opacity-60 grayscale"
              : "bg-white/10 text-[#e8edf2]"
        }`}>
          {initialsOf(l.nome)}
          {isNew && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-[#151b22]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`truncate ${isNew ? "font-black text-white" : contacted ? "font-bold text-white/50" : pending ? "font-black text-white" : "font-bold text-white/90"}`}>{l.nome}</span>
            <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider ${
              pending
                ? "bg-gold-metallic/20 border border-gold-metallic/50 text-gold-metallic"
                : "bg-white/[0.06] border border-white/10 text-[#5f6a78]"
            }`}>
              Prioridade
            </span>
            {isNew && (
              <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/15 border border-red-500/40 text-red-400 text-[9px] font-mono font-bold">
                <Bell className="w-2.5 h-2.5" />
                Nova
              </span>
            )}
            <span className={`ml-auto shrink-0 text-[10px] font-mono whitespace-nowrap ${contacted ? "text-[#5f6a78]" : "text-[#8a96a3]"}`}>{formatTime(l.createdAt)}</span>
          </div>
          <p className={`truncate text-[12px] mt-0.5 ${isNew ? "text-white font-bold" : contacted ? "text-[#5f6a78]" : "text-[#8a96a3]"}`}>
            {l.tipoParceria || "Quero Fazer Parte"}
          </p>
          <p className={`truncate text-[11px] mt-0.5 ${contacted ? "text-[#5f6a78]" : "text-[#8a96a3]"}`}>
            {l.telefone ? <span className={`font-mono ${pending ? "text-amber-300/90" : ""}`}>{l.telefone}</span> : null}
            {l.telefone ? " · " : ""}{l.mensagem}
          </p>
        </div>
      </button>
    );
  };

  const renderFolders = (className: string) => (
    <nav className={className}>
      {folders.map((f) => (
        <button
          key={f.id}
          onClick={f.onClick}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[12px] font-bold transition-colors border ${
            f.active
              ? "bg-white/10 text-white border-white/20"
              : "bg-white/[0.03] text-[#8a96a3] border-white/10 hover:text-white hover:bg-white/[0.05]"
          }`}
        >
          <span className={f.active ? "text-white" : "text-[#8a96a3]"}>{f.icon}</span>
          <span className="flex-1 text-left truncate">{f.label}</span>
          {f.count > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500 text-white text-[9px] font-bold">
              <Bell className="w-2.5 h-2.5" />
              {f.count}
            </span>
          )}
        </button>
      ))}
    </nav>
  );

  const renderTicketPane = () => {
    if (!selected) return null;
    return (
      <>
        <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-white/5">
          <button
            onClick={() => setSelected(null)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-[#e8edf2] hover:border-[#d12a62]/50 transition-colors shrink-0"
            title="Voltar à caixa de entrada"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${avatarColorOf(selected.criadoPor || selected.criadoPorNome || "?")}`}>
            {initialsOf(selected.criadoPorNome)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white font-display truncate">
                #{String(selected.numero).padStart(4, "0")} — {selected.assunto}
              </h3>
              <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-mono font-bold ${STATUS_COLOR[selected.status] || ""}`}>
                {STATUS_LABEL[selected.status] || selected.status}
              </span>
            </div>
            <p className="text-[10px] text-[#8a96a3] mt-0.5 truncate">
              {selected.criadoPorNome} ({selected.criadoPor}) · Aberto {formatDate(selected.criadoEm)}
              {selected.fechadoEm ? ` · Fechado ${formatDate(selected.fechadoEm)}` : ""}
            </p>
          </div>
          {isTerminalTicket(selected) ? (
            <button
              disabled={statusLoading !== null}
              onClick={() => changeStatus("aberto", "Chamado reaberto.")}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-[10px] font-mono font-bold uppercase tracking-wider text-[#8a96a3] hover:text-white transition-colors disabled:opacity-40"
            >
              {statusLoading === "aberto" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Reabrir
            </button>
          ) : (
            <>
              <button
                onClick={() => markUnread(selected.id)}
                disabled={statusLoading !== null}
                title="Marcar como não lida — o chamado volta a ficar verde com notificação, como se a mensagem tivesse acabado de chegar"
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-[10px] font-mono font-bold uppercase tracking-wider text-[#8a96a3] hover:text-white hover:border-[#d12a62]/50 transition-colors disabled:opacity-40"
              >
                {statusLoading === "aberto" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                Não lida
              </button>
              <button
                disabled={statusLoading !== null}
                onClick={() => changeStatus("fechado", "Chamado encerrado.")}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-black uppercase text-[10px] tracking-wider hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
              >
                {statusLoading === "fechado" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                Encerrar
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4 min-h-0">
          {selected.mensagens.map((m) => {
            const isStaffMsg = m.tipo === "suporte";
            return (
              <div key={m.id} className={`flex items-end gap-2 ${isStaffMsg ? "justify-end" : "justify-start"}`}>
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                    isStaffMsg ? avatarColorOf(user?.code || "?") : avatarColorOf(selected.criadoPor || selected.criadoPorNome || "?")
                  } ${isStaffMsg ? "order-2" : ""}`}
                >
                  {initialsOf(isStaffMsg ? m.autorNome || user?.name || "S" : m.autorNome || selected.criadoPorNome)}
                </span>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 border ${
                    isStaffMsg
                      ? "bg-emerald-500/10 border-emerald-500/25 rounded-tr-sm"
                      : "bg-[#0b0f14] border-white/10 rounded-tl-sm"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isStaffMsg ? "text-[#8a96a3]" : "text-[#d12a62]"}`}>
                      {isStaffMsg ? "Suporte" : "Cliente (D.I.)"}
                    </span>
                    <span className="text-[10px] text-[#8a96a3]">· {m.autorNome}</span>
                    <span className="text-[10px] text-[#8a96a3]">· {formatTime(m.criadoEm)}</span>
                  </div>
                  <p className="text-sm text-[#e8edf2] whitespace-pre-wrap break-words">{m.texto}</p>
                  {renderAnexoChips(m.anexos, selected.id)}
                </div>
              </div>
            );
          })}
        </div>

        {isTerminalTicket(selected) ? (
          <div className="px-4 md:px-6 pb-3">
            <div className="p-4 rounded-2xl bg-[#0b0f14]/80 border border-white/10 text-xs text-[#8a96a3]">
              Chamado encerrado. O histórico permanece registrado. Para reabrir, peça ao solicitante ou use o botão acima.
            </div>
          </div>
        ) : (
          <div className="px-4 md:px-6 py-3 border-t border-white/5">
            {staffFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {staffFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-lg bg-[#0b0f14] border border-white/10 text-[11px]"
                  >
                    {f.type.startsWith("image/") ? (
                      <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-gold-metallic shrink-0" />
                    )}
                    <span className="text-[#e8edf2] max-w-[160px] truncate">{f.name}</span>
                    <span className="text-[10px] text-[#8a96a3]">{formatBytes(f.size)}</span>
                    <button
                      onClick={() => setStaffFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="p-0.5 rounded-md text-[#8a96a3] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remover"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-3">
              <div className="flex-1 flex flex-col gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  placeholder="Escreva sua resposta ao cliente... (obrigatório; Ctrl+Enter para enviar)"
                  rows={3}
                  className="bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#d12a62] transition-colors resize-none"
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={staffFileInputRef}
                    type="file"
                    accept={ACCEPT_TYPES}
                    multiple
                    onChange={handleStaffPickFiles}
                    className="hidden"
                  />
                  <button
                    onClick={() => staffFileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-[#e8edf2] hover:border-[#d12a62]/40 hover:text-white transition-colors"
                    title="Anexar arquivos (até 5)"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    Anexar
                  </button>
                  <button
                    onClick={() => {
                      setReplyText("Poderia enviar o arquivo mencionado? Obrigado!");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-[#e8edf2] hover:border-[#d12a62]/40 hover:text-white transition-colors"
                    title="Preenche o texto pedindo o arquivo ao cliente"
                  >
                    Pedir arquivo
                  </button>
                </div>
              </div>
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
                Responder
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderLeadPane = () => {
    if (!selectedLead) return null;
    return (
      <>
        <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-white/5">
          <button
            onClick={() => setSelectedLead(null)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-[#e8edf2] hover:border-amber-500/50 transition-colors shrink-0"
            title="Voltar à caixa de entrada"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 bg-cyan-500/20 text-cyan-300">
            {initialsOf(selectedLead.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white font-display truncate">{selectedLead.nome}</h3>
              <span className="px-2 py-0.5 rounded-md bg-gold-metallic/20 border border-gold-metallic/50 text-gold-metallic text-[9px] font-mono font-bold uppercase tracking-wider">
                Prioridade
              </span>
            </div>
            <p className="text-[10px] text-[#8a96a3] mt-0.5 truncate">
              {selectedLead.tipoParceria || "Quero Fazer Parte"} · Recebido em {formatDate(selectedLead.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-5 min-h-0">
          <div className="p-4 rounded-2xl bg-[#0b0f14]/80 border border-brand-gold/25">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gold-metallic mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> Telefone / WhatsApp
            </p>
            <p className="text-lg font-black text-emerald-400 font-mono break-all">
              {selectedLead.telefone || "—"}
            </p>
            {selectedLead.telefone && (
              <div className="flex flex-wrap gap-2 mt-2.5">
                <button
                  onClick={() => {
                    copyText(selectedLead.telefone || "").then((ok) =>
                      notify(ok ? "success" : "error", ok ? "Número copiado." : "Não foi possível copiar.")
                    );
                  }}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-[#e8edf2] text-[11px] font-bold hover:border-white/25 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar
                </button>
                <a
                  href={`https://wa.me/${whatsappDigits(selectedLead.telefone || "")}?text=${encodeURIComponent("Olá! Aqui é do Grupo Fênix. Recebemos sua solicitação para fazer parte do Grupo Fênix.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500 text-black text-[11px] font-black hover:brightness-110 transition-all"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-[#0b0f14]/80 border border-white/10">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#8a96a3] mb-1 flex items-center gap-1.5">
                <Mail className="w-3 h-3" /> E-mail
              </p>
              <a href={`mailto:${selectedLead.email}`} className="text-sm text-[#d12a62] font-semibold break-all hover:underline">
                {selectedLead.email}
              </a>
              <button
                onClick={() => {
                  copyText(selectedLead.email).then((ok) =>
                    notify(ok ? "success" : "error", ok ? "E-mail copiado." : "Não foi possível copiar.")
                  );
                }}
                className="mt-2 flex items-center gap-1.5 text-[10px] text-[#8a96a3] hover:text-white transition-colors"
              >
                <Copy className="w-3 h-3" /> Copiar e-mail
              </button>
            </div>
            <div className="p-4 rounded-2xl bg-[#0b0f14]/80 border border-white/10">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#8a96a3] mb-1 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Localização
              </p>
              <p className="text-sm text-white font-semibold">
                {[selectedLead.cidade, selectedLead.estado, selectedLead.pais].filter(Boolean).join(" - ") || "—"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-[#8a96a3]">Mensagem do interessado</p>
            <div className="p-4 rounded-2xl bg-[#0b0f14]/80 border border-white/10 text-sm text-[#e8edf2] whitespace-pre-wrap break-words">
              {selectedLead.mensagem}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`mailto:${selectedLead.email}`}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#e8edf2] hover:border-[#d12a62]/40 hover:text-white transition-colors"
            >
              <Mail className="w-4 h-4" />
              Enviar e-mail
            </a>
          </div>

          <p className="text-[10px] text-[#8a96a3]">
            O contato com o interessado é feito fora do sistema — o WhatsApp é o canal prioritário, seguido pelo e-mail.
          </p>
        </div>

        <div className="px-4 md:px-6 py-3.5 border-t border-white/5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#8a96a3]">Ações:</span>
          {selectedLead.status === "arquivada" || selectedLead.status === "resolvida" ? (
            <button
              disabled={leadStatusLoading !== null}
              onClick={() => changeLeadStatus("lida", "Interessado desarquivado (volta à caixa).")}
              className="px-4 py-2 rounded-xl border border-white/10 text-[11px] font-mono font-bold uppercase tracking-wider text-[#8a96a3] hover:text-white transition-colors disabled:opacity-40"
            >
              {leadStatusLoading === "lida" ? <RefreshCw className="w-3.5 h-3.5 animate-spin inline" /> : "Desarquivar"}
            </button>
          ) : (
            <>
              <button
                disabled={leadStatusLoading !== null || selectedLead.status === "lida"}
                onClick={() => changeLeadStatus("lida", "Interessado marcado como já contatado.")}
                className={`px-4 py-2 rounded-xl border text-[11px] font-mono font-bold uppercase tracking-wider transition-colors disabled:opacity-40 ${
                  selectedLead.status === "lida"
                    ? "bg-white/10 border-white/20 text-white"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                }`}
              >
                {leadStatusLoading === "lida" ? <RefreshCw className="w-3.5 h-3.5 animate-spin inline" /> : "Já contatei"}
              </button>
              <button
                disabled={leadStatusLoading !== null}
                onClick={() => changeLeadStatus("arquivada", "Interessado arquivado.")}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-mono font-bold uppercase tracking-wider text-[#8a96a3] hover:text-white transition-colors disabled:opacity-40"
              >
                {leadStatusLoading === "arquivada" ? <RefreshCw className="w-3.5 h-3.5 animate-spin inline" /> : "Arquivar"}
              </button>
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen p-3 md:p-5 space-y-4 animate-fade-in">
      {/* ---------- TOPBAR ---------- */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-[#151b22]/70 border border-white/10 px-4 md:px-6 py-3 backdrop-blur-xl shadow-xl sticky top-0 z-30">
        <div className="flex items-center justify-start">
          <div className="leading-tight">
            <h1 className="text-base sm:text-xl md:text-2xl font-bold text-white font-display">Central de Suporte</h1>
            <p className="text-xs sm:text-sm md:text-base text-[#8a96a3]">Caixa de entrada · atendimento aos membros D.I.</p>
          </div>
        </div>
        <div className="flex items-center justify-center">
          <img
            src={logoUrl}
            alt="Logo Fênix"
            className="h-10 sm:h-12 md:h-auto max-w-[120px] sm:max-w-[200px] md:max-w-[480px] object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex items-center justify-end gap-2.5">
          <div className="hidden md:flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 pl-1.5 pr-4 py-1.5">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${avatarColorOf(user?.code || user?.email || "?")}`}>
              {staffInitials}
            </span>
            <div className="leading-tight">
              <p className="text-xs font-bold text-white">{user?.name || user?.email}</p>
              <p className="text-[10px] text-[#8a96a3] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8a96a3] inline-block" />
                {user?.role === "admin" ? "Administrador" : "Atendente"} online
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#e8edf2] hover:border-red-500/40 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      {/* ---------- TOAST ---------- */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] w-[92%] max-w-md">
          <div
            className={`px-4 py-3 rounded-2xl text-xs font-bold border shadow-2xl backdrop-blur-xl ${
              toast.tipo === "success"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                : "bg-red-500/15 text-red-400 border-red-500/40"
            }`}
          >
            {toast.texto}
          </div>
        </div>
      )}

      {/* ---------- GRID: PASTAS | LISTA | LEITURA ---------- */}
      <div className="grid gap-3 lg:grid-cols-[230px_minmax(0,420px)_minmax(0,1fr)] lg:items-stretch">
        {/* Pastas — desktop */}
        <aside className="hidden lg:flex flex-col gap-1.5 bg-[#151b22]/60 border border-white/5 rounded-2xl p-2.5 self-start sticky top-24">
          <p className="px-3 pt-2 pb-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-[#8a96a3]/70">
            Pastas
          </p>
          {renderFolders("flex flex-col gap-1.5")}
        </aside>

        {/* Pastas — mobile */}
        <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={f.onClick}
              className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-bold border transition-colors ${
                f.active
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-[#151b22]/60 text-[#8a96a3] border-white/10"
              }`}
            >
              {f.icon}
              {f.label.split(" · ")[0]}
              {f.count > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500 text-white text-[9px] font-bold">
                  <Bell className="w-2.5 h-2.5" />
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ---------- LISTA ---------- */}
        <section
          className={`flex-col rounded-2xl bg-[#151b22]/60 border border-white/5 overflow-hidden lg:max-h-[calc(100vh-120px)] ${
            selected || selectedLead ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="p-3 space-y-2.5 border-b border-white/5">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-sm font-bold text-white font-display">
                {folders.find((f) => f.active)?.label || "Entrada"}
              </h2>
              <span className="text-[10px] text-[#8a96a3] font-mono">
                {filteredLeads.length + filteredTickets.length} item(ns)
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a96a3]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por assunto, nome, código D.I. ou interessado..."
                className="w-full bg-[#0b0f14] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-[60vh] lg:min-h-0 lg:max-h-[calc(100vh-230px)] p-2 space-y-1">
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="animate-pulse h-16 rounded-xl bg-white/[0.04]" />
                ))}
              </div>
            ) : (
              <>
                {showLeads && (
                  filteredLeads.length === 0 ? (
                    statusFilter !== "arquivados" && (
                      <div className="p-6 text-center space-y-2">
                        <Handshake className="w-7 h-7 mx-auto text-[#8a96a3]/40" />
                        <p className="text-[11px] text-[#8a96a3]">Nenhum interessado para exibir neste filtro.</p>
                      </div>
                    )
                  ) : (
                    <div className="rounded-xl border border-brand-gold/20 bg-brand-gold/[0.03] overflow-hidden">
                      <div className="sticky top-0 z-10 bg-[#151b22]/95 backdrop-blur px-3.5 py-2 text-[9px] font-mono font-bold uppercase tracking-wider text-gold-metallic flex items-center gap-1.5 border-b border-brand-gold/15">
                        <Handshake className="w-3 h-3" />
                        Interessados — Quero Fazer Parte
                        {unread.leadsNew > 0 && (
                          <span className="px-1.5 py-0.5 rounded-md bg-red-500 text-white text-[9px] font-bold">
                            {unread.leadsNew}
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-white/[0.04]">
                        {filteredLeads.map(renderLeadRow)}
                      </div>
                    </div>
                  )
                )}

                {showTickets && (
                  filteredTickets.length === 0 ? (
                    statusFilter !== "arquivados" && (
                      <div className="p-6 text-center space-y-2">
                        <Inbox className="w-7 h-7 mx-auto text-[#8a96a3]/40" />
                        <p className="text-[11px] text-[#8a96a3]">Nenhum chamado para exibir neste filtro.</p>
                      </div>
                    )
                  ) : (
                    <div>
                      {showLeads && filteredLeads.length > 0 && (
                        <div className="px-3.5 py-2 text-[9px] font-mono font-bold uppercase tracking-wider text-[#8a96a3] flex items-center gap-1.5">
                          <Inbox className="w-3 h-3" />
                          Chamados de suporte (D.I.)
                          {unread.ticketsNew > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[#d12a62] text-white text-[9px] font-bold">
                              {unread.ticketsNew}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="divide-y divide-white/[0.04]">
                        {filteredTickets.map(renderTicketRow)}
                      </div>
                    </div>
                  )
                )}

                {showLeads && filteredLeads.length === 0 && showTickets && filteredTickets.length === 0 && statusFilter === "arquivados" && (
                  <div className="p-8 text-center space-y-2">
                    <Archive className="w-8 h-8 mx-auto text-[#8a96a3]/40" />
                    <p className="text-[11px] text-[#8a96a3]">Nenhum item arquivado.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ---------- PAINEL DE LEITURA ---------- */}
        <section
          className={`flex-col rounded-2xl bg-[#151b22]/60 border border-white/5 overflow-hidden min-h-[80vh] lg:min-h-0 lg:max-h-[calc(100vh-120px)] ${
            selected || selectedLead ? "flex" : "hidden lg:flex"
          }`}
        >
          {selected ? (
            renderTicketPane()
          ) : selectedLead ? (
            renderLeadPane()
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center">
              <span className="w-16 h-16 rounded-3xl bg-white/[0.04] border border-white/10 flex items-center justify-center">
                <Mail className="w-7 h-7 text-[#8a96a3]/60" />
              </span>
              <p className="text-sm font-bold text-white/80">Nenhum item selecionado</p>
              <p className="text-[11px] text-[#8a96a3] max-w-xs">
                Selecione um chamado ou interessado na lista para ler a conversa aqui.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ---------- LIGHTBOX DE ANEXOS ---------- */}
      {lightbox && (
        <AnexoLightbox
          ticketId={lightbox.ticketId}
          anexo={lightbox.anexo}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* ---------- DEFINA A SUA SENHA (1º acesso / redefinição do admin) ---------- */}
      {pwModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#151b22] border border-white/10 rounded-3xl p-8 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gold-metallic flex items-center justify-center text-black shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white font-display">Bem-vindo(a)! Defina sua senha de acesso</h2>
                <p className="text-xs text-[#8a96a3] mt-0.5">
                  Sua conta foi criada com uma senha temporária. Crie a SUA senha para utilizar a área de suporte.
                </p>
              </div>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display">Nova senha</label>
                <input
                  type="password"
                  value={pwNovaSenha}
                  onChange={(e) => setPwNovaSenha(e.target.value)}
                  placeholder="Mínimo 8 caracteres, com letras e números"
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#e8edf2] uppercase tracking-wider font-display">Confirmar nova senha</label>
                <input
                  type="password"
                  value={pwConfirma}
                  onChange={(e) => setPwConfirma(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full bg-[#0b0f14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8a96a3]/50 focus:outline-none focus:border-[#d12a62] transition-colors"
                  required
                />
              </div>
              {pwError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{pwError}</p>
              )}
              <button
                type="submit"
                disabled={pwLoading}
                className="w-full py-3.5 px-6 rounded-xl bg-gold-metallic text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-[#d12a62]/20 hover:brightness-110 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Salvar minha senha
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
