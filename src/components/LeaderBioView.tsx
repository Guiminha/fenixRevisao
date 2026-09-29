import { Fragment, useState } from "react";
import { ArrowRight, CheckCircle2, CircleHelp, Flame, Globe2, Handshake, Moon, Rocket, ShieldCheck, Sparkles, Sun, Target, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PaginaBloco } from "../types";
import { usePublicPage } from "../usePublicPage";
import PublicPageStatus from "./PublicPageStatus";
import { PAGINA_BIOGRAFIA_PADRAO } from "../paginasPadrao";
import PaginaBlocos from "./PaginaBlocos";
import QueroFazerParteModal from "./QueroFazerParteModal";

const CONVITES: Record<string, string> = {
  "bio-produto-noite": "Quero fazer parte desse negócio",
};
const CONVITE_INTRO = "Quero empreender com o Grupo Fênix";
const FOTO_SUCESSO = "/api/storage/preview/paginas%2Fgrupo-fenix-empresario-fenix-dourada-20260928.webp";
const FOTO_EQUIPE = "/api/storage/preview/paginas%2Fgrupo-fenix-equipe-6-profissionais-20260928.webp";
const ICONES: Record<string, LucideIcon> = {
  "bio-intro": Flame,
  "bio-narrativa-1": Rocket,
  "bio-narrativa-2": ShieldCheck,
  "bio-apoio": Handshake,
  "bio-diferenciais-head": Target,
  "bio-produtos-head": Sparkles,
  "bio-produto-dia": Sun,
  "bio-produto-noite": Moon,
  "bio-tecnologia-global": Globe2,
  "bio-faq": CircleHelp,
};

