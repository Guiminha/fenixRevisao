import React, { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import ContentCard from "./ContentCard";
import LoginModal from "./LoginModal";
import CustomVideoPlayer from "./CustomVideoPlayer";
import { 
  Play, 
  CheckCircle, 
  Circle, 
  BookOpen, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  ArrowLeft,
  ArrowRight,
  Award,
  ExternalLink,
  Lock,
  SkipForward,
  SkipBack
} from "lucide-react";
import { Curso, Modulo, Aula } from "../types";
import { parseVimeoInput } from "../utils/vimeoHelper";

export default function EscolaFenixView() {
  const { 
    loggedIn, 
    restrictedData, 
    fetchRestrictedData,
    activeCourse,
    setActiveCourse,
    subView,
    completedLessons,
    toggleLessonCompleted,
    saveLessonProgress,
    lessonProgress
  } = useStore();

  const [activeTab, setActiveTab] = useState<"cursos" | "hub-marketing">("cursos");

  // Detailed view active states
  const [currentModuleIdx, setCurrentModuleIdx] = useState<number>(0);
  const [currentAulaIdx, setCurrentAulaIdx] = useState<number>(0);
  const [openModules, setOpenModules] = useState<{ [key: string]: boolean }>({ "0": true });

  // Video & iframe element refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load restricted data if logged in
  useEffect(() => {
    if (loggedIn) {
      fetchRestrictedData();
    }
  }, [loggedIn]);

  // Sync tab with sidebar subView
  useEffect(() => {
    if (subView) {
      setActiveTab(subView as "cursos" | "hub-marketing");
    }
  }, [subView]);

  // Toggle module accordion
  const toggleModuleAccordion = (idx: number) => {
    setOpenModules((prev) => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // Helper: debounce for 5s video progress save
  const debounceTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});
  
  const debouncedSaveProgress = useCallback((lessonId: string, progressPercent: number) => {
    if (debounceTimers.current[lessonId]) {
      clearTimeout(debounceTimers.current[lessonId]);
    }
    debounceTimers.current[lessonId] = setTimeout(() => {
      saveLessonProgress(lessonId, progressPercent);
      console.log(`[Escola Fênix] Progresso salvo debounced (5s): Aula ${lessonId} -> ${progressPercent}%`);
    }, 5000);
  }, [saveLessonProgress]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const handleLessonSelect = useCallback((modIdx: number, aulaIdx: number) => {
    setCurrentModuleIdx(modIdx);
    setCurrentAulaIdx(aulaIdx);
    setOpenModules((prev) => ({ ...prev, [modIdx]: true }));
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const handleNextAula = useCallback(() => {
    if (!activeCourse) return;
    let nextModIdx = currentModuleIdx;
    let nextAulaIdx = currentAulaIdx + 1;

    const currentMod = activeCourse.modulos[nextModIdx];
    if (currentMod && nextAulaIdx < currentMod.aulas.length) {
      handleLessonSelect(nextModIdx, nextAulaIdx);
    } else if (nextModIdx + 1 < activeCourse.modulos.length) {
      handleLessonSelect(nextModIdx + 1, 0);
    } else {
      console.log("[Escola Fênix] Você concluiu a última aula do curso!");
    }
  }, [activeCourse, currentModuleIdx, currentAulaIdx, handleLessonSelect]);

  const handlePrevAula = useCallback(() => {
    if (!activeCourse) return;
    let prevModIdx = currentModuleIdx;
    let prevAulaIdx = currentAulaIdx - 1;

    if (prevAulaIdx >= 0) {
      handleLessonSelect(prevModIdx, prevAulaIdx);
    } else if (prevModIdx - 1 >= 0) {
      const targetMod = activeCourse.modulos[prevModIdx - 1];
      if (targetMod && targetMod.aulas.length > 0) {
        handleLessonSelect(prevModIdx - 1, targetMod.aulas.length - 1);
      }
    }
  }, [activeCourse, currentModuleIdx, currentAulaIdx, handleLessonSelect]);

  const handleVideoEnd = useCallback(() => {
    if (!activeCourse) return;
    const currentMod = activeCourse.modulos[currentModuleIdx];
    const currentAula = currentMod?.aulas[currentAulaIdx];

    if (currentAula) {
      // Mark as completed if not already marked
      if (!completedLessons.includes(currentAula.id)) {
        toggleLessonCompleted(currentAula.id);
      }
    }

    // Auto-advance to next lesson
    handleNextAula();
  }, [activeCourse, currentModuleIdx, currentAulaIdx, completedLessons, toggleLessonCompleted, handleNextAula]);

  // Ensure iframe listening for Vimeo events
  useEffect(() => {
    if (!iframeRef.current) return;
    const currentMod = activeCourse?.modulos[currentModuleIdx];
    const currentAula = currentMod?.aulas[currentAulaIdx] || activeCourse?.modulos[0]?.aulas[0];
    // Posta APENAS para a origem do player Vimeo (nunca "*")
    const targetOrigin = "https://player.vimeo.com";
    const timer = setTimeout(() => {
      try {
        iframeRef.current?.contentWindow?.postMessage('{"event":"listening","id":1}', targetOrigin);
        iframeRef.current?.contentWindow?.postMessage('{"method":"addEventListener","value":"finish"}', targetOrigin);
        iframeRef.current?.contentWindow?.postMessage('{"method":"addEventListener","value":"ended"}', targetOrigin);
      } catch (e) {}
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentModuleIdx, currentAulaIdx, activeCourse?.id]);

  // Window message listener for Vimeo video completion
  useEffect(() => {
    // Só aceita mensagens vindas do player Vimeo embutido.
    // Um iframe malicioso na página não consegue mais forjar "finish"/"ended"
    // para avançar aulas ou marcar aulas como concluídas.
    const PLAYER_ORIGINS = new Set([
      "https://player.vimeo.com"
    ]);
    const handleWindowMessage = (event: MessageEvent) => {
      try {
        if (!PLAYER_ORIGINS.has(event.origin)) return;
        let data = event.data;
        if (typeof data === "string" && (data.startsWith("{") || data.startsWith("["))) {
          data = JSON.parse(data);
        }
        if (!data || typeof data !== "object") return;

        // Vimeo ENDED
        const isVimeoEnded =
          data.event === "finish" ||
          data.event === "ended" ||
          data.event === "onFinish";

        if (isVimeoEnded) {
          console.log("[Escola Fênix] Vídeo finalizado via mensagem do iframe. Avançando para a próxima aula...");
          handleVideoEnd();
        }
      } catch (e) {
        // ignore invalid JSON
      }
    };

    window.addEventListener("message", handleWindowMessage);
    return () => {
      window.removeEventListener("message", handleWindowMessage);
    };
  }, [handleVideoEnd]);

  // HTML5 Video Events
  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || !activeCourse) return;
    const video = videoRef.current;
    
    const currentModule = activeCourse.modulos[currentModuleIdx];
    if (!currentModule) return;
    const currentAula = currentModule.aulas[currentAulaIdx];
    if (!currentAula) return;

    const currentSecs = video.currentTime;
    const totalSecs = video.duration;
    if (totalSecs > 0) {
      const percent = Math.round((currentSecs / totalSecs) * 100);
      
      debouncedSaveProgress(currentAula.id, percent);

      if (percent >= 95 && !completedLessons.includes(currentAula.id)) {
        toggleLessonCompleted(currentAula.id);
      }
    }
  };

  const handleStartContinueCourse = () => {
    if (!activeCourse) return;
    // Find first incomplete lesson, or play first lesson
    let targetModIdx = 0;
    let targetAulaIdx = 0;
    let found = false;

    for (let m = 0; m < activeCourse.modulos.length; m++) {
      const module = activeCourse.modulos[m];
      for (let a = 0; a < module.aulas.length; a++) {
        const aula = module.aulas[a];
        if (!completedLessons.includes(aula.id)) {
          targetModIdx = m;
          targetAulaIdx = a;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    handleLessonSelect(targetModIdx, targetAulaIdx);
    // Expand accordion for that module
    setOpenModules((prev) => ({ ...prev, [targetModIdx]: true }));
  };

  // Guard: Not Logged In
  if (!loggedIn) {
    return (
      <div id="escola-fenix-auth-guard" className="min-h-[70vh] flex flex-col items-center justify-center p-4">
        <LoginModal />
      </div>
    );
  }

  // Loading Restricted Data
  if (!restrictedData) {
    return (
      <div className="space-y-8 py-8 animate-pulse">
        <div className="h-6 w-32 bg-[#151b22] rounded"></div>
        <div className="h-10 w-64 bg-[#151b22] rounded"></div>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="h-44 bg-[#151b22] rounded-xl"></div>
          <div className="h-44 bg-[#151b22] rounded-xl"></div>
          <div className="h-44 bg-[#151b22] rounded-xl"></div>
        </div>
      </div>
    );
  }

  const { cursos } = restrictedData;

  // 1. DETAIL VIEW: If a course is selected
  if (activeCourse) {
    const totalAulas = activeCourse.modulos.reduce((sum, m) => sum + (m.aulas?.length || 0), 0);
    const isSingle = totalAulas <= 1;
    const activeModule = activeCourse.modulos[currentModuleIdx];
    const activeAula = activeModule?.aulas[currentAulaIdx] || activeCourse.modulos[0]?.aulas[0];

    // Compute progress
    const allLessonIds = activeCourse.modulos.flatMap((m) => m.aulas.map((a) => a.id));
    const finishedCount = allLessonIds.filter((id) => completedLessons.includes(id)).length;
    const progressPercent = allLessonIds.length > 0 ? Math.round((finishedCount / allLessonIds.length) * 100) : 0;

    // Helper to extract embed info for Vimeo or Direct Uploads
    const getVideoEmbedInfo = (url: string, tipoVideo?: string) => {
      if (!url) return { isEmbed: false, type: "upload", src: "" };
      const trimmed = url.trim();

      if (
        tipoVideo === "vimeo" ||
        trimmed.includes("vimeo.com") ||
        /^\d+$/.test(trimmed)
      ) {
        const parsed = parseVimeoInput(trimmed);
        if (parsed.isValid) {
          return {
            isEmbed: true,
            type: "vimeo",
            src: parsed.embedUrl
          };
        }
      }

      return { isEmbed: false, type: "upload", src: trimmed };
    };

    const embedInfo = activeAula ? getVideoEmbedInfo(activeAula.videoUrl, activeAula.tipoVideo) : null;

    return (
      <div id="course-detail-view" className="space-y-6 pb-12 animate-fade-in select-none -mt-6 sm:-mt-8 lg:-mt-10 -mx-4 sm:-mx-6 lg:-mx-10">
        {/* Layout Grid: 3 columns. Main Video & Info (2 cols) | Modules & Progress Sidebar (1 col) */}
        <div className={`${isSingle ? "grid grid-cols-1 gap-6" : "grid lg:grid-cols-3 gap-6 items-start"}`}>
          
          {/* Left Column (Video player + Lesson Details + Instructor) - 2 cols width */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Video Player Frame */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-white/5 shadow-2xl group/player">
              {/* Floating Back Button (overlay on the player) */}
              <button
                id="course-back-btn"
                onClick={() => setActiveCourse(null)}
                title="Voltar ao Catálogo"
                className="absolute top-3 left-3 z-30 flex items-center gap-1.5 text-xs font-semibold text-white bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
              {activeAula ? (
                embedInfo?.isEmbed ? (
                  <div className="relative w-full h-full">
                    <iframe
                      ref={iframeRef}
                      src={embedInfo.src}
                      className="w-full h-full border-0 relative z-10"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                      allowFullScreen
                      title={activeAula.titulo}
                    />
                    {/* Anti-redirect top bar click shield for Vimeo */}
                    {embedInfo.type === "vimeo" && (
                      <div 
                        className="absolute top-0 left-0 right-0 h-14 z-20 pointer-events-auto bg-transparent"
                        title="Fênix Escola - Player Protegido"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <CustomVideoPlayer
                    src={activeAula.videoUrl}
                    poster={activeCourse.imagem}
                    title={activeAula.titulo}
                    autoPlay
                    className="w-full h-full"
                  />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-[#8a96a3]">
                  Nenhuma aula selecionada.
                </div>
              )}
            </div>

            {/* Currently playing details & Navigation Controls */}
            {activeAula && (
              <div className="card-modern rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[10px] font-bold tracking-widest text-gold-metallic uppercase block">
                    Assistindo Agora
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {!isSingle && (
                      <>
                        <button
                          type="button"
                          onClick={handlePrevAula}
                          className="flex items-center gap-1 text-xs text-[#8a96a3] hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg transition-all border border-white/5 cursor-pointer"
                          title="Aula Anterior"
                        >
                          <SkipBack className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Anterior</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleNextAula}
                          className="flex items-center gap-1 text-xs text-[#e8edf2] hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-all border border-white/10 font-medium cursor-pointer"
                          title="Próxima Aula"
                        >
                          <span className="hidden sm:inline">Próxima</span>
                          <SkipForward className="w-3.5 h-3.5 text-[#d12a62]" />
                        </button>
                      </>
                    )}

                    <button
                      id={`toggle-complete-btn-${activeAula.id}`}
                      onClick={() => toggleLessonCompleted(activeAula.id)}
                      className="flex items-center gap-1.5 text-xs text-gold-metallic font-semibold border border-[#d12a62]/30 px-3 py-1 rounded-lg hover:bg-[#d12a62]/10 transition-all ml-1 cursor-pointer"
                    >
                      {completedLessons.includes(activeAula.id) ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-500 fill-green-500/20" />
                          Concluída!
                        </>
                      ) : (
                        <>
                          <Circle className="w-4 h-4" />
                          Marcar Concluída
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <h3 className="text-base md:text-xl font-bold text-white tracking-tight">
                  {activeAula.titulo}
                </h3>

                <div className="flex items-center gap-3 text-xs text-[#8a96a3]">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> Duração: {activeAula.duracao}
                  </span>
                  {lessonProgress[activeAula.id] !== undefined && (
                    <span className="text-amber-500 font-medium">
                      Última parada: {lessonProgress[activeAula.id]}% assistido
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Instructor Card Below Video */}
            {activeCourse.professorNome && (
            <div className="card-modern rounded-2xl p-6 space-y-4">
              <span className="text-[10px] font-bold tracking-widest text-[#8a96a3] uppercase block">
                Instrutor do Curso
              </span>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gold-metallic p-0.5 flex-shrink-0 shadow-lg shadow-[#d12a62]/10">
                  <div className="w-full h-full rounded-full bg-[#0b0f14] overflow-hidden">
                    <img
                      src={activeCourse.professorFoto || "/uploads/default_professor.jpg"}
                      alt={activeCourse.professorNome || "Instrutor"}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                </div>
                <div className="space-y-1 min-w-0">
                  <h5 className="text-base font-bold text-white tracking-tight leading-snug">
                    {activeCourse.professorNome || "Grupo Fênix"}
                  </h5>
                  <span className="text-xs font-semibold text-[#d12a62] uppercase tracking-wider block">
                    {activeCourse.professorEspecialidade || "Capacitação e Mentoria"}
                  </span>
                </div>
              </div>
              <p className="text-xs md:text-sm text-[#8a96a3] leading-relaxed border-t border-white/5 pt-4">
                {activeCourse.professorBio || "Mentores e especialistas em biohacking, bem-estar integrativo e desenvolvimento de liderança."}
              </p>
            </div>
            )}

            {/* Course Description / About */}
            {activeCourse.descricao && (
              <div className="card-modern rounded-2xl p-6 space-y-2">
                <h4 className="text-xs font-bold tracking-widest text-[#8a96a3] uppercase block">
                  Sobre este {isSingle ? (activeCourse.secao === "series" ? "Episódio" : "Treinamento") : "Curso"}
                </h4>
                <p className="text-xs md:text-sm text-[#e8edf2] leading-relaxed">
                  {activeCourse.descricao}
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Sidebar (Progress + Course Modules & Lessons list beside video) */}
          {!isSingle && (
          <div className="space-y-5 lg:sticky lg:top-24">
            
            {/* Progress Card */}
            <div className="card-modern rounded-2xl p-5 space-y-4">
              <h4 className="text-xs font-bold tracking-widest text-[#8a96a3] uppercase">
                Seu Progresso
              </h4>
              
              {progressPercent === 100 && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-400 text-xs rounded-xl flex items-center gap-2.5 animate-pulse">
                  <Award className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <div>
                    <p className="font-extrabold font-display">Curso Concluído!</p>
                    <p className="text-[10px] text-green-400/80">Você assistiu todas as aulas com sucesso.</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-black font-display text-white">
                    {progressPercent}%
                  </span>
                  <span className="text-xs text-[#8a96a3]">
                    {finishedCount} de {allLessonIds.length} aulas
                  </span>
                </div>
                <div className="w-full h-2 bg-[#2a323d] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold-metallic transition-all duration-700"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>

              <button
                id="continue-course-btn"
                onClick={handleStartContinueCourse}
                className="w-full btn-gold-metallic py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
              >
                <Play className="w-4 h-4 fill-current text-[#0b0f14]" />
                {progressPercent === 100 ? "Reassistir Curso" : progressPercent === 0 ? "Iniciar Curso" : "Continuar Assistindo"}
              </button>
            </div>

            {/* Modules & Lessons Accordion Sidebar (Side by side with video) */}
            <div className="card-modern rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <h3 className="text-xs font-bold font-display uppercase text-white tracking-wider flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#d12a62]" />
                  Conteúdo do Curso
                </h3>
                <span className="text-[10px] text-[#8a96a3] font-mono">
                  {activeCourse.modulos.length} módulos
                </span>
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                {activeCourse.modulos.map((modulo, mIdx) => {
                  const isOpen = !!openModules[mIdx];
                  return (
                    <div 
                      key={modulo.id}
                      className="border border-[#2a323d] rounded-xl bg-[#151b22]/50 overflow-hidden"
                    >
                      {/* Accordion Trigger */}
                      <button
                        onClick={() => toggleModuleAccordion(mIdx)}
                        className="w-full flex items-center justify-between p-3 bg-[#151b22] hover:bg-[#1f2730] transition-colors text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <BookOpen className="w-4 h-4 text-[#d12a62] flex-shrink-0" />
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white tracking-tight leading-snug truncate">
                              {modulo.titulo}
                            </h4>
                            <span className="text-[9px] text-[#8a96a3] block">
                              {modulo.aulas.length} aulas
                            </span>
                          </div>
                        </div>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-[#8a96a3] flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-[#8a96a3] flex-shrink-0" />}
                      </button>

                      {/* Accordion Content */}
                      {isOpen && (
                        <div className="divide-y divide-[#2a323d] bg-black/20">
                          {modulo.aulas.map((aula, aIdx) => {
                            const isCurrent = currentModuleIdx === mIdx && currentAulaIdx === aIdx;
                            const isCompleted = completedLessons.includes(aula.id);
                            return (
                              <div
                                key={aula.id}
                                className={`flex items-center justify-between p-2.5 pl-4 transition-colors ${
                                  isCurrent ? "bg-[#d12a62]/10 border-l-2 border-[#d12a62]" : "hover:bg-white/5"
                                }`}
                              >
                                <button
                                  id={`select-lesson-btn-${aula.id}`}
                                  onClick={() => handleLessonSelect(mIdx, aIdx)}
                                  className="flex items-start gap-2.5 flex-grow text-left cursor-pointer min-w-0"
                                >
                                  {isCompleted ? (
                                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5 fill-green-500/10" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-[#8a96a3] flex-shrink-0 mt-0.5" />
                                  )}
                                  <div className="min-w-0">
                                    <span className={`text-xs font-medium block truncate ${isCurrent ? "text-[#d12a62] font-semibold" : "text-[#e8edf2]"}`}>
                                      {aula.titulo}
                                    </span>
                                    <span className="text-[9px] text-[#8a96a3] block font-mono">
                                      {aula.duracao}
                                    </span>
                                  </div>
                                </button>

                                {isCurrent && (
                                  <span className="text-[8px] uppercase tracking-wider font-bold text-[#d12a62] px-1.5 py-0.5 bg-[#d12a62]/10 rounded border border-[#d12a62]/20 flex-shrink-0 ml-2">
                                    No Ar
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Help Support Panel */}
            <div className="p-4 rounded-xl border border-[#2a323d]/60 bg-[#151b22]/30 flex flex-col gap-2">
              <h5 className="text-xs font-bold text-white">Precisa de ajuda?</h5>
              <p className="text-[11px] text-[#8a96a3] leading-relaxed">
                Entre em contato com nossa equipe de suporte para tirar dúvidas pedagógicas ou técnicas.
              </p>
              <a 
                href="mailto:suporte@grupofenix.com.br"
                className="text-[11px] font-semibold text-[#d12a62] hover:underline flex items-center gap-1 w-max"
              >
                suporte@grupofenix.com.br <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          )}
        </div>
      </div>
    );
  }

  // 2. MAIN CATALOG LIST: seções estilo Netflix (linhas horizontais)
  const secaoOf = (c: Curso): Curso["secao"] =>
    c.secao === "series" || c.secao === "treinamentos" ? c.secao : "cursos";

  const SECOES: { key: Curso["secao"]; label: string; desc: string }[] = [
    { key: "cursos", label: "Cursos", desc: "Formações completas com várias aulas" },
    { key: "series", label: "Séries", desc: "Episódios únicos" },
    { key: "treinamentos", label: "Treinamentos", desc: "Lives gravadas do Vimeo" }
  ];

  return (
    <div id="course-catalog-view" className="space-y-8 pb-12 animate-fade-in select-none">
      {/* Restrict Page Indicator */}
      <div className="flex items-center gap-2 text-xs font-mono text-[#8a96a3]">
        <Lock className="w-3.5 h-3.5 text-amber-500" />
        <span>ÁREA RESTRITA ALUNOS</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="bg-gold-metallic text-[#0b0f14] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow shadow-[#d12a62]/10 w-max block">
            Escola Fênix
          </span>
          <h2 className="text-2xl md:text-4xl font-bold font-display text-white tracking-tight">
            Catálogo de Conteúdos
          </h2>
          <p className="text-xs md:text-sm text-[#8a96a3]">
            Explore cursos, séries e treinamentos de alto nível focados em escala, marketing e liderança.
          </p>
        </div>
      </div>

      {/* Seções estilo Netflix */}
      {SECOES.map(({ key, label, desc }) => {
        const items = cursos.filter((c) => secaoOf(c) === key);
        if (items.length === 0) return null;
        return (
          <section key={key} className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="text-lg md:text-2xl font-bold font-display text-white tracking-tight flex items-center gap-2.5">
                  <span className="w-1 h-5 md:h-6 bg-[#d12a62] rounded-full inline-block" />
                  {label}
                </h3>
                <p className="text-[11px] md:text-xs text-[#8a96a3] pl-3.5">{desc}</p>
              </div>
              <span className="text-[10px] font-mono text-[#8a96a3] shrink-0 pb-1">
                {items.length} {items.length === 1 ? "item" : "itens"}
              </span>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-slim snap-x snap-mandatory -mx-1 px-1">
              {items.map((curso) => (
                <div key={curso.id} className="w-[240px] md:w-[280px] flex-shrink-0 snap-start">
                  <ContentCard
                    id={curso.id}
                    titulo={curso.titulo}
                    imagem={curso.imagem}
                    categoria={curso.categoria}
                    tipo="course"
                    duracao={curso.duracao}
                    professorNome={curso.professorNome}
                    professorFoto={curso.professorFoto}
                    professorEspecialidade={curso.professorEspecialidade}
                    lessons={curso.modulos.flatMap((m) => m.aulas)}
                    onClick={() => {
                      setActiveCourse(curso);
                      // Autoexpand first module
                      setOpenModules({ "0": true });
                      setCurrentModuleIdx(0);
                      setCurrentAulaIdx(0);
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {cursos.length === 0 && (
        <div className="text-center py-12 rounded-2xl border border-dashed border-[#2a323d]">
          <span className="text-[#8a96a3] text-sm block">Nenhum conteúdo cadastrado ainda.</span>
        </div>
      )}
    </div>
  );
}
