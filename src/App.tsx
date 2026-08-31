import React, { useEffect, useState, lazy, Suspense } from "react";
import { useStore } from "./store";
import Sidebar from "./components/Sidebar";
import Footer from "./components/Footer";

// View components — code-split (lazy) to keep the initial bundle light.
// Heavy views (AdminView, FenixSocialView e afins) só carregam quando acessados.
const InicioView = lazy(() => import("./components/InicioView"));
const LeaderBioView = lazy(() => import("./components/LeaderBioView"));
const TecnologiasView = lazy(() => import("./components/TecnologiasView"));
const EscolaFenixView = lazy(() => import("./components/EscolaFenixView"));
const ConteudosView = lazy(() => import("./components/ConteudosView"));
const AdminView = lazy(() => import("./components/AdminView"));
const AdminLoginView = lazy(() => import("./components/AdminLoginView"));
const FenixSocialView = lazy(() => import("./components/FenixSocialView"));
const FenixModerationView = lazy(() => import("./components/FenixModerationView"));
const EliteMilionarioView = lazy(() => import("./components/EliteMilionarioView"));
const SuporteClienteView = lazy(() => import("./components/SuporteClienteView"));
const SupportApp = lazy(() => import("./components/SupportApp"));

import { Loader2 } from "lucide-react";

function ViewFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="relative w-12 h-12 rounded-full bg-gold-metallic p-0.5 flex items-center justify-center animate-spin">
        <div className="w-full h-full rounded-full bg-[#0b0f14] flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-[#d12a62]" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { 
    activeView, 
    authLoading, 
    fetchUser, 
    fetchPublicData,
    loggedIn,
    setActiveView
  } = useStore();

  // Modo manutenção: null = checando, "" = desligado, texto = mensagem do aviso.
  // Aplicado só ao site público (adminfenix.* e suporte.* continuam funcionando).
  const [manutencaoMsg, setManutencaoMsg] = useState<string | null>(null);

  // O host é a autoridade sobre o que renderizar (não só no mount): qualquer
  // mudança de activeView (logout, login, reset de estado) não pode exibir a
  // home do site dentro dos subdomínios adminfenix./suporte. (O servidor também
  // valida via ADMIN_HOST_PREFIX/ADMIN_HOSTS e SUPPORT_HOST_PREFIX/SUPPORT_HOSTS.)
  const hostname = window.location.hostname.toLowerCase();
  const isAdminSubdomain = hostname === "adminfenix" || hostname.startsWith("adminfenix.");
  const isSupportSubdomain = hostname === "suporte" || hostname.startsWith("suporte.");

