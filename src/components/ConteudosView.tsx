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
  Lock, 
  X, 
  Share2,
  Copy,
  Check
} from "lucide-react";
import { Material } from "../types";

export default function ConteudosView() {
  const { 
    loggedIn, 
    restrictedData, 
    fetchRestrictedData,
    recordDownload
  } = useStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [shareModalMaterial, setShareModalMaterial] = useState<Material | null>(null);
  
  // Share States
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Load restricted data and deep-link scroll to material
  useEffect(() => {
    if (loggedIn) {
      fetchRestrictedData();
    }
  }, [loggedIn]);

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

  const getSiteMaterialUrl = (matId: string) => {
    return `${window.location.origin}/?view=conteudos&material=${encodeURIComponent(matId)}`;
  };

  if (!loggedIn) {
    return (
      <div id="conteudos-auth-guard" className="min-h-[70vh] flex flex-col items-center justify-center p-4">
        <LoginModal />
      </div>
    );
  }

  if (!restrictedData) {
    return (
      <div className="space-y-8 py-8 animate-pulse">
        <div className="h-6 w-32 bg-[#151b22] rounded"></div>
        <div className="h-10 w-64 bg-[#151b22] rounded"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="aspect-square bg-[#151b22] rounded-xl"></div>
          <div className="aspect-square bg-[#151b22] rounded-xl"></div>
          <div className="aspect-square bg-[#151b22] rounded-xl"></div>
          <div className="aspect-square bg-[#151b22] rounded-xl"></div>
        </div>
      </div>
    );
  }

  const { materiais } = restrictedData;

  const getMediaIcon = (type: string) => {
    switch (type) {
      case "video":
        return Film;
      case "image":
        return ImageIcon;
      case "pdf":
      default:
        return FileText;
    }
  };

  const handleDownload = async (material: Material) => {
    // Nunca navegar para javascript:/data: URLs vindas de dados (fileUrl é
    // controlado por admin, mas a checagem evita esquema perigoso por engano)
    const raw = material.fileUrl || "";
    if (!/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(raw)) return;
    // Record download locally and in backend
    recordDownload(material.id);

    try {
      // Busca o arquivo autenticado (cookie httpOnly OU Bearer do localStorage —
      // o servidor exige sessão para mídias de materiais) e baixa via blob.
      const headers: Record<string, string> = {};
      const token = useStore.getState().token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(raw, { credentials: "same-origin", headers });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = material.titulo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      // Sessão pode ter expirado entre a consulta e o clique — falha silenciosa
    }
  };

  // 1. FILTER MATERIALS FIRST (by search text and by type, if selected)
  const filteredMateriais = materiais.filter((m) => {
    const matchSearch = m.titulo.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        m.categoria.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = selectedType === "all" || m.tipo === selectedType;
    const matchCatDropdown = selectedCategory === "all" || m.categoria === selectedCategory;

    return matchSearch && matchType && matchCatDropdown;
  });

  // 2. RETRIEVE ACTIVE CATEGORIES FROM FILTERED LIST
  const activeCategories = Array.from(new Set(filteredMateriais.map((m) => m.categoria)));

  // 3. SORT CATEGORIES BY RECENCY ("updated/created most recently first" logic)
  // Each material has a "createdAt" string. We parse it and sort categories.
  const categoryRecency = activeCategories.map((cat) => {
    const catMaterials = filteredMateriais.filter((m) => m.categoria === cat);
    const mostRecentDate = catMaterials.reduce((max, cur) => {
      const curDate = cur.createdAt ? new Date(cur.createdAt).getTime() : 0;
      return curDate > max ? curDate : max;
    }, 0);
    return { categoria: cat, lastUpdate: mostRecentDate };
  });

  // Sort descending: highest timestamp first
  categoryRecency.sort((a, b) => b.lastUpdate - a.lastUpdate);
  const sortedCategories = categoryRecency.map((cr) => cr.categoria);

  // Overall categories list for filters select box
  const allAvailableCategoriesList = Array.from(new Set(materiais.map((m) => m.categoria)));

  return (
    <div id="conteudos-library-view" className="space-y-6 pb-12 animate-fade-in select-none">
      
      {/* Header */}
      <Reveal direction="up" className="space-y-1">
        <span className="bg-gold-metallic text-[#07090e] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow w-max block">
          Materiais Publicitários
        </span>
        <h2 className="text-2xl md:text-4xl font-bold font-display text-white tracking-tight">
          Hub de Criativos & Conteúdos
        </h2>
        <p className="text-xs md:text-sm text-[#94a3b8]">
          Pesquise, visualize e faça o download de copys, fotos, vídeos promocionais e modelos para alavancar suas campanhas.
        </p>
      </Reveal>



      {/* Grid formatted as Session categories (most recent updated first) */}
      {sortedCategories.length > 0 ? (
        <div className="space-y-10">
          {sortedCategories.map((catName) => {
            const catMaterials = filteredMateriais.filter((m) => m.categoria === catName);
            if (catMaterials.length === 0) return null;
            return (
              <div key={catName} className="space-y-4 animate-fade-in">
                {/* Category Header */}
                <div className="flex items-center gap-3 border-b border-white/[0.03] pb-2">
                  <h3 className="text-sm font-extrabold text-white font-display tracking-wide uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#d12a62] shadow-sm shadow-[#d12a62]/40"></span>
                    {catName}
                  </h3>
                  <span className="text-[10px] text-[#94a3b8] font-mono bg-white/5 px-2 py-0.5 rounded border border-white/[0.02]">
                    {catMaterials.length} {catMaterials.length === 1 ? "recurso" : "recursos"}
                  </span>
                </div>
                
                {/* Responsive Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5 cv-auto">
                  {catMaterials.map((mat) => {
                    const Icon = getMediaIcon(mat.tipo);
                    return (
                      <div
                        key={mat.id}
                        id={`material-card-${mat.id}`}
                        className="card-modern rounded-xl relative overflow-hidden group flex flex-col justify-between border border-white/5 hover:border-[#d12a62]/30 transition-all shadow-md bg-[#11161d]"
                      >
                        {/* Thumbnail Container */}
                        <div className="relative aspect-square overflow-hidden flex-1">
                          {/* Background image */}
                          <img
                            src={mat.thumbnail}
                            alt={mat.titulo}
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-108"
                            loading="lazy"
                          />

                          {/* Overlays */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent z-10"></div>

                          {/* Type Icon (Top Left Corner) */}
                          <div className="absolute top-2.5 left-2.5 z-20 w-7 h-7 rounded-full bg-[#0b0f14]/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-[#ff719e]">
                            <Icon className="w-3.5 h-3.5" />
                          </div>

                          {/* Title and Download Counter inside gradient */}
                          <div className="p-2.5 relative z-20 h-full flex flex-col justify-end space-y-1">
                            <h3 className="text-[11px] font-bold text-white leading-tight line-clamp-2 drop-shadow group-hover:text-[#d12a62] transition-colors">
                              {mat.titulo}
                            </h3>
                            <div className="flex items-center justify-between text-[9px] text-[#8a96a3] font-mono border-t border-white/5 pt-1 mt-1">
                              <span>Downloads:</span>
                              <span className="text-[#ff719e] font-semibold">{mat.downloads}</span>
                            </div>
                          </div>
                        </div>

                        {/* Bottom Action Buttons: Compartilhar & Download */}
                        <div className="p-2 bg-[#0b0f14]/90 border-t border-white/5 grid grid-cols-2 gap-1.5 z-20">
                          <button
                            type="button"
                            id={`share-btn-material-${mat.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShareModalMaterial(mat);
                              setShareCopied(false);
                            }}
                            className="py-1.5 px-2 bg-white/5 hover:bg-[#d12a62]/20 border border-white/10 hover:border-[#d12a62]/40 text-gray-200 hover:text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer"
                            title="Compartilhar link do material"
                          >
                            <Share2 className="w-3 h-3 text-[#ff719e]" />
                            <span className="truncate">Compartilhar</span>
                          </button>

                          <button
                            type="button"
                            id={`download-btn-material-${mat.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(mat);
                            }}
                            className="py-1.5 px-2 bg-[#d12a62] hover:bg-[#b01e4e] text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                            title="Fazer download do material"
                          >
                            <Download className="w-3 h-3" />
                            <span className="truncate">Download</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 rounded-2xl border border-dashed border-[#2a323d]">
          <span className="text-[#8a96a3] text-sm block">Nenhum criativo publicitário encontrado para esta busca.</span>
        </div>
      )}

      {/* Dedicated Share Modal */}
      {shareModalMaterial && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div 
            id="share-material-modal"
            className="w-full max-w-md bg-[#151b22] border border-[#2a323d] rounded-2xl p-6 relative overflow-hidden flex flex-col gap-4 shadow-2xl animate-scale-up"
          >
            <button
              type="button"
              onClick={() => {
                setShareModalMaterial(null);
                setShareCopied(false);
              }}
              className="absolute top-4 right-4 text-[#8a96a3] hover:text-[#e8edf2] p-1.5 rounded-lg hover:bg-white/5 transition-colors z-30"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <div className="w-10 h-10 rounded-xl bg-[#d12a62]/10 border border-[#d12a62]/20 flex items-center justify-center text-[#ff719e] flex-shrink-0">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white leading-tight">Compartilhar Material</h3>
                <p className="text-xs text-[#8a96a3] mt-0.5">Envie o link do site da Fênix</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-[#0b0f14]/50 p-3 rounded-xl border border-white/5">
              <img
                src={shareModalMaterial.thumbnail}
                alt={shareModalMaterial.titulo}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-bold text-[#d12a62] uppercase tracking-wider block">
                  {shareModalMaterial.categoria}
                </span>
                <h4 className="text-xs font-semibold text-white truncate">
                  {shareModalMaterial.titulo}
                </h4>
                <span className="text-[10px] text-[#8a96a3] font-mono block truncate mt-0.5">
                  {getSiteMaterialUrl(shareModalMaterial.id)}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider block">
                Opções de Compartilhamento
              </span>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent("Confira este material no Grupo Fênix: " + shareModalMaterial.titulo + "\n" + getSiteMaterialUrl(shareModalMaterial.id))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#25D366] hover:bg-[#20ba5a] text-black font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  WhatsApp
                </a>
                <a
                  href={`https://telegram.me/share/url?url=${encodeURIComponent(getSiteMaterialUrl(shareModalMaterial.id))}&text=${encodeURIComponent(shareModalMaterial.titulo)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#0088cc] hover:bg-[#0077b3] text-white font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  Telegram
                </a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getSiteMaterialUrl(shareModalMaterial.id))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#1877F2] hover:bg-[#1566d1] text-white font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  Facebook
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(getSiteMaterialUrl(shareModalMaterial.id));
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 3000);
                  }}
                  className="bg-white/10 hover:bg-white/15 text-white font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-white/5"
                >
                  {shareCopied ? (
                    <>
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-gray-300" />
                      <span>Copiar Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
