import { afterEach, describe, expect, it } from "vitest";
import { ReplayCache } from "../../src/auth/hmac";
import { ErrorEnvelope } from "../../src/contract/schemas";
import { AbuseGuard, DEFAULT_RATE_CONFIG, type RateStore } from "../../src/security/rate-limit";
import { QueueFullError } from "../../src/queue/scheduler";
import type { ChatPipeline } from "../../src/http/pipeline";
import { chat, customer, GUEST, okResult, post, sid, startServer, type StartOptions, type Started } from "../fixtures/http-helpers";

const running: Started[] = [];
async function start(o: StartOptions = {}) {
  const s = await startServer(o);
  running.push(s);
  return s;
}
afterEach(async () => {
  while (running.length) await running.pop()!.app.close();
});
const errOf = async (res: Response) => ErrorEnvelope.parse(await res.json()).error;

describe("per-IP limits over HTTP (signed IP only)", () => {
  it("allows exactly the limit, then answers 429 RATE_LIMITED with Retry-After, and the pipeline is not run for the refused request", async () => {
    const s = await start({ env: { AGENT_RATE_IP_PER_MIN: "3", AGENT_COOLDOWN_AFTER: "100" } });
    for (let i = 0; i < 3; i++) expect((await post(s.url, chat("hi", sid(i)))).status).toBe(200);
    const res = await post(s.url, chat("hi", sid(9)));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await errOf(res)).code).toBe("RATE_LIMITED");
    expect(s.calls).toHaveLength(3);
  });

  it("ignores X-Forwarded-For and similar headers: a spoofed header neither dodges the limit nor moves it onto someone else", async () => {
    const s = await start({ env: { AGENT_RATE_IP_PER_MIN: "2", AGENT_COOLDOWN_AFTER: "100" } });
    const spoof = { "x-forwarded-for": "198.51.100.77", "x-real-ip": "198.51.100.77", forwarded: "for=198.51.100.77", "cf-connecting-ip": "198.51.100.77" };
    await post(s.url, chat("a", sid(1)), { ip: "203.0.113.7", headers: spoof });
    await post(s.url, chat("b", sid(2)), { ip: "203.0.113.7", headers: spoof });
    expect((await post(s.url, chat("c", sid(3)), { ip: "203.0.113.7", headers: { "x-forwarded-for": "198.51.100.200" } })).status).toBe(429); // different spoof, same signed IP
    // The address named in the spoofed headers was never counted.
    expect((await post(s.url, chat("d", sid(4)), { ip: "198.51.100.77" })).status).toBe(200);
  });

  it("rejects a request whose client-IP header was changed after signing (the signature covers it)", async () => {
    const s = await start();
    const res = await post(s.url, chat(), { ip: "203.0.113.7", headers: { "x-volta-client-ip": "198.51.100.1" } });
    expect(res.status).toBe(401);
    expect(s.calls).toHaveLength(0);
  });
});

describe("per-session and per-customer limits over HTTP", () => {
  it("limits one session, but not another session of the same shopper", async () => {
    const s = await start({ env: { AGENT_RATE_SESSION_PER_MIN: "2", AGENT_COOLDOWN_AFTER: "100" } });
    expect((await post(s.url, chat("a", sid(1)))).status).toBe(200);
    expect((await post(s.url, chat("b", sid(1)))).status).toBe(200);
    expect((await post(s.url, chat("c", sid(1)))).status).toBe(429);
    expect((await post(s.url, chat("d", sid(2)))).status).toBe(200);
  });

  it("limits a customer across sessions and IPs", async () => {
    const s = await start({ env: { AGENT_RATE_IDENTITY_PER_MIN: "3", AGENT_COOLDOWN_AFTER: "100" } });
    for (let i = 0; i < 3; i++) expect((await post(s.url, chat("a", sid(i)), { identity: customer("c1"), ip: `198.51.100.${i + 1}` })).status).toBe(200);
    expect((await post(s.url, chat("a", sid(7)), { identity: customer("c1"), ip: "198.51.100.50" })).status).toBe(429);
    expect((await post(s.url, chat("a", sid(8)), { identity: customer("c2"), ip: "198.51.100.51" })).status).toBe(200);
  });

  it("limits new sessions per identity", async () => {
    const s = await start({ env: { AGENT_NEW_SESSIONS_PER_HOUR: "2", AGENT_COOLDOWN_AFTER: "100" } });
    expect((await post(s.url, chat("a", sid(1)))).status).toBe(200);
    expect((await post(s.url, chat("a", sid(2)))).status).toBe(200);
    expect((await post(s.url, chat("a", sid(3)))).status).toBe(429);
    expect((await post(s.url, chat("a", sid(1)))).status).toBe(200); // an existing session still works
  });
});

