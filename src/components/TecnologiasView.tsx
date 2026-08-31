import { useStore } from "../store";
import { PAGINA_TECNOLOGIAS_PADRAO } from "../paginasPadrao";
import PaginaBlocos from "./PaginaBlocos";

export default function TecnologiasView() {
  const blocos = useStore((s) => s.publicData?.paginaTecnologias) ?? [];

  return (
    <div className="animate-fade-in text-slate-100">
      <PaginaBlocos blocos={blocos.length ? blocos : PAGINA_TECNOLOGIAS_PADRAO} />
    </div>
  );
}
