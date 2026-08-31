import React, { useRef, useEffect } from "react";
import { useStore } from "../store";
import HeroCarousel from "./HeroCarousel";
import ContentCard from "./ContentCard";
import Reveal, { StaggerContainer, StaggerItem } from "./Reveal";
import { ChevronLeft, ChevronRight, Lock, Sparkles } from "lucide-react";
import { Curso, Material, Novidade } from "../types";

export default function InicioView() {
  const { 
    publicData, 
    fetchPublicData, 
    fenixPosts,
    fetchFenixPosts,
    setActiveView, 
    setActiveCourse, 
    loggedIn,
    setSubView,
    hiddenHomeCardIds = []
  } = useStore();

  // Create Carousel Refs unconditionally at the top to satisfy the Rules of Hooks
  const refs = {
    novidades: useRef<HTMLDivElement>(null),
    emAlta: useRef<HTMLDivElement>(null),
    cursos: useRef<HTMLDivElement>(null),
    materiais: useRef<HTMLDivElement>(null),
    recomendados: useRef<HTMLDivElement>(null),
    lancamentos: useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    fetchPublicData();
    fetchFenixPosts();
  }, []);

  const isCardLinkedToValidDestination = (item: any): boolean => {
    if (!item) return false;

    // 1. Direct content types or structural properties (cursos, materiais, fênix social)
    if (item.contentType === "course" || item.displayType === "course" || item.modulos) return true;
    if (item.contentType === "material" || item.displayType === "material" || item.fileUrl) return true;
    if (item.contentType === "fenix-social") return true;

    // 2. Explicit link configurations
    if (item.linkType) {
      if (item.linkType === "curso") return true;
      if (item.linkType === "material") return true;
      if (item.linkType === "fenix-social") return true;
      if (
        item.linkType === "pagina" &&
        (item.linkTarget === "fenix-social" || item.linkTarget === "escola-fenix" || item.linkTarget === "conteudos")
      ) {
        return true;
      }
      return false; // Exclude any other linkType (e.g. "externo", "nenhum", or other unlinked pages)
    }

    return false;
  };

  const handleCardClick = (item: any, type: "news" | "course" | "material", actionType?: "play" | "info") => {
    const effectiveType = item.contentType || type;

    // 1. Fênix Social link
    if (
      effectiveType === "fenix-social" ||
      item.linkType === "fenix-social" ||
      (item.linkType === "pagina" && item.linkTarget === "fenix-social")
    ) {
      setActiveView("fenix-social");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // 2. Course link
    if (
      effectiveType === "course" ||
      item.modulos ||
      item.linkType === "curso" ||
      (item.linkType === "pagina" && item.linkTarget === "escola-fenix")
    ) {
      const targetCourseId = item.linkTarget || item.id;
      const matchedCourse = publicData?.cursos?.find((c: any) => c.id === targetCourseId) || (item.modulos ? item : null);

      if (!loggedIn) {
        setActiveView("escola-fenix");
      } else {
        if (matchedCourse) {
          setActiveCourse(matchedCourse as Curso);
        } else if (item.titulo) {
          setActiveCourse(item as Curso);
        }
        setActiveView("escola-fenix");
        setSubView("cursos");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // 3. Material link
    if (
      effectiveType === "material" ||
      item.fileUrl ||
      item.linkType === "material" ||
      (item.linkType === "pagina" && item.linkTarget === "conteudos")
    ) {
      const targetMatId = item.linkTarget || item.id;
      
      // Update URL search query
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("view", "conteudos");
      if (targetMatId) {
        newUrl.searchParams.set("material", targetMatId);
      }
      window.history.pushState({}, "", newUrl.toString());

      setActiveView("conteudos");

      // Scroll to material card on Conteudos page
      setTimeout(() => {
        if (targetMatId) {
          const el = document.getElementById(`material-card-${targetMatId}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring-2", "ring-[#d12a62]", "scale-[1.03]", "transition-all", "duration-500");
            setTimeout(() => {
              el.classList.remove("ring-2", "ring-[#d12a62]", "scale-[1.03]");
            }, 2500);
          } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, 350);
      return;
    }

    // 4. Novidades mapping to course
    let targetCourseId = "";
    if (item.id === "n-1" || item.titulo?.toLowerCase().includes("biohacking") || item.titulo?.toLowerCase().includes("bem-estar")) {
      targetCourseId = "c-2"; // Course: Biohacking & Bem-Estar Integrativo
    } else if (item.id === "n-2" || item.titulo?.toLowerCase().includes("empreendedorismo") || item.titulo?.toLowerCase().includes("estoque")) {
      targetCourseId = "c-1"; // Course: Formação de Empreendedores
    } else if (item.id === "n-3" || item.titulo?.toLowerCase().includes("líderes") || item.titulo?.toLowerCase().includes("liderança") || item.titulo?.toLowerCase().includes("mentoria")) {
      targetCourseId = "c-3"; // Course: Liderança de Alta Performance
    }

    if (targetCourseId) {
      const matchedCourse = publicData?.cursos?.find((c: any) => c.id === targetCourseId);
      if (!loggedIn) {
        setActiveView("escola-fenix");
      } else {
        if (matchedCourse) {
          setActiveCourse(matchedCourse);
        }
        setActiveView("escola-fenix");
        setSubView("cursos");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Default fallback to courses view
    setActiveView("escola-fenix");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Helper: horizontal scroll action
  const scrollContainer = (ref: React.RefObject<HTMLDivElement | null>, direction: "left" | "right") => {
    if (ref.current) {
      const scrollAmount = 550;
      ref.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };

  if (!publicData) {
    return (
      <div className="-mx-4 sm:-mx-6 lg:-mx-10 -mt-6 sm:-mt-8 lg:-mt-10 flex flex-col gap-8 pb-12 animate-pulse">
        <div className="h-[50vh] sm:h-[58vh] lg:h-[65vh] w-full bg-gradient-to-r from-white/[0.03] to-transparent border-b border-white/[0.02]"></div>
        <div className="space-y-4 px-4 sm:px-6 lg:px-10 pt-4">
          <div className="h-6 w-48 bg-white/[0.03] rounded border border-white/[0.02]"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="aspect-video bg-white/[0.03] rounded-xl border border-white/[0.02]"></div>
            <div className="aspect-video bg-white/[0.03] rounded-xl border border-white/[0.02]"></div>
            <div className="aspect-video bg-white/[0.03] rounded-xl border border-white/[0.02]"></div>
            <div className="aspect-video bg-white/[0.03] rounded-xl border border-white/[0.02]"></div>
          </div>
        </div>
      </div>
    );
  }

  const { novidades = [], cursos = [], materiais = [] } = publicData;

  // Helper function to extract reliable timestamp from any content item
  const getItemTimestamp = (item: any) => {
    if (item.createdAt) {
      const t = new Date(item.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (item.dataPublicacao) {
      const t = new Date(item.dataPublicacao).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (item.data) {
      const t = new Date(item.data).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (typeof item.id === "string" && item.id.includes("-")) {
      const parts = item.id.split("-");
      const lastPart = parts[parts.length - 1];
      const num = Number(lastPart);
      if (!isNaN(num) && num > 1000000000) return num;
    }
    return 0;
  };

  // Helper function to sort items by newest descending (newest items placed first)
  const sortByNewest = (items: any[]) => {
    if (!items) return [];
    return [...items].sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a));
  };

  const isCardVisibleOnHome = (item: any) => {
    if (!item) return false;
    const cardId = item.id;
    if (!cardId) return false;
    if (hiddenHomeCardIds.includes(cardId)) return false;
    if (item.contentType && hiddenHomeCardIds.includes(`${item.contentType}:${cardId}`)) return false;
    return true;
  };

  // Filter featured slides for Hero Carousel
  const heroSlides = sortByNewest(
    (novidades || []).filter((n) => n.isFeatured && isCardVisibleOnHome(n))
  );

  // Combine ALL published contents across the platform (Novidades, Cursos, Materiais, and Fênix Social)
  const allContents = [
    ...(novidades || [])
      .filter((n) => isCardVisibleOnHome(n))
      .map((n) => {
        const isMaterial = (n as any).contentType === "material" || n.linkType === "material" || (n as any).fileUrl || ((n.linkType as string) === "pagina" && n.linkTarget === "conteudos");
        return {
          ...n,
          contentType: isMaterial ? ("material" as const) : ("news" as const),
          displayType: isMaterial ? ("material" as const) : ("news" as const),
          displayCategory: n.categoria || "Novidade",
          sortDate: getItemTimestamp(n)
        };
      }),
    ...(cursos || [])
      .filter(isCardVisibleOnHome)
      .map((c) => ({
        ...c,
        contentType: "course" as const,
        displayType: "course" as const,
        displayCategory: c.secao === "series" ? "Série" : c.secao === "treinamentos" ? "Treinamento" : "Curso",
        sortDate: getItemTimestamp(c)
      })),
    ...(materiais || [])
      .filter(isCardVisibleOnHome)
      .map((m) => ({
        ...m,
        imagem: m.thumbnail || m.imagem,
        contentType: "material" as const,
        displayType: "material" as const,
        displayCategory: m.categoria ? `Conteúdo • ${m.categoria}` : "Conteúdo",
        sortDate: getItemTimestamp(m)
      })),
    ...(fenixPosts || [])
      .filter((p) => (p.status === "aprovado" || !p.status) && isCardVisibleOnHome(p))
      .map((p) => ({
        ...p,
        titulo: p.titulo || p.legenda || "Post Fênix Social",
        imagem: p.mediaUrl || (p.mediaUrls && p.mediaUrls[0]) || "",
        contentType: "fenix-social" as const,
        displayType: "news" as const,
        displayCategory: `Fênix Social • ${p.usuarioNome || "Comunidade"}`,
        sortDate: getItemTimestamp(p)
      }))
  ];

  // Novidades section displays all published site content, ordered by newest first
  const novidadesList = [...allContents].sort((a, b) => b.sortDate - a.sortDate);
  const cursosList = sortByNewest(cursos.filter(isCardVisibleOnHome)).map((c) => ({ ...c, contentType: "course" as const, displayType: "course" as const }));
  const materiaisList = sortByNewest(materiais.filter(isCardVisibleOnHome)).map((m) => ({
    ...m,
    imagem: m.thumbnail || m.imagem,
    contentType: "material" as const,
    displayType: "material" as const,
    displayCategory: m.categoria ? `Conteúdo • ${m.categoria}` : "Conteúdo"
  }));
  const emAltaList = sortByNewest(allContents.filter((item) => item.categoria === "Em Alta" || item.isPremium || item.isFeatured));

  const CarouselRow = ({
    title,
    list,
    type,
    containerRef,
    viewAllAction
  }: {
    title: string;
    list: any[];
    type: "news" | "course" | "material";
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewAllAction?: () => void;
  }) => {
    if (list.length === 0) return null;

    return (
      <Reveal direction="up" className="relative group/row space-y-3 pt-2">
        {/* Row Header */}
        <div className="flex items-center justify-between px-1 mb-2">
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#f1f5f9]">
            {title}
          </h2>
          {viewAllAction && (
            <button
              onClick={viewAllAction}
              className="text-[#d12a62] text-[10px] uppercase tracking-widest border border-[#d12a62]/20 hover:bg-[#d12a62]/5 transition-all px-3 py-1 rounded-full font-mono font-bold"
            >
              Ver todos →
            </button>
          )}
        </div>

        {/* Carousel Tracks with Left/Right arrows on Desktop hover */}
        <div className="relative">
          {/* Left Arrow Button */}
          <button
            onClick={() => scrollContainer(containerRef, "left")}
            className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/80 hover:bg-black border border-white/10 text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 z-20 transition-opacity pointer-events-auto hidden md:flex"
          >
            <ChevronLeft className="w-5 h-5 text-[#f1f5f9]" />
          </button>

          {/* Slider Rail */}
          <div
            ref={containerRef as any}
            className="flex items-stretch gap-3 sm:gap-5 overflow-x-auto scroll-smooth scrollbar-hide py-3 px-1 snap-x snap-mandatory"
          >
            <StaggerContainer className="flex items-stretch gap-3 sm:gap-5" stagger={0.07}>
              {list.map((item, index) => (
                <StaggerItem key={`${item.contentType || type}-${item.id}`} className="w-[220px] sm:w-[260px] md:w-[340px] lg:w-[360px] flex-shrink-0 snap-start transition-all duration-300 hover:scale-[1.01]">
                  <ContentCard
                    id={item.id}
                    titulo={item.titulo}
                    imagem={item.imagem || item.thumbnail}
                    categoria={item.displayCategory || item.categoria}
                    tipo={item.displayType || type}
                    isPremium={item.isPremium}
                    isNew={index < 3 || item.isNew}
                    duracao={item.duracao}
                    lessons={item.modulos ? item.modulos.flatMap((m: any) => m.aulas) : []}
                    professorNome={item.professorNome}
                    professorFoto={item.professorFoto}
                    onClick={() => handleCardClick(item, item.displayType || type)}
                  />
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>

          {/* Right Arrow Button */}
          <button
            onClick={() => scrollContainer(containerRef, "right")}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/80 hover:bg-black border border-white/10 text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 z-20 transition-opacity pointer-events-auto hidden md:flex"
          >
            <ChevronRight className="w-5 h-5 text-[#f1f5f9]" />
          </button>
        </div>
      </Reveal>
    );
  };

  return (
    <div id="inicio-view" className="-mx-4 sm:-mx-6 lg:-mx-10 -mt-6 sm:-mt-8 lg:-mt-10 pb-12 animate-fade-in">
      {/* 1. Hero Full Bleed */}
      <HeroCarousel 
        slides={heroSlides.length > 0 ? heroSlides : novidades.slice(0, 3)} 
        onPlayClick={(slide) => handleCardClick(slide, "news", "play")}
        onInfoClick={(slide) => handleCardClick(slide, "news", "info")}
      />

      {/* 2. Horizontal Rows */}
      <div className="space-y-8 sm:space-y-10 px-4 sm:px-6 lg:px-10 pt-4 sm:pt-6">
        {allContents.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-2xl border border-dashed border-white/10 bg-white/[0.01] max-w-2xl mx-auto my-6">
            <div className="w-12 h-12 rounded-2xl bg-[#d12a62]/10 border border-[#d12a62]/20 flex items-center justify-center text-[#ff719e] mx-auto mb-4">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Estrutura Pronta para Conteúdos</h3>
            <p className="text-sm text-[#94a3b8] leading-relaxed max-w-md mx-auto">
              Nenhum conteúdo foi cadastrado ainda. A plataforma está completamente estruturada e pronta para receber informações, cursos, novidades e materiais através do Painel de Administração.
            </p>
          </div>
        ) : (
          <>
            <CarouselRow
              title="Novidades"
              list={novidadesList}
              type="news"
              containerRef={refs.novidades}
            />

            <CarouselRow
              title="Cursos em Destaque"
              list={cursosList}
              type="course"
              containerRef={refs.cursos}
              viewAllAction={() => {
                setActiveView("escola-fenix");
                setSubView("cursos");
              }}
            />

            <CarouselRow
              title="Biblioteca & Materiais"
              list={materiaisList}
              type="material"
              containerRef={refs.materiais}
              viewAllAction={() => {
                setActiveView("conteudos");
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
