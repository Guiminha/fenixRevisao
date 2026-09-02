import { useStore } from "../store";
import { PAGINA_BIOGRAFIA_PADRAO } from "../paginasPadrao";
import PaginaSessoes from "./PaginaSessoes";

export default function LeaderBioView() {
  const blocos = useStore((s) => s.publicData?.paginaBiografia) ?? [];

  return (
    <div id="leader-bio-view" className="animate-fade-in text-slate-100">
      <PaginaSessoes blocos={blocos.length ? blocos : PAGINA_BIOGRAFIA_PADRAO} coverSemTexto />
    </div>
  );
}