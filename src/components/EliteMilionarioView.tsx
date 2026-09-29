import { useState } from "react";
import { ArrowRight, Crown } from "lucide-react";
import type { PaginaBloco } from "../types";
import { usePublicPage } from "../usePublicPage";
import PublicPageStatus from "./PublicPageStatus";
import { PAGINA_ELITE_PADRAO } from "../paginasPadrao";
import PaginaBlocos from "./PaginaBlocos";
import EliteMilionarioModal from "./EliteMilionarioModal";
import RetryImage from "./RetryImage";

const COLABORACAO = "/api/storage/preview/paginas%2Felite-equipe-rooftop-fenix-20260928.webp";
const MENTORIA = "/api/storage/preview/paginas%2Felite-equipe-escadaria-fenix-20260928.webp";

export default function EliteMilionarioView() {
  const { blocos, failed, retry } = usePublicPage("elite");
  const [modalAberto, setModalAberto] = useState(false);
  if (!blocos) return <PublicPageStatus failed={failed} retry={retry} />;

  const ativos = (blocos.length ? blocos : PAGINA_ELITE_PADRAO)
    .filter((bloco) => bloco.ativo)
    .sort((a, b) => a.ordem - b.ordem);
  const banner = ativos[0];
  const conteudo = ativos.slice(1);
  const estrutura = conteudo.find((bloco) => bloco.id === "elite-estrutura");
  const unirMetodoEstrutura = !!estrutura && conteudo.some((bloco) => bloco.id === "elite-metodo");
  const renderTextos = (textos: string[] = [], className = "text-sm leading-7 text-slate-300 sm:text-base") =>
    textos.filter(Boolean).map((texto, i) => <p key={i} className={className}>{texto}</p>);
  const renderImagem = (src: string, alt = "", className = "") => (
    <RetryImage key={src} src={src} alt={alt} className={className} />
  );
  const renderConvite = (texto: string) => (
    <button
      type="button"
      onClick={() => setModalAberto(true)}
      className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border border-amber-100/70 bg-gradient-to-r from-amber-200 via-amber-300 to-amber-400 px-7 py-3.5 text-sm font-extrabold text-[#211608] shadow-[0_10px_28px_rgba(245,158,11,0.32)] ring-1 ring-amber-300/20 transition duration-200 hover:-translate-y-1 hover:from-amber-100 hover:via-amber-200 hover:to-amber-300 hover:shadow-[0_16px_36px_rgba(245,158,11,0.44)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300"
    >
      {texto}<ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
  const renderBloco = (bloco: PaginaBloco, index: number) => {
    const c = bloco.campos;
    if (bloco.id === "elite-metodo" && unirMetodoEstrutura) {
      const segundo = estrutura!.campos;
      return (
        <section key={bloco.id} className="grid items-center gap-8 rounded-2xl border border-white/[0.09] bg-[#12171d] p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_calc(50%+0.5rem)] lg:gap-12">
          <div className="space-y-7">
            <div>
              {c.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">{c.eyebrow}</span>}
              {c.titulo && <h2 className="font-display text-[clamp(1.45rem,2.1vw,2.1rem)] font-semibold leading-tight text-white">{c.titulo}</h2>}
              <div className="mt-4 space-y-3">{renderTextos(c.textos)}</div>
              {c.destaqueTitulo && <strong className="mt-5 block text-amber-300">{c.destaqueTitulo}</strong>}
              {c.destaqueTexto && <p className="mt-2 text-sm leading-7 text-slate-300">{c.destaqueTexto}</p>}
              {c.notaTexto && <p className="mt-2 text-xs text-slate-400">{c.notaTexto}</p>}
            </div>
            <div className="border-t border-white/10 pt-7">
              {segundo.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">{segundo.eyebrow}</span>}
              {segundo.titulo && <h2 className="font-display text-[clamp(1.45rem,2.1vw,2.1rem)] font-semibold leading-tight text-white">{segundo.titulo}</h2>}
              <div className="mt-4 space-y-3">{renderTextos(segundo.textos)}</div>
              {segundo.destaqueTitulo && <strong className="mt-5 block text-amber-300">{segundo.destaqueTitulo}</strong>}
              {segundo.destaqueTexto && <p className="mt-2 text-sm leading-7 text-slate-300">{segundo.destaqueTexto}</p>}
              {segundo.notaTexto && <p className="mt-2 text-xs text-slate-400">{segundo.notaTexto}</p>}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl lg:translate-x-8">{renderImagem(c.imagem || segundo.imagem || MENTORIA, c.imagemAlt || segundo.imagemAlt || "Equipe de cinco pessoas diante de uma fênix dourada", "aspect-[4/3] w-full object-cover")}</div>
        </section>
      );
    }
    switch (bloco.tipo) {
      case "hero_header":
        return (
          <section key={bloco.id} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="max-w-xl">
              {c.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">{c.eyebrow}</span>}
              {c.titulo && <h1 className="mt-4 font-display text-[clamp(1.75rem,2.5vw,2.5rem)] font-bold leading-[1.18] tracking-tight text-white">{c.titulo}</h1>}
              <div className="mt-5 space-y-4">{renderTextos(c.textos)}</div>
              <div className="mt-7">{renderConvite("Quero começar minha jornada")}</div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10">{renderImagem(COLABORACAO, "Equipe de seis pessoas bem-sucedidas diante de uma fênix dourada", "aspect-[4/3] w-full object-cover")}</div>
          </section>
        );
      case "card_tecnologia":
        return (
          <section key={bloco.id} className={`grid items-center gap-7 rounded-2xl border border-white/[0.09] bg-[#12171d] p-6 sm:p-8 ${index === 1 ? "lg:grid-cols-[1fr_.8fr]" : ""}`}>
            <div className="max-w-3xl">
              {c.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">{c.eyebrow}</span>}
              {c.titulo && <h2 className="font-display text-[clamp(1.45rem,2.1vw,2.1rem)] font-semibold leading-tight text-white">{c.titulo}</h2>}
              <div className="mt-4 space-y-3">{renderTextos(c.textos)}</div>
              {c.destaqueTitulo && <strong className="mt-5 block text-amber-300">{c.destaqueTitulo}</strong>}
              {c.destaqueTexto && <p className="mt-2 text-sm leading-7 text-slate-300">{c.destaqueTexto}</p>}
              {c.notaTexto && <p className="mt-2 text-xs text-slate-400">{c.notaTexto}</p>}
            </div>
            {c.imagem ? <div className="overflow-hidden rounded-xl">{renderImagem(c.imagem, c.imagemAlt, "aspect-[3/2] w-full object-cover")}</div>
              : index === 1 ? <div className="overflow-hidden rounded-xl">{renderImagem(MENTORIA, "Equipe de cinco pessoas diante de uma fênix dourada", "aspect-[3/2] w-full object-cover")}</div> : null}
          </section>
        );
      case "imagem":
        return (
          <figure key={bloco.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#12171d]">
            {renderImagem(c.imagem || "", c.imagemAlt, "h-[260px] w-full object-cover sm:h-[400px]")}
            {c.legenda && <figcaption className="px-6 py-4 text-sm text-slate-300">{c.legenda}</figcaption>}
          </figure>
        );
      case "destaque":
        return (
          <section key={bloco.id} className="rounded-2xl border border-amber-300/20 bg-[linear-gradient(135deg,#211c18,#11151b)] px-7 py-10 text-center sm:px-12">
            {c.destaqueTitulo && <h2 className="font-display text-[clamp(1.5rem,2.5vw,2.5rem)] font-semibold text-amber-200">{c.destaqueTitulo}</h2>}
              {c.destaqueTexto && <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">{c.destaqueTexto}</p>}
              {bloco.id === "elite-destaque-1" && <div className="mt-7">{renderConvite("Quero fazer parte")}</div>}
          </section>
        );
      case "lista":
        return (
          <section key={bloco.id} className="mx-auto max-w-4xl">
            {c.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">{c.eyebrow}</span>}
            {c.titulo && <h2 className="mt-3 font-display text-[clamp(1.6rem,2.5vw,2.5rem)] font-semibold text-white">{c.titulo}</h2>}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(c.itens || []).map((item, i) => <p key={i} className="rounded-xl border border-white/[0.09] bg-[#12171d] p-5 text-sm leading-7 text-slate-300">{item}</p>)}
            </div>
          </section>
        );
      case "cta":
        return (
          <section key={bloco.id} className="rounded-2xl border border-amber-300/20 bg-[radial-gradient(circle_at_top_right,rgba(186,120,35,.18),transparent_45%),linear-gradient(135deg,#211c18,#11151b)] px-7 py-12 text-center sm:px-12 sm:py-16">
            <Crown className="mx-auto h-7 w-7 text-amber-300" aria-hidden="true" />
            {c.badge && <span className="mt-5 block text-xs font-bold uppercase tracking-[0.22em] text-amber-300">{c.badge}</span>}
            {c.titulo && <h2 className="mx-auto mt-3 max-w-3xl font-display text-[clamp(1.7rem,2.8vw,2.8rem)] font-semibold leading-tight text-white">{c.titulo}</h2>}
            <div className="mx-auto mt-5 max-w-2xl space-y-3">{renderTextos(c.textos)}</div>
            <button type="button" onClick={() => setModalAberto(true)} className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-200 via-amber-300 to-amber-400 px-6 py-3 text-sm font-bold text-[#19120a] shadow-lg transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300">
              {c.botaoTexto || "Quero fazer parte!"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            {c.notaTexto && <p className="mt-4 text-xs text-slate-400">{c.notaTexto}</p>}
          </section>
        );
      default:
        return <PaginaBlocos key={bloco.id} blocos={[bloco]} ctaModal="elite" />;
    }
  };

  return (
    <div id="elite-milionario-view" className="animate-fade-in bg-[#0b0f14] text-slate-100">
      {banner && <PaginaBlocos blocos={[banner]} ctaModal="elite" coverSemTexto />}
      <main className="mx-auto max-w-6xl space-y-10 px-5 pb-24 pt-12 sm:space-y-14 sm:px-8 sm:pt-16 lg:px-10">
        {conteudo.filter((bloco) => !(unirMetodoEstrutura && bloco.id === "elite-estrutura")).map(renderBloco)}
      </main>
      <EliteMilionarioModal isOpen={modalAberto} onClose={() => setModalAberto(false)} />
    </div>
  );
}
