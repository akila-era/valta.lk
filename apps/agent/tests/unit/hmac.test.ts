import { describe, expect, it } from "vitest";
import { HEADERS, ReplayCache, signRequest, verifyRequest, parseIdentity, formatIdentity, canonicalString } from "../../src/auth/hmac";

const SECRET = "0123456789abcdef0123456789abcdef";
const KEYS = new Map([["k1", SECRET]]);
const NOW = 1_767_000_000_000;
const NONCE = "00112233445566778899aabbccddeeff";

const headerGetter = (h: Record<string, string>) => (name: string) => h[name];

function verify(headers: Record<string, string>, over: Partial<Parameters<typeof verifyRequest>[0]> = {}) {
  return verifyRequest({
    header: headerGetter(headers),
    method: "POST",
    path: "/v1/chat",
    body: Buffer.from('{"a":1}'),
    keys: KEYS,
    nowMs: NOW,
    replay: new ReplayCache({ now: () => NOW }),
    ...over,
  });
}

const signed = (over: Partial<Parameters<typeof signRequest>[0]> = {}) =>
  signRequest({
    keyId: "k1",
    secret: SECRET,
    method: "POST",
    path: "/v1/chat",
    identity: { kind: "customer", customerId: "abc123" },
    clientIp: "203.0.113.7",
    body: '{"a":1}',
    nowMs: NOW,
    nonce: NONCE,
    ...over,
  });

describe("known-answer vectors (computed independently with node:crypto)", () => {
  it("matches vector 1: customer identity, JSON body, IPv4", () => {
    expect(signed()[HEADERS.signature]).toBe("aa88d173f6a5808dfd2d4d1e8e9dac7ed0aa32d6a4f0eb57585d9f8a15b43c7a");
  });

  it("matches vector 2: guest, empty GET body, IPv6", () => {
    const h = signRequest({
      keyId: "k1",
      secret: SECRET,
      method: "GET",
      path: "/v1/health",
      identity: { kind: "guest" },
      clientIp: "2001:db8::1",
      nowMs: NOW,
      nonce: "ffeeddccbbaa99887766554433221100",
    });
    expect(h[HEADERS.signature]).toBe("19ac416eab3b51142ef806daafb526eaba57664412ea85d76784827ead6255e9");
  });

  it("builds the documented canonical string", () => {
    expect(canonicalString({ timestamp: "1", nonce: "n", method: "post", path: "/p", identity: "anon", clientIp: "1.2.3.4", bodySha256: "h" })).toBe(
      "1\nn\nPOST\n/p\nanon\n1.2.3.4\nh",
    );
  });
});

describe("verifyRequest", () => {
  it("accepts a correct signature and returns the signed identity and client ip", () => {
    const r = verify(signed());
    expect(r).toMatchObject({ ok: true, keyId: "k1", clientIp: "203.0.113.7", identity: { kind: "customer", customerId: "abc123" } });
  });

  it("rejects tampering with the body, path, method, identity and client ip", () => {
    const h = signed();
    expect(verify(h, { body: Buffer.from('{"a":2}') })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verify(h, { path: "/v1/chat/stream" })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verify(h, { method: "GET" })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verify({ ...h, [HEADERS.identity]: "cust:someoneelse" })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verify({ ...h, [HEADERS.identity]: "anon" })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verify({ ...h, [HEADERS.clientIp]: "198.51.100.9" })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a wrong secret and an unknown key id", () => {
    expect(verify(signed({ secret: "x".repeat(32) }))).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(verify(signed({ keyId: "k9" }))).toEqual({ ok: false, reason: "UNKNOWN_KEY" });
  });

  it("enforces the 60 second clock window in both directions", () => {
    expect(verify(signed({ nowMs: NOW - 61_000 }))).toEqual({ ok: false, reason: "STALE" });
    expect(verify(signed({ nowMs: NOW + 61_000 }))).toEqual({ ok: false, reason: "STALE" });
    expect(verify(signed({ nowMs: NOW - 59_000 })).ok).toBe(true);
    expect(verify(signed({ nowMs: NOW + 59_000 })).ok).toBe(true);
  });

  it("rejects missing and malformed headers without throwing", () => {
    const h = signed();
    for (const name of Object.values(HEADERS)) {
      const copy = { ...h };
      delete copy[name];
      expect(verify(copy)).toEqual({ ok: false, reason: "MISSING_HEADER" });
    }
    expect(verify({ ...h, [HEADERS.nonce]: "short" }).ok).toBe(false);
    expect(verify({ ...h, [HEADERS.signature]: "zz" }).ok).toBe(false);
    expect(verify({ ...h, [HEADERS.timestamp]: "12.5" }).ok).toBe(false);
    expect(verify({ ...h, [HEADERS.clientIp]: "not-an-ip" }).ok).toBe(false);
    expect(verify({ ...h, [HEADERS.identity]: "admin" }).ok).toBe(false);
    expect(verify({ ...h, [HEADERS.identity]: "cust:" }).ok).toBe(false);
    expect(verify({ ...h, [HEADERS.keyId]: "bad key!" }).ok).toBe(false);
  });

  it("rejects a replayed nonce, but only after the signature has verified", () => {
    const replay = new ReplayCache({ now: () => NOW });
    const h = signed();
    expect(verify(h, { replay }).ok).toBe(true);
    expect(verify(h, { replay })).toEqual({ ok: false, reason: "REPLAY" });
    // A forged request must not consume or learn anything from the cache.
    const forged = signed({ secret: "y".repeat(32), nonce: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(verify(forged, { replay })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(replay.size()).toBe(1);
  });

  it("supports key rotation: two keys are valid at once", () => {
    const two = new Map([["k1", SECRET], ["k2", "z".repeat(40)]]);
    expect(verify(signed(), { keys: two }).ok).toBe(true);
    expect(verify(signed({ keyId: "k2", secret: "z".repeat(40), nonce: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }), { keys: two }).ok).toBe(true);
    expect(verify(signed(), { keys: new Map([["k2", "z".repeat(40)]]) })).toEqual({ ok: false, reason: "UNKNOWN_KEY" });
  });
});

describe("ReplayCache", () => {
  it("forgets a nonce after its time to live", () => {
    let t = 0;
    const c = new ReplayCache({ ttlSec: 10, now: () => t });
    expect(c.check("n1")).toBe(true);
    expect(c.check("n1")).toBe(false);
    t = 11_000;
    expect(c.check("n1")).toBe(true);
  });

  it("fails closed when full instead of evicting live entries", () => {
    let t = 0;
    const c = new ReplayCache({ ttlSec: 100, maxEntries: 2, now: () => t });
    expect(c.check("a")).toBe(true);
    expect(c.check("b")).toBe(true);
    expect(c.check("c")).toBe(false);
    t = 101_000; // entries expire, space frees up
    expect(c.check("c")).toBe(true);
  });
});

describe("identity helpers", () => {
  it("round-trips", () => {
    expect(formatIdentity(parseIdentity("anon")!)).toBe("anon");
    expect(formatIdentity(parseIdentity("cust:abc_1-2")!)).toBe("cust:abc_1-2");
    expect(parseIdentity("cust:has space")).toBeNull();
    expect(parseIdentity("ANON")).toBeNull();
  });
});
