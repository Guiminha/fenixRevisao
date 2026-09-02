import React, { useState } from "react";
import { Zap, Sparkles, Activity, Atom, Flame, Waves, Award, CheckCircle2, UserPlus, HelpCircle, Crown, Rocket, ShieldCheck, Moon, Target } from "lucide-react";
import type { PaginaBloco, PaginaBlocoCampos } from "../types";
import QueroFazerParteModal from "./QueroFazerParteModal";
import EliteMilionarioModal from "./EliteMilionarioModal";

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  flame: Flame,
  sparkles: Sparkles,
  zap: Zap,
  activity: Activity,
  waves: Waves,
  atom: Atom,
  award: Award,
  rocket: Rocket,
  shield: ShieldCheck,
  moon: Moon,
  target: Target,
  crown: Crown
};

const CORES: Record<string, { fg: string; bg: string; border: string; badge: string; glow: string; destaque: string; destaqueBorder: string; text: string }> = {
  amber: {
    fg: "text-amber-400",
    bg: "bg-amber-500/15 border-amber-500/30",
    border: "hover:border-amber-500/40",
    badge: "bg-amber-500/90 text-slate-950",
    glow: "shadow-amber-500/10",
    destaque: "bg-amber-500/10 border-amber-500/20 text-amber-200",
    destaqueBorder: "border-amber-500/20",
    text: "text-amber-400"
  },
  cyan: {
    fg: "text-cyan-400",
    bg: "bg-cyan-500/15 border-cyan-500/30",
    border: "hover:border-cyan-500/40",
    badge: "bg-cyan-500/90 text-slate-950",
    glow: "shadow-cyan-500/10",
    destaque: "bg-cyan-500/10 border-cyan-500/20 text-cyan-200",
    destaqueBorder: "border-cyan-500/20",
    text: "text-cyan-400"
  },
  rose: {
    fg: "text-rose-400",
    bg: "bg-rose-500/15 border-rose-500/30",
    border: "hover:border-rose-500/40",
    badge: "bg-rose-500/90 text-white",
    glow: "shadow-rose-500/10",
    destaque: "bg-rose-500/10 border-rose-500/20 text-rose-200",
    destaqueBorder: "border-rose-500/20",
    text: "text-rose-400"
  },
  indigo: {
    fg: "text-indigo-400",
    bg: "bg-indigo-500/15 border-indigo-500/30",
    border: "hover:border-indigo-500/40",
    badge: "bg-indigo-500/90 text-white",
    glow: "shadow-indigo-500/10",
    destaque: "bg-indigo-500/10 border-indigo-500/20 text-indigo-200",
    destaqueBorder: "border-indigo-500/20",
    text: "text-indigo-400"
  },
  rosa: {
    fg: "text-[#e63973]",
    bg: "bg-[#d12a62]/15 border-[#d12a62]/30",
    border: "hover:border-[#d12a62]/40",
    badge: "bg-[#d12a62]/90 text-white",
    glow: "shadow-[#d12a62]/10",
    destaque: "bg-white/[0.03] border-white/5 text-slate-300",
    destaqueBorder: "border-white/5",
    text: "text-[#e63973]"
  }
};

// Topo full-bleed: o primeiro bloco (banner/hero_banner) sai do contêiner
// max-w-6xl e usa margens negativas equivalentes ao padding do <main>, então
// preenche de ponta a ponta em qualquer largura de tela e encosta no topo.
const FULL_BLEED = "relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-10 -mt-6 sm:-mt-8 lg:-mt-10";

function Icone({ nome, className }: { nome?: string; className?: string }) {
  const C = nome ? ICONES[nome] : undefined;
  if (!C) return null;
  return <C className={className} />;
}

const FALLBACK_IMG = "/uploads/hero_phoenix_city_1785160165470.jpg";

