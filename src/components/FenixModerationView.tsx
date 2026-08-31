import React, { useEffect, useState } from "react";
import { useStore } from "../store";
import { 
  ShieldCheck, 
  Check, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  UserCheck
} from "lucide-react";
import FenixMediaCarousel from "./FenixMediaCarousel";

export default function FenixModerationView() {
  const { 
    pendingFenixPosts, 
    fetchPendingFenixPosts, 
    approveFenixPost, 
    rejectFenixPost,
    moderationToken
  } = useStore();

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Token de moderação vem do store (App.tsx captura da URL e limpa a query
  // string imediatamente — nunca persiste no histórico/logs de proxy).
  const modToken = moderationToken || undefined;

  useEffect(() => {
    loadPending();

    // Auto-refresh queue every 4 seconds to sync across multiple moderators
    const interval = setInterval(() => {
      fetchPendingFenixPosts(modToken);
    }, 4000);

    // Refresh immediately on window focus
    const handleFocus = () => {
      fetchPendingFenixPosts(modToken);
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [modToken]);

  const loadPending = async () => {
    setLoading(true);
    await fetchPendingFenixPosts(modToken);
    setLoading(false);
  };

  const handleApprove = async (id: string) => {
    setLoading(true);
    const success = await approveFenixPost(id, modToken);
    setLoading(false);
    if (success) {
      setToast({ type: "success", text: "Publicação aprovada com sucesso! Liberada no feed público." });
      setTimeout(() => setToast(null), 3000);
    } else {
      setToast({ type: "error", text: "Erro ao aprovar a publicação. Verifique suas permissões." });
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm("Atenção: Ao recusar, esta publicação e o arquivo do servidor serão DELETADOS PERMANENTEMENTE (Hard Delete). Confirmar exclusão?")) {
      return;
    }

    setLoading(true);
    const success = await rejectFenixPost(id, modToken);
    setLoading(false);
    if (success) {
      setToast({ type: "success", text: "Publicação recusada e arquivo excluído permanentemente do servidor." });
      setTimeout(() => setToast(null), 3000);
    } else {
      setToast({ type: "error", text: "Erro ao recusar publicação." });
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="bg-[#0b0f17] border border-amber-500/20 rounded-2xl p-6 sm:p-8 mb-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-3">
              <ShieldCheck className="w-3.5 h-3.5" /> Área de Moderação Pessoal
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-display">
              Fila de Análise de Publicações
            </h1>
            <p className="text-sm text-[#94a3b8] mt-1">
              Analise, aprove para exibição no feed ou recuse (deleção física definitiva do servidor).
            </p>
            {modToken && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
                <UserCheck className="w-3.5 h-3.5" /> Acesso autenticado via Link Pessoal de Moderação
              </div>
            )}
          </div>

          <button
            onClick={loadPending}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold transition-all border border-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar Fila
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`p-4 rounded-xl mb-6 text-xs font-semibold flex items-center gap-3 animate-fade-in ${
          toast.type === "success"
            ? "bg-emerald-950/60 border border-emerald-500/30 text-emerald-300"
            : "bg-red-950/60 border border-red-500/30 text-red-300"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Pending Posts Feed */}
      {pendingFenixPosts.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white/5 rounded-2xl border border-white/[0.06]">
          <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-60" />
          <h3 className="text-lg font-bold text-white mb-1">Nenhuma publicação pendente</h3>
          <p className="text-sm text-[#94a3b8]">
            Todas as submissões foram analisadas. A fila de moderação está em dia!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {pendingFenixPosts.map((post) => {
            const mediaList = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls : [post.mediaUrl];

            return (
              <div 
                key={post.id} 
                className="bg-[#0b0f17] rounded-2xl border border-amber-500/30 overflow-hidden shadow-2xl flex flex-col"
              >
                {/* Card Header */}
                <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold text-xs">
                      {post.usuarioNome ? post.usuarioNome.charAt(0).toUpperCase() : "M"}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{post.usuarioNome}</h4>
                      <span className="text-[10px] text-amber-400/80 font-mono">Pendente de Aprovação</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#64748b] font-mono">
                    {post.dataPublicacao || new Date(post.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>

                {post.titulo && (
                  <div className="px-4 py-2 bg-white/5 border-b border-white/5">
                    <h5 className="text-xs font-bold text-amber-300">{post.titulo}</h5>
                  </div>
                )}

                {/* Media Preview Carousel & Lightbox */}
                <div className="p-2 bg-black/40">
                  <FenixMediaCarousel
                    mediaUrls={mediaList}
                    tipoMedia={post.tipoMedia}
                    caption={post.legenda}
                  />
                </div>

                {/* Caption */}
                <div className="p-4 border-b border-white/5 flex-grow">
                  <p className="text-xs text-[#e2e8f0] leading-relaxed whitespace-pre-line">
                    {post.legenda}
                  </p>
                </div>

                {/* Moderation Actions */}
                <div className="p-4 bg-white/[0.02] grid grid-cols-2 gap-3 border-t border-white/5">
                  <button
                    id={`recusar-btn-${post.id}`}
                    onClick={() => handleReject(post.id)}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 text-xs font-bold transition-all disabled:opacity-50"
                    title="Excluir permanentemente arquivo e registro (Hard Delete)"
                  >
                    <Trash2 className="w-4 h-4" /> Recusar (Hard Delete)
                  </button>

                  <button
                    id={`aprovar-btn-${post.id}`}
                    onClick={() => handleApprove(post.id)}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-50"
                    title="Aprovar e publicar no feed Fênix Social"
                  >
                    <Check className="w-4 h-4" /> Aprovar e Publicar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
