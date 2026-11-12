import { ApiError } from "../errors";

/**
 * Abuse protection for the Agent API (M1-D).
 *
 * Keys are built ONLY from values the Agent can trust: the client IP that the website backend signed (covered by the HMAC), the
 * signed identity, the session id from the validated body, and, before authentication, the socket's own remote address. No
 * forwarded-for or other client-supplied header is ever read here.
 *
 * It fails SAFE: if the counter store is full or throws, the request is refused with a generic "busy" error. A limiter that
 * silently allowed traffic when its storage broke would turn every storage problem into an open door.
 * Nothing here stores or sees message text: counters are keyed by opaque identifiers and hold only timestamps.
 */
export interface RateConfig {
  /** Requests per minute per signed client IP. */
  ipPerMin: number;
  /** Requests per minute per (identity, session). */
  sessionPerMin: number;
  /** Requests per minute per signed customer id, across all of that customer's sessions. */
  identityPerMin: number;
  /** Requests being processed at once for one identity (or one IP for guests). */
  maxConcurrent: number;
  /** New sessions an identity may start per hour. */
  newSessionsPerHour: number;
  /** Failed authentications per minute per socket address, before the signature is even looked at again. */
  authFailPerMin: number;
  /** Limit violations inside one minute that start a cooldown. */
  cooldownAfter: number;
  /** How long a cooldown blocks the key, in seconds. */
  cooldownSec: number;
}

export const DEFAULT_RATE_CONFIG: RateConfig = {
  ipPerMin: 40,
  sessionPerMin: 15,
  identityPerMin: 30,
  maxConcurrent: 2,
  newSessionsPerHour: 10,
  authFailPerMin: 20,
  cooldownAfter: 3,
  cooldownSec: 60,
};

/** Thrown by a store that cannot count (full, or broken). The limiter turns it into a refusal. */
export class RateStoreError extends Error {}

export interface RateStore {
  /** Records one event for `key` and returns how many events fall inside the window, and when the oldest leaves it. */
  hit(key: string, windowMs: number, now: number): { count: number; oldestAt: number };
  /** Counts without recording. */
  peek(key: string, windowMs: number, now: number): number;
  size(): number;
}

/** Sliding-window log per key, bounded in keys and in entries per key. */
export class MemoryRateStore implements RateStore {
  private readonly map = new Map<string, number[]>();
  constructor(private readonly opts: { maxKeys?: number; maxPerKey?: number } = {}) {}

  private prune(now: number, windowMs?: number): void {
    for (const [k, hits] of this.map) {
      const last = hits[hits.length - 1] ?? 0;
      if (now - last > (windowMs ?? 3_600_000)) this.map.delete(k);
    }
  }

  hit(key: string, windowMs: number, now: number): { count: number; oldestAt: number } {
    let hits = this.map.get(key);
    if (!hits) {
      if (this.map.size >= (this.opts.maxKeys ?? 20_000)) this.prune(now);
      if (this.map.size >= (this.opts.maxKeys ?? 20_000)) throw new RateStoreError("rate store full");
      hits = [];
      this.map.set(key, hits);
    }
    const cutoff = now - windowMs;
    while (hits.length > 0 && hits[0]! <= cutoff) hits.shift();
    hits.push(now);
    const maxPer = this.opts.maxPerKey ?? 5_000;
    if (hits.length > maxPer) hits.splice(0, hits.length - maxPer);
    return { count: hits.length, oldestAt: hits[0]! };
  }

  peek(key: string, windowMs: number, now: number): number {
    const hits = this.map.get(key);
    if (!hits) return 0;
    const cutoff = now - windowMs;
    return hits.filter((t) => t > cutoff).length;
  }

  size(): number {
    return this.map.size;
  }
}

/**
 * CAPTCHA-ready: the interface a challenge provider would implement. No provider is bought or integrated in M1.
 * `verify` receives only the opaque token the website forwarded and the signed client IP, never message text.
 */
export interface ChallengeProvider {
  verify(token: string, clientIp: string): Promise<boolean>;
}

export type ChallengeMode = "off" | "on-abuse";

export interface GuardOptions {
  store?: RateStore;
  now?: () => number;
  challenge?: ChallengeProvider;
  challengeMode?: ChallengeMode;
  /** How long a key stays "challenge required" after a violation. */
  challengeTtlSec?: number;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

const busy = (retryAfterSec = 5) => new ApiError("QUEUE_FULL", "The assistant is busy. Please try again shortly.", { retryAfterSec });
const limited = (retryAfterSec: number) => new ApiError("RATE_LIMITED", "Too many requests. Please slow down.", { retryAfterSec: Math.max(1, Math.ceil(retryAfterSec)) });

export class AbuseGuard {
  private readonly store: RateStore;
  private readonly now: () => number;
  private readonly inFlight = new Map<string, number>();
  private readonly cooldownUntil = new Map<string, number>();
  private readonly challengeUntil = new Map<string, number>();
  private readonly mode: ChallengeMode;

  constructor(
    readonly config: RateConfig = DEFAULT_RATE_CONFIG,
    private readonly opts: GuardOptions = {},
  ) {
    this.store = opts.store ?? new MemoryRateStore();
    this.now = opts.now ?? Date.now;
    this.mode = opts.challengeMode ?? "off";
  }

