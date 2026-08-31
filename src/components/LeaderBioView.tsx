import { useStore } from "../store";
import { PAGINA_BIOGRAFIA_PADRAO } from "../paginasPadrao";
import PaginaBlocos from "./PaginaBlocos";

export default function LeaderBioView() {
  const blocos = useStore((s) => s.publicData?.paginaBiografia) ?? [];

  return (
    <div id="leader-bio-view" className="animate-fade-in text-slate-100">
      <PaginaBlocos blocos={blocos.length ? blocos : PAGINA_BIOGRAFIA_PADRAO} />
    </div>
  );
}