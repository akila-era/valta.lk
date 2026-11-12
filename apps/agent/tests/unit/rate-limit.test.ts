import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/errors";
import { AbuseGuard, DEFAULT_RATE_CONFIG, MemoryRateStore, RateStoreError, type RateConfig, type RateStore } from "../../src/security/rate-limit";
import { SessionRegistry } from "../../src/security/sessions";
import { TtlLruStore } from "../../src/session/store";

const cfg = (over: Partial<RateConfig> = {}): RateConfig => ({ ...DEFAULT_RATE_CONFIG, ipPerMin: 3, sessionPerMin: 2, identityPerMin: 4, maxConcurrent: 2, newSessionsPerHour: 2, authFailPerMin: 3, cooldownAfter: 2, cooldownSec: 30, ...over });
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof ApiError ? e.code : "NOT_API_ERROR";
  }
  return undefined;
};
const IP = "203.0.113.7";

describe("per-IP limit boundaries", () => {
  it("allows exactly the limit and refuses the next request with a retry time", () => {
    const c = clock();
    const g = new AbuseGuard(cfg(), { now: c.now });
    for (let i = 0; i < 3; i++) g.checkRequest({ clientIp: IP, identityKey: "anon" });
    try {
      g.checkRequest({ clientIp: IP, identityKey: "anon" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("RATE_LIMITED");
      expect((e as ApiError).status).toBe(429);
      expect((e as ApiError).retryAfterSec).toBeGreaterThanOrEqual(1);
    }
  });

  it("is per IP: another address is unaffected", () => {
    const g = new AbuseGuard(cfg(), { now: clock().now });
    for (let i = 0; i < 3; i++) g.checkRequest({ clientIp: IP, identityKey: "anon" });
    expect(code(() => g.checkRequest({ clientIp: "198.51.100.1", identityKey: "anon" }))).toBeUndefined();
  });

  it("recovers when the window passes", () => {
    const c = clock();
    const g = new AbuseGuard(cfg({ cooldownAfter: 99 }), { now: c.now });
    for (let i = 0; i < 3; i++) g.checkRequest({ clientIp: IP, identityKey: "anon" });
    expect(code(() => g.checkRequest({ clientIp: IP, identityKey: "anon" }))).toBe("RATE_LIMITED");
    c.advance(61_000);
    expect(code(() => g.checkRequest({ clientIp: IP, identityKey: "anon" }))).toBeUndefined();
  });

  it("limits a customer across all of their sessions, separately from the IP", () => {
    const g = new AbuseGuard(cfg({ ipPerMin: 100, identityPerMin: 4 }), { now: clock().now });
    for (let i = 0; i < 4; i++) g.checkRequest({ clientIp: `198.51.100.${i + 1}`, identityKey: "cust:c1" });
    expect(code(() => g.checkRequest({ clientIp: "198.51.100.99", identityKey: "cust:c1" }))).toBe("RATE_LIMITED");
    expect(code(() => g.checkRequest({ clientIp: "198.51.100.98", identityKey: "cust:c2" }))).toBeUndefined();
  });
});

describe("per-session limit", () => {
  it("limits one (identity, session) pair, and the same session id under another identity counts separately", () => {
    const g = new AbuseGuard(cfg(), { now: clock().now });
    g.checkSession({ identityKey: "anon", sessionId: "sess_aaaaaaaaaaaaaaaa" });
    g.checkSession({ identityKey: "anon", sessionId: "sess_aaaaaaaaaaaaaaaa" });
    expect(code(() => g.checkSession({ identityKey: "anon", sessionId: "sess_aaaaaaaaaaaaaaaa" }))).toBe("RATE_LIMITED");
    expect(code(() => g.checkSession({ identityKey: "cust:x", sessionId: "sess_aaaaaaaaaaaaaaaa" }))).toBeUndefined();
    expect(code(() => g.checkSession({ identityKey: "anon", sessionId: "sess_bbbbbbbbbbbbbbbb" }))).toBeUndefined();
  });

  it("limits new sessions per identity per hour", () => {
    const c = clock();
    const g = new AbuseGuard(cfg({ cooldownAfter: 99 }), { now: c.now });
    g.checkNewSession("anon");
    g.checkNewSession("anon");
    expect(code(() => g.checkNewSession("anon"))).toBe("RATE_LIMITED");
    c.advance(3_600_001);
    expect(code(() => g.checkNewSession("anon"))).toBeUndefined();
  });
});

describe("cooldown", () => {
  it("starts after repeated violations, blocks even a request that would otherwise fit, and ends on time", () => {
    const c = clock();
    const g = new AbuseGuard(cfg({ ipPerMin: 1, cooldownAfter: 2, cooldownSec: 30 }), { now: c.now });
    g.checkRequest({ clientIp: IP, identityKey: "anon" });
    expect(code(() => g.checkRequest({ clientIp: IP, identityKey: "anon" }))).toBe("RATE_LIMITED"); // violation 1
    expect(code(() => g.checkRequest({ clientIp: IP, identityKey: "anon" }))).toBe("RATE_LIMITED"); // violation 2: cooldown starts
    c.advance(20_000); // still inside the cooldown, and far outside nothing: blocked without counting
    expect(code(() => g.checkRequest({ clientIp: IP, identityKey: "anon" }))).toBe("RATE_LIMITED");
    c.advance(70_000); // cooldown over and the minute window has passed
    expect(code(() => g.checkRequest({ clientIp: IP, identityKey: "anon" }))).toBeUndefined();
  });

  it("reports the remaining cooldown as the retry time", () => {
    const c = clock();
    const g = new AbuseGuard(cfg({ ipPerMin: 1, cooldownAfter: 1, cooldownSec: 45 }), { now: c.now });
    g.checkRequest({ clientIp: IP, identityKey: "anon" });
    code(() => g.checkRequest({ clientIp: IP, identityKey: "anon" }));
    try {
      g.checkRequest({ clientIp: IP, identityKey: "anon" });
      expect.unreachable();
    } catch (e) {
      expect((e as ApiError).retryAfterSec).toBeGreaterThanOrEqual(40);
      expect((e as ApiError).retryAfterSec).toBeLessThanOrEqual(45);
    }
  });
});

describe("concurrent request limit", () => {
  it("allows up to the limit at once, refuses the next, and frees a slot on release (once only)", () => {
    const g = new AbuseGuard(cfg({ maxConcurrent: 2, cooldownAfter: 99 }), { now: clock().now });
    const a = g.acquire({ clientIp: IP, identityKey: "anon" });
    const b = g.acquire({ clientIp: IP, identityKey: "anon" });
    expect(code(() => g.acquire({ clientIp: IP, identityKey: "anon" }))).toBe("RATE_LIMITED");
    expect(g.inFlightTotal()).toBe(2);
    a();
    a(); // a double release must not free a second slot
    expect(g.inFlightTotal()).toBe(1);
    const c = g.acquire({ clientIp: IP, identityKey: "anon" });
    expect(code(() => g.acquire({ clientIp: IP, identityKey: "anon" }))).toBe("RATE_LIMITED");
    b();
    c();
    expect(g.inFlightTotal()).toBe(0);
  });

  it("counts guests per IP and customers per customer id", () => {
    const g = new AbuseGuard(cfg({ maxConcurrent: 1, cooldownAfter: 99 }), { now: clock().now });
    g.acquire({ clientIp: IP, identityKey: "anon" });
    expect(code(() => g.acquire({ clientIp: IP, identityKey: "anon" }))).toBe("RATE_LIMITED");
    expect(code(() => g.acquire({ clientIp: "198.51.100.5", identityKey: "anon" }))).toBeUndefined();
    g.acquire({ clientIp: IP, identityKey: "cust:a" });
    expect(code(() => g.acquire({ clientIp: "198.51.100.6", identityKey: "cust:a" }))).toBe("RATE_LIMITED"); // same customer, other IP
    expect(code(() => g.acquire({ clientIp: IP, identityKey: "cust:b" }))).toBeUndefined();
  });
});

describe("fails safe when counter storage is unavailable", () => {
  const broken: RateStore = {
    hit() {
      throw new Error("storage down");
    },
    peek() {
      throw new Error("storage down");
    },
    size: () => 0,
  };

  it("refuses requests (503 busy) instead of allowing them when the store throws", () => {
    const g = new AbuseGuard(cfg(), { store: broken, now: clock().now });
    for (const fn of [() => g.checkRequest({ clientIp: IP, identityKey: "anon" }), () => g.checkSession({ identityKey: "anon", sessionId: "s" }), () => g.checkNewSession("anon"), () => g.checkAuthFailures("1.2.3.4")]) {
      expect(code(fn)).toBe("QUEUE_FULL");
    }
  });

  it("refuses new keys when the store is full and keeps serving keys it already tracks", () => {
    const store = new MemoryRateStore({ maxKeys: 2 });
    const g = new AbuseGuard(cfg({ ipPerMin: 50 }), { store, now: clock().now });
    g.checkRequest({ clientIp: "198.51.100.1", identityKey: "anon" });
    g.checkRequest({ clientIp: "198.51.100.2", identityKey: "anon" });
    expect(code(() => g.checkRequest({ clientIp: "198.51.100.3", identityKey: "anon" }))).toBe("QUEUE_FULL");
    expect(code(() => g.checkRequest({ clientIp: "198.51.100.1", identityKey: "anon" }))).toBeUndefined();
  });

  it("a store error is typed, and never leaks its message through the API error", () => {
    expect(() => new MemoryRateStore({ maxKeys: 0 }).hit("k", 1000, 1)).toThrow(RateStoreError);
    const g = new AbuseGuard(cfg(), { store: broken, now: clock().now });
    try {
      g.checkRequest({ clientIp: IP, identityKey: "anon" });
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("storage down");
    }
  });
});

describe("failed authentication tracking (socket address only)", () => {
  it("blocks a socket address after too many failures, others unaffected", () => {
    const g = new AbuseGuard(cfg({ authFailPerMin: 3 }), { now: clock().now });
    for (let i = 0; i < 3; i++) {
      g.checkAuthFailures("10.0.0.9");
      g.recordAuthFailure("10.0.0.9");
    }
    expect(code(() => g.checkAuthFailures("10.0.0.9"))).toBe("RATE_LIMITED");
    expect(code(() => g.checkAuthFailures("10.0.0.10"))).toBeUndefined();
  });
});

describe("CAPTCHA-ready challenge gate", () => {
  const provider = (ok: (t: string) => boolean) => ({ verify: async (t: string) => ok(t) });
  it("does nothing in off mode, whatever happened before", async () => {
    const g = new AbuseGuard(cfg({ ipPerMin: 1 }), { now: clock().now, challengeMode: "off" });
    g.checkRequest({ clientIp: IP, identityKey: "anon" });
    code(() => g.checkRequest({ clientIp: IP, identityKey: "anon" }));
    await expect(g.checkChallenge({ clientIp: IP, identityKey: "anon" })).resolves.toBeUndefined();
  });

  it("on-abuse: a client with no recent violation is not challenged; after a violation it needs a token the provider accepts", async () => {
    const g = new AbuseGuard(cfg({ ipPerMin: 1, cooldownAfter: 99 }), { now: clock().now, challengeMode: "on-abuse", challenge: provider((t) => t === "good-token") });
    await expect(g.checkChallenge({ clientIp: IP, identityKey: "anon" })).resolves.toBeUndefined();
    g.checkRequest({ clientIp: IP, identityKey: "anon" });
    code(() => g.checkRequest({ clientIp: IP, identityKey: "anon" }));
    await expect(g.checkChallenge({ clientIp: IP, identityKey: "anon" })).rejects.toMatchObject({ code: "CHALLENGE_REQUIRED" });
    await expect(g.checkChallenge({ clientIp: IP, identityKey: "anon", token: "bad" })).rejects.toMatchObject({ code: "CHALLENGE_REQUIRED" });
    await expect(g.checkChallenge({ clientIp: IP, identityKey: "anon", token: "good-token" })).resolves.toBeUndefined();
    await expect(g.checkChallenge({ clientIp: IP, identityKey: "anon" })).resolves.toBeUndefined(); // cleared by the pass
  });

  it("on-abuse with no provider never accepts a token (fails closed), and a throwing provider counts as a failed challenge", async () => {
    const none = new AbuseGuard(cfg({ ipPerMin: 1, cooldownAfter: 99 }), { now: clock().now, challengeMode: "on-abuse" });
    none.checkRequest({ clientIp: IP, identityKey: "anon" });
    code(() => none.checkRequest({ clientIp: IP, identityKey: "anon" }));
    await expect(none.checkChallenge({ clientIp: IP, identityKey: "anon", token: "anything" })).rejects.toMatchObject({ code: "CHALLENGE_REQUIRED" });
    const boom = new AbuseGuard(cfg({ ipPerMin: 1, cooldownAfter: 99 }), { now: clock().now, challengeMode: "on-abuse", challenge: { verify: async () => Promise.reject(new Error("x")) } });
    boom.checkRequest({ clientIp: IP, identityKey: "anon" });
    code(() => boom.checkRequest({ clientIp: IP, identityKey: "anon" }));
    await expect(boom.checkChallenge({ clientIp: IP, identityKey: "anon", token: "t" })).rejects.toMatchObject({ code: "CHALLENGE_REQUIRED" });
  });
});

describe("session registry: ownership, expiry and absolute lifetime", () => {
  const SID = "sess_0123456789abcdef";
  it("binds an id to its first identity and refuses every other identity", () => {
    const r = new SessionRegistry({ now: clock().now });
    expect(r.touch("anon", SID)).toEqual({ status: "new" });
    expect(r.touch("anon", SID)).toEqual({ status: "existing" });
    expect(r.touch("cust:a", SID)).toEqual({ status: "conflict" });
    expect(r.touch("cust:b", SID)).toEqual({ status: "conflict" });
  });

  it("forgets an idle id after the idle limit (it becomes new, and can belong to someone else)", () => {
    const c = clock();
    const r = new SessionRegistry({ now: c.now, idleMs: 60_000 });
    r.touch("anon", SID);
    c.advance(59_000);
    expect(r.touch("anon", SID)).toEqual({ status: "existing" }); // activity slides the idle window
    c.advance(61_000);
    expect(r.touch("cust:a", SID)).toEqual({ status: "new" });
  });

  it("ends an id at its absolute lifetime even if it is used constantly", () => {
    const c = clock();
    const r = new SessionRegistry({ now: c.now, idleMs: 60_000, maxAgeMs: 300_000 });
    r.touch("anon", SID);
    for (let i = 0; i < 6; i++) {
      c.advance(50_000);
      r.touch("anon", SID);
    }
    c.advance(50_000);
    expect(r.touch("anon", SID)).toEqual({ status: "new" }); // 350 s since creation
  });
});

describe("conversation state store: idle and absolute expiry", () => {
  it("expires after idle time and after the absolute lifetime, and activity cannot extend the latter", () => {
    const c = clock();
    const s = new TtlLruStore<{ n: number }>({ max: 10, ttlMs: 1_000, maxAgeMs: 2_500, now: c.now });
    s.set("k", { n: 1 });
    c.advance(900);
    expect(s.get("k")).toEqual({ n: 1 });
    s.set("k", { n: 2 }); // update keeps the original creation time
    c.advance(900);
    expect(s.get("k")).toEqual({ n: 2 });
    c.advance(900); // 2700 ms since creation, though never idle
    expect(s.get("k")).toBeUndefined();
    s.set("j", { n: 3 });
    c.advance(1_001);
    expect(s.get("j")).toBeUndefined(); // idle expiry
  });
});