export default function LeaderBioView() {
  const { blocos, failed, retry } = usePublicPage("biografia");
  const [modalAberto, setModalAberto] = useState(false);
  if (!blocos) return <PublicPageStatus failed={failed} retry={retry} />;

  const ativos = (blocos.length ? blocos : PAGINA_BIOGRAFIA_PADRAO)
    .filter((bloco) => bloco.ativo)
    .sort((a, b) => a.ordem - b.ordem);
  const banner = ativos[0]?.tipo === "hero_banner" || ativos[0]?.tipo === "banner" ? ativos[0] : null;
  const conteudo = banner ? ativos.slice(1) : ativos;
  const blocoSemFranquia = conteudo.find((bloco) => bloco.id === "bio-sem-franquia");
  const moverSemFranquia = !!blocoSemFranquia?.campos.destaqueTexto && !blocoSemFranquia.campos.destaqueTitulo && conteudo.some((bloco) => bloco.id === "bio-diferenciais");
  const produtoDia = conteudo.find((bloco) => bloco.id === "bio-produto-dia");
  const produtoNoite = conteudo.find((bloco) => bloco.id === "bio-produto-noite");
  const agruparProdutos = !!produtoDia && !!produtoNoite && conteudo.some((bloco) => bloco.id === "bio-produtos-head");

  const renderTextos = (textos: string[] = []) =>
    textos.map((texto, i) => <p key={i} className="text-sm leading-7 text-slate-300 sm:text-base">{texto}</p>);

  const renderConvite = (texto: string) => (
    <div className="flex justify-center px-4 py-2">
      <button type="button" onClick={() => setModalAberto(true)} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border border-[#ff8ab1]/70 bg-gradient-to-r from-[#df3c76] via-[#d12a62] to-[#a91b50] px-7 py-3.5 text-center text-sm font-extrabold text-white shadow-[0_12px_30px_rgba(209,42,98,0.3)] transition duration-200 hover:-translate-y-1 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff8ab1]">
        {texto}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    </div>
  );

  const renderBloco = (bloco: PaginaBloco) => {
    const c = bloco.campos;
    const Icone = ICONES[bloco.id];
    const intro = bloco.id === "bio-intro";
    const imagem = c.imagem || (bloco.id === "bio-narrativa-1" ? FOTO_SUCESSO : bloco.id === "bio-diferenciais-head" ? FOTO_EQUIPE : "");
    const imagemLateral = bloco.id === "bio-narrativa-1" || bloco.id === "bio-diferenciais-head";
    const renderIcone = (centralizado = false) => Icone ? <span className={`${centralizado ? "mx-auto " : ""}mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[#ff719e]/30 bg-[#d12a62]/15 text-[#ff93b8]`}><Icone className="h-6 w-6" aria-hidden="true" /></span> : null;
    if (bloco.id === "bio-produtos-head" && agruparProdutos && produtoDia && produtoNoite) {
      return (
        <section className="rounded-2xl border border-white/[0.09] bg-[radial-gradient(circle_at_top_right,rgba(209,42,98,.1),transparent_48%),#12171d] p-6 sm:p-8">
          {renderIcone()}
          {c.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#ff85ad]">{c.eyebrow}</span>}
          {c.titulo && <h2 className="mt-2 font-display text-[clamp(1.5rem,2.2vw,2.2rem)] font-semibold leading-tight text-white">{c.titulo}</h2>}
          <div className="mt-4 space-y-3">{renderTextos(c.textos)}</div>
          {c.destaqueTitulo && <strong className="mt-5 block text-[#ff85ad]">{c.destaqueTitulo}</strong>}
          {c.destaqueTexto && <p className="mt-2 text-sm leading-7 text-slate-300 sm:text-base">{c.destaqueTexto}</p>}
          {c.notaTexto && <p className="mt-2 text-xs text-slate-400">{c.notaTexto}</p>}
          {c.imagem && <img src={c.imagem} alt={c.imagemAlt || ""} loading="lazy" className="mt-6 max-h-80 w-full rounded-xl object-cover" />}
          <div className="mt-7 grid gap-6 border-t border-white/10 pt-7 md:grid-cols-2 md:gap-8">
            {[produtoDia, produtoNoite].map((produto) => {
              const ProdutoIcone = ICONES[produto.id];
              const campos = produto.campos;
              return (
                <div key={produto.id} className="md:pr-4 [&+div]:border-t [&+div]:border-white/10 [&+div]:pt-6 md:[&+div]:border-l md:[&+div]:border-t-0 md:[&+div]:pl-8 md:[&+div]:pt-0">
                  {ProdutoIcone && <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[#ff719e]/30 bg-[#d12a62]/15 text-[#ff93b8]"><ProdutoIcone className="h-5 w-5" aria-hidden="true" /></span>}
                  {campos.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#ff85ad]">{campos.eyebrow}</span>}
                  {campos.titulo && <h3 className="mt-2 font-display text-[clamp(1.25rem,1.8vw,1.8rem)] font-semibold leading-tight text-white">{campos.titulo}</h3>}
                  <div className="mt-3 space-y-3">{renderTextos(campos.textos)}</div>
                  {campos.destaqueTitulo && <strong className="mt-4 block text-[#ff85ad]">{campos.destaqueTitulo}</strong>}
                  {campos.destaqueTexto && <p className="mt-2 text-sm leading-7 text-slate-300 sm:text-base">{campos.destaqueTexto}</p>}
                  {campos.notaTexto && <p className="mt-2 text-xs text-slate-400">{campos.notaTexto}</p>}
                  {campos.imagem && <img src={campos.imagem} alt={campos.imagemAlt || ""} loading="lazy" className="mt-5 max-h-72 w-full rounded-xl object-cover" />}
                </div>
              );
            })}
          </div>
        </section>
      );
    }
    switch (bloco.tipo) {
      case "hero_header":
      case "card_tecnologia":
      case "texto":
        return (
          <section className={`${intro ? "rounded-2xl border border-[#ff719e]/20 bg-[radial-gradient(circle_at_top_right,rgba(209,42,98,.18),transparent_48%),linear-gradient(135deg,#20171e,#11151b)] px-7 py-12 text-center sm:px-12 sm:py-16" : "rounded-2xl border border-white/[0.09] bg-[radial-gradient(circle_at_top_right,rgba(209,42,98,.1),transparent_48%),#12171d] p-6 sm:p-8"} ${imagemLateral ? "grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,.9fr)]" : ""}`}>
            <div className={`max-w-4xl ${intro ? "mx-auto" : ""}`}>
              {renderIcone(intro)}
              {c.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#ff85ad]">{c.eyebrow}</span>}
              {c.titulo && <h2 className={`mt-2 font-display font-semibold leading-tight text-white ${intro ? "text-[clamp(1.7rem,2.7vw,2.7rem)]" : "text-[clamp(1.5rem,2.2vw,2.2rem)]"}`}>{c.titulo}</h2>}
              <div className="mt-4 space-y-3">{renderTextos(c.textos)}</div>
              {c.destaqueTitulo && <strong className="mt-5 block text-[#ff85ad]">{c.destaqueTitulo}</strong>}
              {c.destaqueTexto && <p className="mt-2 text-sm leading-7 text-slate-300 sm:text-base">{c.destaqueTexto}</p>}
              {c.notaTexto && <p className="mt-2 text-xs text-slate-400">{c.notaTexto}</p>}
              {intro && <div className="mt-7">{renderConvite(CONVITE_INTRO)}</div>}
              {bloco.id === "bio-diferenciais-head" && <div className="mt-7 flex lg:justify-start">{renderConvite("Quero fazer parte desse negócio")}</div>}
            </div>
            {imagem && <img src={imagem} alt={c.imagemAlt || (bloco.id === "bio-diferenciais-head" ? "Equipe de seis empresários e empresárias" : "Empresário bem-sucedido diante de uma fênix dourada")} loading="lazy" className={`max-h-96 w-full rounded-xl object-cover ${imagemLateral ? "aspect-[4/3]" : "mt-7"}`} />}
          </section>
        );
      case "lista":
        return (
          <section className="rounded-2xl border border-white/[0.09] bg-[#12171d] p-6 sm:p-8">
            {renderIcone()}
            {c.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#ff85ad]">{c.eyebrow}</span>}
            {c.titulo && <h2 className="mt-2 font-display text-[clamp(1.5rem,2.2vw,2.2rem)] font-semibold text-white">{c.titulo}</h2>}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[...(c.itens || []), ...(bloco.id === "bio-diferenciais" && moverSemFranquia ? [blocoSemFranquia.campos.destaqueTexto!] : [])].map((item, i) => <div key={i} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-[#0d1117] p-5"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#ff719e]" aria-hidden="true" /><p className="text-sm leading-7 text-slate-300 sm:text-base">{item}</p></div>)}
            </div>
          </section>
        );
      case "destaque":
        return (
          <section className="rounded-2xl border border-[#ff719e]/20 bg-[linear-gradient(135deg,#20171e,#11151b)] px-7 py-9 text-center sm:px-12">
            {renderIcone(true)}
            {c.destaqueTitulo && <h2 className="font-display text-[clamp(1.5rem,2.4vw,2.4rem)] font-semibold text-[#ffb1cc]">{c.destaqueTitulo}</h2>}
            {c.destaqueTexto && <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">{c.destaqueTexto}</p>}
          </section>
        );
      case "faq":
        return (
          <section className="rounded-2xl border border-white/[0.09] bg-[#12171d] p-6 sm:p-8">
            {renderIcone()}
            {c.eyebrow && <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#ff85ad]">{c.eyebrow}</span>}
            {c.titulo && <h2 className="mt-2 font-display text-[clamp(1.5rem,2.2vw,2.2rem)] font-semibold text-white">{c.titulo}</h2>}
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {(c.faq || []).map((item, i) => <div key={i} className="rounded-xl border border-white/[0.07] bg-[#0d1117] p-5"><h3 className="font-semibold text-white">{item.q}</h3><p className="mt-2 text-sm leading-7 text-slate-300">{item.a}</p></div>)}
            </div>
          </section>
        );
      case "imagem":
        return <figure className="overflow-hidden rounded-2xl border border-white/10 bg-[#12171d]">{c.imagem && <img src={c.imagem} alt={c.imagemAlt || ""} loading="lazy" className="h-[260px] w-full object-cover sm:h-[400px]" />}{c.legenda && <figcaption className="px-6 py-4 text-sm text-slate-300">{c.legenda}</figcaption>}</figure>;
      case "cta":
        return (
          <section className="rounded-2xl border border-[#ff719e]/20 bg-[radial-gradient(circle_at_top_right,rgba(209,42,98,.18),transparent_48%),linear-gradient(135deg,#20171e,#11151b)] px-7 py-12 text-center sm:px-12 sm:py-16">
            <UserPlus className="mx-auto h-7 w-7 text-[#ff85ad]" aria-hidden="true" />
            {c.badge && <span className="mt-4 block text-xs font-bold uppercase tracking-[0.22em] text-[#ff85ad]">{c.badge}</span>}
            {c.titulo && <h2 className="mx-auto mt-3 max-w-3xl font-display text-[clamp(1.7rem,2.7vw,2.7rem)] font-semibold leading-tight text-white">{c.titulo}</h2>}
            <div className="mx-auto mt-5 max-w-2xl space-y-3">{renderTextos(c.textos)}</div>
            <button type="button" onClick={() => setModalAberto(true)} className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#df3c76] to-[#a91b50] px-7 py-3 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff8ab1]">{c.botaoTexto || "Quero fazer parte!"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
            {c.notaTexto && <p className="mt-4 text-xs text-slate-400">{c.notaTexto}</p>}
          </section>
        );
      default:
        return <PaginaBlocos blocos={[bloco]} />;
    }
  };

  return (
    <div id="leader-bio-view" className="animate-fade-in bg-[#0b0f14] text-slate-100">
      {banner && <PaginaBlocos blocos={[banner]} coverSemTexto />}
      <main className="mx-auto max-w-6xl space-y-10 px-5 pb-24 pt-12 sm:space-y-14 sm:px-8 sm:pt-16 lg:px-10">
        {conteudo.filter((bloco) => !(moverSemFranquia && bloco.id === "bio-sem-franquia") && !(agruparProdutos && (bloco.id === "bio-produto-dia" || bloco.id === "bio-produto-noite"))).map((bloco) => {
          const convite = CONVITES[bloco.id] || (agruparProdutos && bloco.id === "bio-produtos-head" ? CONVITES["bio-produto-noite"] : undefined);
          return <Fragment key={bloco.id}>{renderBloco(bloco)}{convite && renderConvite(convite)}</Fragment>;
        })}
      </main>
      <QueroFazerParteModal isOpen={modalAberto} onClose={() => setModalAberto(false)} />
    </div>
  );
}
