import { useStore } from "../store";
import { PAGINA_ELITE_PADRAO } from "../paginasPadrao";
import PaginaSessoes from "./PaginaSessoes";

export default function EliteMilionarioView() {
  const blocos = useStore((s) => s.publicData?.paginaElite) ?? [];

  return (
    <div id="elite-milionario-view" className="animate-fade-in text-slate-100">
      <PaginaSessoes blocos={blocos.length ? blocos : PAGINA_ELITE_PADRAO} ctaModal="elite" coverSemTexto />
    </div>
  );
}