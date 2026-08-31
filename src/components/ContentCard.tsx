import React, { useState } from "react";
import { Film, Image as ImageIcon, FileText, GraduationCap } from "lucide-react";
import { useStore } from "../store";

interface ContentCardProps {
  key?: any;
  id: string;
  titulo: string;
  imagem: string;
  categoria: string;
  tipo?: "video" | "image" | "pdf" | "course" | "news" | "material";
  isPremium?: boolean;
  isNew?: boolean;
  duracao?: string;
  onClick?: () => void;
  lessons?: any[]; // optional, for courses
  professorNome?: string;
  professorFoto?: string;
  professorEspecialidade?: string;
}

export default function ContentCard({
  id,
  titulo,
  imagem,
  categoria,
  tipo = "news",
  isPremium = false,
  isNew = false,
  duracao,
  onClick,
  lessons = [],
  professorNome,
  professorFoto,
  professorEspecialidade
}: ContentCardProps) {
  const { completedLessons } = useStore();

  const [thumbErro, setThumbErro] = useState(false);
  const [profErro, setProfErro] = useState(false);

  const FALLBACK_THUMB = "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80";

  // Determine media icon
  const getMediaIcon = () => {
    switch (tipo) {
      case "video":
        return Film;
      case "image":
        return ImageIcon;
      case "pdf":
      case "material":
        return FileText;
      case "course":
        return GraduationCap;
      default:
        return Film;
    }
  };

  const MediaIcon = getMediaIcon();

  // Course watch progress computation
  const getCourseProgress = () => {
    if (tipo !== "course" || !lessons || lessons.length === 0) return null;
    
    // Flatten lesson ids
    const lessonIds = lessons.map((l) => l.id);
    const completedCount = lessonIds.filter((lid) => completedLessons.includes(lid)).length;
    
    if (completedCount === 0) return null;
    return Math.round((completedCount / lessonIds.length) * 100);
  };

  const progressPercent = getCourseProgress();

  return (
    <div
      id={`content-card-${id}`}
      onClick={onClick}
      className="card-modern rounded-2xl flex flex-col cursor-pointer group h-full relative card-shine"
    >
      {/* Thumbnail Container */}
      <div className="relative aspect-video overflow-hidden bg-[#161c26]/50">
        {/* Thumbnail Image */}
        <img
          src={thumbErro ? FALLBACK_THUMB : (imagem || FALLBACK_THUMB)}
          alt={titulo || "Conteúdo"}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-108"
          loading="lazy"
          onError={() => setThumbErro(true)}
        />

        {/* Top Left Badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
          {isNew && (
            <span className="px-2 py-0.5 bg-gold-metallic text-[#07090e] text-[9px] font-extrabold rounded uppercase tracking-wider shadow-md">
              Novo
            </span>
          )}
          {isPremium && (
            <span className="px-2 py-0.5 bg-gradient-to-r from-rose-500 to-[#d12a62] text-[#07090e] text-[9px] font-extrabold rounded uppercase tracking-wider shadow-md">
              Premium
            </span>
          )}
        </div>

        {/* Top Right Media Icon (Discrete Container) */}
        <div className="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-[#07090e]/75 backdrop-blur-md border border-white/10 flex items-center justify-center text-[#f1f5f9] transition-all duration-300 group-hover:bg-gold-metallic group-hover:text-[#07090e] group-hover:border-transparent">
          <MediaIcon className="w-4 h-4" />
        </div>

        {/* Duration indicator if course/video */}
        {duracao && (
          <div className="absolute bottom-2.5 right-2.5 z-10 bg-[#07090e]/80 px-2 py-0.5 rounded border border-white/5 text-[9px] font-mono text-[#f1f5f9]">
            {duracao}
          </div>
        )}

        {/* Overlay Dark Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07090e]/80 to-transparent"></div>
      </div>

      {/* Card Body below thumbnail */}
      <div className="p-3 sm:p-4.5 flex flex-col flex-grow justify-between bg-transparent">
        <div>
          {/* Category */}
          <span className="block text-[10px] sm:text-[11px] text-[#d12a62] font-bold uppercase tracking-wider mb-1 sm:mb-2">
            {categoria}
          </span>
          {/* Title */}
          <h3 className="text-[13px] sm:text-[15px] font-semibold text-[#f1f5f9] leading-snug group-hover:text-[#d12a62] transition-colors line-clamp-2">
            {titulo}
          </h3>

          {/* Professor badge on card if available */}
          {professorNome && (
            <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-white/5 min-w-0">
              {professorFoto ? (
                <img
                  src={profErro ? "/uploads/default_professor.jpg" : professorFoto}
                  alt={professorNome}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="w-5 h-5 rounded-full object-cover border border-white/10 flex-shrink-0"
                  onError={() => setProfErro(true)}
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#d12a62]/20 text-[#d12a62] border border-[#d12a62]/30 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                  {professorNome.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-[11px] text-[#8a96a3] font-medium truncate">
                Prof: <strong className="text-[#e8edf2] font-semibold">{professorNome}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Course watch progress bar (Dourada) and Assistir Curso button */}
        {tipo === "course" && (
          <div className="mt-5 space-y-4.5">
            <div className="w-full flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#94a3b8]">
                <span>Progresso</span>
                <span className="text-[#d12a62] font-bold">
                  {progressPercent === 100 ? "Concluído ✓" : `${progressPercent || 0}%`}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/[0.02]">
                <div 
                  className={`h-full ${progressPercent === 100 ? "bg-green-500" : "bg-gradient-to-r from-rose-500 to-[#d12a62]"} transition-all duration-500`} 
                  style={{ width: `${progressPercent || 0}%` }}
                ></div>
              </div>
            </div>
            
            <button
              type="button"
              className="w-full bg-white/[0.03] hover:bg-[#d12a62]/10 text-white hover:text-[#d12a62] border border-white/[0.05] hover:border-[#d12a62]/30 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer backdrop-blur-md shadow-sm"
            >
              <span>Assistir Curso</span>
              <span className="text-xs transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>
        )}

        {/* Material button */}
        {(tipo === "material" || tipo === "pdf") && (
          <div className="mt-5">
            <button
              type="button"
              className="w-full bg-[#d12a62]/10 hover:bg-[#d12a62] text-[#ff719e] hover:text-white border border-[#d12a62]/30 hover:border-[#d12a62] py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer backdrop-blur-md shadow-sm"
            >
              <span>Acessar Materiais</span>
              <span className="text-xs transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
