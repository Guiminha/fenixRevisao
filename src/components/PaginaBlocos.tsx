import React, { useState } from "react";
import { Zap, Sparkles, Activity, Atom, Flame, Waves, Award, CheckCircle2, UserPlus, HelpCircle, Crown, Rocket, ShieldCheck, Moon, Target } from "lucide-react";
import type { PaginaBloco, PaginaBlocoCampos } from "../types";
import QueroFazerParteModal from "./QueroFazerParteModal";
import EliteMilionarioModal from "./EliteMilionarioModal";

// Ícones ilustrativos (limpos, usados de forma elegante e pequena).
const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  flame: Flame, sparkles: Sparkles, zap: Zap, activity: Activity, waves: Waves,
  atom: Atom, award: Award, rocket: Rocket, shield: ShieldCheck, moon: Moon,
  target: Target, crown: Crown
};

// Paleta da marca mantida (acentos de texto/cor).
const CORES: Record<string, { fg: string; text: string; blob: string; ring: string }> = {
  amber: { fg: "text-amber-400", text: "text-amber-300", blob: "bg-amber-500/20", ring: "border-amber-400/30" },
  cyan: { fg: "text-cyan-400", text: "text-cyan-300", blob: "bg-cyan-500/20", ring: "border-cyan-400/30" },
  rose: { fg: "text-rose-400", text: "text-rose-300", blob: "bg-rose-500/20", ring: "border-rose-400/30" },
  indigo: { fg: "text-indigo-400", text: "text-indigo-300", blob: "bg-indigo-500/20", ring: "border-indigo-400/30" },
  rosa: { fg: "text-[#e63973]", text: "text-[#ff719e]", blob: "bg-[#d12a62]/20", ring: "border-[#ff719e]/30" }
};

// Topo full-bleed: o primeiro bloco (banner/hero_banner) sai do contêiner.
const FULL_BLEED = "relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-10 -mt-6 sm:-mt-8 lg:-mt-10";

function Icone({ nome, className }: { nome?: string; className?: string }) {
  const C = nome ? ICONES[nome] : undefined;
  if (!C) return null;
  return <C className={className} />;
}

const FALLBACK_IMG = "/uploads/hero_phoenix_city_1785160165470.jpg";

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

// Elementos decorativos de fundo (formas geométricas + blobs de gradiente).
function FundoDecorativo({ cor }: { cor: string }) {
  const c = CORES[cor] || CORES.rosa;
  return (
    <>
      <div className={`absolute -top-16 -right-16 w-64 h-64 rounded-full ${c.blob} blur-3xl pointer-events-none`} />
      <div className="absolute -bottom-20 -left-16 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className={`absolute top-8 left-8 w-24 h-24 rounded-full ${c.ring} border opacity-30 pointer-events-none`} />
      <div className="absolute bottom-8 right-10 w-14 h-14 rounded-full border border-white/10 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full border border-white/[0.04] pointer-events-none" />
    </>
  );
}

