import nodemailer from "nodemailer";

// Serviço de e-mail por SMTP — credenciais SOMENTE via env do servidor
// (nunca no banco/painel/bundle). Produção (Hostinger): SMTP_HOST=smtp.hostinger.com
// (Titan: smtp.titan.email), porta 465 (SSL) ou 587 (STARTTLS).
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const rawSecure = process.env.SMTP_SECURE;
// Por padrão, 465 = SSL (secure true); 587 = STARTTLS (secure false).
// SMTP_SECURE="true"/"false" no .env sobrepõe o padrão da porta.
const SMTP_SECURE = rawSecure !== undefined ? rawSecure === "true" : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "Grupo Fênix";

export function isSmtpConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email || "";
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

// Status sem nenhum segredo (user mascarado; senha nunca sai do processo).
export function getSmtpStatus(): { configured: boolean; host: string; port: number; secure: boolean; user: string } {
  return {
    configured: isSmtpConfigured(),
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    user: SMTP_USER ? maskEmail(SMTP_USER) : ""
  };
}

// Conteúdo de e-mail é texto puro sanitizado (anti HTML injection na mensagem).
export function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface MailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Fire-and-forget: falha de e-mail NUNCA quebra API/formulário. Logs mascarados.
export async function sendEmail(payload: MailPayload): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!isSmtpConfigured()) {
    console.log(`[E-mail][SKIPPED] SMTP não configurado (env SMTP_HOST/SMTP_USER/SMTP_PASS). Destino: ${maskEmail(payload.to)}`);
    return { ok: false, skipped: true };
  }
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  try {
    await transport.sendMail({
      from: `"${MAIL_FROM_NAME}" <${SMTP_USER}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html || undefined
    });
    console.log(`[E-mail][OK] "${payload.subject}" -> ${maskEmail(payload.to)}`);
    return { ok: true };
  } catch (err: any) {
    console.error(`[E-mail][ERRO] "${payload.subject}" -> ${maskEmail(payload.to)}: ${err?.message || "falha SMTP"}`);
    return { ok: false, error: err?.message || "Falha de envio." };
  }
}

export async function sendTestEmail(to: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (!isSmtpConfigured()) {
    return { ok: false, error: "SMTP não configurado. Adicione SMTP_HOST, SMTP_USER e SMTP_PASS no .env do servidor." };
  }
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, error: "Informe um e-mail de destino válido." };
  }
  const result = await sendEmail({
    to,
    subject: "Teste de e-mail — Plataforma Fênix",
    text: "Este é um e-mail de teste da Plataforma Fênix. Se você recebeu esta mensagem, o envio de e-mails (SMTP) está funcionando corretamente.",
    html: getTestEmailHtml()
  });
  if (result.ok) return { ok: true, message: "E-mail de teste enviado com sucesso." };
  return { ok: false, error: result.error || "Erro ao enviar e-mail de teste." };
}

// Templates das notificações (sanitizados via escapeHtml — nunca usar HTML cru)

function wrapShell(title: string, bodyHtml: string, footer: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;background:#0e141d;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#151b22;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:28px;">
<h2 style="color:#f1f5f9;margin:0 0 20px;">${title}</h2>
${bodyHtml}
<p style="color:#64748b;font-size:12px;margin-top:24px;">${footer}</p>
</div></body></html>`;
}

function fieldBlock(label: string, value: string): string {
  return `<div style="background:#0b0f14;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 16px;margin-bottom:10px;"><p style="color:#8a96a3;font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.4px;">${label}</p><p style="color:#e8edf2;font-size:13px;margin:0;word-break:break-word;white-space:pre-wrap;">${value}</p></div>`;
}

// Chatão de novo chamado de suporte (notificação inicial — atendimento é no sistema).
export function notifyNewTicketHtml(assunto: string, texto: string, criadoPorNome: string, criadoPor: string, numero: string): string {
  const h = escapeHtml;
  return wrapShell(
    `Novo chamado de suporte — #${h(numero)}`,
    `<p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">${h(criadoPorNome)} (<strong style="color:#d12a62;">${h(criadoPor)}</strong>) abriu um novo chamado na plataforma.</p>` +
    fieldBlock("Assunto", h(assunto)) +
    fieldBlock("Mensagem inicial", h(texto)),
    "Atendimento pelo painel de suporte (subdomínio próprio) — as respostas são feitas dentro da plataforma."
  );
}

// Novo interessado "Quero Fazer Parte" (contato é fora do sistema — WhatsApp em destaque).
export function notifyNewLeadHtml(lead: {
  nome: string; email: string; telefone?: string; cidade?: string; estado?: string; pais?: string;
  tipoParceria?: string; mensagem: string;
}): string {
  const h = escapeHtml;
  const wa = String(lead.telefone || "").replace(/\D/g, "");
  const waFull = wa ? (wa.startsWith("55") ? wa : `55${wa}`) : "";
  let body =
    `<p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">Novo contato de <strong style="color:#22d3ee;">Quero Fazer Parte</strong> recebido pelo site.</p>` +
    fieldBlock("Nome", h(lead.nome)) +
    fieldBlock("E-mail", h(lead.email));
  if (lead.telefone) {
    const line = wa
      ? `<span style="font-family:monospace;color:#34d399;">${h(lead.telefone)}</span> — <a href="https://wa.me/${waFull}" style="color:#34d399;font-weight:bold;">Abrir conversa no WhatsApp</a>`
      : h(lead.telefone);
    body += fieldBlock("WhatsApp (contato prioritário)", line);
  }
  const loc = [lead.cidade, lead.estado, lead.pais].filter(Boolean).join(" - ");
  if (loc) body += fieldBlock("Localização", h(loc));
  body += fieldBlock(lead.tipoParceria ? "Tipo de proposta" : "Proposta", h(lead.tipoParceria || "Quero Fazer Parte"));
  body += fieldBlock("Mensagem", h(lead.mensagem));
  return wrapShell("Novo interessado — Quero Fazer Parte", body, "Este contato é tratado fora do sistema (WhatsApp/e-mail).");
}

export function getTestEmailHtml(): string {
  return wrapShell(
    "Plataforma Fênix — Teste de e-mail",
    `<p style="color:#94a3b8;font-size:14px;line-height:1.6;">Este é um e-mail de teste. Se você recebeu esta mensagem, o envio de e-mails (SMTP) está funcionando corretamente.</p>`,
    "Enviado automaticamente pela Plataforma Fênix."
  );
}