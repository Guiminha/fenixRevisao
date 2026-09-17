import React, { useState, useEffect } from "react";
import { useStore } from "../store";
import LoginModal from "./LoginModal";
import Reveal from "./Reveal";
import { 
  Download, 
  Search, 
  FileText, 
  Film, 
  Image as ImageIcon, 
  X, 
  Check,
  Play,
  Youtube,
  BookOpen,
  FolderOpen,
  Loader2,
  AlertCircle
} from "lucide-react";
import { Material } from "../types";

const SECTIONS = ["Folders", "Manuais"] as const;
type Section = typeof SECTIONS[number];

function getSectionIcon(section: Section) {
  switch (section) {
    case "Folders":
      return FolderOpen;
    case "Manuais":
      return BookOpen;
    default:
      return FileText;
  }
}

function isYouTubeUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

function getYouTubeId(url: string): string | null {
  const regExp = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

function getYouTubeThumbnailUrl(url: string): string | null {
  const id = getYouTubeId(url);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
}

export default function ConteudosView() {
  const { 
    loggedIn, 
    restrictedData, 
    fetchRestrictedData,
    recordDownload
  } = useStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [videoModal, setVideoModal] = useState<Material | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<{
    id: string;
    titulo: string;
    status: "preparando" | "sucesso" | "erro";
    mensagem?: string;
  } | null>(null);

  // Carregar dados restrito
  useEffect(() => {
    if (loggedIn) {
      fetchRestrictedData();
    }
  }, [loggedIn]);

  // Deep-link scroll
  useEffect(() => {
    if (restrictedData?.materiais) {
      const searchParams = new URLSearchParams(window.location.search);
      const matId = searchParams.get("material") || searchParams.get("materialId");
      if (matId) {
        setTimeout(() => {
          const el = document.getElementById(`material-card-${matId}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring-2", "ring-[#d12a62]", "scale-[1.03]", "transition-all", "duration-500");
            setTimeout(() => {
              el.classList.remove("ring-2", "ring-[#d12a62]", "scale-[1.03]");
            }, 2500);
          }
        }, 300);
      }
    }
  }, [restrictedData]);

  // Guard: não logado
  if (!loggedIn) {
    return (
      <div id="conteudos-auth-guard" className="min-h-[70vh] flex flex-col items-center justify-center p-4">
        <LoginModal />
      </div>
    );
  }

  // Guard: carregando
  if (!restrictedData) {
    return (
      <div className="space-y-8 py-8 animate-pulse">
        <div className="h-6 w-32 bg-[#151b22] rounded"></div>
        <div className="h-16 w-full bg-[#151b22] rounded-2xl"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="aspect-square bg-[#151b22] rounded-xl"></div>
          <div className="aspect-square bg-[#151b22] rounded-xl"></div>
          <div className="aspect-square bg-[#151b22] rounded-xl"></div>
          <div className="aspect-square bg-[#151b22] rounded-xl"></div>
        </div>
      </div>
    );
  }

  const materiais = restrictedData?.materiais || [];

  const handleDownload = async (material: Material) => {
    const raw = material.fileUrl || "";
    if (!/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(raw)) return;

    setDownloadingId(material.id);
    setDownloadFeedback({
      id: material.id,
      titulo: material.titulo,
      status: "preparando",
      mensagem: "Preparando seu download com segurança..."
    });

    try {
      recordDownload(material.id);

      // Tratar extensão e nome de download
      let downloadUrl = raw;
      const cleanUrl = raw.split("?")[0];
      const rawExt = cleanUrl.includes(".") ? cleanUrl.split(".").pop() : "";
      const defaultExt = material.tipo === "pdf" ? "pdf" : (material.tipo === "image" ? "png" : "dat");
      const ext = (rawExt && rawExt.length <= 5) ? rawExt : defaultExt;
      const filename = `${material.titulo.replace(/[/\\?%*:|"<>]/g, "-")}.${ext}`;

      if (downloadUrl.startsWith("/") || downloadUrl.startsWith(window.location.origin)) {
        const sep = downloadUrl.includes("?") ? "&" : "?";
        downloadUrl = `${downloadUrl}${sep}download=1&filename=${encodeURIComponent(filename)}`;
      }

      const res = await fetch(downloadUrl);
      if (!res.ok) {
        throw new Error(`Servidor respondeu com status ${res.status}`);
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 15000);

      setDownloadFeedback({
        id: material.id,
        titulo: material.titulo,
        status: "sucesso",
        mensagem: "Download concluído com sucesso!"
      });

      setTimeout(() => {
        setDownloadFeedback((curr) => (curr?.id === material.id && curr.status === "sucesso" ? null : curr));
      }, 4000);
    } catch (err: any) {
      console.warn("[Download] Falha no fetch direto do blob, acionando fallback nativo:", err);
      // Fallback seguro via link nativo do navegador
      try {
        const link = document.createElement("a");
        link.href = raw;
        link.download = material.titulo;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setDownloadFeedback({
          id: material.id,
          titulo: material.titulo,
          status: "sucesso",
          mensagem: "Download acionado pelo navegador!"
        });

        setTimeout(() => {
          setDownloadFeedback((curr) => (curr?.id === material.id && curr.status === "sucesso" ? null : curr));
        }, 4000);
      } catch (fallbackErr) {
        setDownloadFeedback({
          id: material.id,
          titulo: material.titulo,
          status: "erro",
          mensagem: "Não foi possível baixar o arquivo. Tente novamente."
        });

        setTimeout(() => {
          setDownloadFeedback((curr) => (curr?.id === material.id && curr.status === "erro" ? null : curr));
        }, 4500);
      }
    } finally {
      setDownloadingId(null);
    }
  };

  // Filtrar por busca e restringir às 2 seções
  const allFiltered = materiais.filter((m) => {
    const titulo = m?.titulo || "";
    const categoria = m?.categoria || "";
    const matchSearch = !searchQuery || 
      titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      categoria.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSection = SECTIONS.includes(categoria as Section);
    return matchSearch && matchSection;
  });

  return (
    <div id="materiais-apoio-view" className="space-y-8 pb-12 animate-fade-in select-none">

      {/* Header */}
      <Reveal direction="up" className="space-y-1">
        <span className="bg-gold-metallic text-[#07090e] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow w-max block">
          Área Restrita
        </span>
        <h2 className="text-2xl md:text-4xl font-bold font-display text-white tracking-tight">
          Materiais de Apoio
        </h2>
        <p className="text-xs md:text-sm text-[#94a3b8]">
          Acesse, faça download e compartilhe folders, manuais e vídeos explicativos para alavancar suas vendas.
        </p>
      </Reveal>

      {/* CAMPO DE BUSCA GRANDE */}
      <Reveal direction="up" delay={0.08}>
        <div className="relative group">
          {/* Glow de fundo */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#d12a62]/10 via-transparent to-[#d12a62]/5 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <div className="relative flex items-center gap-4 bg-[#151b22]/90 backdrop-blur-sm border border-white/10 focus-within:border-[#d12a62]/50 rounded-2xl px-5 py-4 shadow-xl transition-all duration-300 focus-within:shadow-[#d12a62]/10 focus-within:shadow-2xl">
            <Search className="w-6 h-6 text-[#d12a62] flex-shrink-0 transition-transform duration-300 group-focus-within:scale-110" />
            <input
              id="materiais-apoio-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar material pelo nome do produto..."
              className="flex-1 bg-transparent text-base text-[#e8edf2] placeholder-[#4a5568] outline-none font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-[#8a96a3] hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer flex-shrink-0"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Indicador de resultados */}
          {searchQuery && (
            <div className="mt-2 px-1">
              <span className="text-[11px] text-[#8a96a3]">
                {allFiltered.length === 0
                  ? "Nenhum material encontrado"
                  : `${allFiltered.length} ${allFiltered.length === 1 ? "material encontrado" : "materiais encontrados"}`}
              </span>
            </div>
          )}
        </div>
      </Reveal>

      {/* SEÇÕES FIXAS: Folders e Manuais */}
      <div className="space-y-12">
        {SECTIONS.map((sectionName) => {
          const SectionIcon = getSectionIcon(sectionName);
          const sectionMateriais = allFiltered.filter((m) => m.categoria === sectionName);

          return (
            <div key={sectionName}>
            <Reveal direction="up" delay={0.1}>
              <div className="space-y-5">
                {/* Cabeçalho da Seção */}
                <div className="flex items-center gap-3 border-b border-white/[0.05] pb-3">
                  <div className="w-9 h-9 rounded-xl bg-[#d12a62]/10 border border-[#d12a62]/20 flex items-center justify-center flex-shrink-0">
                    <SectionIcon className="w-4.5 h-4.5 text-[#d12a62]" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white font-display tracking-wide">
                      {sectionName}
                    </h3>
                    <span className="text-[10px] text-[#94a3b8] font-mono">
                      {sectionMateriais.length} {sectionMateriais.length === 1 ? "material" : "materiais"}
                    </span>
                  </div>
                </div>

                {/* Grid de materiais */}
                {sectionMateriais.length === 0 ? (
                  <div className="text-center py-10 rounded-2xl border border-dashed border-[#2a323d]">
                    {searchQuery ? (
                      <span className="text-[#8a96a3] text-sm">
                        Nenhum material em <strong className="text-white">{sectionName}</strong> corresponde à busca.
                      </span>
                    ) : (
                      <span className="text-[#8a96a3] text-sm">
                        Nenhum material em <strong className="text-white">{sectionName}</strong> cadastrado ainda.
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
                    {sectionMateriais.map((mat) => {
                      const isVideo = mat.tipo === "video";
                      const isYT = isVideo && isYouTubeUrl(mat.fileUrl || "");
                      const ytThumb = isYT ? getYouTubeThumbnailUrl(mat.fileUrl || "") : null;
                      const thumbSrc = mat.thumbnail || ytThumb || "";
                      const isDownloadingThis = downloadingId === mat.id;

                      return (
                        <div
                          key={mat.id}
                          id={`material-card-${mat.id}`}
                          className="card-modern rounded-xl relative overflow-hidden group flex flex-col justify-between border border-white/5 hover:border-[#d12a62]/30 transition-all shadow-md bg-[#11161d]"
                        >
                          {/* Thumbnail */}
                          <div 
                            className={`relative aspect-square overflow-hidden flex-1 ${isVideo ? "cursor-pointer" : ""}`}
                            onClick={() => {
                              if (isVideo) setVideoModal(mat);
                            }}
                          >
                            <img
                              src={thumbSrc}
                              alt={mat.titulo}
                              referrerPolicy="no-referrer"
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent z-10" />

                            {/* Ícone tipo (canto superior esquerdo) */}
                            <div className="absolute top-2.5 left-2.5 z-20 w-7 h-7 rounded-full bg-[#0b0f14]/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-[#ff719e]">
                              {isYT ? (
                                <Youtube className="w-3.5 h-3.5 text-red-500" />
                              ) : isVideo ? (
                                <Film className="w-3.5 h-3.5 text-[#ff719e]" />
                              ) : mat.tipo === "pdf" ? (
                                <FileText className="w-3.5 h-3.5" />
                              ) : mat.tipo === "image" ? (
                                <ImageIcon className="w-3.5 h-3.5" />
                              ) : (
                                <FileText className="w-3.5 h-3.5" />
                              )}
                            </div>

                            {/* Play overlay para vídeos */}
                            {isVideo && (
                              <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-red-600 to-[#d12a62] flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform">
                                  <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                                </div>
                              </div>
                            )}

                            {/* Título e downloads */}
                            <div className="p-2.5 relative z-20 h-full flex flex-col justify-end space-y-1">
                              <h3 className="text-[11px] font-bold text-white leading-tight line-clamp-2 drop-shadow group-hover:text-[#d12a62] transition-colors">
                                {mat.titulo}
                              </h3>
                              <div className="flex items-center justify-between text-[9px] text-[#8a96a3] font-mono border-t border-white/5 pt-1 mt-1">
                                <span>{isVideo ? (isYT ? "YouTube" : "Vídeo") : "Downloads:"}</span>
                                {isVideo ? null : <span className="text-[#ff719e] font-semibold">{mat.downloads}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Botão de ação único (largura total) */}
                          <div className="p-2 bg-[#0b0f14]/90 border-t border-white/5 z-20">
                            {isVideo ? (
                              <button
                                type="button"
                                id={`watch-btn-material-${mat.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVideoModal(mat);
                                }}
                                className="w-full py-2 px-3 bg-gradient-to-r from-red-600 to-[#d12a62] hover:from-red-500 hover:to-[#b01e4e] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-[0.98]"
                                title="Assistir vídeo"
                              >
                                <Play className="w-3.5 h-3.5 fill-white" />
                                <span>Assistir</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                id={`download-btn-material-${mat.id}`}
                                disabled={isDownloadingThis}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(mat);
                                }}
                                className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] ${
                                  isDownloadingThis
                                    ? "bg-[#d12a62]/60 text-white/80 cursor-wait"
                                    : "bg-[#d12a62] hover:bg-[#b01e4e] text-white cursor-pointer"
                                }`}
                                title="Baixar material"
                              >
                                {isDownloadingThis ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                    <span>Baixando...</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Baixar</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Reveal>
            </div>
          );
        })}
      </div>

      {/* Modal Player de Vídeo */}
      {videoModal && (() => {
        const isYT = isYouTubeUrl(videoModal.fileUrl || "");
        const ytId = isYT ? getYouTubeId(videoModal.fileUrl || "") : null;

        return (
          <div
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto"
            onClick={() => setVideoModal(null)}
          >
            <div
              className="w-full max-w-3xl bg-[#0b0f14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-scale-up my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header do modal */}
              <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#11161d]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg ${isYT ? "bg-red-600/20 border-red-500/30 text-red-500" : "bg-[#d12a62]/20 border-[#d12a62]/30 text-[#ff719e]"} border flex items-center justify-center flex-shrink-0`}>
                    {isYT ? <Youtube className="w-4 h-4 text-red-500" /> : <Film className="w-4 h-4 text-[#ff719e]" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white leading-tight truncate">{videoModal.titulo}</h3>
                    <span className="text-[10px] text-[#8a96a3]">
                      {videoModal.categoria} • {isYT ? "Vídeo do YouTube" : "Vídeo Explicativo"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVideoModal(null)}
                  className="text-[#8a96a3] hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0"
                  title="Fechar vídeo"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Player */}
              <div className="aspect-video w-full bg-black flex items-center justify-center">
                {isYT ? (
                  ytId ? (
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`}
                      title={videoModal.titulo}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#8a96a3]">
                      Link de vídeo do YouTube inválido.
                    </div>
                  )
                ) : (
                  <video
                    src={videoModal.fileUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pop-up Flutuante de Feedback de Download */}
      {downloadFeedback && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 max-w-sm w-[calc(100vw-3rem)] transition-all duration-300 ease-out transform translate-y-0"
        >
          <div className="bg-[#151b22]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-start gap-3 relative overflow-hidden">
            {/* Glow decorativo de fundo */}
            <div
              className={`absolute inset-0 opacity-15 pointer-events-none ${
                downloadFeedback.status === "sucesso"
                  ? "bg-emerald-500"
                  : downloadFeedback.status === "erro"
                  ? "bg-red-500"
                  : "bg-gradient-to-r from-[#d12a62] to-amber-500"
              }`}
            />

            {/* Ícone de status */}
            <div className="relative flex-shrink-0 mt-0.5">
              {downloadFeedback.status === "preparando" && (
                <div className="w-9 h-9 rounded-xl bg-[#d12a62]/20 border border-[#d12a62]/40 flex items-center justify-center text-[#ff719e]">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}
              {downloadFeedback.status === "sucesso" && (
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Check className="w-5 h-5" />
                </div>
              )}
              {downloadFeedback.status === "erro" && (
                <div className="w-9 h-9 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                  <AlertCircle className="w-5 h-5" />
                </div>
              )}
            </div>

            {/* Mensagem e detalhes */}
            <div className="relative flex-1 min-w-0 pr-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white font-display">
                  {downloadFeedback.status === "preparando"
                    ? "Iniciando download"
                    : downloadFeedback.status === "sucesso"
                    ? "Download pronto!"
                    : "Falha no download"}
                </span>
                {downloadFeedback.status === "preparando" && (
                  <span className="text-[10px] text-[#ff719e] font-mono font-bold animate-pulse">
                    Aguarde...
                  </span>
                )}
              </div>

              <p className="text-[11px] text-gray-200 font-medium truncate mt-0.5" title={downloadFeedback.titulo}>
                {downloadFeedback.titulo}
              </p>

              <p className="text-[10px] text-[#8a96a3] mt-0.5 leading-snug">
                {downloadFeedback.mensagem}
              </p>

              {/* Barra de progresso visual enquanto prepara */}
              {downloadFeedback.status === "preparando" && (
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-2.5">
                  <div className="h-full bg-gradient-to-r from-[#d12a62] to-[#f5d442] animate-pulse w-3/4 rounded-full" />
                </div>
              )}
            </div>

            {/* Botão fechar toast */}
            <button
              type="button"
              onClick={() => setDownloadFeedback(null)}
              className="relative text-[#8a96a3] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0 -mr-1 -mt-1"
              title="Fechar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
