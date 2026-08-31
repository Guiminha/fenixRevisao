import React, { useState } from "react";
import { 
  UserPlus, 
  Send, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Mail, 
  Phone, 
  User, 
  FileText, 
  Loader2, 
  MapPin, 
  Globe 
} from "lucide-react";

interface QueroFazerParteModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  tipoParceria?: string;
}

export default function QueroFazerParteModal({ 
  isOpen, 
  onClose,
  title = "Quero Fazer Parte do Grupo Fênix",
  subtitle = "Preencha seus dados de contato e localização para fazer parte da nossa comunidade.",
  tipoParceria = "Quero Fazer Parte"
}: QueroFazerParteModalProps) {
  const [parcNome, setParcNome] = useState("");
  const [parcEmail, setParcEmail] = useState("");
  const [parcTelefone, setParcTelefone] = useState("");
  const [parcCidade, setParcCidade] = useState("");
  const [parcEstado, setParcEstado] = useState("");
  const [parcPais, setParcPais] = useState("");
  const [parcMensagem, setParcMensagem] = useState("");
  const [parcHoneypot, setParcHoneypot] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setParcNome("");
    setParcEmail("");
    setParcTelefone("");
    setParcCidade("");
    setParcEstado("");
    setParcPais("");
    setParcMensagem("");
    setParcHoneypot("");
  };

  const handleClose = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Client validations
    if (!parcNome.trim() || parcNome.trim().length < 2) {
      setErrorMessage("Por favor, informe seu nome completo (mínimo 2 caracteres).");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!parcEmail.trim() || !emailRegex.test(parcEmail.trim())) {
      setErrorMessage("Por favor, informe um endereço de e-mail válido.");
      return;
    }
    if (!parcTelefone.trim()) {
      setErrorMessage("Por favor, informe seu WhatsApp com DDD.");
      return;
    }
    const phoneDigits = parcTelefone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      setErrorMessage("Informe um WhatsApp válido com DDD (somente números, ex.: 11988887777).");
      return;
    }
    if (!parcCidade.trim()) {
      setErrorMessage("Por favor, informe a sua cidade.");
      return;
    }
    if (!parcEstado.trim()) {
      setErrorMessage("Por favor, informe o seu estado.");
      return;
    }
    if (!parcPais.trim()) {
      setErrorMessage("Por favor, informe o seu país.");
      return;
    }
    if (!parcMensagem.trim() || parcMensagem.trim().length < 15) {
      setErrorMessage("Sua mensagem deve conter pelo menos 15 caracteres.");
      return;
    }
    if (parcMensagem.trim().length > 3000) {
      setErrorMessage("Sua mensagem excede o limite máximo de 3000 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ouvidoria/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "parceria",
          nome: parcNome,
          email: parcEmail,
          telefone: parcTelefone,
          cidade: parcCidade,
          estado: parcEstado,
          pais: parcPais,
          tipoParceria: tipoParceria || "Quero Fazer Parte",
          mensagem: parcMensagem,
          aceitaLgpd: true,
          website: parcHoneypot
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMessage(data.message || "Sua solicitação foi enviada com sucesso!");
        resetForm();
      } else {
        setErrorMessage(data.error || "Ocorreu um erro ao enviar sua solicitação.");
      }
    } catch (err) {
      setErrorMessage("Erro de conexão ao enviar solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div 
        className="relative w-[92%] sm:w-full max-w-2xl bg-[#0e141d] border border-white/10 rounded-2xl p-5 sm:p-6 md:p-8 shadow-2xl my-4 sm:my-8 max-h-[85vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer z-10"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-white/10 pr-8">
          <div className="w-11 h-11 rounded-xl bg-[#d12a62]/15 border border-[#d12a62]/30 flex items-center justify-center text-[#d12a62] flex-shrink-0">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#f1f5f9] font-display">
              {title}
            </h2>
            <p className="text-xs sm:text-sm text-[#94a3b8] mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Alert Banners */}
        {successMessage && (
          <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-xs sm:text-sm flex items-start gap-3 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-grow">
              <span className="font-bold block text-green-200">Solicitação Enviada!</span>
              <p>{successMessage}</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs sm:text-sm flex items-start gap-3 shadow-lg">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-grow">
              <span className="font-bold block text-red-200">Atenção ao Preenchimento:</span>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Honeypot field */}
          <input
            type="text"
            name="_hp"
            value={parcHoneypot}
            onChange={(e) => setParcHoneypot(e.target.value)}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nome */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#cbd5e1] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#d12a62]" />
                Nome Completo <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Mariana Castro"
                value={parcNome}
                onChange={(e) => setParcNome(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-[#64748b] text-xs focus:outline-none focus:border-[#d12a62] transition-colors"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#cbd5e1] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#d12a62]" />
                E-mail de Contato <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="seuemail@exemplo.com"
                value={parcEmail}
                onChange={(e) => setParcEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-[#64748b] text-xs focus:outline-none focus:border-[#d12a62] transition-colors"
              />
            </div>
          </div>

          {/* WhatsApp */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#cbd5e1] flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-[#d12a62]" />
              <span className="flex items-center gap-1.5">
                WhatsApp (com DDD) <span className="text-red-400">*</span>
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-mono font-bold uppercase tracking-wider">Contato prioritário</span>
              </span>
            </label>
            <input
              type="tel"
              required
              inputMode="numeric"
              placeholder="(11) 98888-7777 — somente números com DDD"
              value={parcTelefone}
              onChange={(e) => setParcTelefone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-[#64748b] text-xs focus:outline-none focus:border-[#d12a62] transition-colors"
            />
          </div>

          {/* Localização: Cidade, Estado, País */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#cbd5e1] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#d12a62]" />
                Cidade <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: São Paulo"
                value={parcCidade}
                onChange={(e) => setParcCidade(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-[#64748b] text-xs focus:outline-none focus:border-[#d12a62] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#cbd5e1] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#d12a62]" />
                Estado <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: SP"
                value={parcEstado}
                onChange={(e) => setParcEstado(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-[#64748b] text-xs focus:outline-none focus:border-[#d12a62] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#cbd5e1] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#d12a62]" />
                País <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Brasil"
                value={parcPais}
                onChange={(e) => setParcPais(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-[#64748b] text-xs focus:outline-none focus:border-[#d12a62] transition-colors"
              />
            </div>
          </div>

          {/* Mensagem / Motivação */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#cbd5e1] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#d12a62]" />
                Por que você quer fazer parte? <span className="text-red-400">*</span>
              </label>
              <span className={`text-[10px] font-mono ${parcMensagem.length > 3000 ? "text-red-400 font-bold" : "text-[#64748b]"}`}>
                {parcMensagem.length} / 3000
              </span>
            </div>
            <textarea
              required
              rows={4}
              placeholder="Conte-nos um pouco sobre você, seus objetivos e por que gostaria de fazer parte do Grupo Fênix..."
              value={parcMensagem}
              onChange={(e) => setParcMensagem(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-[#64748b] text-xs focus:outline-none focus:border-[#d12a62] transition-colors resize-y min-h-[100px]"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-white/10">
            <button
              type="button"
              onClick={handleClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl bg-gradient-to-r from-[#d12a62] to-[#b01e4e] hover:from-[#e0356d] hover:to-[#c42357] text-white font-bold text-xs shadow-lg shadow-[#d12a62]/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando Solicitação...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar Solicitação - Quero Fazer Parte
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
