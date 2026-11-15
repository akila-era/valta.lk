import { describe, expect, it } from "vitest";
import { GatewayError, classifyHttpFailure, userMessage, type ErrorKind } from "../../src/gateway/errors";
import { CircuitBreaker, ConcurrencyLimiter, SlidingWindowLimiter, timeoutSignal, withRetry } from "../../src/gateway/resilience";
import { installNoNetworkGuard } from "./gateway-helpers";

installNoNetworkGuard();

const err = (kind: ErrorKind, init: ConstructorParameters<typeof GatewayError>[1] = {}) => new GatewayError(kind, init);

describe("withRetry", () => {
  const opts = (over: Partial<Parameters<typeof withRetry>[1]> = {}) => {
    const waits: number[] = [];
    return { waits, o: { maxAttempts: 4, baseMs: 100, maxMs: 1_000, random: () => 0.5, sleep: async (ms: number) => void waits.push(ms), ...over } };
  };

  it("returns the first success without waiting", async () => {
    const { o, waits } = opts();
    expect(await withRetry(async () => "ok", o)).toBe("ok");
    expect(waits).toEqual([]);
  });
  it("retries retryable errors with exponential backoff and equal jitter, then succeeds", async () => {
    const { o, waits } = opts();
    let n = 0;
    const r = await withRetry(async () => {
      if (++n < 4) throw err("unavailable");
      return n;
    }, o);
    expect(r).toBe(4);
    // random = 0.5 -> wait = cap/2 + 0.5 * cap/2 = 0.75 * cap, cap = min(1000, 100 * 2^(attempt-1))
    expect(waits).toEqual([75, 150, 300]);
  });
  it("caps the backoff at maxMs", async () => {
    const { o, waits } = opts({ maxAttempts: 8, baseMs: 400, maxMs: 1_000 });
    let n = 0;
    await withRetry(async () => {
      if (++n < 8) throw err("rate_limit");
    }, o);
    expect(Math.max(...waits)).toBeLessThanOrEqual(1_000);
    expect(waits.at(-1)).toBe(750);
  });
  it("gives up after maxAttempts and throws the last error", async () => {
    const { o } = opts({ maxAttempts: 3 });
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        throw err("timeout");
      }, o),
    ).rejects.toMatchObject({ kind: "timeout" });
    expect(n).toBe(3);
  });
  for (const kind of ["auth", "bad_request", "safety_blocked", "quota", "budget_exceeded", "disabled", "not_configured", "circuit_open", "internal"] as ErrorKind[]) {
    it(`never retries ${kind}`, async () => {
      const { o } = opts();
      let n = 0;
      await expect(
        withRetry(async () => {
          n++;
          throw err(kind);
        }, o),
      ).rejects.toMatchObject({ kind });
      expect(n).toBe(1);
    });
  }
  it("a non-GatewayError becomes a non-retryable internal error", async () => {
    const { o } = opts();
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        throw new Error("boom");
      }, o),
    ).rejects.toMatchObject({ kind: "internal" });
    expect(n).toBe(1);
  });
  it("waits the provider's Retry-After instead of the backoff", async () => {
    const { o, waits } = opts();
    let n = 0;
    await withRetry(async () => {
      if (++n < 2) throw err("rate_limit", { retryAfterMs: 2_500 });
    }, o);
    expect(waits).toEqual([2_500]);
  });
  it("does not wait for an excessive Retry-After: it fails at once", async () => {
    const { o, waits } = opts({ maxRetryAfterMs: 10_000 });
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        throw err("rate_limit", { retryAfterMs: 60_000 });
      }, o),
    ).rejects.toMatchObject({ kind: "rate_limit" });
    expect(n).toBe(1);
    expect(waits).toEqual([]);
  });
  it("stops retrying once the caller's signal has aborted", async () => {
    const ctl = new AbortController();
    const { o } = opts({ signal: ctl.signal });
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        ctl.abort();
        throw err("unavailable");
      }, o),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(n).toBe(1);
  });
  it("tells the caller each attempt number and reports each retry", async () => {
    const seen: number[] = [];
    const retries: number[] = [];
    let n = 0;
    await withRetry(
      async (a) => {
        seen.push(a);
        if (++n < 3) throw err("unavailable");
      },
      { maxAttempts: 5, baseMs: 10, maxMs: 100, sleep: async () => {}, onRetry: (i) => retries.push(i.attempt) },
    );
    expect(seen).toEqual([1, 2, 3]);
    expect(retries).toEqual([1, 2]);
  });
});