  /** Runs a counter operation and converts any storage failure into a safe refusal. */
  private safely<T>(fn: () => T): T {
    try {
      return fn();
    } catch {
      throw busy();
    }
  }

  private inCooldown(key: string, now: number): number {
    const until = this.cooldownUntil.get(key) ?? 0;
    if (until > now) return until - now;
    if (until) this.cooldownUntil.delete(key);
    return 0;
  }

  /** A violation: counted per key, and enough of them in a minute start a cooldown. Always throws RATE_LIMITED. */
  private violate(key: string, now: number, retryMs: number): never {
    this.safely(() => {
      const v = this.store.hit(`viol:${key}`, MINUTE, now);
      if (v.count >= this.config.cooldownAfter) this.cooldownUntil.set(key, now + this.config.cooldownSec * 1000);
    });
    this.challengeUntil.set(key, now + (this.opts.challengeTtlSec ?? 300) * 1000);
    if (this.cooldownUntil.size > 20_000) this.cooldownUntil.clear(); // a full table must not grow forever; clearing only loosens cooldowns, never the counters
    throw limited(Math.max(retryMs, 1000) / 1000);
  }

  private count(key: string, limit: number, windowMs: number, now: number): void {
    const cd = this.inCooldown(key, now);
    if (cd > 0) throw limited(cd / 1000);
    const r = this.safely(() => this.store.hit(key, windowMs, now));
    if (r.count > limit) this.violate(key, now, r.oldestAt + windowMs - now);
  }

  /** Before the signature is trusted: failed authentications per socket address. Never uses a header. */
  recordAuthFailure(socketAddress: string): void {
    const now = this.now();
    try {
      this.store.hit(`auth:${socketAddress}`, MINUTE, now);
    } catch {
      // The failure itself is still refused with 401 by the caller; there is nothing to protect by throwing here.
    }
  }

  /** Throws RATE_LIMITED when this socket address has failed too often, so guessing signatures gets slower and slower. */
  checkAuthFailures(socketAddress: string): void {
    const now = this.now();
    const failures = this.safely(() => this.store.peek(`auth:${socketAddress}`, MINUTE, now));
    if (failures >= this.config.authFailPerMin) throw limited(MINUTE / 1000);
  }

  /** After authentication: limits on the signed client IP and, for customers, the signed customer id. */
  checkRequest(p: { clientIp: string; identityKey: string }): void {
    const now = this.now();
    this.count(`ip:${p.clientIp}`, this.config.ipPerMin, MINUTE, now);
    if (p.identityKey.startsWith("cust:")) this.count(`id:${p.identityKey}`, this.config.identityPerMin, MINUTE, now);
  }

  /** After the body is validated: the per-session limit. */
  checkSession(p: { identityKey: string; sessionId: string }): void {
    this.count(`sess:${p.identityKey}|${p.sessionId}`, this.config.sessionPerMin, MINUTE, this.now());
  }

  /** A session id seen for the first time by this identity counts against an hourly allowance. */
  checkNewSession(identityKey: string): void {
    this.count(`newsess:${identityKey}`, this.config.newSessionsPerHour, HOUR, this.now());
  }

  /**
   * Concurrency: a caller may have only a few requests running at once. Returns the release function, which must be called
   * exactly once (the server calls it in a finally block). Guests are counted per client IP, customers per customer id.
   */
  acquire(p: { clientIp: string; identityKey: string }): () => void {
    const key = p.identityKey.startsWith("cust:") ? p.identityKey : `ip:${p.clientIp}`;
    const current = this.inFlight.get(key) ?? 0;
    if (current >= this.config.maxConcurrent) {
      const v = this.now();
      this.violate(`conc:${key}`, v, 1000);
    }
    this.inFlight.set(key, current + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const n = (this.inFlight.get(key) ?? 1) - 1;
      if (n <= 0) this.inFlight.delete(key);
      else this.inFlight.set(key, n);
    };
  }

  /**
   * CAPTCHA-ready gate. In "on-abuse" mode, a client that recently hit a limit must present a challenge token that the (future)
   * provider accepts. With no provider configured the gate stays closed: it never lets an unverified token through.
   */
  async checkChallenge(p: { clientIp: string; identityKey: string; token?: string }): Promise<void> {
    if (this.mode !== "on-abuse") return;
    const now = this.now();
    const keys = [`ip:${p.clientIp}`, ...(p.identityKey.startsWith("cust:") ? [`id:${p.identityKey}`] : [])];
    const pending = keys.filter((k) => (this.challengeUntil.get(k) ?? 0) > now);
    if (pending.length === 0) return;
    const ok = p.token && this.opts.challenge ? await this.opts.challenge.verify(p.token, p.clientIp).catch(() => false) : false;
    if (!ok) throw new ApiError("CHALLENGE_REQUIRED", "Please complete the verification and try again.", { retryAfterSec: 5 });
    for (const k of pending) this.challengeUntil.delete(k);
  }

  /** For tests and health: current number of concurrent requests being tracked. */
  inFlightTotal(): number {
    let n = 0;
    for (const v of this.inFlight.values()) n += v;
    return n;
  }
}
