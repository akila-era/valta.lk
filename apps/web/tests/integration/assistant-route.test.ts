import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests of POST /api/assistant/chat against a FAKE Agent (a local HTTP server that checks the signature the way the real
 * Agent does and returns canned answers). No model, ERP, database or network beyond loopback is involved.
 */
const SECRET = "k".repeat(40);
const jar = new Map<string, string>();
let customer: { id: string; name: string; phone: string } | null = null;

vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined) }) }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentCustomer: async () => customer,
  sessionCookieOptions: (expires: Date) => ({ httpOnly: true, secure: false, sameSite: "lax" as const, path: "/", expires }),
}));

interface Seen {
  headers: Record<string, string>;
  body: Record<string, unknown>;
  signatureValid: boolean;
}
let agent: http.Server;
let agentUrl = "";
let seen: Seen[] = [];
let respond: (req: Seen) => { status: number; body: unknown; headers?: Record<string, string>; raw?: string } = () => ({ status: 200, body: good() });
const nonces = new Set<string>();

const good = (over: Record<string, unknown> = {}) => ({
  requestId: "req_1",
  sessionId: "sess_agent",
  language: "en",
  reply: { text: "Here is what I found.", source: "template" },
  needsNativeReview: false,
  cards: [],
  actions: [],
  suggestions: [],
  meta: { model: "qwen3:1.7b-q4_K_M", degraded: false, queuedMs: 12, latencyMs: 40, contractVersion: "1.1" },
  ...over,
});

beforeAll(async () => {
  agent = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const h = req.headers;
      const expected = createHmac("sha256", SECRET)
        .update([h["x-volta-timestamp"], h["x-volta-nonce"], req.method, req.url, h["x-volta-identity"], h["x-volta-client-ip"], createHash("sha256").update(raw).digest("hex")].join("\n"))
        .digest("hex");
      const nonce = String(h["x-volta-nonce"]);
      const fresh = !nonces.has(nonce);
      nonces.add(nonce);
      const s: Seen = {
        headers: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, String(v)])),
        body: JSON.parse(raw.toString("utf8") || "{}"),
        signatureValid: h["x-volta-signature"] === expected && h["x-volta-key-id"] === "web1" && fresh && Math.abs(Date.now() / 1000 - Number(h["x-volta-timestamp"])) < 60,
      };
      seen.push(s);
      const r = respond(s);
      res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) });
      res.end(r.raw ?? JSON.stringify(r.body));
    });
  });
  await new Promise<void>((r) => agent.listen(0, "127.0.0.1", r));
  agentUrl = `http://127.0.0.1:${(agent.address() as AddressInfo).port}`;
});
afterAll(() => agent.close());

beforeEach(() => {
  seen = [];
  jar.clear();
  customer = null;
  respond = () => ({ status: 200, body: good() });
  process.env.AI_ASSISTANT_ENABLED = "true";
  process.env.AI_AGENT_URL = agentUrl;
  process.env.AI_AGENT_HMAC_KEY_ID = "web1";
  process.env.AI_AGENT_HMAC_SECRET = SECRET;
  delete process.env.AI_AGENT_TIMEOUT_MS;
  delete process.env.AI_ASSISTANT_PREVIEW_KEY;
  (globalThis as unknown as { __voltaRate?: Map<string, unknown> }).__voltaRate?.clear();
});
afterEach(() => vi.restoreAllMocks());

const ORIGIN = { origin: "http://shop.test", host: "shop.test" };
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://shop.test/api/assistant/chat", { method: "POST", headers: { "content-type": "application/json", ...ORIGIN, "x-forwarded-for": "203.0.113.50", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const call = async (body: unknown, headers?: Record<string, string>) => (await import("@/app/api/assistant/chat/route")).POST(post(body, headers));

describe("switched off", () => {
  it("answers 404 and never contacts the Agent unless the assistant is fully configured", async () => {
    for (const patch of [{ AI_ASSISTANT_ENABLED: "false" }, { AI_AGENT_HMAC_SECRET: "short" }, { AI_AGENT_URL: "http://10.0.0.5:8787" }]) {
      Object.assign(process.env, { AI_ASSISTANT_ENABLED: "true", AI_AGENT_URL: agentUrl, AI_AGENT_HMAC_SECRET: SECRET, ...patch });
      const res = await call({ message: "hi" });
      expect(res.status, JSON.stringify(patch)).toBe(404);
    }
    expect(seen).toHaveLength(0);
  });
});

