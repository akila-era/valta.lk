import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agentSessionId, ASSISTANT_COOKIE } from "@/lib/assistant/session-id";

/**
 * Route-level tests of POST /api/assistant/browser/confirm and /cancel against a FAKE Agent (a local HTTP server that checks the signature the way the real
 * Agent does and returns canned answers). MOCK-ONLY with respect to the Agent: this proves the website side (gating, limits, signing, session derivation,
 * strict validation, error mapping), not browsing. No browser, model or network beyond loopback is involved.
 */
const SECRET = "k".repeat(40);
const TOKEN = "T".repeat(32);
const PID = "bp_AbCdEfGhIjKlMnOpQr";
const jar = new Map<string, string>();
let customer: { id: string; name: string; phone: string } | null = null;

vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined) }) }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentCustomer: async () => customer,
  sessionCookieOptions: (expires: Date) => ({ httpOnly: true, secure: false, sameSite: "lax" as const, path: "/", expires }),
}));

interface Seen {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  signatureValid: boolean;
}
let agent: http.Server;
let agentUrl = "";
let seen: Seen[] = [];
let respond: (s: Seen) => { status: number; body?: unknown; raw?: string; headers?: Record<string, string> } = () => ({ status: 200, body: decision() });
const nonces = new Set<string>();

const guestSession = () => agentSessionId(SECRET, TOKEN, { kind: "guest" });
const decision = (over: Record<string, unknown> = {}) => ({
  requestId: "req_9",
  sessionId: guestSession(),
  outcome: "done",
  reply: { text: 'Done. The page now shows "Gaming Laptop X1". This is the page\'s own text, so any price or stock shown there is not verified.', source: "template" },
  needsNativeReview: false,
  browser: { source: "page", progress: [{ step: "open", status: "done", label: "Opening the page" }, { step: "act", status: "done", label: "Pressing it" }, { step: "verify", status: "done", label: "Checking the result" }] },
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
        url: String(req.url),
        headers: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, String(v)])),
        body: JSON.parse(raw.toString("utf8") || "{}"),
        signatureValid: h["x-volta-signature"] === expected && h["x-volta-key-id"] === "web1" && fresh && Math.abs(Date.now() / 1000 - Number(h["x-volta-timestamp"])) < 60,
      };
      seen.push(s);
      const r = respond(s);
      res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) });
      res.end(r.raw ?? JSON.stringify(r.body ?? {}));
    });
  });
  await new Promise<void>((r) => agent.listen(0, "127.0.0.1", r));
  agentUrl = `http://127.0.0.1:${(agent.address() as AddressInfo).port}`;
});
afterAll(() => agent.close());

beforeEach(() => {
  seen = [];
  jar.clear();
  jar.set(ASSISTANT_COOKIE, TOKEN);
  customer = null;
  respond = () => ({ status: 200, body: decision() });
  process.env.AI_ASSISTANT_ENABLED = "true";
  process.env.AI_AGENT_URL = agentUrl;
  process.env.AI_AGENT_HMAC_KEY_ID = "web1";
  process.env.AI_AGENT_HMAC_SECRET = SECRET;
  process.env.AI_ASSISTANT_BROWSER = "1";
  delete process.env.AI_AGENT_TIMEOUT_MS;
  delete process.env.AI_ASSISTANT_PREVIEW_KEY;
  (globalThis as unknown as { __voltaRate?: Map<string, unknown> }).__voltaRate?.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_ASSISTANT_BROWSER;
});

