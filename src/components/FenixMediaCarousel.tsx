import React, { useState } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  X, 
  Play, 
  Film, 
  Image as ImageIcon 
} from "lucide-react";

interface FenixMediaCarouselProps {
  mediaUrls: string[];
  tipoMedia: "photo" | "video" | "foto";
  caption?: string;
  className?: string;
}

export default function FenixMediaCarousel({
  mediaUrls,
  tipoMedia,
  caption,
  className = ""
}: FenixMediaCarouselProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isVideo = tipoMedia === "video";

  // Normalize list
  const list = mediaUrls && mediaUrls.length > 0 ? mediaUrls : [];
  const total = list.length;

  if (total === 0) {
    return (
      <div className="bg-black/40 h-48 sm:h-56 flex items-center justify-center text-xs text-gray-500 rounded-xl border border-white/5">
        Sem mídia anexada
      </div>
    );
  }

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIdx((prev) => (prev + 1) % total);
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIdx((prev) => (prev - 1 + total) % total);
  };

  return (
    <>
      {/* Inline Container */}
      <div className={`relative bg-black rounded-xl overflow-hidden group border border-white/10 ${className}`}>
        {isVideo ? (
          <div className="relative w-full aspect-video max-h-[360px] flex items-center justify-center bg-black">
            <video
              src={list[0]}
              controls
              playsInline
              preload="metadata"
              className="w-full h-full object-contain max-h-[360px]"
            />
            <button
              onClick={() => setLightboxOpen(true)}
              className="absolute top-2 right-2 p-2 rounded-lg bg-black/60 hover:bg-black/90 text-white border border-white/20 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
              title="Expandir Vídeo"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="relative w-full aspect-video sm:aspect-[4/3] max-h-[360px] flex items-center justify-center bg-black/90 select-none">
            {/* Image display */}
            <img
              src={list[currentIdx]}
              alt={caption || `Mídia ${currentIdx + 1}`}
              className="w-full h-full object-contain max-h-[360px] cursor-zoom-in"
              onClick={() => setLightboxOpen(true)}
              referrerPolicy="no-referrer"
            />

            {/* Expand Overlay Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
              }}
              className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white text-xs font-semibold border border-white/20 flex items-center gap-1.5 backdrop-blur-md opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer shadow-lg"
              title="Ampliar Foto"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ampliar</span>
            </button>

            {/* Multiple Photos Navigation Arrows */}
            {total > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/20 backdrop-blur-md transition-all hover:scale-110 z-10 cursor-pointer"
                  aria-label="Foto anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <button
                  onClick={handleNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/20 backdrop-blur-md transition-all hover:scale-110 z-10 cursor-pointer"
                  aria-label="Próxima foto"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {/* Badge Indicator */}
                <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/70 text-white text-[10px] font-mono border border-white/20 backdrop-blur-md flex items-center gap-1">
                  <ImageIcon className="w-3 h-3 text-amber-400" />
                  <span>{currentIdx + 1} / {total}</span>
                </div>

                {/* Dots indicator */}
                <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 z-10">
                  {list.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentIdx(idx);
                      }}
                      className={`h-2 rounded-full transition-all cursor-pointer ${
                        idx === currentIdx ? "w-5 bg-amber-400" : "w-2 bg-white/40 hover:bg-white/70"
                      }`}
                      aria-label={`Ir para imagem ${idx + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {lightboxOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-lg flex flex-col items-center justify-between p-3 sm:p-6 animate-fade-in"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Header */}
          <div 
            className="w-full max-w-5xl flex items-center justify-between text-white pb-3 border-b border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              {isVideo ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold">
                  <Film className="w-3.5 h-3.5" /> Vídeo em Alta Resolução
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold">
                  <ImageIcon className="w-3.5 h-3.5" /> Foto {total > 1 ? `${currentIdx + 1} de ${total}` : "1 de 1"}
                </span>
              )}
            </div>

            <button
              onClick={() => setLightboxOpen(false)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Media View Body */}
          <div 
            className="relative w-full max-w-5xl flex-grow flex items-center justify-center my-3 overflow-hidden select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideo ? (
              <video
                src={list[0]}
                controls
                autoPlay
                playsInline
                controlsList="nodownload"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
              />
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={list[currentIdx]}
                  alt={caption || "Visualização ampla"}
                  className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />

                {total > 1 && (
                  <>
                    <button
                      onClick={handlePrev}
                      className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/80 hover:bg-black text-white border border-white/20 shadow-2xl transition-transform hover:scale-110 cursor-pointer"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>

                    <button
                      onClick={handleNext}
                      className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/80 hover:bg-black text-white border border-white/20 shadow-2xl transition-transform hover:scale-110 cursor-pointer"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Bottom Thumbnails & Caption */}
          <div 
            className="w-full max-w-5xl pt-3 border-t border-white/10 flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {caption && (
              <p className="text-xs sm:text-sm text-gray-300 max-w-3xl text-center line-clamp-2 px-2">
                {caption}
              </p>
            )}

            {!isVideo && total > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1 px-2">
                {list.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIdx(idx)}
                    className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 cursor-pointer ${
                      idx === currentIdx ? "border-amber-400 scale-105" : "border-white/20 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={url} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
