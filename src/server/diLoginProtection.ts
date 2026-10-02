import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { getSupabaseTrustedClient } from './db.js';

const HALF_HOUR = 30 * 60_000;
const DAY = 24 * 60 * 60_000;
type Decision = { retryAfterSeconds: number; reason: string; reservationId?: string; honeypot?: boolean };
type RecordState = { failures: number[]; refused: number[]; traps: number[]; until: number; reason: string; pending: Map<string, number> };

// Local shadow protects login before the migration and during DB outages.
// Every request is also checked atomically in Supabase once the SQL is installed.
export class DILoginAttempts {
  private records = new Map<string, RecordState>();
  constructor(private now = Date.now) {}
  begin(ip: string, honeypot: boolean): Decision {
    const now = this.now();
    this.clean(now);
    let r = this.records.get(ip);
    if (!r) {
      if (this.records.size >= 10_000) throw new Error('Limite de proteção local atingido.');
      r = { failures: [], refused: [], traps: [], until: 0, reason: '', pending: new Map() };
      this.records.set(ip, r);
    }
    if (honeypot) {
      r.traps.push(now);
      if (r.traps.length > 2) r.traps.shift();
      if (r.traps.length >= 2 && r.reason !== 'honeypot') { r.until = now + DAY; r.reason = 'honeypot'; }
      this.refuse(r, now);
      return { retryAfterSeconds: Math.max(0, Math.ceil((r.until - now) / 1000)), reason: r.reason || 'honeypot_detectado', honeypot: true };
    }
    if (r.until > now) {
      this.refuse(r, now);
      return { retryAfterSeconds: Math.ceil((r.until - now) / 1000), reason: r.reason };
    }
    // Reserve slots before validating credentials; parallel requests cannot
    // all slip through a limit that only counts completed responses.
    if (r.failures.length + r.pending.size >= 5) {
      this.refuse(r, now);
      return { retryAfterSeconds: Math.max(1, Math.ceil((r.until - now) / 1000)), reason: r.reason || 'validacoes_em_andamento' };
    }
    const reservationId = randomUUID();
    r.pending.set(reservationId, now);
    return { retryAfterSeconds: 0, reason: '', reservationId };
  }
  finish(ip: string, id: string | undefined, status: number) {
    const now = this.now();
    this.clean(now);
    const r = this.records.get(ip);
    if (!r || !id || !r.pending.delete(id)) return;
    if ([400, 401, 403].includes(status)) {
      r.failures.push(now);
      this.refuse(r, now);
      if (r.failures.length >= 5 && !r.until) { r.until = now + HALF_HOUR; r.reason = 'codigos_incorretos'; }
    } else if (status >= 200 && status < 300) r.failures = [];
  }
  private refuse(r: RecordState, now: number) {
    if (r.refused.length < 50) r.refused.push(now);
    if (r.refused.length >= 50 && !['insistencia', 'honeypot'].includes(r.reason)) { r.until = now + DAY; r.reason = 'insistencia'; }
  }
  private clean(now: number) {
    for (const [ip, r] of this.records) {
      r.failures = r.failures.filter(t => t > now - HALF_HOUR);
      r.refused = r.refused.filter(t => t > now - DAY);
      r.traps = r.traps.filter(t => t > now - DAY);
      for (const [id, t] of r.pending) if (t <= now - 120_000) r.pending.delete(id);
      if (r.until && r.until <= now) { r.until = 0; r.reason = ''; r.failures = []; }
      if (!r.until && !r.pending.size && !r.refused.length && !r.traps.length) this.records.delete(ip);
    }
  }
  list() {
    this.clean(this.now());
    return [...this.records].filter(([, r]) => r.until > this.now()).map(([ip, r]) => ({ ip, reason: r.reason, blockedUntil: new Date(r.until).toISOString() }));
  }
  release(ip: string) { this.records.delete(ip); }
}

const local = new DILoginAttempts();
let persistenceAvailable = false;
let retryPersistenceAt = 0;
async function rpc(action: string, ip = '', id = '', status = 0, honeypot = false): Promise<any | null> {
  if (Date.now() < retryPersistenceAt) return null;
  try {
    const client = getSupabaseTrustedClient();
    if (!client) throw new Error('unavailable');
    const { data, error } = await client.rpc('fenix_di_login_guard', { p_action: action, p_ip: ip, p_id: id, p_status: status, p_honeypot: honeypot }).abortSignal(AbortSignal.timeout(4000));
    if (error) throw error;
    persistenceAvailable = true;
    return data;
  } catch {
    persistenceAvailable = false;
    retryPersistenceAt = Date.now() + 60_000;
    console.warn('[Segurança / login D.I.] Persistência indisponível. Proteção local ativa; execute ou verifique supabase-login-di-protecao.sql.');
    return null;
  }
}

export function createDILoginProtection(attempts = local, persist = rpc): RequestHandler {
return async (req, res, next) => {
  // E-mail/password retain the existing administrative/support login policy.
  if (req.body?.code === undefined && !req.body?._hp) return next();
  const ip = (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (!isIP(ip)) return res.status(503).json({ error: 'Não foi possível verificar o acesso. Tente novamente.' }) as any;
  const honeypot = req.body?._hp !== undefined && req.body._hp !== '';
  try {
    let shadow = attempts.begin(ip, honeypot);
    const persistent = await persist('begin', ip, randomUUID(), 0, honeypot) as Decision | null;
    // Supabase is authoritative across server instances and manual releases.
    if (persistent?.reservationId && shadow.retryAfterSeconds) {
      attempts.release(ip);
      shadow = attempts.begin(ip, honeypot);
    }
    const decision = persistent || shadow;
    if (honeypot || decision.retryAfterSeconds > 0) {
      attempts.finish(ip, shadow.reservationId, 499);
      if (persistent?.reservationId) await persist('finish', ip, persistent.reservationId, 499);
      const seconds = decision.retryAfterSeconds;
      if (seconds) res.setHeader('Retry-After', seconds);
      return res.status(seconds ? 429 : 400).json({ error: seconds ? `Acesso temporariamente bloqueado. Tente novamente em ${Math.ceil(seconds / 60)} minuto(s).` : 'Não foi possível validar o envio. Reabra a janela e tente novamente.', retryAfterSeconds: seconds }) as any;
    }
    let completed = false;
    const finish = (status: number) => {
      if (completed) return;
      completed = true;
      attempts.finish(ip, shadow.reservationId, status);
      if (persistent?.reservationId) void persist('finish', ip, persistent.reservationId, status);
    };
    res.once('finish', () => finish(res.statusCode));
    res.once('close', () => finish(res.writableFinished ? res.statusCode : 499));
    next();
  } catch (error) { next(error); }
};
}
export const diLoginProtection = createDILoginProtection();

export async function listDILoginBlocks() {
  const data = await rpc('list');
  if (data) return { persistent: true, blocks: data.blocks || [] };
  const blocks = new Map<string, any>((data?.blocks || []).map((b: any) => [b.ip, b]));
  for (const b of local.list()) if (!blocks.has(b.ip) || b.blockedUntil > blocks.get(b.ip).blockedUntil) blocks.set(b.ip, b);
  return { persistent: persistenceAvailable, blocks: [...blocks.values()] };
}
export async function releaseDILoginBlock(ip: string) {
  if (!isIP(ip)) throw new Error('IP inválido.');
  // Never claim a persisted block was removed when Supabase is unavailable.
  const result = await rpc('release', ip);
  if (!result) throw new Error('Não foi possível liberar no Supabase. Verifique o SQL e tente novamente.');
  local.release(ip);
}