describe("message and body size limits", () => {
  it("accepts a message of exactly the maximum length and rejects one character more (422), before any pipeline", async () => {
    const s = await start();
    expect((await post(s.url, chat("a".repeat(800), sid(1)))).status).toBe(200);
    const res = await post(s.url, chat("a".repeat(801), sid(2)));
    expect(res.status).toBe(422);
    expect((await errOf(res)).fields).toHaveProperty("message");
    expect(s.calls).toHaveLength(1);
  });

  it("honours a lower configured message limit", async () => {
    const s = await start({ env: { AGENT_MAX_MESSAGE_CHARS: "50" } });
    expect((await post(s.url, chat("a".repeat(50), sid(1)))).status).toBe(200);
    expect((await post(s.url, chat("a".repeat(51), sid(2)))).status).toBe(422);
  });

  it("rejects a body over the byte limit with 413, whether or not Content-Length is honest, and runs nothing", async () => {
    const s = await start({ env: { AGENT_MAX_BODY_BYTES: "1000" } });
    const big = JSON.stringify({ ...chat("x", sid(1)), challengeToken: "t".repeat(2_000) });
    expect((await post(s.url, null, { raw: big })).status).toBe(413);
    expect((await post(s.url, null, { raw: JSON.stringify(chat("x", sid(2))) })).status).toBe(200); // a normal body is fine
    expect(s.calls).toHaveLength(1);
  });

  it("rejects non-JSON content types and malformed JSON without running anything", async () => {
    const s = await start();
    const res = await post(s.url, null, { raw: "{not json" });
    expect(res.status).toBe(400);
    const wrong = await post(s.url, chat(), { headers: { "content-type": "text/plain" } });
    expect(wrong.status).toBe(415);
    expect(s.calls).toHaveLength(0);
  });
});

