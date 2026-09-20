import { usePublicPage } from "../usePublicPage";
import PublicPageStatus from "./PublicPageStatus";
import { PAGINA_TECNOLOGIAS_PADRAO } from "../paginasPadrao";
import PaginaBlocos from "./PaginaBlocos";

export default function TecnologiasView() {
  const { blocos, failed, retry } = usePublicPage('tecnologias');
  if (!blocos) return <PublicPageStatus failed={failed} retry={retry} />;

  return (
    <div className="animate-fade-in text-slate-100">
      <PaginaBlocos blocos={blocos.length ? blocos : PAGINA_TECNOLOGIAS_PADRAO} />
    </div>
  );
}