describe("timeoutSignal", () => {
  it("fires after the timeout and reports that it did", async () => {
    const t = timeoutSignal(20);
    await new Promise((r) => setTimeout(r, 60));
    expect(t.signal.aborted).toBe(true);
    expect(t.timedOut()).toBe(true);
    t.dispose();
  });
  it("follows the parent signal without reporting a timeout; dispose clears the timer", () => {
    const parent = new AbortController();
    const t = timeoutSignal(10_000, parent.signal);
    parent.abort();
    expect(t.signal.aborted).toBe(true);
    expect(t.timedOut()).toBe(false);
    t.dispose();
  });
});

describe("circuit breaker", () => {
  const make = (threshold = 3, cooldown = 1_000) => {
    const clock = { t: 0 };
    return { clock, b: new CircuitBreaker(threshold, cooldown, () => clock.t) };
  };
  it("opens after N consecutive provider-health failures and refuses calls", () => {
    const { b } = make();
    expect(b.current).toBe("closed");
    b.onFailure("unavailable");
    b.onFailure("timeout");
    expect(b.allow()).toBe(true);
    b.onFailure("rate_limit");
    expect(b.current).toBe("open");
    expect(b.allow()).toBe(false);
  });
  it("a success resets the failure count", () => {
    const { b } = make();
    b.onFailure("unavailable");
    b.onFailure("unavailable");
    b.onSuccess();
    b.onFailure("unavailable");
    b.onFailure("unavailable");
    expect(b.current).toBe("closed");
  });
  it("failures that say nothing about provider health never open it", () => {
    const { b } = make(1);
    for (const k of ["auth", "bad_request", "safety_blocked", "quota", "budget_exceeded"] as ErrorKind[]) b.onFailure(k);
    expect(b.current).toBe("closed");
  });
  it("after the cool-down it is half-open and lets exactly ONE probe through", () => {
    const { b, clock } = make(1, 1_000);
    b.onFailure("unavailable");
    expect(b.allow()).toBe(false);
    clock.t = 999;
    expect(b.current).toBe("open");
    clock.t = 1_000;
    expect(b.current).toBe("half_open");
    expect(b.allow()).toBe(true);
    expect(b.allow()).toBe(false); // the probe is out
  });
  it("a successful probe closes it; a failed probe re-opens it for another cool-down", () => {
    const { b, clock } = make(1, 1_000);
    b.onFailure("timeout");
    clock.t = 1_000;
    b.allow();
    b.onSuccess();
    expect(b.current).toBe("closed");
    b.onFailure("timeout");
    clock.t = 2_100;
    expect(b.allow()).toBe(true);
    b.onFailure("unavailable");
    expect(b.current).toBe("open");
    clock.t = 2_500;
    expect(b.allow()).toBe(false);
    clock.t = 3_100;
    expect(b.allow()).toBe(true);
  });
  it("a refused probe (for example a budget refusal) releases the probe slot without re-opening", () => {
    const { b, clock } = make(1, 1_000);
    b.onFailure("unavailable");
    clock.t = 1_000;
    expect(b.allow()).toBe(true);
    b.onFailure("bad_request");
    expect(b.allow()).toBe(true);
  });
});