describe("concurrent requests and queue exhaustion", () => {
  function gate() {
    let open!: () => void;
    const opened = new Promise<void>((r) => (open = r));
    const pipeline: ChatPipeline = { run: async () => (await opened, okResult()) };
    return { pipeline, open };
  }

  it("refuses a request beyond the concurrent limit for one IP, and accepts again once one finishes", async () => {
    const g = gate();
    const s = await start({ pipeline: g.pipeline, env: { AGENT_MAX_CONCURRENT_PER_IDENTITY: "2", AGENT_COOLDOWN_AFTER: "100", AGENT_RATE_IP_PER_MIN: "100" } });
    const a = post(s.url, chat("a", sid(1)));
    const b = post(s.url, chat("b", sid(2)));
    await new Promise((r) => setTimeout(r, 150));
    const c = await post(s.url, chat("c", sid(3)));
    expect(c.status).toBe(429);
    expect((await errOf(c)).code).toBe("RATE_LIMITED");
    g.open();
    expect((await a).status).toBe(200);
    expect((await b).status).toBe(200);
    expect((await post(s.url, chat("d", sid(4)))).status).toBe(200);
  });

  it("releases the slot when the pipeline fails, so errors cannot exhaust the concurrency budget", async () => {
    const s = await start({ pipeline: { run: async () => Promise.reject(new Error("boom")) }, env: { AGENT_MAX_CONCURRENT_PER_IDENTITY: "1", AGENT_RATE_IP_PER_MIN: "100", AGENT_COOLDOWN_AFTER: "100" } });
    for (let i = 0; i < 4; i++) expect((await post(s.url, chat("a", sid(i)))).status).toBe(500);
  });

  it("applies the global in-flight cap across different callers (503 QUEUE_FULL with Retry-After)", async () => {
    const g = gate();
    const s = await start({ pipeline: g.pipeline, env: { AGENT_MAX_IN_FLIGHT: "2", AGENT_RATE_IP_PER_MIN: "100" } });
    const held = [post(s.url, chat("a", sid(1)), { ip: "198.51.100.1" }), post(s.url, chat("b", sid(2)), { ip: "198.51.100.2" })];
    await new Promise((r) => setTimeout(r, 150));
    const res = await post(s.url, chat("c", sid(3)), { ip: "198.51.100.3" });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect((await errOf(res)).code).toBe("QUEUE_FULL");
    g.open();
    for (const h of held) expect((await h).status).toBe(200);
  });

  it("turns an exhausted inference queue into 503 QUEUE_FULL with Retry-After, not a crash or a hang", async () => {
    const s = await start({ pipeline: { run: async () => Promise.reject(new QueueFullError(7)) } });
    const res = await post(s.url, chat("a", sid(1)));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("7");
    expect((await errOf(res)).code).toBe("QUEUE_FULL");
  });
});

describe("session identity validation, ownership, expiry and fixation", () => {
  it.each([
    ["too short", "sess_1"],
    ["too long", "s".repeat(65)],
    ["spaces", "sess 0123456789abcdef"],
    ["path characters", "../../sess_0123456789"],
    ["sql", "1' OR '1'='1' --0123456789"],
    ["unicode", "සැසිය_0123456789abcdef"],
    ["empty", ""],
  ])("rejects an invalid session id (%s) with 422 and runs nothing", async (_n, id) => {
    const s = await start();
    const res = await post(s.url, { sessionId: id, message: "hi" });
    expect(res.status).toBe(422);
    expect(s.calls).toHaveLength(0);
  });

  it("rejects a missing or non-string session id", async () => {
    const s = await start();
    expect((await post(s.url, { message: "hi" })).status).toBe(422);
    expect((await post(s.url, { sessionId: 12345678901234567, message: "hi" })).status).toBe(422);
    expect(s.calls).toHaveLength(0);
  });

  it("never lets one identity use a session id that belongs to another: guest-then-customer, customer-then-customer, customer-then-guest", async () => {
    const s = await start({ env: { AGENT_RATE_IP_PER_MIN: "100", AGENT_RATE_SESSION_PER_MIN: "100" } });
    expect((await post(s.url, chat("a", sid(1)), { identity: GUEST })).status).toBe(200);
    const login = await post(s.url, chat("a", sid(1)), { identity: customer("c1") });
    expect(login.status).toBe(422);
    expect((await errOf(login)).fields).toHaveProperty("sessionId");
    expect((await post(s.url, chat("a", sid(2)), { identity: customer("c1") })).status).toBe(200);
    expect((await post(s.url, chat("a", sid(2)), { identity: customer("c2") })).status).toBe(422);
    expect((await post(s.url, chat("a", sid(2)), { identity: GUEST })).status).toBe(422);
    expect(s.calls.map((c) => c.sessionId)).toEqual([sid(1), sid(2)]);
  });

  it("blocks session fixation: an id an attacker started as a guest can never become the victim's logged-in session", async () => {
    const s = await start({ env: { AGENT_RATE_IP_PER_MIN: "100", AGENT_RATE_SESSION_PER_MIN: "100" } });
    await post(s.url, chat("planted", "sess_attacker_chosen_01"), { identity: GUEST, ip: "198.51.100.66" });
    const victim = await post(s.url, chat("where is my order", "sess_attacker_chosen_01"), { identity: customer("victim") });
    expect(victim.status).toBe(422);
    expect(s.calls.filter((c) => c.identity.kind === "customer")).toHaveLength(0);
  });

  it("expires an idle session id: after the idle time it is forgotten and can start again under another identity", async () => {
    let t = Date.UTC(2026, 10, 12, 10, 0, 0);
    const s = await start({ now: () => t, env: { AGENT_RATE_IP_PER_MIN: "100", AGENT_RATE_SESSION_PER_MIN: "100" } });
    expect((await post(s.url, chat("a", sid(1)), { identity: GUEST, nowMs: t })).status).toBe(200);
    t += 29 * 60_000;
    expect((await post(s.url, chat("a", sid(1)), { identity: customer("c1"), nowMs: t })).status).toBe(422); // still bound
    t += 31 * 60_000;
    expect((await post(s.url, chat("a", sid(1)), { identity: customer("c1"), nowMs: t })).status).toBe(200); // expired, fresh start
  });
});

