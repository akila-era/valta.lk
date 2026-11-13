import { createHash, randomBytes } from "node:crypto";
import { BROWSER_LIMITS } from "./protocol";
import type { BrowserDriver } from "./driver";

/**
 * Anonymous browser sessions, one isolated context each, bound to the assistant session and identity that created them.
 * Limits are hard: idle timeout, maximum lifetime, step budget, concurrent sessions overall and per identity. Expired sessions are
 * destroyed through the driver (whole context: pages, cookies, storage, cache). Time and the driver are injected so all of it is
 * testable without a browser or a clock.
 */
export interface SessionLimits {
  idleMs: number;
  maxLifetimeMs: number;
  maxSteps: number;
  maxConcurrent: number;
  maxPerIdentity: number;
}

export const DEFAULT_SESSION_LIMITS: SessionLimits = Object.freeze({
  idleMs: 60_000,
  maxLifetimeMs: BROWSER_LIMITS.maxTaskSeconds * 1000,
  maxSteps: BROWSER_LIMITS.maxStepsPerTask,
  maxConcurrent: BROWSER_LIMITS.maxConcurrentTasks,
  maxPerIdentity: 1,
});

export interface SessionOwner {
  /** The Agent's identity-bound assistant session. */
  assistantSessionId: string;
  /** Stable key for the signed identity (guest or customer). Used only for the per-identity limit. */
  identityKey: string;
}

export interface BrowserSession {
  id: string;
  owner: SessionOwner;
  createdAt: number;
  lastUsedAt: number;
  steps: number;
}

export type SessionErrorCode = "not_your_session" | "session_expired" | "too_many_sessions" | "step_limit";
export class SessionError extends Error {
  readonly code: SessionErrorCode;
  constructor(code: SessionErrorCode) {
    super(code);
    this.name = "SessionError";
    this.code = code;
  }
}

/**
 * Audit events carry codes and counts only. There is deliberately no field for a URL, page text, element name, typed text or
 * customer data, so none can be written by accident; `sessionRef` is a short hash, not the session id.
 */
export interface AuditEvent {
  at: number;
  type: "session_created" | "session_closed" | "session_expired" | "tool_call" | "policy_block" | "confirmation_issued" | "confirmation_used";
  sessionRef?: string;
  tool?: string;
  outcome?: "ok" | "failed";
  code?: string;
  ms?: number;
  host?: string;
}
export type AuditSink = (e: AuditEvent) => void;

const ALLOWED_AUDIT_FIELDS: readonly (keyof AuditEvent)[] = ["at", "type", "sessionRef", "tool", "outcome", "code", "ms", "host"];
export const cleanAudit = (e: AuditEvent): AuditEvent => Object.fromEntries(ALLOWED_AUDIT_FIELDS.filter((k) => e[k] !== undefined).map((k) => [k, e[k]])) as unknown as AuditEvent;

export const sessionRef = (id: string): string => createHash("sha256").update(id).digest("hex").slice(0, 10);

export class BrowserSessionManager {
  private readonly sessions = new Map<string, BrowserSession>();

  constructor(
    private readonly driver: BrowserDriver,
    private readonly limits: SessionLimits = DEFAULT_SESSION_LIMITS,
    private readonly now: () => number = Date.now,
    private readonly audit: AuditSink = () => {},
  ) {}

  private emit(e: Omit<AuditEvent, "at">) {
    this.audit(cleanAudit({ at: this.now(), ...e }));
  }

  get activeCount(): number {
    return this.sessions.size;
  }

  async create(owner: SessionOwner): Promise<BrowserSession> {
    await this.sweep();
    const mine = [...this.sessions.values()].filter((s) => s.owner.identityKey === owner.identityKey).length;
    if (this.sessions.size >= this.limits.maxConcurrent || mine >= this.limits.maxPerIdentity) {
      this.emit({ type: "policy_block", code: "too_many_sessions" });
      throw new SessionError("too_many_sessions");
    }
    const id = `bs_${randomBytes(18).toString("base64url")}`;
    const t = this.now();
    const session: BrowserSession = { id, owner: { ...owner }, createdAt: t, lastUsedAt: t, steps: 0 };
    this.sessions.set(id, session);
    try {
      await this.driver.open(id);
    } catch (e) {
      this.sessions.delete(id);
      throw e;
    }
    this.emit({ type: "session_created", sessionRef: sessionRef(id) });
    return session;
  }

  /** Ownership is checked before anything else, and a foreign or unknown id looks exactly the same to the caller (no probing). */
  async use(sessionId: string, owner: SessionOwner): Promise<BrowserSession> {
    await this.sweep();
    const s = this.sessions.get(sessionId);
    if (!s || s.owner.assistantSessionId !== owner.assistantSessionId || s.owner.identityKey !== owner.identityKey) {
      this.emit({ type: "policy_block", code: "not_your_session", ...(s ? { sessionRef: sessionRef(sessionId) } : {}) });
      throw new SessionError("not_your_session");
    }
    if (s.steps >= this.limits.maxSteps) {
      this.emit({ type: "policy_block", sessionRef: sessionRef(s.id), code: "step_limit" });
      throw new SessionError("step_limit");
    }
    s.steps++;
    s.lastUsedAt = this.now();
    return s;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async close(sessionId: string, reason: "closed" | "expired" = "closed"): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.sessions.delete(sessionId);
    try {
      await this.driver.close(sessionId);
    } finally {
      this.emit({ type: reason === "expired" ? "session_expired" : "session_closed", sessionRef: sessionRef(sessionId) });
    }
  }

  /** Destroys every session of one assistant session (the shopper cleared the chat, or the assistant session ended). */
  async closeAllFor(assistantSessionId: string): Promise<number> {
    const ids = [...this.sessions.values()].filter((s) => s.owner.assistantSessionId === assistantSessionId).map((s) => s.id);
    for (const id of ids) await this.close(id);
    return ids.length;
  }

  /** Removes sessions past their idle time or lifetime. Called on every create/use, and can be driven by a timer. */
  async sweep(): Promise<number> {
    const t = this.now();
    const expired = [...this.sessions.values()].filter((s) => t - s.lastUsedAt > this.limits.idleMs || t - s.createdAt > this.limits.maxLifetimeMs);
    for (const s of expired) await this.close(s.id, "expired");
    return expired.length;
  }

  async shutdown(): Promise<void> {
    for (const id of [...this.sessions.keys()]) await this.close(id);
  }
}