describe("request checks before the Agent is contacted", () => {
  it("blocks requests with no or a foreign Origin (403)", async () => {
    const { POST } = await import("@/app/api/assistant/chat/route");
    const noOrigin = new Request("http://shop.test/api/assistant/chat", { method: "POST", headers: { "content-type": "application/json", host: "shop.test" }, body: JSON.stringify({ message: "hi" }) });
    expect((await POST(noOrigin)).status).toBe(403);
    expect((await call({ message: "hi" }, { origin: "http://evil.test" })).status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  it("answers 422 for invalid input, including attempts to set identity or session from the browser", async () => {
    for (const body of [{ message: "" }, { message: "a".repeat(801) }, { message: "hi", customerId: "c1" }, { message: "hi", sessionId: "sess_0123456789abcdef" }, "{not json", { message: "hi", cart: [{ productId: "p", quantity: 99 }] }]) {
      expect((await call(body)).status, JSON.stringify(body).slice(0, 50)).toBe(422);
    }
    expect((await call("x".repeat(9_000))).status).toBe(422);
    expect(seen).toHaveLength(0);
  });

  it("is rate limited per client (429 with Retry-After) before the Agent", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 21; i++) last = await call({ message: "hi" });
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(seen).toHaveLength(20);
  });
});

describe("what the Agent is sent", () => {
  it("a guest: signed as anon, with the signed client IP, a derived session id and the contract version", async () => {
    const res = await call({ message: "Show me phones", cart: [{ productId: "p1", variantKey: "", quantity: 2 }], page: "product", locale: "en" });
    expect(res.status).toBe(200);
    const s = seen[0]!;
    expect(s.signatureValid).toBe(true);
    expect(s.headers["x-volta-identity"]).toBe("anon");
    expect(s.headers["x-volta-client-ip"]).toBe("203.0.113.50");
    expect(s.body).toMatchObject({ message: "Show me phones", locale: "en", cart: [{ productId: "p1", variantKey: "", quantity: 2 }], context: { page: "product" }, contractVersion: "1.1" });
    expect(String(s.body.sessionId)).toMatch(/^sess_[A-Za-z0-9_-]{32}$/);
  });

  it("a signed-in customer: identity comes from the session cookie only, and the conversation id differs from the guest's", async () => {
    const first = await call({ message: "hi" });
    jar.set("volta_ai", /volta_ai=([A-Za-z0-9_-]{32})/.exec(first.headers.get("set-cookie") ?? "")![1]!); // the same browser
    const guestSession = seen[0]!.body.sessionId;
    customer = { id: "cust_42", name: "Kasun", phone: "0771234567" };
    await call({ message: "where is my order" });
    const s = seen[seen.length - 1]!;
    expect(s.signatureValid).toBe(true);
    expect(s.headers["x-volta-identity"]).toBe("cust:cust_42");
    expect(s.body.sessionId).not.toBe(guestSession);
    // personal details never travel to the Agent
    expect(JSON.stringify(s.body)).not.toMatch(/Kasun|0771234567/);
  });

  it("starts a private httpOnly cookie on first use, keeps the same conversation id when it is sent back, and never exposes the id to the browser", async () => {
    const first = await call({ message: "hi" });
    const cookie = first.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/volta_ai=[A-Za-z0-9_-]{32}/);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    const token = /volta_ai=([A-Za-z0-9_-]{32})/.exec(cookie)![1]!;
    jar.set("volta_ai", token);
    const second = await call({ message: "again" });
    expect(second.headers.get("set-cookie")).toBeNull();
    expect(seen[1]!.body.sessionId).toBe(seen[0]!.body.sessionId);
    expect(JSON.stringify(await second.json())).not.toContain(String(seen[0]!.body.sessionId));
  });

  it("uses a fresh signature (nonce) for every request, and a spoofed IP header is just the client IP the proxy reported", async () => {
    await call({ message: "a" });
    await call({ message: "b" });
    expect(seen.every((s) => s.signatureValid)).toBe(true);
    expect(new Set(seen.map((s) => s.headers["x-volta-nonce"])).size).toBe(2);
    seen = [];
    await call({ message: "c" }, { "x-forwarded-for": "not-an-ip" });
    expect(seen[0]!.headers["x-volta-client-ip"]).toBe("0.0.0.0");
  });
});

