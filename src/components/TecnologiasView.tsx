import { useStore } from "../store";
import { PAGINA_TECNOLOGIAS_PADRAO } from "../paginasPadrao";
import PaginaBlocos from "./PaginaBlocos";

export default function TecnologiasView() {
  const blocos = useStore((s) => s.publicData?.paginaTecnologias) ?? [];

  return (
    <div className="animate-fade-in text-slate-100">
      {/* Degradês de fundo com o rosa padrão da marca */}
      <div className="relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[36rem] h-[36rem] rounded-full bg-[#d12a62]/10 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 -left-32 w-[32rem] h-[32rem] rounded-full bg-[#ff719e]/5 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 right-0 w-[30rem] h-[30rem] rounded-full bg-[#d12a62]/8 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <PaginaBlocos blocos={blocos.length ? blocos : PAGINA_TECNOLOGIAS_PADRAO} />
        </div>
      </div>
    </div>
  );
}