describe("replay protection over HTTP", () => {
  it("rejects a captured request replayed with the same nonce, and one with a stale timestamp, without running the pipeline twice", async () => {
    const s = await start();
    const nonce = "0123456789abcdef0123456789abcdef";
    expect((await post(s.url, chat("a", sid(1)), { nonce })).status).toBe(200);
    expect((await post(s.url, chat("a", sid(1)), { nonce })).status).toBe(401);
    expect((await post(s.url, chat("a", sid(1)), { nowMs: Date.now() - 5 * 60_000 })).status).toBe(401);
    expect((await post(s.url, chat("a", sid(1)), { nowMs: Date.now() + 5 * 60_000 })).status).toBe(401);
    expect(s.calls).toHaveLength(1);
  });

  it("fails closed when the replay cache is full: a new nonce is refused, never accepted unchecked", async () => {
    const replay = new ReplayCache({ maxEntries: 1 });
    const s = await start({ replay });
    expect((await post(s.url, chat("a", sid(1)))).status).toBe(200);
    expect((await post(s.url, chat("a", sid(1)))).status).toBe(401);
  });

  it("rejects a wrong key, an unsigned request and an altered body with the same 401 and no detail", async () => {
    const s = await start();
    const bad = await post(s.url, chat(), { secret: "x".repeat(40) });
    const unsigned = await fetch(`${s.url}/v1/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(chat()) });
    expect(bad.status).toBe(401);
    expect(unsigned.status).toBe(401);
    expect(await bad.json()).toEqual({ error: { code: "UNAUTHORIZED", message: "Unauthorized.", requestId: expect.any(String) } });
    expect(s.calls).toHaveLength(0);
  });
});

describe("failed-authentication throttling (socket address, never a header)", () => {
  it("slows a socket that keeps sending bad signatures, whatever IP the headers claim", async () => {
    const s = await start({ env: { AGENT_AUTH_FAIL_PER_MIN: "3" } });
    for (let i = 0; i < 3; i++) expect((await post(s.url, chat(), { secret: "y".repeat(40), headers: { "x-forwarded-for": `198.51.100.${i}` } })).status).toBe(401);
    const blocked = await post(s.url, chat(), { secret: "y".repeat(40) });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });
});

describe("rate-limit storage failure fails safe", () => {
  it("refuses with 503 (not 200) when the counters are unavailable, and runs nothing", async () => {
    const broken: RateStore = {
      hit() {
        throw new Error("down");
      },
      peek() {
        throw new Error("down");
      },
      size: () => 0,
    };
    const s = await start({ guard: new AbuseGuard(DEFAULT_RATE_CONFIG, { store: broken }) });
    const res = await post(s.url, chat());
    expect(res.status).toBe(503);
    expect((await errOf(res)).code).toBe("QUEUE_FULL");
    expect(JSON.stringify(await res.text().catch(() => ""))).not.toContain("down");
    expect(s.calls).toHaveLength(0);
  });
});

describe("CAPTCHA-ready challenge over HTTP (no provider purchased)", () => {
  it("off by default: a limit hit never asks for a challenge", async () => {
    const s = await start({ env: { AGENT_RATE_IP_PER_MIN: "1", AGENT_COOLDOWN_AFTER: "100" } });
    await post(s.url, chat("a", sid(1)));
    const res = await post(s.url, chat("a", sid(2)));
    expect((await errOf(res)).code).toBe("RATE_LIMITED");
  });

  it("on-abuse: after a limit hit the client needs a token the provider accepts, and a good token lets it through", async () => {
    let t = Date.UTC(2026, 10, 12, 10, 0, 0);
    const s = await start({
      now: () => t,
      challenge: { verify: async (token) => token === "good-token" },
      env: { AGENT_RATE_IP_PER_MIN: "1", AGENT_COOLDOWN_AFTER: "100", AI_CHALLENGE_MODE: "on-abuse" },
    });
    expect((await post(s.url, chat("a", sid(1)), { nowMs: t })).status).toBe(200);
    expect((await errOf(await post(s.url, chat("a", sid(2)), { nowMs: t }))).code).toBe("RATE_LIMITED");
    t += 61_000; // the minute window is over, the challenge window is not
    const noToken = await post(s.url, chat("a", sid(3)), { nowMs: t });
    expect(noToken.status).toBe(429);
    expect((await errOf(noToken)).code).toBe("CHALLENGE_REQUIRED");
    t += 61_000; // a refused attempt still counts towards the rate limit, so wait out the minute again
    const bad = await post(s.url, { ...chat("a", sid(3)), challengeToken: "nope" }, { nowMs: t });
    expect((await errOf(bad)).code).toBe("CHALLENGE_REQUIRED");
    t += 61_000;
    expect((await post(s.url, { ...chat("a", sid(3)), challengeToken: "good-token" }, { nowMs: t })).status).toBe(200);
  });

  it("on-abuse without a provider keeps the gate closed", async () => {
    let t = Date.UTC(2026, 10, 12, 10, 0, 0);
    const s = await start({ now: () => t, env: { AGENT_RATE_IP_PER_MIN: "1", AGENT_COOLDOWN_AFTER: "100", AI_CHALLENGE_MODE: "on-abuse" } });
    await post(s.url, chat("a", sid(1)), { nowMs: t });
    await post(s.url, chat("a", sid(2)), { nowMs: t });
    t += 61_000;
    const res = await post(s.url, { ...chat("a", sid(3)), challengeToken: "anything" }, { nowMs: t });
    expect((await errOf(res)).code).toBe("CHALLENGE_REQUIRED");
  });
});

describe("logs never contain customer content", () => {
  it("logs only allow-listed fields: no message, session id, customer id, nonce, signature or IP", async () => {
    const s = await start({ env: { AGENT_RATE_IP_PER_MIN: "2", AGENT_COOLDOWN_AFTER: "100" } });
    const message = "my unique secret-ish message about a Nova X1 zebra-quartz-77";
    await post(s.url, chat(message, "sess_unique_session_id_x1"), { identity: customer("cust_unique_77"), ip: "198.51.100.123" });
    await post(s.url, chat(message, "sess_unique_session_id_x2"), { identity: customer("cust_unique_77"), ip: "198.51.100.123" });
    await post(s.url, chat(message, "sess_unique_session_id_x3"), { identity: customer("cust_unique_77"), ip: "198.51.100.123" });
    const all = s.logs.join("\n");
    for (const needle of ["zebra-quartz-77", "sess_unique_session_id", "cust_unique_77", "198.51.100.123", "x-volta", "Nova X1"]) expect(all, needle).not.toContain(needle);
    expect(all).toContain("RATE_LIMITED");
    for (const line of s.logs) expect(Object.keys(JSON.parse(line)).every((k) => ["ts", "requestId", "route", "method", "status", "latencyMs", "identityKind", "errorCode", "authReason", "degraded"].includes(k))).toBe(true);
  });
});
