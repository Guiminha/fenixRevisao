// Keep diagnostics useful to administrators without persisting raw exception
// messages, URLs, tokens or Supabase response bodies in the metrics table.
export class DiagnosedError extends Error {
  constructor(public readonly stage: string, public readonly original: unknown) {
    super(`Falha em ${stage}`);
    this.name = "DiagnosedError";
  }
}

export function describeFailure(error: unknown): { stage?: string; diagnostic: string } {
  const stage = error instanceof DiagnosedError ? error.stage : undefined;
  const original = error instanceof DiagnosedError ? error.original : error;
  const value = original && typeof original === "object" ? original as Record<string, unknown> : {};
  const cause = value.cause && typeof value.cause === "object" ? value.cause as Record<string, unknown> : {};
  const name = typeof value.name === "string" && /^(Error|TypeError|AbortError|AuthApiError|AuthRetryableFetchError|PostgrestError|FetchError|TimeoutError|AggregateError)$/.test(value.name)
    ? value.name : "Erro desconhecido";
  const status = typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599
    ? `HTTP ${value.status}` : null;
  const safeCode = (code: unknown) => typeof code === "string" && /^(?:E(?:CONNRESET|CONNREFUSED|TIMEDOUT|HOSTUNREACH|PIPE|AI_AGAIN)|ENOTFOUND|ABORT_ERR|UND_ERR_[A-Z_]+|PGRST\d{3}|[0-9A-Z]{5}|SERVICE_UNAVAILABLE)$/.test(code) ? code : null;
  const code = safeCode(value.code);
  const causeCode = safeCode(cause.code);
  const message = typeof value.message === "string" ? value.message.toLowerCase() : "";
  const category = /timeout|timed out|aborted/.test(message) ? "tempo esgotado"
    : /fetch failed|network error/.test(message) ? "falha de rede" : null;
  return { stage, diagnostic: [name, status, code, causeCode && causeCode !== code ? causeCode : null, category].filter(Boolean).join(" · ") };
}