// Verifica o modo manutenção no site público (os subdomínios admin/suporte
// não precisam — a rota pública nem existe neles).
useEffect(() => {
  if (isAdminSubdomain || isSupportSubdomain) {
    setManutencaoMsg("");
    return;
  }
  fetch("/api/manutencao/status")
    .then((r) => r.json())
    .then((d) => {
      if (d && d.ativo) {
        setManutencaoMsg(typeof d.mensagem === "string" && d.mensagem ? d.mensagem : "");
      } else {
        setManutencaoMsg("");
      }
    })
    .catch(() => setManutencaoMsg(""));
}, []);

  useEffect(() => {
    // Check if URL is for admin or moderation
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const modToken = searchParams.get("modToken") || searchParams.get("token");

    // O token de moderação NUNCA permanece na URL (vazaria para histórico,
    // logs de proxy e referrers). Captura-se, guarda-se em memória e limpa-se
    // a query string imediatamente (o link continua funcionando na sessão).
    if (modToken) {
      useStore.getState().setModerationToken(modToken);
      searchParams.delete("modToken");
      searchParams.delete("token");
      const cleanQuery = searchParams.toString();
      const cleanUrl = cleanQuery ? `${path}?${cleanQuery}` : path;
      window.history.replaceState({}, "", cleanUrl);
    }

    if (isSupportSubdomain) {
      setActiveView("support-app");
    } else if (isAdminSubdomain) {
      setActiveView("admin-login");
    } else if (path === "/adminfenix") {
      // Host público: /adminfenix retorna 404 no servidor; mantido apenas como fallback.
      setActiveView("admin-login");
    } else if (path === "/moderacao-fenix-x9k2" || path === "/moderacao-fenix" || modToken) {
      setActiveView("moderacao-fenix");
    }

    // Validate session on mount
    fetchUser();
    // Cache public contents
    fetchPublicData();
  }, []);

  const renderActiveView = () => {
    switch (activeView) {
      case "inicio":
        return <InicioView />;
      case "fenix-social":
        return <FenixSocialView />;
      case "elite-milionario":
        return <EliteMilionarioView />;
      case "moderacao-fenix":
        return <FenixModerationView />;
      case "grupo-fenix":
        return <LeaderBioView />;
      case "tecnologias":
        return <TecnologiasView />;
      case "escola-fenix":
        return <EscolaFenixView />;
      case "conteudos":
        return <ConteudosView />;
      case "suporte":
        return <SuporteClienteView />;
      case "admin":
        return <AdminView />;
      case "admin-login":
        return <AdminLoginView />;
      default:
        return <InicioView />;
    }
  };

  // Prevent flicker on load
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0f14] flex flex-col items-center justify-center text-center">
        <div className="relative w-14 h-14 rounded-full bg-gold-metallic p-0.5 flex items-center justify-center animate-spin mb-4">
          <div className="w-full h-full rounded-full bg-[#0b0f14] flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-[#d12a62]" />
          </div>
        </div>
        <span className="text-xs font-mono font-bold tracking-widest text-[#d12a62] uppercase">
          GRUPO FÊNIX
        </span>
        <span className="text-[10px] text-[#8a96a3] mt-1.5 font-sans font-medium">
          Validando chaves de acesso com segurança...
        </span>
      </div>
    );
  }

  // Modo manutenção (site público): enquanto ativo, visitantes veem o aviso.
  // Painel admin (adminfenix.*) e suporte (suporte.*) permanecem acessíveis.
  if (
    manutencaoMsg !== null &&
    manutencaoMsg !== "" &&
    !isAdminSubdomain &&
    !isSupportSubdomain &&
    !(activeView === "moderacao-fenix")
  ) {
    return (
      <div className="min-h-screen bg-[#0b0f14] flex flex-col items-center justify-center text-center px-6 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#d12a62]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative w-16 h-16 rounded-full bg-gold-metallic p-0.5 flex items-center justify-center mb-6">
          <div className="w-full h-full rounded-full bg-[#0b0f14] flex items-center justify-center">
            <span className="text-[#f5d442] font-black font-display">F</span>
          </div>
        </div>
        <h1 className="text-2xl md:text-3xl font-black font-display text-white tracking-tight">GRUPO FÊNIX <span className="text-[#d12a62]">•</span> Em Manutenção</h1>
        <p className="text-sm text-[#8a96a3] max-w-md mt-3 leading-relaxed">
          {manutencaoMsg || "Estamos realizando uma atualização importante no site. Volte em breve!"}
        </p>
        <p className="text-[10px] text-[#8a96a3]/60 mt-6 font-mono uppercase tracking-widest">Obrigado pela compreensão</p>
      </div>
    );
  }

  // Tela de login da área administrativa: layout próprio, tela cheia,
  // sem os menus/rodapé do site (cara de login de dashboard).
  if (activeView === "admin-login" || (isAdminSubdomain && !loggedIn)) {
    return (
      <div className="min-h-screen w-full bg-[#0b0f14] relative overflow-hidden">
        <Suspense fallback={<ViewFallback />}>
          <AdminLoginView />
        </Suspense>
      </div>
    );
  }

  // Subdomínio do suporte: app dedicado (login + painel do atendente), tela cheia.
  // Sempre renderizado em suporte.* — nada (logout/login/sessão) pode jogar a
  // home do site principal aqui dentro.
  if (activeView === "support-app" || isSupportSubdomain) {
    return (
      <div className="min-h-screen w-full bg-[#0b0f14] relative overflow-hidden">
        <Suspense fallback={<ViewFallback />}>
          <SupportApp />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f14] flex flex-col lg:flex-row text-[#e8edf2] relative overflow-x-hidden w-full">
      
      {/* 1. Left Vertical Navigation Sidebar */}
      <Sidebar />

      {/* 2. Content view pane with left offset to avoid sidebar overlap */}
      <div className="flex-grow min-h-screen flex flex-col lg:pl-64 pt-16 sm:pt-20 lg:pt-0 w-full overflow-x-hidden">
        
        {/* View content section */}
        <main className="px-4 py-6 sm:px-6 sm:py-8 lg:p-10 flex-grow w-full max-w-none mx-auto z-10 overflow-x-hidden">
          {/* key={activeView}: cada troca de view cria um boundary novo — evita a
              corrida do Suspense que deixava [conteúdo antigo + fallback] presos
              juntos (view travada sem nunca montar o componente novo). */}
          <Suspense key={activeView} fallback={<ViewFallback />}>
            {renderActiveView()}
          </Suspense>
        </main>

        {/* Sticky bottom Footer */}
        <Footer />
      </div>
    </div>
  );
}