export default function PaginaBlocos({
  blocos,
  ctaModal = "queroFazerParte",
  preview = false,
  coverSemTexto = false
}: {
  blocos: PaginaBloco[];
  ctaModal?: "queroFazerParte" | "elite";
  preview?: boolean;
  coverSemTexto?: boolean;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEliteModalOpen, setIsEliteModalOpen] = useState(false);

  const ativos = blocos.filter((b) => b.ativo).sort((a, b) => a.ordem - b.ordem);
  const topo = ativos[0] || null;
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
            className={
              fullBleedTop
                ? `${FULL_BLEED} relative overflow-hidden bg-gradient-to-br from-[#0b0f14] via-[#1a1020] to-[#0b0f14] px-6 py-14 sm:px-12 sm:py-20 text-slate-100`
                : "relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0b0f14] via-[#1a1020] to-[#0b0f14] px-6 py-14 sm:px-12 sm:py-20 text-slate-100"
            }
          >
            <FundoDecorativo cor={cor ? cor.fg ? "rosa" : campos.cor || "rosa" : "rosa"} />
            <div className="absolute top-0 right-0 -mt-24 -mr-24 w-[28rem] h-[28rem] rounded-full bg-[#d12a62]/10 blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-4xl mx-auto text-center space-y-6">
              {/* Título em caixa alta (remove traço residual " — " do dado, se houver) */}
              <h1 className="text-[clamp(1.4rem,3.9vw,4.55rem)] font-black uppercase tracking-tight text-white font-display leading-[1.1] whitespace-normal md:whitespace-nowrap">
                {(campos.titulo || "").replace(/\s*[—–-]\s*$/, "").trim()}
              </h1>
              {/* Subtítulo logo abaixo do título */}
              {campos.tituloDestaque && (
                <p className="text-[clamp(1.43rem,2.34vw,2.08rem)] font-semibold bg-gradient-to-r from-white via-slate-200 to-[#ff719e] bg-clip-text text-transparent">
                  {campos.tituloDestaque}
                </p>
              )}
              {/* Espaço antes do badge */}
              {campos.badge && (
                <div className="pt-4">
                  <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#d12a62]/15 border border-[#d12a62]/25 text-[#ff719e] text-[clamp(0.75rem,1vw,0.9rem)] font-semibold tracking-[0.15em] uppercase">
                    <Sparkles className="w-3.5 h-3.5" />
                    {campos.badge}
                  </span>
                </div>
              )}
              {/* Parágrafo normal */}
              {textos[0] && (
                <p className="text-[clamp(1rem,1.5vw,1.4rem)] text-slate-300 leading-relaxed max-w-3xl mx-auto font-light">{textos[0]}</p>
              )}
              {textos.length > 1 && (
                <div className="pt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[clamp(0.875rem,1.1vw,1rem)] text-slate-400">
                  {textos.slice(1).map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#ff719e] to-[#d12a62] shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {fullBleedTop && (
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0b0f14] to-transparent pointer-events-none" />
            )}
          </header>
        );

      case "hero_banner":
        return (
          <section key={bloco.id} className={fullBleedTop ? `${FULL_BLEED} bg-[#07090e]` : "relative overflow-hidden rounded-[2rem] bg-[#07090e]"}>
            {campos.imagem ? (
              <div className="relative w-full aspect-[21/9] min-h-[240px] sm:min-h-[300px]">
                <BlocoImg src={campos.imagem} alt={campos.imagemAlt || ""} className="w-full h-full object-contain md:object-cover md:object-top" />
                {!coverSemTexto && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f14]/85 via-[#0b0f14]/25 to-black/20" />
                    <div className="absolute inset-x-0 bottom-10 sm:bottom-14 px-6 sm:px-12 text-center">
                      {campos.badge && (
                        <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[clamp(0.625rem,0.8vw,0.875rem)] font-mono font-bold tracking-widest uppercase backdrop-blur-md shadow-lg shadow-amber-500/10">
                          {campos.badge}
                        </span>
                      )}
                      {campos.titulo && (
                        <h1 className="mt-4 text-[clamp(1.75rem,3.6vw,5rem)] font-black text-white font-display tracking-tight leading-[1.05] drop-shadow-lg">
                          {campos.titulo}{" "}
                          {campos.tituloDestaque && (
                            <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(251,191,36,0.25)]">{campos.tituloDestaque}</span>
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
              <div className="relative w-full h-56 sm:h-72 bg-gradient-to-br from-[#121721] via-[#0f131a] to-[#07090e] flex flex-col items-center justify-center p-8 text-center overflow-hidden">
                <FundoDecorativo cor={campos.cor || "rosa"} />
                <div className="relative z-10">
                  {campos.badge && (
                    <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[clamp(0.625rem,0.8vw,0.875rem)] font-mono font-bold tracking-widest uppercase">{campos.badge}</span>
                  )}
                  {campos.titulo && (
                    <h1 className="mt-4 text-[clamp(1.75rem,3.6vw,5rem)] font-black text-white font-display tracking-tight">
                      {campos.titulo} <span className="bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">{campos.tituloDestaque}</span>
                    </h1>
                  )}
                  {textos[0] && <p className="mt-3 max-w-3xl text-[clamp(0.875rem,1.4vw,1.5rem)] text-slate-300">{textos[0]}</p>}
                </div>
              </div>
            )}
            {(fullBleedTop || (coverSemTexto && campos.imagem)) && (
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b0f14] to-transparent pointer-events-none" />
            )}
          </section>
        );

      case "hero_header":
        return (
          <section key={bloco.id} className="relative mx-auto max-w-4xl text-center px-4 sm:px-6 py-10 sm:py-12 space-y-4">
            <FundoDecorativo cor={campos.cor || "rosa"} />
            <div className="relative z-10 flex flex-col items-center gap-4">
              {campos.icone && (
                <span className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center ${cor.blob} border ${cor.ring}`}>
                  <Icone nome={campos.icone} className={`w-7 h-7 ${cor.fg}`} />
                </span>
              )}
              <div className="space-y-3">
                {campos.eyebrow && <span className={`text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block ${cor.fg}`}>{campos.eyebrow}</span>}
                <h2 className="text-[clamp(1.75rem,3.2vw,3.5rem)] font-bold text-white font-display tracking-tight leading-[1.1]">{campos.titulo}</h2>
                {textos.map((t, i) => (
                  <p key={i} className="text-[clamp(1rem,1.5vw,1.25rem)] max-w-2xl mx-auto text-slate-300 leading-relaxed">{t}</p>
                ))}
              </div>
            </div>
          </section>
        );

      case "card_tecnologia": {
        const imagemEsquerda = index % 2 === 0;
        return (
          <div key={bloco.id} className="relative overflow-hidden rounded-[1.5rem] border border-white/[0.06] bg-[#0d1117]/70 shadow-xl min-h-[280px]">
            <FundoDecorativo cor={campos.cor || "rosa"} />
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 items-center gap-8 lg:gap-10 p-6 sm:p-10">
              <div className={`lg:col-span-7 space-y-4 text-center lg:text-left ${imagemEsquerda ? "order-2 lg:order-1" : "order-2"}`}>
                <div className="flex items-center justify-center lg:justify-start gap-4">
                  {campos.icone && (
                    <span className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center ${cor.blob} border ${cor.ring}`}>
                      <Icone nome={campos.icone} className={`w-7 h-7 ${cor.fg}`} />
                    </span>
                  )}
                  <div className="space-y-1">
                    {campos.eyebrow && <span className={`text-[clamp(0.75rem,1vw,0.9rem)] font-bold uppercase tracking-[0.2em] block ${cor.fg}`}>{campos.eyebrow}</span>}
                    {campos.titulo && <h3 className="text-[clamp(1.5rem,2.8vw,2.75rem)] font-bold text-white font-display tracking-tight leading-[1.1]">{campos.titulo}</h3>}
                  </div>
                </div>
                {textos.map((t, i) => (
                  <p key={i} className="text-[clamp(1rem,1.5vw,1.2rem)] text-slate-300 leading-relaxed">{t}</p>
                ))}
                {campos.destaqueTitulo && (
                  <div className="mt-5 pt-5 border-t border-white/[0.06] space-y-1.5">
                    <strong className={`font-semibold block text-[clamp(1rem,1.4vw,1.2rem)] ${cor.text}`}>{campos.destaqueTitulo}</strong>
                    {campos.destaqueTexto && <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{campos.destaqueTexto}</p>}
                  </div>
                )}
                {campos.notaTexto && <p className="text-xs text-slate-400 pt-2">{campos.notaTexto}</p>}
              </div>
              {campos.imagem && (
                <div className={`lg:col-span-5 relative ${imagemEsquerda ? "order-1" : "order-1 lg:order-2"}`}>
                  <div className={`absolute -inset-3 rounded-[2rem] ${cor.blob} opacity-40 blur-2xl pointer-events-none`} />
                  <div className="relative overflow-hidden rounded-[1.5rem] shadow-2xl border border-white/10">
                    <BlocoImg src={campos.imagem} alt={campos.imagemAlt || ""} className="w-full h-full min-h-[260px] object-cover" />
                    {campos.badge && (
                      <span className={`absolute top-4 ${imagemEsquerda ? "left-4" : "right-4"} text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md ${cor.text} bg-black/40 border border-white/15`}>{campos.badge}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      }

      case "texto":
        return (
          <section key={bloco.id} className="relative mx-auto max-w-3xl text-center px-4 sm:px-6 py-8 sm:py-10 space-y-4">
            <FundoDecorativo cor="dourado" />
            <div className="relative z-10 space-y-4">
              {campos.eyebrow && <span className="text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block text-amber-400">{campos.eyebrow}</span>}
              {campos.titulo && <h2 className="text-[clamp(1.5rem,2.8vw,2.75rem)] font-extrabold font-display text-white tracking-tight">{campos.titulo}</h2>}
              {textos.map((t, i) => (
                <p key={i} className="text-[clamp(1rem,1.5vw,1.25rem)] leading-relaxed text-slate-300">{t}</p>
              ))}
            </div>
          </section>
        );

      case "imagem":
        return (
          <div key={bloco.id} className="relative py-6">
            <div className="relative overflow-hidden rounded-[1.5rem] shadow-2xl border border-white/10">
              <BlocoImg src={campos.imagem} alt={campos.imagemAlt || ""} className="w-full h-auto md:h-[480px] object-contain md:object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f14]/90 via-transparent to-transparent" />
              {campos.legenda && (
                <div className="absolute inset-x-0 bottom-0 px-6 sm:px-8 py-5 sm:py-7">
                  <p className="text-sm sm:text-base font-semibold text-amber-300">{campos.legenda}</p>
                </div>
              )}
            </div>
          </div>
        );

      case "lista":
        return (
          <section key={bloco.id} className="relative mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 space-y-6 text-center">
            <FundoDecorativo cor="dourado" />
            <div className="relative z-10 space-y-6">
              <div className="space-y-2">
                {campos.eyebrow && <span className="text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block text-[#ff719e]">{campos.eyebrow}</span>}
                {campos.titulo && <h3 className="text-[clamp(1.5rem,2.8vw,2.75rem)] font-bold text-white font-display tracking-tight">{campos.titulo}</h3>}
              </div>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-left">
                {(campos.itens || []).map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#d12a62] shrink-0 mt-0.5" />
                    <span className="text-[clamp(0.95rem,1.3vw,1.1rem)] text-slate-200 leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );

      case "faq":
        return (
          <section key={bloco.id} className="relative mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 space-y-6 text-center">
            <FundoDecorativo cor="rosa" />
            <div className="relative z-10 space-y-6">
              <div className="space-y-2">
                {campos.eyebrow && <span className="text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block text-[#ff719e]">{campos.eyebrow}</span>}
                {campos.titulo && <h3 className="text-[clamp(1.5rem,2.8vw,2.75rem)] font-bold text-white font-display tracking-tight">{campos.titulo}</h3>}
              </div>
              <div className="divide-y divide-white/[0.06] text-left max-w-3xl mx-auto">
                {(campos.faq || []).map((item, i) => (
                  <div key={i} className="py-6 flex items-start gap-3">
                    <HelpCircle className="w-5 h-5 text-[#d12a62] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-base sm:text-lg font-bold text-white">{item.q}</h4>
                      <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{item.a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );

      case "destaque":
        return (
          <section key={bloco.id} className="relative overflow-hidden rounded-[2rem] px-6 sm:px-12 py-16 sm:py-24 text-center">
            <FundoDecorativo cor="dourado" />
            <div className="relative z-10 max-w-4xl mx-auto space-y-4">
              {campos.destaqueTitulo && (
                <h3 className="text-[clamp(1.75rem,3.2vw,3.5rem)] font-black font-display bg-gradient-to-r from-amber-200 via-amber-300 to-amber-500 bg-clip-text text-transparent tracking-tight">{campos.destaqueTitulo}</h3>
              )}
              {campos.destaqueTexto && <p className="text-[clamp(1rem,1.5vw,1.35rem)] text-slate-200 font-medium leading-relaxed max-w-3xl mx-auto">{campos.destaqueTexto}</p>}
            </div>
          </section>
        );

      case "cta":
        return (
          <section key={bloco.id} className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0b0f14] via-[#1a1020] to-[#0b0f14] px-6 py-14 sm:px-12 sm:py-20 text-center space-y-6">
            <FundoDecorativo cor="rosa" />
            <div className="relative z-10 max-w-3xl mx-auto space-y-5">
              {campos.badge && (
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#d12a62]/15 border border-[#d12a62]/25 text-[#ff719e] text-[clamp(0.625rem,0.8vw,0.875rem)] font-semibold tracking-[0.2em] uppercase">
                  <UserPlus className="w-3.5 h-3.5" />
                  {campos.badge}
                </span>
              )}
              {campos.titulo && <h2 className="text-[clamp(1.75rem,3.2vw,3.5rem)] font-extrabold text-white font-display leading-tight">{campos.titulo}</h2>}
              {textos.map((t, i) => (
                <p key={i} className="text-[clamp(1rem,1.5vw,1.2rem)] text-slate-300 leading-relaxed font-light">{t}</p>
              ))}
              <div className="pt-4 flex justify-center">
                <button
                  onClick={() => {
                    if (preview) return;
                    if (ctaModal === "elite") setIsEliteModalOpen(true);
                    else setIsModalOpen(true);
                  }}
                  className="btn-gold-metallic px-10 sm:px-14 py-4 rounded-xl text-sm sm:text-base font-bold shadow-2xl hover:scale-[1.03] transition-transform inline-flex items-center gap-2.5"
                >
                  {ctaModal === "elite" ? <Crown className="w-5 h-5 text-[#0b0f14]" /> : <UserPlus className="w-5 h-5" />}
                  {campos.botaoTexto || "Quero fazer parte!"}
                </button>
              </div>
              {campos.notaTexto && <p className="text-xs text-slate-400 font-medium">{campos.notaTexto}</p>}
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="relative bg-[#0b0f14] overflow-hidden">
        {/* Degradê de fundo global e discreto (nas cores da marca) — atrás de todo o conteúdo */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[50rem] h-[50rem] rounded-full bg-[#d12a62]/8 blur-3xl" />
          <div className="absolute top-1/3 -left-40 w-[36rem] h-[36rem] rounded-full bg-amber-500/5 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[40rem] h-[40rem] rounded-full bg-[#ff719e]/5 blur-3xl" />
        </div>
        <div className="relative z-10">
          {topoFullBleed && renderBloco(topo, 0, true)}
          <div className={`max-w-5xl mx-auto space-y-12 sm:space-y-16 px-4 sm:px-6${topoFullBleed ? " mt-10" : " pt-6 sm:pt-10"}`}>
            {resto.map((bloco, idx) => renderBloco(bloco, topoFullBleed ? idx + 1 : idx, false))}
          </div>
        </div>
      </div>

      {!preview && (
        <>
          <QueroFazerParteModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
          <EliteMilionarioModal isOpen={isEliteModalOpen} onClose={() => setIsEliteModalOpen(false)} />
        </>
      )}
    </>
  );
}