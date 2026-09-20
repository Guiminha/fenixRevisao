import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../store";

export default function CourseSupportModal({ onClose, onSent }: { onClose: () => void; onSent: (numero: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const createTicket = useStore(s => s.createSupportTicket);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending.current) return;
    if (!assunto.trim() || !mensagem.trim()) { setError("Preencha o assunto e a mensagem."); return; }
    sending.current = true; setBusy(true); setError("");
    try {
      const result = await createTicket(assunto.trim(), mensagem.trim());
      if (result.success && result.ticket) onSent(result.ticket.numero);
      else setError(result.error || "Não foi possível enviar. Tente novamente.");
    } catch { setError("Não foi possível enviar. Verifique sua conexão e tente novamente."); }
    finally { sending.current = false; setBusy(false); }
  };
  return createPortal(
    <dialog ref={dialog} aria-labelledby="course-support-title" onCancel={event => {
      event.preventDefault(); if (!sending.current) onClose();
    }} className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#111820] p-6 text-white shadow-2xl backdrop:bg-black/75">
      <h2 id="course-support-title" className="text-lg font-bold mb-5">Falar com o suporte</h2>
      <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <div>
          <label htmlFor="course-support-subject" className="block text-sm mb-2">Assunto</label>
          <input id="course-support-subject" autoFocus required maxLength={200} value={assunto} disabled={busy}
            onChange={e => setAssunto(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#0b1016] px-3 py-2 outline-none focus:border-[#d12a62]" />
        </div>
        <div>
          <label htmlFor="course-support-message" className="block text-sm mb-2">Mensagem</label>
          <textarea id="course-support-message" required maxLength={5000} rows={6} value={mensagem} disabled={busy}
            onChange={e => setMensagem(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#0b1016] px-3 py-2 outline-none focus:border-[#d12a62] resize-y" />
        </div>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-white/20 px-4 py-2 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-[#d12a62] px-4 py-2 font-semibold disabled:opacity-50">{busy ? "Enviando…" : "Enviar"}</button>
        </div>
      </form>
    </dialog>, document.body
  );
}
