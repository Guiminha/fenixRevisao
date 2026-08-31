import React, { useState } from "react";
import { useStore } from "../store";
import { ShieldCheck, ArrowRight, Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function AdminLoginView() {
  const { login, setActiveView, publicData, restrictedData } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login({ email, password });
    setLoading(false);

    if (result.success) {
      // Get the freshly logged-in user from the store state
      const loggedInUser = useStore.getState().user;

      if (loggedInUser && loggedInUser.role !== "admin") {
        setError("Autenticado, mas você não possui privilégios de administrador. Certifique-se de executar o comando UPDATE no SQL Editor do Supabase (descrito em supabase_schema.sql) para promover este e-mail para 'admin' no app_metadata.");
        // Log out immediately to clear state
        useStore.getState().logout();
      } else {
        setActiveView("admin");
        // Optionally update URL to avoid being stuck on /adminfenix if user navigates away later
        window.history.pushState({}, "", "/");
      }
    } else {
      setError(result.error || "Erro ao fazer login.");
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center px-4 py-10 overflow-hidden animate-fade-in">
      {/* Fundo decorativo: blobs aurora + brilho superior */}
      <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-[#d12a62]/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute -bottom-48 -right-32 w-[520px] h-[520px] rounded-full bg-gold/10 blur-[140px] pointer-events-none"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[340px] h-[260px] rounded-full bg-[#d12a62]/10 blur-[90px] pointer-events-none"></div>

      {/* Marca no topo */}
      <div className="relative z-10 flex flex-col items-center mb-8">
        {(publicData?.logoUrl || restrictedData?.logoUrl) ? (
          <img
            src={publicData?.logoUrl || restrictedData?.logoUrl}
            alt="Logo Grupo Fênix"
            className="h-14 sm:h-16 max-w-[260px] object-contain"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gold-metallic p-[2px] flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-[#0b0f14] flex items-center justify-center">
                <span className="text-[13px] font-black text-[#e8edf2] tracking-tight">F</span>
              </div>
            </div>
            <span className="text-lg font-display font-bold tracking-[0.18em] text-[#e8edf2] uppercase">
              Grupo <span className="text-gold-metallic">Fênix</span>
            </span>
          </div>
        )}
        <span className="mt-2 text-[10px] font-mono uppercase tracking-[0.35em] text-[#8a96a3]">
          Painel Administrativo
        </span>
      </div>

      {/* Card de login */}
      <div className="relative z-10 w-full max-w-md">
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[#d12a62]/30 via-white/5 to-gold/20 blur-[2px] pointer-events-none"></div>
        <div className="relative bg-[#10151c]/95 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-[0_24px_60px_-15px_rgba(0,0,0,0.8)] p-7 md:p-9 overflow-hidden">
          {/* Linha de acento no topo do card */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-[#d12a62] to-transparent"></div>

          <div className="flex flex-col items-center text-center mb-7">
            <div className="w-14 h-14 rounded-2xl bg-gold-metallic p-[3px] flex items-center justify-center shadow-[0_0_24px_rgba(209,42,98,0.35)] mb-4">
              <div className="w-full h-full rounded-[10px] bg-[#0d1117] flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-[#d12a62]" />
              </div>
            </div>
            <h2 className="text-xl md:text-[22px] font-bold text-[#e8edf2] tracking-tight">
              Acesse sua conta
            </h2>
            <p className="text-xs md:text-[13px] text-[#8a96a3] mt-1.5 leading-relaxed">
              Área restrita da administração do sistema.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/25 text-red-400 text-xs text-center leading-relaxed">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-email" className="text-[11px] font-semibold text-[#e8edf2] uppercase tracking-wider">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a96a3] pointer-events-none" />
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className="w-full bg-[#0b0f14]/80 border border-[#2a323d] rounded-xl pl-11 pr-4 py-3 text-sm text-[#e8edf2] focus:outline-none focus:border-[#d12a62]/60 focus:ring-2 focus:ring-[#d12a62]/15 transition-all placeholder:text-[#5c6672]"
                  placeholder="seu-email@empresa.com"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-password" className="text-[11px] font-semibold text-[#e8edf2] uppercase tracking-wider">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a96a3] pointer-events-none" />
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full bg-[#0b0f14] border border-white/[0.06] rounded-xl pl-11 pr-11 py-3 text-sm text-[#e8edf2] focus:outline-none focus:border-[#d12a62]/60 focus:ring-2 focus:ring-[#d12a62]/15 transition-all placeholder:text-[#5c6672]"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8a96a3] hover:text-[#e8edf2] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="mt-2 w-full btn-gold-metallic h-12 rounded-xl text-xs md:text-sm uppercase tracking-[0.18em] font-bold flex items-center justify-center gap-2 transition-transform duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Entrar no Painel
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-7 text-center text-[10px] text-[#5c6672] leading-relaxed">
            Acesso monitorado e protegido.<br />
            Tentativas inválidas são registradas para segurança.
          </p>
        </div>
      </div>

      <p className="relative z-10 mt-8 text-[10px] text-[#4c5762] tracking-wider">
        © {new Date().getFullYear()} Grupo Fênix · Todos os direitos reservados
      </p>
    </div>
  );
}