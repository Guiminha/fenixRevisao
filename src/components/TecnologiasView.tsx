import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import type { PaginaBloco } from "../types";
import { usePublicPage } from "../usePublicPage";
import PublicPageStatus from "./PublicPageStatus";
import { PAGINA_TECNOLOGIAS_PADRAO } from "../paginasPadrao";
import PaginaBlocos from "./PaginaBlocos";
import QueroFazerParteModal from "./QueroFazerParteModal";

const CONVITES: Record<string, string> = {
  "tec-hero": "Quero fazer parte do Grupo Fênix",
};

export default function TecnologiasView() {
  const { blocos, failed, retry } = usePublicPage("tecnologias");
  const [modalAberto, setModalAberto] = useState(false);
  if (!blocos) return <PublicPageStatus failed={failed} retry={retry} />;

  const ativos = (blocos.length ? blocos : PAGINA_TECNOLOGIAS_PADRAO)
    .filter((bloco) => bloco.ativo)
    .sort((a, b) => a.ordem - b.ordem);
  const banner = ativos[0]?.tipo === "banner" ? ativos[0] : null;
  const conteudo = banner ? ativos.slice(1) : ativos;

  const renderConvite = (bloco: PaginaBloco) => {
    const texto = CONVITES[bloco.id];
    if (!texto) return null;
    return (
      <div className="flex justify-center px-4 py-1">
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border border-[#ff8ab1]/70 bg-gradient-to-r from-[#df3c76] via-[#d12a62] to-[#a91b50] px-7 py-3.5 text-center text-sm font-extrabold text-white shadow-[0_12px_30px_rgba(209,42,98,0.3)] transition duration-200 hover:-translate-y-1 hover:brightness-110 hover:shadow-[0_17px_38px_rgba(209,42,98,0.44)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff8ab1]"
        >
          {texto}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </div>
    );
  };

  return (
    <div id="tecnologias-view" className="animate-fade-in bg-[#0b0f14] text-slate-100">
      {banner && (
        <header className="relative -mx-4 -mt-6 overflow-hidden bg-[#0b0e14] sm:-mx-6 sm:-mt-8 lg:-mx-10 lg:-mt-10">
          <div className="absolute inset-0 bg-gradient-to-b from-[#06080c]/80 via-[#090b11]/70 to-[#0b0f14]/90" aria-hidden="true" />
          <div className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col items-center justify-center px-6 py-6 text-center sm:px-10 sm:py-8">
            {banner.campos.badge && (
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ff719e]/45 bg-[#180d16]/70 px-4 py-2 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#ffb1cc] backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />{banner.campos.badge}
              </span>
            )}
            {banner.campos.titulo && <h1 className="font-display text-[clamp(1.755rem,3.25vw,3.25rem)] font-bold uppercase leading-none tracking-tight text-white drop-shadow-lg">{banner.campos.titulo}</h1>}
            {banner.campos.logo && <img src={banner.campos.logo} alt="Nipponflex e E-Energy" className="mt-3 h-auto w-full max-w-[1175px] object-contain drop-shadow-xl" />}
            {banner.campos.tituloDestaque && <p className="mt-7 max-w-3xl font-display text-[clamp(1.2rem,2vw,2rem)] font-semibold leading-[1.3] tracking-tight text-white drop-shadow-lg">{banner.campos.tituloDestaque}</p>}
            <div className="mt-6 w-full max-w-[1450px] space-y-3">
              {(banner.campos.textos || []).filter(Boolean).map((texto, i) => (
                <p key={i} className="text-pretty text-[1.144rem] leading-[1.65] text-slate-100 drop-shadow-md sm:text-[1.235rem]">{texto}</p>
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0b0f14] to-transparent" />
        </header>
      )}

      <div className="tech-content">
        <PaginaBlocos blocos={conteudo} renderAfterBlock={renderConvite} compactTop />
      </div>
      <QueroFazerParteModal isOpen={modalAberto} onClose={() => setModalAberto(false)} />
    </div>
  );
}
