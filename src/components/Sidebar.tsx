import React, { useState } from "react";
import { useStore } from "../store";
import QueroFazerParteModal from "./QueroFazerParteModal";
import { motion, AnimatePresence } from "motion/react";
import { 
  Home, 
  Users, 
  Brain,
  GraduationCap, 
  FolderDown, 
  Flame,
  Crown,
  ShieldAlert,
  Instagram, 
  Youtube, 
  Linkedin, 
  Github, 
  LogOut, 
  UserCheck, 
  Settings, 
  ShieldCheck,
  Menu, 
  FileText,
  X,
  ChevronDown,
  UserPlus,
  BarChart3,
  Layers,
  Eye,
  Server,
  Globe,
  KeyRound,
  LifeBuoy
} from "lucide-react";
import { ViewType, SubViewType } from "../types";

export default function Sidebar() {
  const { 
    activeView, 
    setActiveView, 
    subView, 
    setSubView, 
    user, 
    loggedIn, 
    logout,
    activeCourse,
    publicData,
    restrictedData,
    adminActiveTab,
    setAdminActiveTab,
    adminDiCodes
  } = useStore();

  const diMatch = adminDiCodes?.find(
    (d) =>
      d.codigo.toUpperCase() === user?.code?.toUpperCase() ||
      `DI-${d.codigo.toUpperCase()}` === user?.code?.toUpperCase() ||
      d.codigo.toUpperCase() === `DI-${user?.code?.toUpperCase()}`
  );

  const userDisplayName =
    user?.name ||
    diMatch?.descricao ||
    user?.descricao ||
    (user?.role === "admin" ? "Administrador" : "Aluno Ativo");

  const userInitials = (() => {
    if (user?.role === "admin" && !user?.name) return "AD";
    if (userDisplayName && userDisplayName !== "Membro Fênix" && userDisplayName !== "Aluno Ativo") {
      const parts = userDisplayName.trim().split(/[\s—-]+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      } else if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
      }
    }
    return "DI";
  })();

  const logoUrl = publicData?.logoUrl || restrictedData?.logoUrl;

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [isQueroFazerParteOpen, setIsQueroFazerParteOpen] = useState(false);

  const mainNavItems = [
    { id: "inicio", label: "Início", icon: Home },
    { id: "grupo-fenix", label: "Grupo Fênix", icon: Users },
    { id: "fenix-social", label: "Fenix Social", icon: Flame },
    { id: "tecnologias", label: "Tecnologias", icon: Brain },
    { id: "elite-milionario", label: "Elite Milionária", icon: Crown },
    { id: "escola-fenix", label: "Escola Fênix", icon: GraduationCap, restricted: true },
    { id: "conteudos", label: "Conteúdos", icon: FolderDown, restricted: true },
    { id: "suporte", label: "Suporte", icon: LifeBuoy, restricted: true }
  ];

  const adminNavItems = [
    { id: "dashboard", label: "Visão Geral", icon: BarChart3 },
    { id: "cadastrar-di", label: "Cadastrar D.I.", icon: KeyRound },
    { id: "banners", label: "Banners Início", icon: Layers },
    { id: "cards-home", label: "Cards Tela Inicial", icon: Eye },
    { id: "cursos", label: "Cursos & Aulas", icon: GraduationCap },
    { id: "materiais", label: "Materiais", icon: FolderDown },
    { id: "fenix-social", label: "Fênix Social", icon: Flame },
    { id: "suporte", label: "Suporte", icon: LifeBuoy },
    { id: "bio", label: "Biografia", icon: Users },
    { id: "paginas", label: "Tecnologias", icon: FileText },
    { id: "elite", label: "Elite Milionária", icon: Crown },
    { id: "backup", label: "Backup & Restauração", icon: ShieldCheck },
    { id: "servidores", label: "Servidores Externos", icon: Server }
  ];

  const handleNavItemClick = (viewId: ViewType) => {
    setActiveView(viewId);
    setMobileOpen(false);
  };

  const renderNavLinks = () => {
    const listVariants = {
      hidden: {},
      show: {
        transition: { staggerChildren: 0.06, delayChildren: 0.1 },
      },
    };

    const itemVariants = {
      hidden: { opacity: 0, x: -14 },
      show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
    };

    if (activeView === "admin") {
      return (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20 mb-2 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span>Sessões do Painel</span>
          </div>

          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = adminActiveTab === item.id;
            return (
              <button
                key={item.id}
                id={`admin-nav-${item.id}`}
                onClick={() => {
                  setAdminActiveTab(item.id as any);
                  setMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-300 ${
                  isActive 
                    ? "bg-[#d12a62]/15 text-[#d12a62] font-bold border border-[#d12a62]/30 shadow-md" 
                    : "text-[#94a3b8] hover:bg-white/5 hover:text-[#f1f5f9] transition-colors"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          <button
            id="admin-nav-back-to-site"
            onClick={() => {
              setActiveView("inicio");
              setMobileOpen(false);
            }}
            className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-amber-300 border border-amber-500/20 transition-all cursor-pointer"
          >
            <Globe className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Voltar ao Site</span>
          </button>
        </div>
      );
    }

return (
    <motion.div
      variants={listVariants}
      className="flex flex-col gap-1.5"
    >
      {mainNavItems.filter((item) => item.id !== "suporte" || loggedIn).map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        return (
          <motion.button
            key={item.id}
            id={`nav-${item.id}`}
            onClick={() => handleNavItemClick(item.id as ViewType)}
            variants={itemVariants}
            whileHover={{ x: 3 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-300 ${
              isActive 
                ? "bg-[#d12a62]/10 text-[#d12a62] font-semibold border border-[#d12a62]/20" 
                : "text-[#94a3b8] hover:bg-white/5 hover:text-[#f1f5f9]"
            }`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="truncate">{item.label}</span>
            {item.restricted && !loggedIn && (
              <span className="ml-auto text-[10px] uppercase font-bold tracking-wider text-amber-500 opacity-60">
                🔒
              </span>
            )}
          </motion.button>
        );
      })}

      {/* Quero fazer parte! Button below Ouvidoria */}
      <motion.button
        id="nav-quero-fazer-parte"
        onClick={() => {
          setIsQueroFazerParteOpen(true);
          setMobileOpen(false);
        }}
        variants={itemVariants}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold btn-gold-metallic shadow-lg shadow-[#d12a62]/15 transition-shadow cursor-pointer"
      >
        <UserPlus className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">Quero fazer parte!</span>
      </motion.button>
    </motion.div>
  );
};



  return (
    <>
      {/* Mobile & Tablet Top Bar */}
      <div className="lg:hidden w-full h-16 sm:h-20 bg-[#07090e]/95 backdrop-blur-md border-b border-white/[0.04] fixed top-0 left-0 z-40 px-4 sm:px-6 flex items-center justify-between">
        {/* Left spacing item to keep layout beautifully balanced */}
        <div className="w-10"></div>

        {/* Centered Logo with High Visibility */}
        <div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-105" 
          onClick={() => {
            setActiveView("inicio");
            setMobileOpen(false);
          }}
        >
          {logoUrl ? (
            <div className="h-12 sm:h-14 flex items-center justify-center">
              <img src={logoUrl} alt="Logo" className="h-full max-w-[180px] sm:max-w-[240px] object-contain" referrerPolicy="no-referrer" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shadow-[0_0_12px_rgba(209,42,98,0.3)] bg-[#07090e]">
                <div className="w-full h-full bg-gradient-to-tr from-[#881337] via-[#d12a62] to-[#fff1f2] flex items-center justify-center">
                  <span className="text-[#07090e] font-black font-display text-xs tracking-tighter">F</span>
                </div>
              </div>
              <span className="text-white font-bold tracking-widest text-sm uppercase">FÊNIX</span>
            </div>
          )}
        </div>

        {/* Menu Toggle Button on the Right */}
        <button
          id="mobile-menu-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-[#e8edf2] hover:bg-white/5 rounded-lg transition-colors z-50 flex items-center justify-center"
        >
          {mobileOpen ? <X className="w-6 h-6 sm:w-7 sm:h-7" /> : <Menu className="w-6 h-6 sm:w-7 sm:h-7" />}
        </button>
      </div>

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex w-64 h-screen fixed top-0 left-0 glass-panel flex-col justify-between py-6 px-4 z-30 select-none">
        <div className="flex flex-col">
          {/* Brand Logo */}
          <div 
            onClick={() => setActiveView("inicio")}
            className="flex flex-col items-center gap-1.5 mb-8 cursor-pointer group animate-fade-in"
          >
            {/* Logo Container adjusting to proportions */}
            {logoUrl ? (
              <div className="max-h-[83px] max-w-full flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
                <img src={logoUrl} alt="Logo" className="max-h-[83px] max-w-[234px] object-contain" referrerPolicy="no-referrer" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shadow-[0_0_15px_rgba(209,42,98,0.2)] transition-transform duration-500 group-hover:scale-105 bg-[#07090e]">
                <div className="w-full h-full bg-gradient-to-tr from-[#881337] via-[#d12a62] to-[#fff1f2] flex items-center justify-center">
                  <span className="text-[#07090e] font-black font-display text-sm tracking-tighter">F</span>
                </div>
              </div>
            )}
          </div>

          {/* Nav Items */}
          <motion.nav
            className="flex flex-col gap-1.5"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
            }}
          >
            {renderNavLinks()}
          </motion.nav>
          

        </div>

        {/* Sidebar Footer */}
        <div className="flex flex-col gap-3 border-t border-white/5 pt-4">
          {loggedIn && user ? (
            <div className="flex flex-col gap-2 p-3 bg-white/5 rounded-xl border border-white/[0.04]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#d12a62]/20 border border-[#d12a62]/30 flex items-center justify-center text-[#d12a62] font-mono font-bold text-xs uppercase shrink-0">
                  {userInitials}
                </div>
                <div className="flex-grow min-w-0">
                  <div className="text-xs font-bold text-[#f1f5f9] truncate" title={userDisplayName}>
                    {userDisplayName}
                  </div>
                  <div className="text-[10px] text-[#94a3b8] font-mono truncate">
                    Código: {user.code || "654321"}
                  </div>
                </div>
              </div>
              <button
                id="sidebar-logout-btn"
                onClick={() => {
                  logout();
                  setMobileOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/30 text-red-400 text-xs font-semibold rounded-lg transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair da Conta
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-3 bg-[#d12a62]/5 rounded-xl border border-[#d12a62]/10">
              <div className="text-[10px] font-bold text-[#d12a62] tracking-wider uppercase font-mono">
                Acesso Limitado 🔒
              </div>
              <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                Desbloqueie os cursos e criativos com seu código de acesso.
              </p>
              <button
                id="sidebar-login-btn"
                onClick={() => {
                  setActiveView("escola-fenix");
                  setMobileOpen(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-gold-metallic hover:bg-[#fff1f2] text-[#07090e] text-xs font-bold rounded-lg transition-all shadow-lg shadow-[#d12a62]/10"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Desbloquear Agora
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile & Tablet Drawer (Wider & fully responsive) */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 bg-[#000]/60 z-40 backdrop-blur-sm pt-16 sm:pt-20"
            ></motion.div>

            {/* Drawer Panel */}
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.9 }}
              className="lg:hidden w-72 sm:w-80 h-screen fixed top-0 left-0 bg-[#0b0f14] border-r border-white/5 z-50 py-8 px-6 flex flex-col justify-between shadow-2xl"
            >
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                {logoUrl ? (
                  <div className="h-10 flex items-center justify-start">
                    <img src={logoUrl} alt="Logo" className="h-full max-w-[160px] object-contain" referrerPolicy="no-referrer" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shadow-[0_0_10px_rgba(209,42,98,0.3)] bg-[#07090e]">
                      <div className="w-full h-full bg-gradient-to-tr from-[#881337] via-[#d12a62] to-[#fff1f2] flex items-center justify-center">
                        <span className="text-[#07090e] font-black font-display text-xs tracking-tighter">F</span>
                      </div>
                    </div>
                    <span className="text-white font-bold tracking-widest text-xs uppercase">FÊNIX</span>
                  </div>
                )}
                
                {/* Dedicated Close Button inside drawer header */}
                <button 
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg text-[#94a3b8] hover:text-[#e8edf2] hover:bg-white/5 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <motion.nav
                className="flex flex-col gap-2.5"
                initial="hidden"
                animate="show"
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
                }}
              >
                {renderNavLinks()}
              </motion.nav>


            </div>

            <div className="flex flex-col gap-3 border-t border-white/5 pt-5">
              {loggedIn && user ? (
                <div className="flex flex-col gap-2 p-3 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#d12a62]/20 border border-[#d12a62]/30 flex items-center justify-center text-[#d12a62] font-mono font-bold text-xs uppercase shrink-0">
                      {userInitials}
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="text-xs font-bold text-[#e8edf2] truncate" title={userDisplayName}>
                        {userDisplayName}
                      </div>
                      <div className="text-[10px] text-[#8a96a3] font-mono truncate">
                        Código: {user.code || "654321"}
                      </div>
                    </div>
                  </div>
                  <button
                    id="mobile-logout-btn"
                    onClick={() => {
                      logout();
                      setMobileOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/30 text-red-400 text-xs font-semibold rounded-lg transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sair da Conta
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 p-3 bg-[#d12a62]/5 rounded-xl border border-[#d12a62]/10">
                  <div className="text-[10px] font-bold text-[#d12a62] tracking-wider uppercase font-mono">
                    Acesso Limitado 🔒
                  </div>
                  <p className="text-[11px] text-[#8a96a3] leading-relaxed">
                    Acesse todos os cursos e materiais com seu código.
                  </p>
                  <button
                    id="mobile-login-btn"
                    onClick={() => {
                      setActiveView("escola-fenix");
                      setMobileOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-gold-metallic hover:bg-[#fff1f2] text-[#07090e] text-xs font-bold rounded-lg transition-all shadow-lg shadow-[#d12a62]/10"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Desbloquear Agora
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>

      {/* Modal Quero Fazer Parte */}
      <QueroFazerParteModal 
        isOpen={isQueroFazerParteOpen}
        onClose={() => setIsQueroFazerParteOpen(false)}
      />
    </>
  );
}
