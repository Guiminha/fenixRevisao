import React, { useState } from "react";
import type { PaginaBloco, PaginaBlocoCampos } from "../types";
import QueroFazerParteModal from "./QueroFazerParteModal";
import EliteMilionarioModal from "./EliteMilionarioModal";

// Paleta da marca mantida. Usada para acentos de texto/cor em cada seção.
const CORES: Record<string, { fg: string; accent: string; text: string }> = {
  amber: { fg: "text-amber-400", accent: "from-amber-300/70 to-amber-500/50", text: "text-amber-300" },
  cyan: { fg: "text-cyan-400", accent: "from-cyan-300/70 to-cyan-500/50", text: "text-cyan-300" },
  rose: { fg: "text-rose-400", accent: "from-rose-300/70 to-rose-500/50", text: "text-rose-300" },
  indigo: { fg: "text-indigo-400", accent: "from-indigo-300/70 to-indigo-500/50", text: "text-indigo-300" },
  rosa: { fg: "text-[#e63973]", accent: "from-[#ff719e]/70 to-[#d12a62]/50", text: "text-[#ff719e]" }
};

// Topo full-bleed: o primeiro bloco (banner/hero_banner) sai do contêiner
// max-w-6xl e usa margens negativas equivalentes ao padding do <main>, então
// preenche de ponta a ponta em qualquer largura de tela e encosta no topo.
const FULL_BLEED = "relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-10 -mt-6 sm:-mt-8 lg:-mt-10";

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
            className={
              fullBleedTop
                ? `${FULL_BLEED} bg-gradient-to-br from-[#0b0f14] via-[#1a1020] to-[#0b0f14] px-6 py-12 sm:px-12 sm:py-20 text-slate-100`
                : "relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0b0f14] via-[#1a1020] to-[#0b0f14] px-6 py-12 sm:px-12 sm:py-20 text-slate-100"
            }
          >
            <div className="absolute top-0 right-0 -mt-24 -mr-24 w-[28rem] h-[28rem] rounded-full bg-[#d12a62]/10 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -mb-24 -ml-24 w-[28rem] h-[28rem] rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
            <div className="relative z-10 space-y-7 max-w-5xl">
              {campos.badge && (
                <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#d12a62]/15 border border-[#d12a62]/25 text-[#ff719e] text-[clamp(0.625rem,0.8vw,0.875rem)] font-semibold tracking-[0.2em] uppercase">
                  {campos.badge}
                </span>
              )}
              <h1 className="text-[clamp(2rem,4.2vw,5.5rem)] font-black tracking-tight text-white font-display leading-[1.05]">
                {campos.titulo}{" "}
                {campos.tituloDestaque && (
                  <span className="bg-gradient-to-r from-white via-slate-200 to-[#ff719e] bg-clip-text text-transparent">
                    {campos.tituloDestaque}
                  </span>
                )}
              </h1>
              {textos[0] && (
                <p className="text-[clamp(1rem,1.5vw,1.4rem)] text-slate-300 leading-relaxed max-w-3xl font-light">
                  {textos[0]}
                </p>
              )}
              {textos.length > 1 && (
                <div className="pt-4 flex flex-wrap items-center gap-x-8 gap-y-3 text-[clamp(0.875rem,1.1vw,1rem)] text-slate-400">
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
          <section
            key={bloco.id}
            className={fullBleedTop ? `${FULL_BLEED} bg-[#07090e]` : "relative overflow-hidden rounded-[2rem] bg-[#07090e]"}
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
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f14]/85 via-[#0b0f14]/25 to-black/20" />
                    <div className="absolute inset-x-0 bottom-10 sm:bottom-14 px-6 sm:px-12 text-center">
                      {campos.badge && (
                        <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[clamp(0.625rem,0.8vw,0.875rem)] font-mono font-bold tracking-widest uppercase backdrop-blur-md shadow-lg shadow-amber-500/10">
                          {campos.badge}
                        </span>
                      )}
                      {campos.titulo && (
                        <h1 className="mt-4 text-[clamp(1.75rem,3.6vw,5rem)] font-black text-white font-display tracking-tight drop-shadow-lg leading-[1.05]">
                          {campos.titulo}{" "}
                          {campos.tituloDestaque && (
                            <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(251,191,36,0.25)]">
                              {campos.tituloDestaque}
                            </span>
                          )}
                        </h1>
                      )}
                      {textos[0] && (
                        <p className="mt-3 mx-auto max-w-3xl text-[clamp(0.875rem,1.4vw,1.5rem)] text-slate-200 font-medium drop-shadow">
                          {textos[0]}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="relative w-full h-56 sm:h-72 bg-gradient-to-br from-[#121721] via-[#0f131a] to-[#07090e] flex flex-col items-center justify-center p-8 text-center">
                {campos.badge && (
                  <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[clamp(0.625rem,0.8vw,0.875rem)] font-mono font-bold tracking-widest uppercase">
                    {campos.badge}
                  </span>
                )}
                {campos.titulo && (
                  <h1 className="mt-4 text-[clamp(1.75rem,3.6vw,5rem)] font-black text-white font-display tracking-tight">
                    {campos.titulo}{" "}
                    <span className="bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">{campos.tituloDestaque}</span>
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

      case "hero_header":
        return (
          <section key={bloco.id} className="space-y-4 max-w-4xl">
            {campos.eyebrow && (
              <span className={`text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block ${cor.fg}`}>
                {campos.eyebrow}
              </span>
            )}
            <h2 className="text-[clamp(1.75rem,3.2vw,3.5rem)] font-bold text-white font-display tracking-tight leading-[1.1]">
              {campos.titulo}
            </h2>
            {textos.map((t, i) => (
              <p key={i} className="text-[clamp(1rem,1.5vw,1.25rem)] max-w-3xl text-slate-300 leading-relaxed">
                {t}
              </p>
            ))}
          </section>
        );

      case "card_tecnologia": {
        const imagemEsquerda = index % 2 === 0;
        const conteudo = renderCardConteudo(campos, cor);
        return (
          <div key={bloco.id} className="relative">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-8 lg:gap-12 pt-10 sm:pt-12">
              <div className={`lg:col-span-7 space-y-4 ${imagemEsquerda ? "order-2 lg:order-1" : "order-2"}`}>
                {conteudo}
              </div>
              {campos.imagem && (
                <div className={`lg:col-span-5 relative overflow-hidden rounded-[1.5rem] shadow-2xl ${imagemEsquerda ? "order-1" : "order-1 lg:order-2"}`}>
                  <BlocoImg
                    src={campos.imagem}
                    alt={campos.imagemAlt || ""}
                    className="w-full h-full min-h-[280px] object-cover"
                  />
                  {campos.badge && (
                    <span className={`absolute top-4 ${imagemEsquerda ? "left-4" : "right-4"} text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md ${cor.text} bg-black/40 border border-white/15`}>
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
          <section key={bloco.id} className="space-y-4 max-w-4xl">
            {campos.eyebrow && (
              <span className="text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block text-amber-400">
                {campos.eyebrow}
              </span>
            )}
            {campos.titulo && (
              <h2 className="text-[clamp(1.5rem,2.8vw,2.75rem)] font-extrabold font-display text-white tracking-tight">
                {campos.titulo}
              </h2>
            )}
            {textos.map((t, i) => (
              <p key={i} className="text-[clamp(1rem,1.5vw,1.25rem)] leading-relaxed text-slate-300">
                {t}
              </p>
            ))}
          </section>
        );

      case "imagem":
        return (
          <div key={bloco.id} className="relative overflow-hidden rounded-[1.5rem] shadow-2xl">
            <BlocoImg
              src={campos.imagem}
              alt={campos.imagemAlt || ""}
              className="w-full h-[280px] sm:h-[400px] md:h-[480px] object-cover"
            />
            {campos.legenda && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b0f14]/90 to-transparent px-6 sm:px-8 py-5 sm:py-7">
                <p className="text-sm sm:text-base font-semibold text-amber-300">{campos.legenda}</p>
              </div>
            )}
          </div>
        );

      case "lista":
        return (
          <section key={bloco.id} className="space-y-6 max-w-4xl">
            <div className="space-y-2">
              {campos.eyebrow && (
                <span className="text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block text-[#ff719e]">
                  {campos.eyebrow}
                </span>
              )}
              {campos.titulo && (
                <h3 className="text-[clamp(1.5rem,2.8vw,2.75rem)] font-bold text-white font-display tracking-tight">
                  {campos.titulo}
                </h3>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {(campos.itens || []).map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#ff719e] to-[#d12a62] shrink-0 mt-2.5" />
                  <span className="text-[clamp(0.95rem,1.3vw,1.1rem)] text-slate-200 leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </section>
        );

      case "faq":
        return (
          <section key={bloco.id} className="space-y-6 max-w-4xl">
            <div className="space-y-2">
              {campos.eyebrow && (
                <span className="text-[clamp(0.75rem,1vw,0.9rem)] font-bold tracking-[0.25em] uppercase block text-[#ff719e]">
                  {campos.eyebrow}
                </span>
              )}
              {campos.titulo && (
                <h3 className="text-[clamp(1.5rem,2.8vw,2.75rem)] font-bold text-white font-display tracking-tight">
                  {campos.titulo}
                </h3>
              )}
            </div>
            <div className="divide-y divide-white/[0.06]">
              {(campos.faq || []).map((item, i) => (
                <div key={i} className="py-6">
                  <h4 className="text-base sm:text-lg font-bold text-white mb-2">{item.q}</h4>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </section>
        );

      case "destaque":
        return (
          <section key={bloco.id} className="py-8 text-center max-w-4xl mx-auto space-y-4">
            {campos.destaqueTitulo && (
              <h3 className="text-[clamp(1.75rem,3.2vw,3.5rem)] font-black font-display bg-gradient-to-r from-amber-200 via-amber-300 to-amber-500 bg-clip-text text-transparent tracking-tight">
                {campos.destaqueTitulo}
              </h3>
            )}
            {campos.destaqueTexto && (
              <p className="text-[clamp(1rem,1.5vw,1.35rem)] text-slate-200 font-medium leading-relaxed">{campos.destaqueTexto}</p>
            )}
          </section>
        );

      case "cta":
        return (
          <section key={bloco.id} className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0b0f14] via-[#1a1020] to-[#0b0f14] px-6 py-14 sm:px-12 sm:py-20 text-center space-y-6">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] rounded-full bg-[#d12a62]/10 blur-3xl pointer-events-none" />
            <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-3xl mx-auto space-y-5">
              {campos.badge && (
                <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#d12a62]/15 border border-[#d12a62]/25 text-[#ff719e] text-[clamp(0.625rem,0.8vw,0.875rem)] font-semibold tracking-[0.2em] uppercase">
                  {campos.badge}
                </span>
              )}
              {campos.titulo && (
                <h2 className="text-[clamp(1.75rem,3.2vw,3.5rem)] font-extrabold text-white font-display leading-tight">
                  {campos.titulo}
                </h2>
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
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {topoFullBleed && renderBloco(topo, 0, true)}
      <div className={`max-w-6xl mx-auto space-y-16 sm:space-y-20${topoFullBleed ? " mt-16" : " pt-6 sm:pt-8 lg:pt-10"}`}>
        {resto.map((bloco, idx) => renderBloco(bloco, topoFullBleed ? idx + 1 : idx, false))}
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

function renderCardConteudo(campos: PaginaBlocoCampos, cor: (typeof CORES)[keyof typeof CORES]) {
  const textos = campos.textos || [];
  return (
    <>
      <div className="space-y-1.5 mb-3">
        {campos.eyebrow && <span className={`text-[clamp(0.75rem,1vw,0.9rem)] font-bold uppercase tracking-[0.2em] block ${cor.fg}`}>{campos.eyebrow}</span>}
        {campos.titulo && (
          <h3 className="text-[clamp(1.75rem,3vw,3rem)] font-bold text-white font-display tracking-tight leading-[1.1]">{campos.titulo}</h3>
        )}
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
    </>
  );
}