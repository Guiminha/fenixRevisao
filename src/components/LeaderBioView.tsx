import { usePublicPage } from "../usePublicPage";
import PublicPageStatus from "./PublicPageStatus";
import { PAGINA_BIOGRAFIA_PADRAO } from "../paginasPadrao";
import PaginaBlocos from "./PaginaBlocos";

export default function LeaderBioView() {
  const { blocos, failed, retry } = usePublicPage('biografia');
  if (!blocos) return <PublicPageStatus failed={failed} retry={retry} />;

  return (
    <div id="leader-bio-view" className="animate-fade-in text-slate-100">
      <PaginaBlocos blocos={blocos.length ? blocos : PAGINA_BIOGRAFIA_PADRAO} coverSemTexto />
    </div>
  );
}