describe("what the browser receives", () => {
  it("only the reply, cards, actions and suggestions: no model name, queue time, request or session id from the Agent", async () => {
    const res = await call({ message: "hi" });
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["actions", "cards", "language", "needsNativeReview", "reply", "suggestions"]);
    expect(JSON.stringify(body)).not.toMatch(/qwen|queuedMs|latencyMs|sess_agent|req_1/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("passes valid cards and confirm-gated cart proposals through unchanged", async () => {
    const card = { type: "product", id: "cm0item00000008", slug: "atlas-smartwatch-cm0item00000008", name: "Atlas Smartwatch", price: { amount: 34900, text: "Rs. 34,900.00" }, available: true, url: "/products/atlas-smartwatch-cm0item00000008" };
    const action = { type: "cart.add", actionId: "act_0123456789ab", productId: "cm0item00000008", variantKey: "", quantity: 1, confirm: "ask" };
    respond = () => ({ status: 200, body: good({ cards: [card], actions: [action, { type: "navigate", actionId: "act_0123456789ac", href: "/cart" }] }) });
    const body = await (await call({ message: "add the watch" })).json();
    expect(body.cards).toEqual([card]);
    expect(body.actions).toHaveLength(2);
  });

  it.each([
    ["an unknown field on a card", { cards: [{ type: "product", id: "p", slug: "s", name: "n", price: { amount: 1, text: "Rs. 1.00" }, available: true, url: "/products/s", sneaky: "x" }] }],
    ["an off-site product link", { cards: [{ type: "product", id: "p", slug: "s", name: "n", price: { amount: 1, text: "Rs. 1.00" }, available: true, url: "https://evil.example/x" }] }],
    ["a cart proposal that does not ask", { actions: [{ type: "cart.add", actionId: "act_0123456789ab", productId: "p", variantKey: "", quantity: 1, confirm: "none" }] }],
    ["an off-site navigation", { actions: [{ type: "navigate", actionId: "act_0123456789ab", href: "https://evil.example" }] }],
    ["a checkout-style action that does not exist", { actions: [{ type: "order.create", actionId: "act_0123456789ab" }] }],
    ["Sinhala text without the review flag", { language: "si", reply: { text: "ආයුබෝවන්", source: "template" }, needsNativeReview: false }],
    ["an unsupported contract version", { meta: { model: null, degraded: false, queuedMs: 0, latencyMs: 1, contractVersion: "1" } }],
  ])("refuses a response with %s (502), and shows the shopper only a generic message", async (_n, over) => {
    respond = () => ({ status: 200, body: good(over) });
    const res = await call({ message: "hi" });
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/evil|sneaky|order\.create/);
  });
});

describe("Agent failures become safe, generic answers", () => {
  it("passes a rate limit on as 429 with Retry-After, without the Agent's wording", async () => {
    respond = () => ({ status: 429, body: { error: { code: "RATE_LIMITED", message: "internal detail: ip bucket 203.0.113.50", retryAfterSec: 12 } } });
    const res = await call({ message: "hi" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
    expect(JSON.stringify(await res.json())).not.toContain("internal detail");
  });

  it.each([
    ["QUEUE_FULL", 503],
    ["AI_UNAVAILABLE", 503],
    ["AI_DISABLED", 503],
    ["TIMEOUT", 503],
    ["VALIDATION_FAILED", 422],
    ["INTERNAL", 502],
    ["UNAUTHORIZED", 502],
    ["UPSTREAM_ERROR", 502],
  ])("maps the Agent's %s to %i and forwards none of its text", async (code, status) => {
    respond = () => ({ status: 500, body: { error: { code, message: "SECRET internal message with stack trace" } } });
    const res = await call({ message: "hi" });
    expect(res.status).toBe(status);
    expect(JSON.stringify(await res.json())).not.toMatch(/SECRET|stack trace/);
  });

  it("answers 503 when the Agent is down or times out, 502 when it sends garbage, and never follows a redirect", async () => {
    process.env.AI_AGENT_URL = "http://127.0.0.1:1"; // nothing listens there
    expect((await call({ message: "hi" })).status).toBe(503);
    process.env.AI_AGENT_URL = agentUrl;
    respond = () => ({ status: 200, body: {}, raw: "<html>not json</html>" });
    expect((await call({ message: "hi" })).status).toBe(502);
    respond = () => ({ status: 302, body: {}, headers: { location: "http://evil.test/" } });
    expect((await call({ message: "hi" })).status).toBe(503);
    process.env.AI_AGENT_TIMEOUT_MS = "1000";
    respond = () => ({ status: 200, body: good() });
    const slow = http.createServer(() => {});
    await new Promise<void>((r) => slow.listen(0, "127.0.0.1", r));
    process.env.AI_AGENT_URL = `http://127.0.0.1:${(slow.address() as AddressInfo).port}`;
    const t0 = Date.now();
    expect((await call({ message: "hi" })).status).toBe(503);
    expect(Date.now() - t0).toBeLessThan(3_000);
    slow.closeAllConnections();
    slow.close();
  });

  it("refuses an oversized Agent response", async () => {
    respond = () => ({ status: 200, body: {}, raw: JSON.stringify({ pad: "x".repeat(250_000) }) });
    expect((await call({ message: "hi" })).status).toBe(502);
  });
});

describe("no message content is logged", () => {
  it("writes nothing to the console, even for a message holding a secret or when everything fails", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await call({ message: "my password is Tr0ub4dor&3-unique" });
    respond = () => ({ status: 500, body: { error: { code: "INTERNAL", message: "x" } } });
    await call({ message: "my password is Tr0ub4dor&3-unique" });
    process.env.AI_AGENT_URL = "http://127.0.0.1:1";
    await call({ message: "my password is Tr0ub4dor&3-unique" });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

describe("private preview", () => {
  const KEY = "preview-key-0123456789";
  const getPreview = async (key?: string) => (await import("@/app/api/assistant/preview/route")).GET(new Request(`http://shop.test/api/assistant/preview${key === undefined ? "" : `?key=${key}`}`, { headers: { "x-forwarded-for": "203.0.113.60" } }));

  it("hides the assistant from everyone without the preview cookie (404, the Agent is never contacted)", async () => {
    process.env.AI_ASSISTANT_PREVIEW_KEY = KEY;
    expect((await call({ message: "hi" })).status).toBe(404);
    jar.set("volta_ai_preview", "not-the-cookie");
    expect((await call({ message: "hi" })).status).toBe(404);
    expect(seen).toHaveLength(0);
  });

  it("the preview link with the right key sets an httpOnly cookie and redirects home; with the cookie the chat works", async () => {
    process.env.AI_ASSISTANT_PREVIEW_KEY = KEY;
    const res = await getPreview(KEY);
    expect(res.status).toBe(303);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie.toLowerCase()).toContain("httponly");
    jar.set("volta_ai_preview", /volta_ai_preview=([^;]+)/.exec(cookie)![1]!);
    expect((await call({ message: "hi" })).status).toBe(200);
    expect(seen).toHaveLength(1);
  });

  it("a wrong, missing or short key gets 404 and no cookie, and the link does not exist when no preview key is set", async () => {
    process.env.AI_ASSISTANT_PREVIEW_KEY = KEY;
    for (const k of ["wrong-key-0123456789", "", undefined]) {
      const r = await getPreview(k);
      expect(r.status, String(k)).toBe(404);
      expect(r.headers.get("set-cookie")).toBeNull();
    }
    delete process.env.AI_ASSISTANT_PREVIEW_KEY;
    expect((await getPreview(KEY)).status).toBe(404);
    expect((await call({ message: "hi" })).status).toBe(200); // no key: open to everyone
  });

  it("rate limits guessing of the key", async () => {
    process.env.AI_ASSISTANT_PREVIEW_KEY = KEY;
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) last = await getPreview("guess-0123456789-" + i);
    expect(last!.status).toBe(429);
  });
});