const ORIGIN = { origin: "http://shop.test", host: "shop.test" };
const req = (kind: "confirm" | "cancel", body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://shop.test/api/assistant/browser/${kind}`, { method: "POST", headers: { "content-type": "application/json", ...ORIGIN, "x-forwarded-for": "203.0.113.50", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const confirm = async (body: unknown = { proposalId: PID }, headers?: Record<string, string>) => (await import("@/app/api/assistant/browser/confirm/route")).POST(req("confirm", body, headers));
const cancel = async (body: unknown = { proposalId: PID }, headers?: Record<string, string>) => (await import("@/app/api/assistant/browser/cancel/route")).POST(req("cancel", body, headers));

describe("switched off", () => {
  it("answers 404 and never contacts the Agent unless AI_ASSISTANT_BROWSER is exactly 1", async () => {
    for (const v of [undefined, "", "0", "true", "yes", " 2"]) {
      if (v === undefined) delete process.env.AI_ASSISTANT_BROWSER;
      else process.env.AI_ASSISTANT_BROWSER = v;
      expect((await confirm()).status, `flag ${String(v)}`).toBe(404);
      expect((await cancel()).status, `flag ${String(v)}`).toBe(404);
    }
    expect(seen).toHaveLength(0);
  });

  it("answers 404 when the assistant itself is not fully configured", async () => {
    for (const patch of [{ AI_ASSISTANT_ENABLED: "false" }, { AI_AGENT_HMAC_SECRET: "short" }, { AI_AGENT_URL: "http://10.0.0.5:8787" }]) {
      Object.assign(process.env, { AI_ASSISTANT_ENABLED: "true", AI_AGENT_URL: agentUrl, AI_AGENT_HMAC_SECRET: SECRET, ...patch });
      expect((await confirm()).status, JSON.stringify(patch)).toBe(404);
    }
    expect(seen).toHaveLength(0);
  });
});

describe("request checks before the Agent is contacted", () => {
  it("blocks requests with no or a foreign Origin (403)", async () => {
    const { POST } = await import("@/app/api/assistant/browser/confirm/route");
    const noOrigin = new Request("http://shop.test/api/assistant/browser/confirm", { method: "POST", headers: { "content-type": "application/json", host: "shop.test" }, body: JSON.stringify({ proposalId: PID }) });
    expect((await POST(noOrigin)).status).toBe(403);
    expect((await confirm({ proposalId: PID }, { origin: "http://evil.test" })).status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  it("answers 422 for anything but exactly { proposalId }, including attempts to choose the conversation or identity", async () => {
    const bad: unknown[] = [{}, { proposalId: "x" }, { proposalId: "bp_short" }, { proposalId: PID, sessionId: "sess_0123456789abcdef0123" }, { proposalId: PID, identity: "cust:1" }, { proposalId: PID, extra: 1 }, { proposalId: 5 }, "{not json", [], null, "x".repeat(2_000)];
    for (const body of bad) expect((await confirm(body)).status, JSON.stringify(body)?.slice(0, 50)).toBe(422);
    expect(seen).toHaveLength(0);
  });

  it("answers 422 and sends nothing when there is no assistant cookie (there is no conversation to decide about)", async () => {
    jar.clear();
    expect((await confirm()).status).toBe(422);
    jar.set(ASSISTANT_COOKIE, "not-a-token");
    expect((await confirm()).status).toBe(422);
    expect(seen).toHaveLength(0);
  });

  it("is rate limited per client (429 with Retry-After) before the Agent", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 13; i++) last = await confirm();
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(seen).toHaveLength(12);
  });
});

describe("what the Agent is sent", () => {
  it("confirm: a signed call to /v1/browser/confirm with the derived session id and the proposal id, as anon", async () => {
    const res = await confirm();
    expect(res.status).toBe(200);
    const s = seen[0]!;
    expect(s.url).toBe("/v1/browser/confirm");
    expect(s.signatureValid).toBe(true);
    expect(s.headers["x-volta-identity"]).toBe("anon");
    expect(s.headers["x-volta-client-ip"]).toBe("203.0.113.50");
    expect(s.body).toEqual({ sessionId: guestSession(), proposalId: PID });
  });

  it("cancel: the same, to /v1/browser/cancel", async () => {
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(seen[0]!.url).toBe("/v1/browser/cancel");
    expect(seen[0]!.signatureValid).toBe(true);
    expect(seen[0]!.body).toEqual({ sessionId: guestSession(), proposalId: PID });
  });

  it("a signed-in customer: identity comes from the session cookie only, and the conversation id differs from the guest's", async () => {
    customer = { id: "cust_42", name: "A", phone: "0771234567" };
    respond = () => ({ status: 200, body: decision({ sessionId: agentSessionId(SECRET, TOKEN, { kind: "customer", customerId: "cust_42" }) }) });
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(seen[0]!.headers["x-volta-identity"]).toBe("cust:cust_42");
    expect(seen[0]!.body.sessionId).not.toBe(guestSession());
  });

  it("a request without a usable address gets the ONE reserved address (never 0.0.0.0)", async () => {
    await confirm({ proposalId: PID }, { "x-forwarded-for": "not-an-ip" });
    expect(seen[0]!.headers["x-volta-client-ip"]).toBe("192.0.2.1");
  });
});

describe("what the browser receives", () => {
  it("only the outcome, the Agent's fixed reply, the review flag and the progress: no request id, session id or Agent labels beyond the steps", async () => {
    const out = (await (await confirm()).json()) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["browser", "needsNativeReview", "outcome", "reply"]);
    expect(out.outcome).toBe("done");
    expect(out.reply).toEqual({ text: expect.stringContaining("not verified") });
    expect(JSON.stringify(out)).not.toContain("req_9");
    expect(JSON.stringify(out)).not.toContain(guestSession());
  });

  it("forces the review flag on for Sinhala text even if the Agent forgot it", async () => {
    respond = () => ({ status: 200, body: decision({ reply: { text: "හරි, සිදු විය.", source: "template" }, needsNativeReview: false }) });
    expect(((await (await confirm()).json()) as { needsNativeReview: boolean }).needsNativeReview).toBe(true);
  });

  it("returns 502 (nothing shown) for an answer about ANOTHER conversation, an unknown field, a wrong shape, non-JSON, or an oversized body", async () => {
    const cases: (() => { status: number; body?: unknown; raw?: string })[] = [
      () => ({ status: 200, body: decision({ sessionId: "sess_someone_else_0123456789abcdef" }) }),
      () => ({ status: 200, body: decision({ surprise: true }) }),
      () => ({ status: 200, body: decision({ outcome: "maybe" }) }),
      () => ({ status: 200, body: decision({ browser: { source: "page", progress: [{ step: "teleport", status: "done", label: "x" }] } }) }),
      () => ({ status: 200, body: decision({ browser: { source: "web", progress: [] } }) }),
      () => ({ status: 200, body: decision({ reply: { text: "x", source: "qwen" } }) }),
      () => ({ status: 200, raw: "not json" }),
      () => ({ status: 200, raw: JSON.stringify(decision({ reply: { text: "a".repeat(70_000), source: "template" } })) }),
    ];
    for (const c of cases) {
      respond = c;
      expect((await confirm()).status).toBe(502);
    }
  });

  it("maps the Agent's error codes to fixed wording and never forwards its text", async () => {
    const leak = "INTERNAL DETAIL the shopper must never see";
    const cases: [number, string, number][] = [
      [429, "RATE_LIMITED", 429],
      [422, "VALIDATION_FAILED", 422],
      [404, "NOT_FOUND", 404],
      [503, "QUEUE_FULL", 503],
      [504, "TIMEOUT", 503],
      [500, "INTERNAL", 502],
      [401, "UNAUTHORIZED", 502],
    ];
    for (const [status, code, expected] of cases) {
      respond = () => ({ status, body: { error: { code, message: leak, retryAfterSec: 7 } }, headers: {} });
      const res = await confirm();
      expect(res.status, code).toBe(expected);
      expect(JSON.stringify(await res.json())).not.toContain(leak);
    }
  });

  it("returns 503 when the Agent cannot be reached", async () => {
    process.env.AI_AGENT_URL = "http://127.0.0.1:1";
    expect((await confirm()).status).toBe(503);
  });
});
