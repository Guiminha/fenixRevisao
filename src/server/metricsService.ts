import crypto from 'node:crypto';
import { getSupabaseTrustedClient } from './db.js';

type Kind = 'login' | 'download' | 'course' | 'training' | 'di_new' | 'di_status' | 'error';
export type Metric = { kind: Kind; actor?: string; entity_id?: string; detail?: Record<string, unknown> };
let failedWrites = 0;
let lastFailure: string | null = null;

// Métricas nunca impedem login ou entrega de conteúdo. Falhas de coleta são
// explicitamente sinalizadas no painel; não são substituídas por números estimados.
export async function recordMetrics(events: Metric[]): Promise<void> {
  if (!events.length) return;
  try {
    const client = getSupabaseTrustedClient();
    if (!client) throw new Error('unavailable');
    const { error } = await client.from('fenix_metric_events').insert(events.map(event => ({
      ...event, id: crypto.randomUUID(), occurred_at: new Date().toISOString(),
    }))).abortSignal(AbortSignal.timeout(5000));
    if (error) throw error;
  } catch {
    failedWrites += events.length;
    lastFailure = new Date().toISOString();
    console.error('[Metrics] Falha de gravação; consulte o aviso de coleta no painel.');
  }
}
export function recordMetric(event: Metric) { return recordMetrics([event]); }
export async function metricsReport(days: number) {
  const client = getSupabaseTrustedClient();
  if (!client) throw new Error('Métricas indisponíveis.');
  const { data, error } = await client.rpc('fenix_metrics_report', { p_days: days })
    .abortSignal(AbortSignal.timeout(12000));
  if (error) throw new Error('Não foi possível consultar as métricas. Verifique a conexão e a aplicação de supabase-metricas-reais.sql.');
  return { ...data, collection: { failedWrites, lastFailure, scope: 'Desde o início deste processo do servidor' } };
}

const recentErrors = new Map<string, number>();
export function reportSystemError(source: string, code: string, message: string, route?: string) {
  // Evita uma cascata de erros quando uma integração está indisponível.
  const key = `${source}:${code}:${route || ''}`;
  const now = Date.now();
  if ((recentErrors.get(key) || 0) > now - 60000) return;
  for (const [k, t] of recentErrors) if (t < now - 60000) recentErrors.delete(k);
  if (recentErrors.size >= 500) return;
  recentErrors.set(key, now);
  void recordMetric({ kind: 'error', detail: { source, code, message, route } });
}