describe("concurrency limiter", () => {
  it("never runs more than max at once, queues up to maxQueue, then refuses immediately", async () => {
    const l = new ConcurrencyLimiter(2, 1);
    const r1 = await l.acquire();
    const r2 = await l.acquire();
    expect(l.inFlight).toBe(2);
    let third = false;
    const p3 = l.acquire().then((r) => {
      third = true;
      return r;
    });
    await Promise.resolve();
    expect(third).toBe(false);
    expect(l.queued).toBe(1);
    await expect(l.acquire()).rejects.toMatchObject({ kind: "rate_limit", code: "queue_full" });
    r1();
    const r3 = await p3;
    expect(third).toBe(true);
    expect(l.inFlight).toBe(2);
    r2();
    r3();
    expect(l.inFlight).toBe(0);
  });
  it("release is idempotent", async () => {
    const l = new ConcurrencyLimiter(1, 0);
    const r = await l.acquire();
    r();
    r();
    expect(l.inFlight).toBe(0);
    await l.acquire();
    await expect(l.acquire()).rejects.toMatchObject({ code: "queue_full" });
  });
  it("a waiter that is aborted leaves the queue without taking a slot", async () => {
    const l = new ConcurrencyLimiter(1, 2);
    const r = await l.acquire();
    const ctl = new AbortController();
    const waiting = l.acquire(ctl.signal);
    ctl.abort();
    await expect(waiting).rejects.toMatchObject({ kind: "timeout" });
    expect(l.queued).toBe(0);
    r();
    expect(l.inFlight).toBe(0);
  });
  it("holds the limit under a burst of 200 callers", async () => {
    const l = new ConcurrencyLimiter(3, 500);
    let running = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 200 }, async () => {
        const rel = await l.acquire();
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 1));
        running--;
        rel();
      }),
    );
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("sliding-window limiter", () => {
  it("allows `limit` hits per window per key and recovers as the window slides", () => {
    const clock = { t: 0 };
    const l = new SlidingWindowLimiter(2, 1_000, () => clock.t);
    expect([l.hit("a"), l.hit("a"), l.hit("a")]).toEqual([true, true, false]);
    expect(l.hit("b")).toBe(true);
    clock.t = 1_001;
    expect(l.hit("a")).toBe(true);
  });
  it("a full key table refuses new keys instead of growing", () => {
    const l = new SlidingWindowLimiter(5, 60_000, () => 0, 3);
    expect([l.hit("a"), l.hit("b"), l.hit("c"), l.hit("d")]).toEqual([true, true, true, false]);
    expect(l.hit("a")).toBe(true);
  });
});

describe("error taxonomy and user messages", () => {
  const table: [number, string | undefined, ErrorKind, boolean][] = [
    [400, undefined, "bad_request", false],
    [400, "SAFETY", "safety_blocked", false],
    [400, "jailbreak", "safety_blocked", false],
    [401, undefined, "auth", false],
    [403, undefined, "auth", false],
    [402, undefined, "quota", false],
    [404, undefined, "bad_request", false],
    [408, undefined, "timeout", true],
    [413, undefined, "bad_request", false],
    [429, "RESOURCE_EXHAUSTED", "rate_limit", true],
    [500, undefined, "unavailable", true],
    [502, undefined, "unavailable", true],
    [503, undefined, "unavailable", true],
    [504, undefined, "unavailable", true],
    [418, undefined, "internal", false],
  ];
  for (const [status, code, kind, retryable] of table) {
    it(`HTTP ${status}${code ? ` / ${code}` : ""} is ${kind}, retryable ${retryable}`, () => {
      expect(classifyHttpFailure(status, code)).toMatchObject({ kind, retryable, status });
    });
  }
  it("every kind has a fixed user message in English and Sinhala, flagged for native review, that never claims an answer was produced", () => {
    const kinds: ErrorKind[] = ["auth", "quota", "rate_limit", "timeout", "unavailable", "bad_request", "safety_blocked", "budget_exceeded", "disabled", "not_configured", "circuit_open", "internal"];
    for (const k of kinds) {
      const m = userMessage(k);
      expect(m.en.length).toBeGreaterThan(10);
      expect(m.si).toMatch(/[඀-෿]/);
      expect(m.needsNativeReview).toBe(true);
      expect(m.en).not.toMatch(/AI said|here is your answer|according to/i);
    }
  });
  it("a GatewayError's message and JSON are fixed codes, never provider text", () => {
    const e = new GatewayError("rate_limit", { status: 429, code: "queue_full" });
    expect(e.message).toBe("gateway:rate_limit:queue_full");
    expect(JSON.stringify(e)).toBe('{"kind":"rate_limit","code":"queue_full","status":429}');
  });
});
