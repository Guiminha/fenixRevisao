import { usePublicPage } from "../usePublicPage";
import PublicPageStatus from "./PublicPageStatus";
import { PAGINA_ELITE_PADRAO } from "../paginasPadrao";
import PaginaBlocos from "./PaginaBlocos";

export default function EliteMilionarioView() {
  const { blocos, failed, retry } = usePublicPage('elite');
  if (!blocos) return <PublicPageStatus failed={failed} retry={retry} />;

  return (
    <div id="elite-milionario-view" className="animate-fade-in text-slate-100">
      <PaginaBlocos blocos={blocos.length ? blocos : PAGINA_ELITE_PADRAO} ctaModal="elite" coverSemTexto />
    </div>
  );
}
