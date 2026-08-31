import React, { useState, useEffect, useRef } from "react";
import { useStore } from "../store";
import { Key, Flame, Loader2, AlertCircle, X } from "lucide-react";

interface LoginModalProps {
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function LoginModal({ onSuccess, onClose }: LoginModalProps) {
  const { login, publicData, restrictedData } = useStore();
  const logoUrl = publicData?.logoUrl || restrictedData?.logoUrl;
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Autofocus on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, ""); // Keep only numbers
    if (val.length <= 6) {
      setCode(val);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) {
      setError("O código de acesso deve conter exatamente 6 dígitos.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await login({ code });
    setLoading(false);

    if (result.success) {
      setFailedAttempts(0);
      if (onSuccess) onSuccess();
    } else {
      setFailedAttempts((prev) => prev + 1);
      setError(result.error || "Ocorreu um erro ao validar seu código.");
    }
  };

  const handleQuickFill = async (demoCode: string) => {
    setCode(demoCode);
    setError(null);
    setLoading(true);
    const result = await login({ code: demoCode });
    setLoading(false);
    if (result.success) {
      setFailedAttempts(0);
      if (onSuccess) onSuccess();
    } else {
      setFailedAttempts((prev) => prev + 1);
      setError(result.error || "Ocorreu um erro.");
    }
  };

  const showSupportHint = failedAttempts >= 3;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div
        id="login-dialog-container"
        className="w-[92%] sm:w-full max-w-md bg-[#0f131a]/90 border border-white/[0.05] rounded-3xl p-5 sm:p-6 md:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl my-auto"
      >
        {/* Glow effect */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-[#d12a62]/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-[#d12a62]/[0.03] rounded-full blur-3xl"></div>

        {/* Close Button if applicable */}
        {onClose && (
          <button 
            id="login-close-btn"
            onClick={onClose}
            className="absolute top-4 right-4 text-[#94a3b8] hover:text-[#f1f5f9] p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Branded Header */}
        <div className="flex flex-col items-center text-center mb-6">
          {logoUrl ? (
            <div className="max-h-[125px] max-w-[260px] flex items-center justify-center mb-4">
              <img src={logoUrl} alt="Logo" className="max-h-[125px] max-w-full object-contain" referrerPolicy="no-referrer" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-full bg-gold-metallic p-[1.5px] flex items-center justify-center shadow-lg shadow-[#d12a62]/10 mb-4 overflow-hidden bg-[#07090e]">
              <div className="w-full h-full rounded-full bg-[#07090e] flex items-center justify-center">
                <Flame className="w-6 h-6 text-[#d12a62]" fill="#d12a62" />
              </div>
            </div>
          )}
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            Área Restrita Grupo Fênix
          </h2>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-[#94a3b8] uppercase tracking-wider block text-center">
              Insira o codigo D. I. para acessar
            </label>
            <div className="relative">
              <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94a3b8]" />
              <input
                id="login-code-input"
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={handleInputChange}
                placeholder="••••••"
                disabled={loading}
                className="w-full bg-[#07090e] border border-white/[0.05] focus:border-[#d12a62]/40 text-[#d12a62] text-xl text-center rounded-2xl py-3 pl-12 pr-4 outline-none transition-all tracking-[0.3em] font-mono focus:ring-1 focus:ring-[#d12a62]/30"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/20 border border-red-500/20 text-[#dc2626] text-xs leading-relaxed animate-shake">
              <AlertCircle className="w-4.5 h-4.5 flex-shrink-0 mt-0.5 text-red-500" />
              <div className="space-y-1">
                <span>{error}</span>
                {showSupportHint && (
                  <span className="block text-[#f59e24] font-semibold">
                    Você pode ter digitado o código incorretamente. Se o problema persistir, entre em contato com o suporte do Grupo Fênix para obter assistência.
                  </span>
                )}
              </div>
            </div>
          )}

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full btn-gold-metallic py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#07090e]" />
                Verificando...
              </>
            ) : (
              "Desbloquear Acesso"
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
