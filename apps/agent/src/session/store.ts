import { formatIdentity, type Identity } from "../auth/hmac";
import type { Language } from "../contract/schemas";

/**
 * Short-term conversation state. In memory only: it is never written to disk, so a restart simply forgets it and the
 * next turn is rebuilt from the cart and page context that every request carries. No message text is kept here.
 */
export interface SessionState {
  language?: Language;
  lastIntent?: string;
  slots: { brand?: string; category?: string; budgetLkr?: number };
  /** Ids only, newest first. Used to resolve "this one". */
  lastShownProductIds: string[];
  pendingClarification?: string;
}

export const emptySession = (): SessionState => ({ slots: {}, lastShownProductIds: [] });

/** Keyed by identity AND session id, so knowing someone's session id is not enough to read their state. */
export const sessionKey = (identity: Identity, sessionId: string): string => `${formatIdentity(identity)}|${sessionId}`;

export interface StoreOptions {
  max: number;
  /** Sliding idle expiry. */
  ttlMs: number;
  /** Absolute lifetime from creation, however active the entry is. Unset means none. */
  maxAgeMs?: number;
  now?: () => number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
  createdAt: number;
}

/** Least-recently-used with a sliding time-to-live. */
export class TtlLruStore<V> {
  private readonly map = new Map<string, Entry<V>>();
  private readonly now: () => number;

  constructor(private readonly opts: StoreOptions) {
    this.now = opts.now ?? Date.now;
  }

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    const t = this.now();
    if (e.expiresAt <= t || (this.opts.maxAgeMs !== undefined && t - e.createdAt > this.opts.maxAgeMs)) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key); // re-insert: most recently used goes last
    e.expiresAt = t + this.opts.ttlMs;
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: V): void {
    const previous = this.map.get(key);
    this.map.delete(key);
    const t = this.now();
    // Updating an entry keeps its original creation time, so the absolute lifetime cannot be extended by activity.
    this.map.set(key, { value, expiresAt: t + this.opts.ttlMs, createdAt: previous && (this.opts.maxAgeMs === undefined || t - previous.createdAt <= this.opts.maxAgeMs) ? previous.createdAt : t });
    while (this.map.size > this.opts.max) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  sweep(): number {
    const t = this.now();
    let n = 0;
    for (const [k, e] of this.map) {
      if (e.expiresAt <= t || (this.opts.maxAgeMs !== undefined && t - e.createdAt > this.opts.maxAgeMs)) {
        this.map.delete(k);
        n++;
      }
    }
    return n;
  }

  size(): number {
    return this.map.size;
  }
}

export const createSessionStore = (now?: () => number) =>
  new TtlLruStore<SessionState>({ max: 300, ttlMs: 30 * 60_000, maxAgeMs: 8 * 3_600_000, ...(now ? { now } : {}) });