// Imagem de bloco com fallback controlado por estado (evita loop de requisições
// quando a mídia original (ex.: MinIO) está fora).
function BlocoImg({ src, alt, className }: { src?: string; alt?: string; className?: string }) {
  const [errou, setErrou] = useState(false);
  const final = errou || !src ? FALLBACK_IMG : src;
  return (
    <img
      src={final}
      alt={alt || ""}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setErrou(true)}
    />
  );
}

export default function PaginaBlocos({ blocos, ctaModal = "queroFazerParte", preview = false, coverSemTexto = false }: { blocos: PaginaBloco[]; ctaModal?: "queroFazerParte" | "elite"; preview?: boolean; coverSemTexto?: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEliteModalOpen, setIsEliteModalOpen] = useState(false);

  const ativos = blocos.filter((b) => b.ativo).sort((a, b) => a.ordem - b.ordem);
  const topo = ativos[0] || null;
  // Blocos de topo (banner / hero_banner) são full-bleed quando são o 1º da página.
  const topoFullBleed = !!topo && (topo.tipo === "hero_banner" || topo.tipo === "banner");
  const resto = topoFullBleed ? ativos.slice(1) : ativos;

  const renderBloco = (bloco: PaginaBloco, index: number, fullBleedTop: boolean) => {
    const campos = bloco.campos;
    const cor = CORES[campos.cor || "rosa"] || CORES.rosa;
    const textos = campos.textos || [];

    switch (bloco.tipo) {
      case "banner":
        return (
          <header
            key={bloco.id}
            className={fullBleedTop
              ? `${FULL_BLEED} bg-gradient-to-br from-slate-900/90 via-[#1e1b2e]/90 to-slate-900/90 p-8 sm:p-12 text-slate-100`
              : "relative overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-900/90 via-[#1e1b2e]/90 to-slate-900/90 p-8 sm:p-12 shadow-2xl backdrop-blur-md border-white/10 text-slate-100"}
          >
            <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 rounded-full bg-[#d12a62]/10 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
            <div className="relative z-10 space-y-6">
              {campos.badge && (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#d12a62]/15 border border-[#d12a62]/30 text-[#e63973] text-[clamp(0.625rem,0.8vw,0.875rem)] font-semibold tracking-wider uppercase animate-fade-in-up">
                  <Award className="w-4 h-4" />
                  <span>{campos.badge}</span>
                </div>
              )}
              <h1 className="text-[clamp(1.75rem,3.5vw,5rem)] font-extrabold tracking-tight text-white font-display leading-tight">
                {campos.titulo}
                {campos.tituloDestaque && (
                  <span className="bg-gradient-to-r from-white via-slate-200 to-[#e63973] bg-clip-text text-transparent">{campos.tituloDestaque}</span>
                )}
              </h1>
              {textos[0] && (
                <p className="text-[clamp(0.875rem,1.4vw,1.5rem)] text-slate-300 leading-relaxed max-w-3xl font-light">{textos[0]}</p>
              )}
              {textos.length > 1 && (
                <div className="pt-2 flex flex-wrap items-center gap-6 text-[clamp(0.75rem,1vw,0.875rem)] text-slate-400 border-t border-white/10">
                  {textos.slice(1).map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {fullBleedTop && (
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b0f14] to-transparent pointer-events-none" />
            )}
          </header>
        );

      case "hero_header":
        return (
          <section key={bloco.id} className="flex items-center gap-6 p-6 rounded-3xl border bg-slate-900/40 border-white/5">
            <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border flex items-center justify-center shrink-0 shadow-xl ${cor.bg} ${cor.glow}`}>
              <Icone nome={campos.icone} className={`w-12 h-12 sm:w-14 sm:h-14 ${cor.fg}`} />
            </div>
            <div className="space-y-1">
              {campos.eyebrow && <span className={`text-xs sm:text-sm font-bold tracking-widest uppercase block ${cor.fg}`}>{campos.eyebrow}</span>}
              <h2 className="text-2xl sm:text-4xl font-bold text-white font-display">{campos.titulo}</h2>
              {textos.map((t, i) => (
                <p key={i} className="text-sm sm:text-base max-w-3xl text-slate-300">{t}</p>
              ))}
            </div>
          </section>
        );

      case "card_tecnologia": {
        const imagemEsquerda = index % 2 === 0;
        const conteudo = renderCardConteudo(campos, cor);
        return (
          <div key={bloco.id} className={`rounded-3xl border border-white/10 bg-slate-900/70 overflow-hidden shadow-2xl transition-all duration-300 ${cor.border}`}>
            <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
              <div className={`lg:col-span-7 p-6 sm:p-10 space-y-4 ${imagemEsquerda ? "order-2 lg:order-1" : "order-2"}`}>
                {conteudo}
              </div>
              {campos.imagem && (
                <div className={`lg:col-span-5 relative h-64 lg:h-full min-h-[280px] ${imagemEsquerda ? "order-1" : "order-1 lg:order-2"}`}>
                  <BlocoImg
                    src={campos.imagem}
                    alt={campos.imagemAlt || ""}
                    className="w-full h-full object-cover"
                  />
                  <div className={`absolute inset-0 from-slate-900/80 via-transparent to-transparent ${imagemEsquerda ? "bg-gradient-to-t" : "bg-gradient-to-t lg:bg-gradient-to-l"}`} />
                  {campos.badge && (
                    <span className={`absolute top-4 ${imagemEsquerda ? "left-4" : "right-4"} text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl shadow-lg backdrop-blur-md ${cor.badge}`}>
                      {campos.badge}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }

      case "texto":
        return (
          <section key={bloco.id} className="card-modern rounded-3xl p-8 sm:p-10 space-y-4 shadow-xl border bg-[#0f141c]/90 border-white/10">
            {campos.eyebrow && (
              <span className="text-xs font-bold tracking-[0.2em] uppercase block text-amber-400">{campos.eyebrow}</span>
            )}
            {textos.length === 0 && campos.titulo ? (
              <p className="text-lg sm:text-2xl font-bold leading-relaxed font-display text-white">{campos.titulo}</p>
            ) : (
              campos.titulo && (
                <h2 className="text-xl sm:text-2xl font-extrabold font-display text-white">{campos.titulo}</h2>
              )
            )}
            {textos.map((t, i) => (
              <p key={i} className="text-base sm:text-lg leading-relaxed text-slate-300">{t}</p>
            ))}
          </section>
        );

      case "imagem":
        return (
          <div key={bloco.id} className="relative rounded-3xl overflow-hidden shadow-2xl group border border-amber-500/30">
            <BlocoImg
              src={campos.imagem}
              alt={campos.imagemAlt || ""}
              className="w-full h-[280px] sm:h-[400px] md:h-[480px] object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f14] via-black/20 to-transparent" />
            {campos.legenda && (
              <div className="absolute bottom-6 left-6 right-6 sm:bottom-8 sm:left-8 sm:right-8 backdrop-blur-md p-4 sm:p-6 rounded-2xl border bg-[#0d1218]/80 border-white/10">
                <p className="text-xs sm:text-sm font-semibold text-amber-300">{campos.legenda}</p>
              </div>
            )}
          </div>
        );

      case "destaque":
        return (
          <section key={bloco.id} className="card-modern rounded-3xl p-8 sm:p-10 space-y-4 flex flex-col justify-center text-center shadow-2xl bg-gradient-to-br from-[#1a140b] via-[#0d1218] to-[#120a07] border border-amber-500/40">
            {campos.destaqueTitulo && (
              <h3 className="text-2xl sm:text-3xl font-black font-display text-amber-300">{campos.destaqueTitulo}</h3>
            )}
            {campos.destaqueTexto && (
              <p className="text-base sm:text-lg text-slate-200 font-medium leading-relaxed">{campos.destaqueTexto}</p>
            )}
          </section>
        );

      case "cta":
        return (
          <section key={bloco.id} className="relative overflow-hidden rounded-3xl border p-8 sm:p-12 text-center space-y-6 shadow-2xl backdrop-blur-md bg-gradient-to-br from-slate-900/90 via-[#1e1422]/90 to-slate-900/90 border-white/10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#d12a62]/10 blur-3xl pointer-events-none" />
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-3xl mx-auto space-y-5">
              {campos.badge && (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold tracking-wider uppercase bg-[#d12a62]/15 border-[#d12a62]/30 text-[#e63973]">
                  <UserPlus className="w-4 h-4" />
                  <span>{campos.badge}</span>
                </div>
              )}
              {campos.titulo && (
                <h2 className="text-2xl sm:text-4xl font-extrabold text-white font-display leading-tight">{campos.titulo}</h2>
              )}
              {textos.map((t, i) => (
                <p key={i} className="text-sm sm:text-base text-slate-300 leading-relaxed font-light">{t}</p>
              ))}
              <div className="pt-2 flex justify-center">
                <button
                  onClick={() => {
                    if (preview) return;
                    if (ctaModal === "elite") setIsEliteModalOpen(true);
                    else setIsModalOpen(true);
                  }}
                  className="btn-gold-metallic px-8 sm:px-12 py-4 rounded-xl text-sm sm:text-base font-bold shadow-2xl inline-flex items-center gap-2.5 hover:scale-[1.03] transition-transform"
                >
                  {ctaModal === "elite" ? <Crown className="w-5 h-5 text-[#0b0f14]" /> : <UserPlus className="w-5 h-5" />}
                  <span>{campos.botaoTexto || "Quero fazer parte!"}</span>
                </button>
              </div>
              {campos.notaTexto && (
                <p className="text-xs text-slate-400 font-medium">{campos.notaTexto}</p>
              )}
            </div>
          </section>
        );

      case "hero_banner":
        return (
          <section
            key={bloco.id}
            className={fullBleedTop
              ? `${FULL_BLEED} bg-[#07090e]`
              : "relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl bg-[#07090e]"}
          >
            {campos.imagem ? (
              <div className="relative w-full aspect-[21/9] min-h-[240px] sm:min-h-[300px]">
                <BlocoImg
                  src={campos.imagem}
                  alt={campos.imagemAlt || ""}
                  className="w-full h-full object-cover object-top"
                />
                {!coverSemTexto && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f14] via-[#0b0f14]/20 to-black/25" />
                    <div className="absolute inset-x-0 bottom-10 sm:bottom-14 px-6 sm:px-12 text-center">
                      {campos.badge && (
                        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[clamp(0.625rem,0.8vw,0.875rem)] font-mono font-bold tracking-widest uppercase backdrop-blur-md shadow-lg shadow-amber-500/10">
                          <Crown className="w-4 h-4" />
                          {campos.badge}
                        </span>
                      )}
                      {campos.titulo && (
                        <h1 className="mt-4 text-[clamp(1.75rem,3.5vw,5rem)] font-black text-white font-display tracking-tight drop-shadow-lg">
                          {campos.titulo}{" "}
                          {campos.tituloDestaque && (
                            <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(251,191,36,0.25)]">
                              {campos.tituloDestaque}
                            </span>
                          )}
                        </h1>
                      )}
                      {textos[0] && (
                        <p className="mt-3 mx-auto max-w-3xl text-[clamp(0.875rem,1.4vw,1.5rem)] text-slate-200 font-medium drop-shadow">{textos[0]}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="relative w-full h-56 sm:h-72 bg-gradient-to-br from-[#121721] via-[#0f131a] to-[#07090e] flex flex-col items-center justify-center p-8 text-center">
                {campos.badge && (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[clamp(0.625rem,0.8vw,0.875rem)] font-mono font-bold tracking-widest uppercase">
                    <Crown className="w-4 h-4" />
                    {campos.badge}
                  </span>
                )}
                {campos.titulo && (
                  <h1 className="mt-4 text-[clamp(1.75rem,3.5vw,5rem)] font-black text-white font-display tracking-tight">
                    {campos.titulo} <span className="bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">{campos.tituloDestaque}</span>
                  </h1>
                )}
                {textos[0] && <p className="mt-3 max-w-3xl text-[clamp(0.875rem,1.4vw,1.5rem)] text-slate-300">{textos[0]}</p>}
              </div>
            )}
            {(fullBleedTop || (coverSemTexto && campos.imagem)) && (
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b0f14] to-transparent pointer-events-none" />
            )}
          </section>
        );

      case "lista":
        return (
          <section key={bloco.id} className="card-modern rounded-3xl p-6 md:p-10 border border-white/10 bg-gradient-to-r from-slate-900/90 via-[#0a0d14] to-slate-900/90 shadow-2xl space-y-8">
            <div className="text-center space-y-2">
              {campos.eyebrow && (
                <span className="text-xs font-bold tracking-widest text-[#d12a62] uppercase block">{campos.eyebrow}</span>
              )}
              {campos.titulo && <h3 className="text-2xl md:text-3xl font-bold text-white font-display">{campos.titulo}</h3>}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {(campos.itens || []).map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <CheckCircle2 className="w-5 h-5 text-[#d12a62] shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-200">{item}</span>
                </div>
              ))}
            </div>
          </section>
        );

      case "faq":
        return (
          <section key={bloco.id} className="space-y-6">
            <div className="text-center space-y-2">
              {campos.eyebrow && (
                <span className="text-xs font-bold tracking-widest text-[#d12a62] uppercase block">{campos.eyebrow}</span>
              )}
              {campos.titulo && <h3 className="text-2xl md:text-3xl font-bold text-white font-display">{campos.titulo}</h3>}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {(campos.faq || []).map((item, i) => (
                <div key={i} className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
                  <h4 className="text-sm md:text-base font-bold text-white flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-[#d12a62] shrink-0 mt-1" />
                    <span>{item.q}</span>
                  </h4>
                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed pl-6">{item.a}</p>
                </div>
              ))}
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {topoFullBleed && renderBloco(topo, 0, true)}
      <div className={`max-w-6xl mx-auto space-y-16${topoFullBleed ? " mt-16" : " pt-6 sm:pt-8 lg:pt-10"}`}>
        {resto.map((bloco, idx) => renderBloco(bloco, topoFullBleed ? idx + 1 : idx, false))}
      </div>

      {!preview && (
        <>
          <QueroFazerParteModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
          />

          <EliteMilionarioModal
            isOpen={isEliteModalOpen}
            onClose={() => setIsEliteModalOpen(false)}
          />
        </>
      )}
    </>
  );
}

function renderCardConteudo(campos: PaginaBlocoCampos, cor: (typeof CORES)[keyof typeof CORES]) {
  const textos = campos.textos || [];
  return (
    <>
      <div className="flex items-center gap-5 mb-2">
        <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border flex items-center justify-center shrink-0 shadow-lg ${cor.bg} ${cor.glow}`}>
          <Icone nome={campos.icone} className={`w-12 h-12 sm:w-14 sm:h-14 ${cor.fg}`} />
        </div>
        <div>
          {campos.eyebrow && <span className={`text-xs sm:text-sm font-semibold uppercase tracking-wider block ${cor.fg}`}>{campos.eyebrow}</span>}
          <h3 className="text-2xl sm:text-3xl font-bold text-white font-display">{campos.titulo}</h3>
        </div>
      </div>
      {textos.map((t: string, i: number) => (
        <p key={i} className="text-sm sm:text-base text-slate-300 leading-relaxed">{t}</p>
      ))}
      {campos.destaqueTitulo && (
        <div className={`p-4 rounded-xl border text-xs sm:text-sm ${cor.destaque}`}>
          <strong className={`font-semibold block ${cor.text}`}>{campos.destaqueTitulo}</strong>
          {campos.destaqueTexto}
        </div>
      )}
      {campos.notaTexto && (
        <div className="text-xs text-slate-400">{campos.notaTexto}</div>
      )}
    </>
  );
}