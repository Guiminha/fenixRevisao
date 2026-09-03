import React, { useState, useEffect } from "react";
import { Novidade, Banner, ViewType } from "../types";
import { Play, Info, ArrowUpRight } from "lucide-react";
import { useStore } from "../store";
import { motion, AnimatePresence } from "motion/react";

interface HeroCarouselProps {
  slides: Novidade[];
  onPlayClick?: (slide: Novidade) => void;
  onInfoClick?: (slide: Novidade) => void;
}

const FALLBACK_HERO = "/uploads/hero_phoenix_city_1785160165470.jpg";

// Imagem de slide com fallback controlado por estado — evita o loop de
// requisições que acontecia quando o onError mutava o src via setAttribute
// (o React sobrescrevia o src no próximo render e o erro repetia centenas de vezes).
function HeroSlideImage({ slide, index, currentIndex }: { slide: any; index: number; currentIndex: number }) {
  const [errou, setErrou] = useState(false);
  const src = (() => {
    if (errou) return FALLBACK_HERO;
    if (slide?.imagem) return slide.imagem;
    if (slide?.imagemDesktop) return slide.imagemDesktop;
    if (slide?.imagemMobile) return slide.imagemMobile;
    if (slide?.image) return slide.image;
    if (slide?.thumbnail) return slide.thumbnail;
    if (slide?.mediaUrl) return slide.mediaUrl;
    return FALLBACK_HERO;
  })();
  return (
    <img
      src={src}
      alt={slide.titulo || "Destaque"}
      referrerPolicy="no-referrer"
      loading={index === currentIndex ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={index === currentIndex ? "high" : undefined}
      className="w-full h-full object-contain md:object-cover object-top"
      
      onError={() => setErrou(true)}
    />
  );
}

export default function HeroCarousel({ slides, onPlayClick, onInfoClick }: HeroCarouselProps) {
  const { 
    publicData, 
    setActiveView, 
    setActiveCourse, 
    loggedIn,
    setSubView,
    hiddenHomeCardIds = []
  } = useStore();

  const [currentIndex, setCurrentIndex] = useState(0);

  const isSlideValid = (slide: any) => {
    if (!slide) return false;
    if (hiddenHomeCardIds.includes(slide.id)) return false;
    return true;
  };

  const banners = (publicData?.banners || []).filter(isSlideValid);
  const hasBanners = banners.length > 0;
  
  // Sort banners by order
  const activeSlides = hasBanners 
    ? [...banners].sort((a, b) => (a.ordem || 1) - (b.ordem || 1))
    : (slides || []).filter(isSlideValid);

  useEffect(() => {
    if (activeSlides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeSlides.length);
    }, 7000); // 7s autoplay
    return () => clearInterval(interval);
  }, [activeSlides]);

  if (!activeSlides || activeSlides.length === 0) {
    return (
      <div className="h-[38vh] sm:h-[45vh] lg:h-[50vh] w-full bg-gradient-to-br from-[#0e131a] via-[#121822] to-[#0b0f14] border-b border-white/[0.05] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#d12a62]/10 border border-[#d12a62]/20 flex items-center justify-center text-[#ff719e] mb-3">
          <Play className="w-5 h-5 text-[#ff719e]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-1.5">Área de Destaques</h2>
        <p className="text-xs sm:text-sm text-[#94a3b8] max-w-md">
          A estrutura do banner de destaques está pronta. Adicione e gerencie banners de destaque pelo Painel de Administração.
        </p>
      </div>
    );
  }

  const safeIndex = currentIndex < activeSlides.length ? currentIndex : 0;
  const currentSlide = activeSlides[safeIndex] || activeSlides[0];

  if (!currentSlide) return null;

  const handleBannerButtonClick = (tipo: string | undefined, destino: string | undefined) => {
    if (!tipo || tipo === "nenhum") return;

    if (tipo === "fenix-social" || (tipo === "pagina" && destino === "fenix-social")) {
      setActiveView("fenix-social");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (tipo === "curso" || (tipo === "pagina" && destino === "escola-fenix")) {
      const matchedCourse = publicData?.cursos?.find((c: any) => c.id === destino);
      if (matchedCourse) {
        if (!loggedIn) {
          setActiveView("escola-fenix");
        } else {
          setActiveCourse(matchedCourse);
          setActiveView("escola-fenix");
          setSubView("cursos");
        }
      } else {
        setActiveView("escola-fenix");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (tipo === "material" || (tipo === "pagina" && destino === "conteudos")) {
      setActiveView("conteudos");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (tipo === "pagina" && destino) {
      const validViews: ViewType[] = [
        "inicio", "escola-fenix", "conteudos", "tecnologias",
        "grupo-fenix", "fenix-social", "elite-milionario"
      ];
      if (validViews.includes(destino as ViewType)) {
        setActiveView(destino as ViewType);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else if (tipo === "externo" && destino) {
      if (destino.startsWith("http://") || destino.startsWith("https://")) {
        window.open(destino, "_blank", "noopener,noreferrer");
      } else {
        const cleaned = destino.replace(/^\/+/, "");
        const validViews: ViewType[] = [
          "inicio", "escola-fenix", "conteudos", "tecnologias",
          "grupo-fenix", "fenix-social", "elite-milionario"
        ];
        if (validViews.includes(cleaned as ViewType)) {
          setActiveView(cleaned as ViewType);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          window.open(`https://${destino}`, "_blank", "noopener,noreferrer");
        }
      }
    }
  };

  return (
    <div 
      id="hero-carousel-container"
      className="relative w-full aspect-[21/9] min-h-[360px] sm:min-h-[320px] overflow-hidden select-none"
    >
      {/* Background Slides Track */}
      <div className="absolute inset-0 w-full h-full">
        {activeSlides.map((slide, index) => (
          <div
            key={slide.id}
            className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ease-in-out ${
              index === currentIndex ? "opacity-100 z-10" : "opacity-0 z-0"
            }`}
          >
            <HeroSlideImage slide={slide} index={index} currentIndex={currentIndex} />
          </div>
        ))}
      </div>

      {/* GRADIENT OVERLAYS - Localized to text area for maximum image visibility */}
      {/* Light top gradient for navbar readability */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#0b0f14]/35 to-transparent z-15 pointer-events-none" />
      
      {/* Bottom-left localized gradient strictly around title, description & buttons (increased opacity for better text contrast) */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#0b0f14]/95 via-[#0b0f14]/35 via-40% to-transparent z-15 pointer-events-none" />
      
      {/* Subtle bottom edge blend to smooth transition into page content */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b0f14] to-transparent z-15 pointer-events-none" />

      {/* Slide Content Overlay */}
      <div className="absolute inset-0 z-20 flex flex-col justify-end p-4 sm:p-8 lg:p-12 w-full sm:max-w-[60%] lg:max-w-[45%] animate-fade-in pb-10 sm:pb-8">
        <motion.div
          key={currentSlide.id + "-" + safeIndex}
          initial="hidden"
          animate="visible"
          className="flex flex-col"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.04, delayChildren: 0 } },
          }}
        >
          <motion.div
            className="flex flex-wrap items-center gap-2 mb-2 md:mb-3"
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
            }}
          >
            {/* Category/Type Badge */}
            <span className="px-2.5 py-0.5 bg-gradient-to-r from-[#fff1f2] via-[#d12a62] to-[#881337] text-white text-[clamp(0.625rem,0.8vw,0.75rem)] font-bold rounded-full uppercase tracking-widest shadow-[0_2px_10px_rgba(209,42,98,0.15)] italic">
              {hasBanners ? "Destaque" : (currentSlide as Novidade).categoria || "Novidade"}
            </span>
            {/* Amber Premium Badge for fallback news */}
            {!hasBanners && (currentSlide as Novidade).isPremium && (
              <span className="px-2 py-1 bg-[#d97706] text-white text-[8px] md:text-[9px] font-bold rounded uppercase tracking-tighter">
                ★ Premium
              </span>
            )}
          </motion.div>

          {/* Title */}
          <motion.h1
            id={`hero-slide-title-${currentSlide.id}`}
            className="text-[clamp(1.5rem,4vw,4.5rem)] font-bold tracking-tighter mb-2 md:mb-4 leading-[1.05] md:leading-[1.02] drop-shadow-md"
            style={{ color: (currentSlide as Banner).corTitulo || "#ffffff" }}
            variants={{
              hidden: { opacity: 0, y: 24 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
            }}
          >
            {currentSlide.titulo}
          </motion.h1>

          {/* Description */}
          <motion.p
            className="text-[clamp(0.9rem,1.5vw,1.6rem)] mb-4 md:mb-8 leading-relaxed italic drop-shadow-sm font-medium"
            style={{ color: (currentSlide as Banner).corDescricao || "#ffffff" }}
            variants={{
              hidden: { opacity: 0, y: 18 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
            }}
          >
            {currentSlide.descricao}
          </motion.p>

          {/* Actions */}
          <motion.div
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 md:gap-4 w-full sm:w-auto"
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
            }}
          >
            {hasBanners ? (
              <>
                {/* Dynamic Banner Buttons */}
                {(currentSlide as Banner).botoesAtivos ? (
                  <>
                    {/* Button 1 */}
                    {(currentSlide as Banner).btn1Texto && (currentSlide as Banner).btn1Tipo !== "nenhum" && (
                      <button
                        onClick={() => handleBannerButtonClick((currentSlide as Banner).btn1Tipo, (currentSlide as Banner).btn1Destino)}
                        className="h-8 sm:h-10 md:h-12 px-4 sm:px-6 md:px-8 rounded-lg sm:rounded-xl bg-[#d12a62] hover:bg-[#b02251] text-white text-[clamp(0.625rem,0.8vw,0.875rem)] uppercase tracking-widest font-extrabold flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer transition-all duration-300 hover:scale-[1.01] w-full sm:w-auto shadow-lg shadow-[#d12a62]/20 border border-transparent"
                      >
                        {(currentSlide as Banner).btn1Tipo === "externo" && <ArrowUpRight className="w-3.5 h-3.5" />}
                        {(currentSlide as Banner).btn1Texto}
                      </button>
                    )}

                    {/* Button 2 */}
                    {(currentSlide as Banner).btn2Texto && (currentSlide as Banner).btn2Tipo !== "nenhum" && (
                      <button
                        onClick={() => handleBannerButtonClick((currentSlide as Banner).btn2Tipo, (currentSlide as Banner).btn2Destino)}
                        className="h-8 sm:h-10 md:h-12 px-4 sm:px-6 md:px-8 rounded-lg sm:rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/[0.08] text-[#f1f5f9] font-bold text-[clamp(0.625rem,0.8vw,0.875rem)] uppercase tracking-widest flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-300 w-full sm:w-auto backdrop-blur-md cursor-pointer"
                      >
                        {(currentSlide as Banner).btn2Tipo === "externo" && <ArrowUpRight className="w-3.5 h-3.5" />}
                        {(currentSlide as Banner).btn2Texto}
                      </button>
                    )}
                  </>
                ) : null}
              </>
            ) : (
              <>
                {/* Fallback Legacy Buttons */}
                <button
                  id={`hero-watch-btn-${currentSlide.id}`}
                  onClick={() => onPlayClick && onPlayClick(currentSlide as Novidade)}
                  className="h-8 sm:h-10 md:h-12 px-4 sm:px-6 md:px-8 rounded-lg sm:rounded-xl bg-[#d12a62]/10 hover:bg-[#d12a62] text-[#d12a62] hover:text-[#07090e] border border-[#d12a62]/30 hover:border-transparent backdrop-blur-md text-[clamp(0.625rem,0.8vw,0.875rem)] uppercase tracking-widest font-extrabold flex items-center justify-center gap-1.5 sm:gap-2.5 cursor-pointer transition-all duration-300 hover:scale-[1.01] w-full sm:w-auto shadow-lg shadow-[#d12a62]/5"
                >
                  <Play className="w-3.5 h-3.5 md:w-4 md:h-4 fill-current" />
                  Assistir agora
                </button>
                <button
                  id={`hero-info-btn-${currentSlide.id}`}
                  onClick={() => onInfoClick && onInfoClick(currentSlide as Novidade)}
                  className="h-8 sm:h-10 md:h-12 px-4 sm:px-6 md:px-8 rounded-lg sm:rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/[0.08] text-[#f1f5f9] font-bold text-[clamp(0.625rem,0.8vw,0.875rem)] uppercase tracking-widest flex items-center justify-center gap-1.5 sm:gap-2.5 transition-all duration-300 w-full sm:w-auto backdrop-blur-md cursor-pointer"
                >
                  <Info className="w-4 h-4 md:w-4.5 md:h-4.5 text-[#94a3b8]" />
                  Saiba mais
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* Carousel Dot Indicators (Glow active, translucent white inactive) */}
      {activeSlides.length > 1 && (
        <div className="absolute bottom-5 left-5 md:bottom-8 md:left-12 z-25 flex items-center gap-1.5 md:gap-2">
          {activeSlides.map((_, index) => (
            <button
              key={index}
              id={`hero-carousel-dot-${index}`}
              onClick={() => setCurrentIndex(index)}
              className={`h-1 transition-all duration-300 ${
                index === currentIndex 
                  ? "w-6 md:w-8 bg-[#d12a62] shadow-[0_0_8px_rgba(209,42,98,0.4)]" 
                  : "w-1.5 md:w-2 bg-white/20 hover:bg-white/40 cursor-pointer"
              }`}
              aria-label={`Slide ${index + 1}`}
            ></button>
          ))}
        </div>
      )}
    </div>
  );
}
