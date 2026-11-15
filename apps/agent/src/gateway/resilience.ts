import { GatewayError, isGatewayError, type ErrorKind } from "./errors";
import { abortableSleep } from "./provider";

/** A signal that fires after `ms`, or when the parent fires. Call dispose() to release the timer. */
export function timeoutSignal(ms: number, parent?: AbortSignal): { signal: AbortSignal; dispose: () => void; timedOut: () => boolean } {
  const ctl = new AbortController();
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    ctl.abort();
  }, ms);
  const onParent = (): void => ctl.abort();
  if (parent) {
    if (parent.aborted) ctl.abort();
    else parent.addEventListener("abort", onParent, { once: true });
  }
  return {
    signal: ctl.signal,
    timedOut: () => fired,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParent);
    },
  };
}

export interface RetryOptions {
  maxAttempts: number;
  baseMs: number;
  maxMs: number;
  /** Retry-After values above this are not waited for (the call fails instead of stalling the shopper). */
  maxRetryAfterMs?: number;
  /** Returns a number in [0, 1). Injectable for tests. */
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; error: GatewayError; waitMs: number }) => void;
}

/**
 * Runs `fn` with bounded retries. Only retryable GatewayErrors (rate limit, timeout, unavailable) are retried; auth, bad request, safety
 * and quota failures are NEVER retried. Waits use exponential backoff with equal jitter, or the provider's Retry-After when given.
 * `fn` receives the attempt number (1-based) so that each attempt can make its own budget reservation.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions): Promise<T> {
  const random = o.random ?? Math.random;
  const sleep = o.sleep ?? abortableSleep;
  const maxRetryAfter = o.maxRetryAfterMs ?? 30_000;
  let last: GatewayError | undefined;
  for (let attempt = 1; attempt <= o.maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      const err = isGatewayError(e) ? e : new GatewayError("internal", { retryable: false });
      last = err;
      if (!err.retryable || attempt >= o.maxAttempts || o.signal?.aborted) throw err;
      let wait: number;
      if (err.retryAfterMs !== undefined) {
        if (err.retryAfterMs > maxRetryAfter) throw err;
        wait = err.retryAfterMs;
      } else {
        const cap = Math.min(o.maxMs, o.baseMs * 2 ** (attempt - 1));
        wait = cap / 2 + random() * (cap / 2);
      }
      o.onRetry?.({ attempt, error: err, waitMs: wait });
      await sleep(wait, o.signal);
    }
  }
  throw last ?? new GatewayError("internal");
}

// ----------------------------------------------------------------------------------------------------------------------------
// Circuit breaker
// ----------------------------------------------------------------------------------------------------------------------------

export type BreakerState = "closed" | "open" | "half_open";

/** Failure kinds that say the provider is unhealthy. Auth, bad request, safety and quota failures say nothing about its health. */
const HEALTH_KINDS: ReadonlySet<ErrorKind> = new Set(["unavailable", "timeout", "internal", "rate_limit"]);

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures = 0;
  private openedAt = 0;
  private probing = false;

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly clock: () => number = Date.now,
  ) {}

  get current(): BreakerState {
    return this.refresh();
  }

  private refresh(): BreakerState {
    if (this.state === "open" && this.clock() - this.openedAt >= this.cooldownMs) this.state = "half_open";
    return this.state;
  }

  /** True when a call may go out. In half-open state exactly ONE probe is allowed at a time. */
  allow(): boolean {
    const s = this.refresh();
    if (s === "closed") return true;
    if (s === "open") return false;
    if (this.probing) return false;
    this.probing = true;
    return true;
  }

  onSuccess(): void {
    this.failures = 0;
    this.probing = false;
    this.state = "closed";
  }

  /** Records a failed call. Kinds that do not indicate provider ill-health (auth, bad request, safety, quota) only release a probe. */
  onFailure(kind: ErrorKind): void {
    if (!HEALTH_KINDS.has(kind)) {
      this.probing = false;
      return;
    }
    if (this.state === "half_open") {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.threshold) this.trip();
  }

  private trip(): void {
    this.state = "open";
    this.openedAt = this.clock();
    this.probing = false;
    this.failures = 0;
  }
}

// ----------------------------------------------------------------------------------------------------------------------------
// Concurrency and rate limits
// ----------------------------------------------------------------------------------------------------------------------------

/** At most `max` calls run at once; up to `maxQueue` wait; beyond that a call is refused immediately (rate_limit), never queued forever. */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(
    private readonly max: number,
    private readonly maxQueue: number,
  ) {}

  get inFlight(): number {
    return this.active;
  }
  get queued(): number {
    return this.waiters.length;
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return this.releaser();
    }
    if (this.waiters.length >= this.maxQueue) throw new GatewayError("rate_limit", { code: "queue_full", retryable: false });
    await new Promise<void>((resolve, reject) => {
      const wake = (): void => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = (): void => {
        const i = this.waiters.indexOf(wake);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new GatewayError("timeout", { code: "aborted" }));
      };
      this.waiters.push(wake);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    this.active++;
    return this.releaser();
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.active--;
      this.waiters.shift()?.();
    };
  }
}

/** Sliding-window counter per key, bounded in keys. */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly clock: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  /** Records one event and returns whether it is within the limit. */
  hit(key: string): boolean {
    const now = this.clock();
    let arr = this.hits.get(key);
    if (!arr) {
      if (this.hits.size >= this.maxKeys) this.prune(now);
      if (this.hits.size >= this.maxKeys) return false; // a full table refuses rather than grows
      arr = [];
      this.hits.set(key, arr);
    }
    while (arr.length > 0 && arr[0]! <= now - this.windowMs) arr.shift();
    if (arr.length >= this.limit) return false;
    arr.push(now);
    return true;
  }

  private prune(now: number): void {
    for (const [k, v] of this.hits) if (v.length === 0 || v[v.length - 1]! <= now - this.windowMs) this.hits.delete(k);
  }
}
