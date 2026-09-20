import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportTicket } from "./db.js";

// Each mutation runs in a single PostgreSQL transaction. There is no JSON-list
// fallback: a missing migration must never silently restore the lost-update bug.
export async function supportAction<T>(client: SupabaseClient | null, action: string, data: unknown = {}): Promise<T> {
  if (!client) throw new Error("Suporte indisponível. Tente novamente mais tarde.");
  const result = await client.rpc("fenix_support_action", { p_action: action, p_data: data });
  if (result.error) {
    const safeErrors = new Set([
      "Chamado não encontrado.", "Este chamado está encerrado. Reabra antes de enviar uma mensagem.",
      "Este chamado não pertence a você.", "Transição de situação não permitida.",
      "Informe assunto e mensagem válidos.", "Escreva a mensagem ou anexe um arquivo."
    ]);
    if (result.error.code === "P0001" && safeErrors.has(result.error.message)) throw new Error(result.error.message);
    console.error("[Support] database operation failed", { action, code: result.error.code });
    throw new Error("Suporte temporariamente indisponível. Tente novamente mais tarde.");
  }
  return result.data as T;
}

export type SupportMutationResult = { success: boolean; ticket?: SupportTicket; error?: string };
