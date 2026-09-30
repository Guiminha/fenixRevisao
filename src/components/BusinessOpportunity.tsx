import { useState } from "react";
import { ArrowRight, Users, TrendingUp, Award, GraduationCap, Headset } from "lucide-react";
import QueroFazerParteModal from "./QueroFazerParteModal";
import RetryImage from "./RetryImage";

const opportunityLogo = "/api/storage/preview/paginas%2Finicio-logo-grupo-fenix-20260930.png";
const productsImage = "/api/storage/preview/paginas%2Finicio-produtos-nipponflex-20260930.jpg";

const benefits = [
  { icon: TrendingUp, title: "Um plano de carreira estruturado para crescimento real" },
  { icon: Award, title: "Produtos com tecnologia biohacking avançado" },
  { icon: GraduationCap, title: "Formação contínua através do nosso sistema educacional, com treinamentos presenciais e conteúdos online" },
  { icon: Headset, title: "Suporte em todas as etapas da jornada empreendedora" },
  { icon: Users, title: "Comunidade colaborativa, com líderes comprometidos com o seu sucesso" },
];

export default function BusinessOpportunity() {
  const [open, setOpen] = useState(false);
  const join = (label: string, enlarged = false) => (
    <button type="button" onClick={() => setOpen(true)}
      style={enlarged
        ? { minHeight: 75.264, padding: "11.2px 37.632px", fontSize: "clamp(19.2px, 4vw, 31.36px)", lineHeight: 1.2, gap: 26.88, maxWidth: "100%" }
        : { minHeight: 64, padding: "16px 32px", fontSize: 18.667, lineHeight: "26.667px", gap: 16, maxWidth: "100%" }}
      className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#e63879] to-[#ac174c] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_28px_rgba(209,42,98,0.25)] border border-[#ff8bb4]/40 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff8bb4]">
      {label}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" style={enlarged ? { width: 35.84, height: 35.84 } : { width: 21.333, height: 21.333 }} />
    </button>
  );

  return (
    <section aria-labelledby="business-opportunity-title" className="overflow-hidden rounded-3xl border border-[#d12a62]/25 bg-gradient-to-br from-[#29121e] via-[#12171d] to-[#10151b]">
      <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:p-12">
        <div className="flex flex-col items-start justify-center">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff8bb4]">Oportunidade de negócio</span>
          <h2 id="business-opportunity-title" className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">Empreenda com o <span className="text-[#ff8bb4]">Grupo Fênix.</span></h2>
          <div className="mt-5 w-full space-y-4 text-lg leading-relaxed text-[#d1d9e3] lg:text-xl">
            <p>Acreditamos que empreender é uma oportunidade de transformar a própria realidade. Além de conquistar uma fonte de renda, é encontrar sentido no que você faz, ter liberdade para tomar decisões e conduzir sua vida com mais independência.</p>
            <p>Como consultor Grupo Fenix, você apresenta soluções voltadas ao bem-estar e à qualidade de vida das pessoas. Enquanto ajuda seus clientes a conhecer novas possibilidades de cuidado, também amplia seus conhecimentos, fortalece suas habilidades e desenvolve uma trajetória de evolução pessoal, profissional e financeira.</p>
          </div>
          <div className="mt-6 w-full">{join("Quero conhecer o negócio")}</div>
        </div>
        <div className="flex w-full items-center justify-center self-center">
          <img src={opportunityLogo} alt="Grupo Fênix — Transformando vidas" loading="lazy" className="mx-auto h-auto w-[90%] object-contain" />
        </div>
      </div>
      <div className="px-6 pb-7 sm:px-9 lg:px-12">
        <h3 className="mb-5 text-xl font-bold text-white">Aqui você conta com:</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {benefits.map(({ icon: Icon, title }) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <Icon aria-hidden="true" className="h-6 w-6 text-[#ff719e]" />
              <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
            </div>
          ))}
        </div>
      </div>
      <div className="grid items-center gap-6 border-t border-white/10 bg-black/15 p-6 sm:p-9 lg:grid-cols-2 lg:gap-9 lg:px-12">
        <figure className="overflow-hidden rounded-2xl border border-white/10">
          <RetryImage src={productsImage} alt="Produtos Nipponflex e E-Energy" className="aspect-video w-full object-cover" />
        </figure>
        <div>
          <p className="mx-auto mb-1.5 max-w-[82.45%] text-center text-2xl font-bold leading-relaxed text-[#ff8bb4]">O Grupo Fenix é 100% exclusivo na venda de produtos</p>
          <img src="/api/storage/preview/paginas%2F1789685744955_4bdbbbe4_energy_04.png" alt="Nipponflex | E-Energy" loading="lazy" className="mx-auto mb-5 h-auto w-[1055.36px] max-w-[82.45%] object-contain" />
          <div className="mx-auto w-full lg:w-[82.45%]">
          <h3 className="text-xl font-bold text-white">Tecnologia e produtos para apresentar com confiança.</h3>
          <p className="mt-3 text-sm leading-relaxed text-[#b8c3d1]">O Grupo Fênix atua com o portfólio 100% Nipponflex | E-Energy. Conheça as tecnologias FIR Power, Íon Balls, MFP, Magnetos e Rabatan® e aprenda como elas integram as diferentes linhas de produtos.</p>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#b8c3d1]">
            <p>Nosso portfólio reúne a maior e mais completa linha de produtos de biohacking do mundo, criada para promover, bem-estar e alta performance.</p>
            <p>Com os nossos produtos, o seu corpo se regenera durante o sono. A hidratação através da Linha Alcaline Max que proporciona uma água de altíssima qualidade para purificar de dentro para fora. Já os dispositivos de uso diário atuam de fora para dentro, levando equilíbrio, energia e vitalidade à sua rotina.</p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[#b8c3d1]">Nossa formação ajuda você a entender as características de cada produto, apresentar suas aplicações com clareza e construir um atendimento responsável.</p>
          <img src="/api/storage/preview/paginas%2Finicio-tecnologias-20260930.png" alt="Tecnologias FIR Power, Magneto, Íon Balls e MFP" width={668} height={118} loading="lazy" decoding="async" className="mx-auto my-5 h-auto w-full max-w-[668px] object-contain" />
          </div>
        </div>
      </div>
      <div className="p-[33.6px] text-center sm:p-[50.4px]">
        <div className="mb-7">{join("Quero mudar de vida!", true)}</div>
        <h3 className="text-[33.6px] font-bold text-white">Sua jornada começa com uma conversa.</h3>
        <p className="mx-auto mt-[16.8px] max-w-[940.8px] text-[19.6px] leading-relaxed text-[#b8c3d1]">Preencha o formulário para receber o contato da equipe. Entenda os produtos, o investimento inicial, as responsabilidades e as condições de remuneração antes de decidir.</p>
      </div>
      <QueroFazerParteModal isOpen={open} onClose={() => setOpen(false)} />
    </section>
  );
}
