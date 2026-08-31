import React, { useEffect, useState } from "react";
import { useStore } from "../store";
import { SupportAnexo } from "../types";
import { Download, X, Loader2, AlertCircle } from "lucide-react";

interface AnexoLightboxProps {
  ticketId: string;
  anexo: SupportAnexo;
  onClose: () => void;
}

// Visualização interna de anexos (imagem e PDF) — o arquivo NUNCA abre direto:
// o chat só oferece "Baixar" (attachment) e este lightbox busca o binário via
// API autenticada e exibe com blob URL dentro do próprio site.
export default function AnexoLightbox({ ticketId, anexo, onClose }: AnexoLightboxProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const isPdf = String(anexo.mime || "").toLowerCase().includes("pdf");

  useEffect(() => {
    let cancelled = false;
    setBlobUrl(null);
    setErro(null);
    const token = useStore.getState().token;
    const headers: HeadersInit = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}/anexos/${encodeURIComponent(anexo.id)}`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Acesso negado." : r.status === 404 ? "Arquivo não encontrado." : "Não foi possível carregar o arquivo.");
        return r.blob();
      })
      .then((blob) => {
        if (!cancelled) setBlobUrl(URL.createObjectURL(blob));
      })
      .catch((e) => {
        if (!cancelled) setErro(e.message || "Não foi possível carregar o arquivo.");
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, anexo.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const url = `/api/support/tickets/${encodeURIComponent(ticketId)}/anexos/${encodeURIComponent(anexo.id)}?download=1`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-[#151b22] border border-white/10 shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 border-b border-white/10 bg-[#151b22]/95">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{anexo.nome}</p>
            <p className="text-[10px] text-[#8a96a3] mt-0.5">{anexo.tamanhoKb} KB · {anexo.mime}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={url}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gold-metallic text-black text-[11px] font-black uppercase tracking-wider hover:brightness-110 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-[#8a96a3] hover:text-white transition-colors"
              title="Fechar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-black/40 flex items-center justify-center overflow-auto">
          {erro ? (
            <div className="text-center space-y-3 p-10">
              <AlertCircle className="w-10 h-10 mx-auto text-red-400" />
              <p className="text-xs text-[#8a96a3]">{erro}</p>
            </div>
          ) : !blobUrl ? (
            <div className="flex items-center gap-3 text-sm text-[#8a96a3] p-10">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando arquivo...
            </div>
          ) : isPdf ? (
            <iframe
              src={blobUrl}
              title={anexo.nome}
              className="w-full h-full min-h-[60vh] border-0"
            />
          ) : (
            <img
              src={blobUrl}
              alt={anexo.nome}
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
