import crypto from "node:crypto";

export interface Identity {
  code: string;
  role: "admin" | "support" | "user";
  name: string;
  version: string;
  mustChangePassword?: boolean;
}
interface Session {
  id: string;
  identity: Identity;
  createdAt: number;
  expiresAt: number;
  refreshHash: string;
}
type Tokens = { access: string; refresh: string; identity: Identity };
export class DuplicateDISessionError extends Error {
  constructor() { super("Este D.I. já está conectado. Encerre a sessão anterior antes de entrar novamente."); }
}
const ACCESS_SECONDS = 15 * 60;
const REFRESH_MS = 7 * 86400000;
const MAX_MS = 30 * 86400000;
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

// Session state is never trusted from a JWT alone and never written in plaintext.
// Restart deliberately requires login again; old on-disk session files are not read.
export class SessionService {
  private sessions = new Map<string, Session>();
  private refreshIndex = new Map<string, string>();
  private used = new Map<string, { code: string; expiresAt: number }>();
  private rotating = new Map<string, Promise<Tokens | null>>();
  constructor(private secret: string, private lookup: (code: string) => Promise<Identity | null>) {}

  private prune() {
    const now = Date.now();
    for (const [id, s] of this.sessions) if (s.expiresAt <= now || s.createdAt + MAX_MS <= now) this.remove(id);
    for (const [key, s] of this.used) if (s.expiresAt <= now) this.used.delete(key);
    while (this.used.size > 50000) this.used.delete(this.used.keys().next().value!);
  }
  private remove(id: string) {
    const session = this.sessions.get(id);
    if (session) this.refreshIndex.delete(session.refreshHash);
    this.sessions.delete(id);
  }
  revokeAccount(code: string) {
    for (const [id, s] of this.sessions) if (s.identity.code === code) this.remove(id);
  }
  private access(session: Session): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ sid: session.id, exp: Math.floor(Date.now() / 1000) + ACCESS_SECONDS })).toString("base64url");
    const signature = crypto.createHmac("sha256", this.secret).update(`${header}.${body}`).digest("base64url");
    return `${header}.${body}.${signature}`;
  }
  private verify(token: unknown, allowExpired = false): string | null {
    if (typeof token !== "string" || token.length > 2048) return null;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const [h, b, sig] = parts;
      const signature = Buffer.from(sig, "base64url");
      const expected = crypto.createHmac("sha256", this.secret).update(`${h}.${b}`).digest();
      if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) return null;
      const header = JSON.parse(Buffer.from(h, "base64url").toString());
      const body = JSON.parse(Buffer.from(b, "base64url").toString());
      if (header.alg !== "HS256" || typeof body.sid !== "string" || !Number.isFinite(body.exp)) return null;
      if (!allowExpired && body.exp <= Date.now() / 1000) return null;
      return body.sid;
    } catch { return null; }
  }
  async create(identity: Identity): Promise<Tokens> {
    this.prune();
    // Check and insertion are synchronous: concurrent requests cannot claim the same D.I.
    if (identity.role === "user" && /^\d{4,6}$/.test(identity.code) &&
      [...this.sessions.values()].some(s => s.identity.code === identity.code)) {
      throw new DuplicateDISessionError();
    }
    if (this.sessions.size >= 10000) throw new Error("Limite de sessões atingido.");
    const refresh = crypto.randomBytes(32).toString("base64url");
    const session: Session = { id: crypto.randomBytes(24).toString("base64url"), identity,
      createdAt: Date.now(), expiresAt: Date.now() + REFRESH_MS, refreshHash: hash(refresh) };
    this.sessions.set(session.id, session);
    this.refreshIndex.set(session.refreshHash, session.id);
    return { access: this.access(session), refresh, identity };
  }
  private async current(session: Session): Promise<Identity | null> {
    if (session.expiresAt <= Date.now() || session.createdAt + MAX_MS <= Date.now()) {
      this.remove(session.id); return null;
    }
    const current = await this.lookup(session.identity.code);
    if (!current || current.role !== session.identity.role || current.version !== session.identity.version) {
      this.revokeAccount(session.identity.code); return null;
    }
    // A concurrent password change/logout must not resurrect an in-flight session.
    if (this.sessions.get(session.id) !== session) return null;
    session.identity = current;
    return current;
  }
  async authenticate(access: unknown): Promise<Identity | null> {
    const id = this.verify(access);
    const session = id && this.sessions.get(id);
    return session ? this.current(session) : null;
  }
  async refresh(token: unknown): Promise<Tokens | null> {
    if (typeof token !== "string" || token.length > 128) return null;
    const key = hash(token);
    if (this.rotating.has(key)) return this.rotating.get(key)!;
    this.prune();
    const replay = this.used.get(key);
    if (replay) { this.revokeAccount(replay.code); return null; }
    const id = this.refreshIndex.get(key);
    const session = id && this.sessions.get(id);
    if (!session) return null;
    const pending = (async () => {
      const identity = await this.current(session);
      if (!identity) return null;
      const refresh = crypto.randomBytes(32).toString("base64url");
      this.refreshIndex.delete(key);
      this.used.set(key, { code: identity.code, expiresAt: session.createdAt + MAX_MS });
      session.refreshHash = hash(refresh);
      session.expiresAt = Math.min(Date.now() + REFRESH_MS, session.createdAt + MAX_MS);
      this.refreshIndex.set(session.refreshHash, session.id);
      return { access: this.access(session), refresh, identity };
    })();
    this.rotating.set(key, pending);
    try { return await pending; } finally { this.rotating.delete(key); }
  }
  logout(access: unknown, refresh: unknown) {
    const id = this.verify(access, true);
    if (id) this.remove(id);
    if (typeof refresh === "string") {
      const refreshId = this.refreshIndex.get(hash(refresh));
      if (refreshId) this.remove(refreshId);
    }
  }
}
