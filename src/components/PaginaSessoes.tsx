import React, { useState } from "react";
import type { PaginaBloco, PaginaBlocoCampos } from "../types";
import QueroFazerParteModal from "./QueroFazerParteModal";
import EliteMilionarioModal from "./EliteMilionarioModal";

// Cores da marca usadas nos degradês de fundo das seções.
const PALETA = {
  rosa: { fg: "text-[#ff719e]", from: "from-[#d12a62]/20", via: "via-[#ff719e]/10", to: "to-transparent", glow: "bg-[#d12a62]/15" },
  dourado: { fg: "text-amber-300", from: "from-amber-500/15", via: "via-amber-400/8", to: "to-transparent", glow: "bg-amber-500/15" },
  cyan: { fg: "text-cyan-300", from: "from-cyan-500/15", via: "via-cyan-400/8", to: "to-transparent", glow: "bg-cyan-500/15" },
  rose: { fg: "text-rose-300", from: "from-rose-500/15", via: "via-rose-400/8", to: "to-transparent", glow: "bg-rose-500/15" },
  indigo: { fg: "text-indigo-300", from: "from-indigo-500/15", via: "via-indigo-400/8", to: "to-transparent", glow: "bg-indigo-500/15" }
};

// Fundo em degradê suave para cada seção (rosa + dourado, mais a cor do card se houver).
function GradienteFundo({ cor, children, className = "" }: { key?: React.Key; cor: string; children: React.ReactNode; className?: string }) {
  const c = PALETA[cor as keyof typeof PALETA] || PALETA.rosa;
  const cDourado = PALETA.dourado;
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${c.from} via-black/40 to-[#0b0f14] ${className}`}>
      <div className={`absolute -top-20 -right-20 w-80 h-80 rounded-full ${c.glow} blur-3xl pointer-events-none`} />
      <div className={`absolute -bottom-24 -left-20 w-80 h-80 rounded-full ${cDourado.glow} blur-3xl pointer-events-none`} />
      <div className="relative z-10">{children}</div>
    </div>
  );
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

export default function PaginaSessoes({
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

  const renderSecao = (bloco: PaginaBloco, index: number) => {
    const campos = bloco.campos;
    const textos = campos.textos || [];
    const cor = (campos.cor || "rosa") as string;

    switch (bloco.tipo) {
      case "hero_banner":
        return (
          <div key={bloco.id} className="relative w-full aspect-[21/9] min-h-[240px] sm:min-h-[300px] overflow-hidden">
            <BlocoImg src={campos.imagem} alt={campos.imagemAlt || ""} className="w-full h-full object-cover object-top" />
            {!coverSemTexto && (
              <>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f14]/90 via-[#0b0f14]/30 to-black/10" />
                <div className="absolute inset-x-0 bottom-10 sm:bottom-14 px-6 sm:px-12 text-center">
                  {campos.badge && (
                    <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[clamp(0.625rem,0.8vw,0.875rem)] font-mono font-bold tracking-widest uppercase backdrop-blur-md">
                      {campos.badge}
                    </span>
                  )}
                  {campos.titulo && (
                    <h1 className="mt-4 text-[clamp(1.75rem,3.6vw,5rem)] font-black text-white font-display tracking-tight leading-[1.05] drop-shadow-lg">
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
            {(index === 0 || coverSemTexto) && (
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b0f14] to-transparent pointer-events-none" />
            )}
          </div>
        );

      case "hero_header":
        return (
          <GradienteFundo key={bloco.id} cor={cor}>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 space-y-4">
              {campos.eyebrow && (
                <span className={`text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block ${PALETA[cor as keyof typeof PALETA]?.fg || "text-[#ff719e]"}`}>
                  {campos.eyebrow}
                </span>
              )}
              <h2 className="text-[clamp(1.75rem,3.2vw,3.5rem)] font-bold text-white font-display tracking-tight leading-[1.1]">
                {campos.titulo}
              </h2>
              {textos.map((t, i) => (
                <p key={i} className="text-[clamp(1rem,1.5vw,1.25rem)] max-w-3xl text-slate-300 leading-relaxed">{t}</p>
              ))}
            </div>
          </GradienteFundo>
        );

      case "card_tecnologia": {
        const imagemEsquerda = index % 2 === 0;
        return (
          <GradienteFundo key={bloco.id} cor={cor}>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-14 sm:py-20">
              <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-8 lg:gap-12">
                <div className={`lg:col-span-7 space-y-4 ${imagemEsquerda ? "order-2 lg:order-1" : "order-2"}`}>
                  <div className="space-y-1.5">
                    {campos.eyebrow && (
                      <span className={`text-[clamp(0.75rem,1vw,0.9rem)] font-bold uppercase tracking-[0.2em] block ${PALETA[cor as keyof typeof PALETA]?.fg || "text-[#ff719e]"}`}>
                        {campos.eyebrow}
                      </span>
                    )}
                    {campos.titulo && (
                      <h3 className="text-[clamp(1.75rem,3vw,3rem)] font-bold text-white font-display tracking-tight leading-[1.1]">{campos.titulo}</h3>
                    )}
                  </div>
                  {textos.map((t, i) => (
                    <p key={i} className="text-[clamp(1rem,1.5vw,1.2rem)] text-slate-300 leading-relaxed">{t}</p>
                  ))}
                  {campos.destaqueTitulo && (
                    <div className="mt-5 pt-5 border-t border-white/[0.06] space-y-1.5">
                      <strong className={`font-semibold block text-[clamp(1rem,1.4vw,1.2rem)] ${PALETA[cor as keyof typeof PALETA]?.fg || "text-[#ff719e]"}`}>{campos.destaqueTitulo}</strong>
                      {campos.destaqueTexto && <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{campos.destaqueTexto}</p>}
                    </div>
                  )}
                  {campos.notaTexto && <p className="text-xs text-slate-400 pt-2">{campos.notaTexto}</p>}
                </div>
                {campos.imagem && (
                  <div className={`lg:col-span-5 relative overflow-hidden rounded-[1.5rem] shadow-2xl ${imagemEsquerda ? "order-1" : "order-1 lg:order-2"}`}>
                    <BlocoImg src={campos.imagem} alt={campos.imagemAlt || ""} className="w-full h-full min-h-[280px] object-cover" />
                    {campos.badge && (
                      <span className={`absolute top-4 ${imagemEsquerda ? "left-4" : "right-4"} text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md ${PALETA[cor as keyof typeof PALETA]?.fg || "text-[#ff719e]"} bg-black/40 border border-white/15`}>
                        {campos.badge}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </GradienteFundo>
        );
      }

      case "texto":
        return (
          <GradienteFundo key={bloco.id} cor="dourado">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-14 sm:py-20 space-y-4">
              {campos.eyebrow && (
                <span className="text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block text-amber-400">{campos.eyebrow}</span>
              )}
              {campos.titulo && <h2 className="text-[clamp(1.5rem,2.8vw,2.75rem)] font-extrabold font-display text-white tracking-tight">{campos.titulo}</h2>}
              {textos.map((t, i) => (
                <p key={i} className="text-[clamp(1rem,1.5vw,1.25rem)] leading-relaxed text-slate-300">{t}</p>
              ))}
            </div>
          </GradienteFundo>
        );

      case "imagem":
        return (
          <GradienteFundo key={bloco.id} cor="dourado">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-14 sm:py-20">
              <div className="relative overflow-hidden rounded-[1.5rem] shadow-2xl">
                <BlocoImg src={campos.imagem} alt={campos.imagemAlt || ""} className="w-full h-[280px] sm:h-[400px] md:h-[480px] object-cover" />
                {campos.legenda && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b0f14]/90 to-transparent px-6 sm:px-8 py-5 sm:py-7">
                    <p className="text-sm sm:text-base font-semibold text-amber-300">{campos.legenda}</p>
                  </div>
                )}
              </div>
            </div>
          </GradienteFundo>
        );

      case "lista":
        return (
          <GradienteFundo key={bloco.id} cor="dourado">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-14 sm:py-20 space-y-6">
              <div className="space-y-2">
                {campos.eyebrow && (
                  <span className="text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block text-[#ff719e]">{campos.eyebrow}</span>
                )}
                {campos.titulo && <h3 className="text-[clamp(1.5rem,2.8vw,2.75rem)] font-bold text-white font-display tracking-tight">{campos.titulo}</h3>}
              </div>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
                {(campos.itens || []).map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#ff719e] to-amber-400 shrink-0 mt-2.5" />
                    <span className="text-[clamp(0.95rem,1.3vw,1.1rem)] text-slate-200 leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </GradienteFundo>
        );

      case "faq":
        return (
          <GradienteFundo key={bloco.id} cor="rosa">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-14 sm:py-20 space-y-6">
              <div className="space-y-2">
                {campos.eyebrow && (
                  <span className="text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block text-[#ff719e]">{campos.eyebrow}</span>
                )}
                {campos.titulo && <h3 className="text-[clamp(1.5rem,2.8vw,2.75rem)] font-bold text-white font-display tracking-tight">{campos.titulo}</h3>}
              </div>
              <div className="divide-y divide-white/[0.06]">
                {(campos.faq || []).map((item, i) => (
                  <div key={i} className="py-6">
                    <h4 className="text-base sm:text-lg font-bold text-white mb-2">{item.q}</h4>
                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </GradienteFundo>
        );

      case "destaque":
        return (
          <GradienteFundo key={bloco.id} cor="dourado">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 text-center space-y-4">
              {campos.destaqueTitulo && (
                <h3 className="text-[clamp(1.75rem,3.2vw,3.5rem)] font-black font-display bg-gradient-to-r from-amber-200 via-amber-300 to-amber-500 bg-clip-text text-transparent tracking-tight">
                  {campos.destaqueTitulo}
                </h3>
              )}
              {campos.destaqueTexto && (
                <p className="text-[clamp(1rem,1.5vw,1.35rem)] text-slate-200 font-medium leading-relaxed max-w-3xl mx-auto">{campos.destaqueTexto}</p>
              )}
            </div>
          </GradienteFundo>
        );

      case "cta":
        return (
          <GradienteFundo key={bloco.id} cor="rosa">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 text-center space-y-6">
              <div className="max-w-3xl mx-auto space-y-5">
                {campos.badge && (
                  <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#d12a62]/15 border border-[#d12a62]/25 text-[#ff719e] text-[clamp(0.625rem,0.8vw,0.875rem)] font-semibold tracking-[0.2em] uppercase">
                    {campos.badge}
                  </span>
                )}
                {campos.titulo && (
                  <h2 className="text-[clamp(1.75rem,3.2vw,3.5rem)] font-extrabold text-white font-display leading-tight">{campos.titulo}</h2>
                )}
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
                    className="btn-gold-metallic px-10 sm:px-14 py-4 rounded-xl text-sm sm:text-base font-bold shadow-2xl hover:scale-[1.03] transition-transform"
                  >
                    {campos.botaoTexto || "Quero fazer parte!"}
                  </button>
                </div>
                {campos.notaTexto && <p className="text-xs text-slate-400 font-medium">{campos.notaTexto}</p>}
              </div>
            </div>
          </GradienteFundo>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="bg-[#0b0f14]">
        {ativos.map((bloco, idx) => renderSecao(bloco, idx))}
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