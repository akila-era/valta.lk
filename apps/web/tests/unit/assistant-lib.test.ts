import { describe, expect, it } from "vitest";
import { readAssistantConfig } from "@/lib/assistant/config";
import { AgentChatResponse, BrowserRequest } from "@/lib/assistant/schema";
import { agentSessionId, isAssistantToken, newAssistantToken } from "@/lib/assistant/session-id";
import { signAgentRequest } from "@/lib/assistant/sign";

const SECRET = "k".repeat(40);
const ok = { AI_ASSISTANT_ENABLED: "true", AI_AGENT_URL: "http://127.0.0.1:18787", AI_AGENT_HMAC_KEY_ID: "web1", AI_AGENT_HMAC_SECRET: SECRET };

describe("request signing matches the Agent's implementation", () => {
  it("produces exactly the headers the Agent's own signRequest produced for the same inputs (vector from apps/agent/src/auth/hmac.ts)", () => {
    const h = signAgentRequest({ keyId: "web1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "customer", customerId: "cust_42" }, clientIp: "203.0.113.9", body: '{"a":1}', nowMs: 1_800_000_000_000, nonce: "0123456789abcdef0123456789abcdef" });
    expect(h).toEqual({
      "x-volta-key-id": "web1",
      "x-volta-timestamp": "1800000000",
      "x-volta-nonce": "0123456789abcdef0123456789abcdef",
      "x-volta-identity": "cust:cust_42",
      "x-volta-client-ip": "203.0.113.9",
      "x-volta-signature": "3e24884d9213931cf20bb68daa2c2523711f3d6a3c37aa4fbdc28cc1551e936b",
    });
  });

  it("signs a guest as anon, and a changed body, path, IP or identity changes the signature", () => {
    const base = { keyId: "web1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" } as const, clientIp: "203.0.113.9", body: "x", nowMs: 1_800_000_000_000, nonce: "0123456789abcdef0123456789abcdef" };
    const sig = (o: object) => signAgentRequest({ ...base, ...o })["x-volta-signature"];
    expect(signAgentRequest(base)["x-volta-identity"]).toBe("anon");
    const all = new Set([sig({}), sig({ body: "y" }), sig({ path: "/v1/health" }), sig({ clientIp: "203.0.113.10" }), sig({ identity: { kind: "customer", customerId: "c" } }), sig({ nowMs: 1_800_000_001_000 })]);
    expect(all.size).toBe(6);
  });

  it("uses a fresh nonce for every request", () => {
    const a = signAgentRequest({ keyId: "web1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: "203.0.113.9" });
    const b = signAgentRequest({ keyId: "web1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: "203.0.113.9" });
    expect(a["x-volta-nonce"]).not.toBe(b["x-volta-nonce"]);
    expect(a["x-volta-nonce"]).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("assistant configuration is off unless complete and safe", () => {
  it("is off by default and when the switch is anything but exactly true", () => {
    expect(readAssistantConfig({})).toBeNull();
    for (const v of ["", "false", "TRUE", "1", "yes"]) expect(readAssistantConfig({ ...ok, AI_ASSISTANT_ENABLED: v }), v).toBeNull();
    expect(readAssistantConfig(ok)).toMatchObject({ keyId: "web1", timeoutMs: 50_000 });
  });

  it("refuses a missing, malformed or short credential", () => {
    for (const over of [{ AI_AGENT_HMAC_KEY_ID: "" }, { AI_AGENT_HMAC_KEY_ID: "bad key!" }, { AI_AGENT_HMAC_KEY_ID: "x".repeat(17) }, { AI_AGENT_HMAC_SECRET: "short" }, { AI_AGENT_HMAC_SECRET: "" }]) expect(readAssistantConfig({ ...ok, ...over }), JSON.stringify(over)).toBeNull();
  });

  it("accepts loopback http and https, and refuses clear-text http to any other host, credentials in the URL and other schemes", () => {
    for (const url of ["http://127.0.0.1:18787", "http://localhost:8787", "http://[::1]:8787", "https://agent.example.com"]) expect(readAssistantConfig({ ...ok, AI_AGENT_URL: url }), url).not.toBeNull();
    for (const url of ["http://10.0.0.5:8787", "http://2.29.97.114:8787", "http://agent.example.com", "ftp://127.0.0.1", "http://user:pw@127.0.0.1:8787", "not a url", ""]) expect(readAssistantConfig({ ...ok, AI_AGENT_URL: url }), url).toBeNull();
  });

  it("keeps only the origin of the URL and bounds the timeout", () => {
    expect(readAssistantConfig({ ...ok, AI_AGENT_URL: "http://127.0.0.1:18787/some/path?x=1" })!.agentUrl.href).toBe("http://127.0.0.1:18787/");
    expect(readAssistantConfig({ ...ok, AI_AGENT_TIMEOUT_MS: "5000" })!.timeoutMs).toBe(5_000);
    for (const t of ["10", "999999", "abc", "1.5"]) expect(readAssistantConfig({ ...ok, AI_AGENT_TIMEOUT_MS: t })!.timeoutMs, t).toBe(50_000);
  });
});

describe("the conversation id is derived on the server", () => {
  it("is stable for one browser and identity, differs after sign-in or sign-out, and differs between browsers", () => {
    const token = newAssistantToken();
    const guest = agentSessionId(SECRET, token, { kind: "guest" });
    expect(agentSessionId(SECRET, token, { kind: "guest" })).toBe(guest);
    const cust = agentSessionId(SECRET, token, { kind: "customer", customerId: "c1" });
    expect(cust).not.toBe(guest);
    expect(agentSessionId(SECRET, token, { kind: "customer", customerId: "c2" })).not.toBe(cust);
    expect(agentSessionId(SECRET, newAssistantToken(), { kind: "guest" })).not.toBe(guest);
    expect(agentSessionId("z".repeat(40), token, { kind: "guest" })).not.toBe(guest);
  });

  it("always fits the Agent's session id format, and never contains the token", () => {
    const token = newAssistantToken();
    const id = agentSessionId(SECRET, token, { kind: "guest" });
    expect(id).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(id).not.toContain(token);
  });

  it("accepts only well-formed tokens", () => {
    expect(isAssistantToken(newAssistantToken())).toBe(true);
    for (const bad of [undefined, "", "short", "x".repeat(33), "../../etc/passwd/../../abcdefghij", "a b".repeat(11)]) expect(isAssistantToken(bad), String(bad)).toBe(false);
  });
});

describe("what the browser may send", () => {
  it("accepts a message, an optional language, a cart snapshot and a page type", () => {
    expect(BrowserRequest.safeParse({ message: " Show me phones ", cart: [{ productId: "p1", quantity: 2 }], page: "home" }).data).toMatchObject({ message: "Show me phones", locale: "auto", cart: [{ productId: "p1", variantKey: "", quantity: 2 }] });
  });

  it("rejects identity or session fields, unknown fields, long or control-character messages and bad carts", () => {
    const bad: unknown[] = [
      { message: "hi", customerId: "c1" },
      { message: "hi", sessionId: "sess_0123456789abcdef" },
      { message: "hi", identity: "cust:c1" },
      { message: "hi", contractVersion: "1.1" },
      { message: "" },
      { message: "   " },
      { message: "a".repeat(801) },
      { message: "bad\u0001text" },
      { message: "hi", cart: Array.from({ length: 21 }, () => ({ productId: "p", quantity: 1 })) },
      { message: "hi", cart: [{ productId: "p", quantity: 0 }] },
      { message: "hi", cart: [{ productId: "p", quantity: 11 }] },
      { message: "hi", cart: [{ productId: "p", quantity: 1.5 }] },
      { message: "hi", cart: [{ productId: "", quantity: 1 }] },
      { message: "hi", page: "admin" },
      { message: "hi", locale: "fr" },
      { message: 42 },
    ];
    for (const b of bad) expect(BrowserRequest.safeParse(b).success, JSON.stringify(b).slice(0, 60)).toBe(false);
  });
});

describe("what the Agent may answer", () => {
  const good = { requestId: "req_1", sessionId: "sess_x", language: "en", reply: { text: "Here is what I found.", source: "template" }, needsNativeReview: false, cards: [], actions: [], suggestions: [], meta: { model: null, degraded: false, queuedMs: 0, latencyMs: 5, contractVersion: "1.2" } };
  it("accepts a valid response and rejects other contract versions, unknown fields and Sinhala without the review flag", () => {
    expect(AgentChatResponse.safeParse(good).success).toBe(true);
    expect(AgentChatResponse.safeParse({ ...good, meta: { ...good.meta, contractVersion: "1" } }).success).toBe(false);
    expect(AgentChatResponse.safeParse({ ...good, extra: 1 }).success).toBe(false);
    expect(AgentChatResponse.safeParse({ ...good, language: "si", needsNativeReview: false }).success).toBe(false);
    expect(AgentChatResponse.safeParse({ ...good, reply: { text: "ආයුබෝවන්", source: "template" }, needsNativeReview: false }).success).toBe(false);
    expect(AgentChatResponse.safeParse({ ...good, language: "si", reply: { text: "ආයුබෝවන්", source: "template" }, needsNativeReview: true }).success).toBe(true);
  });

  it("accepts cart proposals that ask and approved links only", () => {
    const act = (a: object) => AgentChatResponse.safeParse({ ...good, actions: [a] }).success;
    expect(act({ type: "cart.add", actionId: "act_12345678", productId: "p", variantKey: "", quantity: 1, confirm: "ask" })).toBe(true);
    expect(act({ type: "cart.add", actionId: "act_12345678", productId: "p", variantKey: "", quantity: 1, confirm: "none" })).toBe(false);
    expect(act({ type: "cart.add", actionId: "act_12345678", productId: "p", variantKey: "", quantity: 11, confirm: "ask" })).toBe(false);
    for (const href of ["/checkout", "/cart", "/track-order", "/products/nova-x1"]) expect(act({ type: "navigate", actionId: "act_12345678", href }), href).toBe(true);
    for (const href of ["https://evil.example", "//evil.example", "/admin", "/api/internal/sync-orders", "javascript:alert(1)", "/products/../admin"]) expect(act({ type: "navigate", actionId: "act_12345678", href }), href).toBe(false);
  });
});

describe("private preview key", () => {
  it("is optional, must be 16+ characters when set, and a weak one turns the assistant off", () => {
    expect(readAssistantConfig(ok)!.previewKey).toBeNull();
    expect(readAssistantConfig({ ...ok, AI_ASSISTANT_PREVIEW_KEY: "p".repeat(16) })!.previewKey).toBe("p".repeat(16));
    expect(readAssistantConfig({ ...ok, AI_ASSISTANT_PREVIEW_KEY: "short" })).toBeNull();
  });
});
