import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";

const FIVE_MINUTES = 300_000;
export class LoginAttempts {
  private records = new Map<string, { failures: number; lastFailure: number; until: number; pending: number }>();
  constructor(private now = Date.now) {}
  begin(keys: string[]): number {
    const now = this.now();
    for (const [key, r] of this.records) {
      if (!r.pending && now >= r.until && now - r.lastFailure >= FIVE_MINUTES) this.records.delete(key);
    }
    let retry = 0;
    for (const key of keys) {
      const r = this.records.get(key);
      if (r) {
        if (r.until && now >= r.until) { r.failures = 0; r.until = 0; }
        retry = Math.max(retry, Math.ceil((r.until - now) / 1000), r.pending >= Math.max(1, 3 - r.failures) ? 1 : 0);
      }
    }
    if (retry > 0) return retry;
    for (const key of keys) {
      const r = this.records.get(key) || { failures: 0, lastFailure: now, until: 0, pending: 0 };
      r.pending++;
      this.records.set(key, r);
    }
    return 0;
  }
  finish(keys: string[], status: number) {
    const now = this.now();
    for (const key of keys) {
      const r = this.records.get(key);
      if (!r) continue;
      r.pending = Math.max(0, r.pending - 1);
      if ([400, 401, 403].includes(status)) {
        r.failures++;
        r.lastFailure = now;
        if (r.failures >= 3 && !r.until) r.until = now + FIVE_MINUTES;
      } else if (status >= 200 && status < 300 && !r.until) r.failures = 0;
    }
  }
}

export function createLoginProtection(attempts = new LoginAttempts()) {
  return (req: Request, res: Response, next: NextFunction) => {
    const keys = [`ip:${req.ip || req.socket.remoteAddress}`];
    const account = req.body?.email || req.body?.code;
    if (typeof account === "string" && account.length <= 254) {
      keys.push(`account:${createHash("sha256").update(account.trim().toLowerCase()).digest("hex")}`);
    }
    const retryAfterSeconds = attempts.begin(keys);
    if (retryAfterSeconds) {
      res.setHeader("Retry-After", retryAfterSeconds);
      return res.status(429).json({ error: `Acesso temporariamente bloqueado. Tente novamente em ${retryAfterSeconds} segundos. Após 3 erros, o bloqueio dura 5 minutos.`, retryAfterSeconds });
    }
    let completed = false;
    const finish = (status: number) => {
      if (completed) return;
      completed = true;
      attempts.finish(keys, status);
    };
    res.once("finish", () => finish(res.statusCode));
    res.once("close", () => finish(res.writableFinished ? res.statusCode : 499));
    next();
  };
}
