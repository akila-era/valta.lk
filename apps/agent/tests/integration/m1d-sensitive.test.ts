import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/config";
import { itemId, FixtureErpTransport } from "../../src/mock/erp-fixture";
import { checkSafety, containsSensitive, luhnValid } from "../../src/router/safety";
import { renderTemplate } from "../../src/router/templates";
import { createSessionStore, sessionKey } from "../../src/session/store";
import { LEGITIMATE } from "../eval/safety-pack";
import { startFakeOllama, type FakeOllama } from "../fake-ollama/server";
import { chat, customer, post, sid, startServer, type Started } from "../fixtures/http-helpers";
import { run } from "../fixtures/pipeline-helpers";
import { mockStack } from "../fixtures/mock-stack-helpers";

let fake: FakeOllama;
beforeEach(async () => {
  fake = await startFakeOllama();
});
afterEach(async () => {
  await fake.close();
});

/** Each entry: the sensitive text, and the exact secret value that must never be echoed, logged or kept. */
const SENSITIVE: [string, string, string][] = [
  ["card number", "my card is 4111 1111 1111 1111 please use it", "4111 1111 1111 1111"],
  ["card number with dashes", "pay with 5500-0000-0000-0004", "5500-0000-0000-0004"],
  ["card number, no spaces", "4012888888881881 expiry 12/29", "4012888888881881"],
  ["CVV", "cvv 123 for my card", "cvv 123"],
  ["OTP", "my otp is 482913", "482913"],
  ["OTP phrase", "verification code: 774411", "774411"],
  ["password", "my password is Tr0ub4dor&3", "Tr0ub4dor&3"],
  ["password colon", "password: hunter2hunter2", "hunter2hunter2"],
  ["PIN", "my pin is 4821", "4821"],
  ["old NIC", "my nic is 912345678V", "912345678V"],
  ["new NIC", "nic 199012345678 for the delivery", "199012345678"],
  ["bearer token", "use Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789", "abcdefghijklmnopqrstuvwxyz0123456789"],
  ["JWT", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r", "eyJhbGciOiJIUzI1NiJ9"],
  ["secret key", "my key is sk_live_51H8abcdefghijklmnop", "sk_live_51H8abcdefghijklmnop"],
  ["AWS key", "AKIAIOSFODNN7EXAMPLE is my access key", "AKIAIOSFODNN7EXAMPLE"],
  ["GitHub token", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
  ["Slack token", "xoxb-123456789012-abcdefghijkl", "xoxb-123456789012-abcdefghijkl"],
  ["store credential", "the credential is hxs_live7.abcdef123456", "hxs_live7.abcdef123456"],
  ["session cookie", "valta_session=abcdef0123456789abcdef", "abcdef0123456789abcdef"],
  ["named api key", "api_key = zx81hd0aa92lq77", "zx81hd0aa92lq77"],
  ["named secret", "secret: correcthorsebattery", "correcthorsebattery"],
  ["private key", "-----BEGIN RSA PRIVATE KEY----- MIIE", "MIIE"],
  ["long hex secret", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefcafe", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefcafe"],
  ["Sinhala password", "මුරපදය: abc12345xyz", "abc12345xyz"],
  ["Sinhala card", "මගේ card number 4111111111111111", "4111111111111111"],
  ["mixed OTP", "mage otp eka is 559900 danna", "559900"],
];

describe("sensitive input is detected, refused and never processed", () => {
  it.each(SENSITIVE)("%s", async (_n, text, secret) => {
    expect(checkSafety(text)).toEqual({ blocked: true, reason: "sensitive_input" });
    const s = mockStack(fake, { qwen: true });
    const { result, events } = await run(s.pipeline, text, { customer: true, cart: [{ productId: itemId(3), quantity: 1 }] });
    // refused with a fixed template that does not echo any part of the input
    expect([renderTemplate("refuse_sensitive", "en").text, renderTemplate("refuse_sensitive", "si").text]).toContain(result.reply.text);
    const out = JSON.stringify({ result, events });
    expect(out).not.toContain(secret);
    expect(out).not.toContain(secret.replace(/[ -]/g, ""));
    // no model, tool or ERP call, and nothing cards or actions
    expect(fake.requests).toHaveLength(0);
    expect(s.transport.calls).toEqual({ list: 0, product: 0, settings: 0, order: 0 });
    expect(result.cards).toEqual([]);
    expect(result.actions).toEqual([]);
  });

  it("keeps no text of the refused message: the stored conversation state has no field that could hold it", async () => {
    const s = mockStack(fake, { qwen: true });
    const secret = "my password is Tr0ub4dor&3";
    await run(s.pipeline, secret);
    const key = sessionKey({ kind: "guest" }, "sess_0123456789abcdef");
    const state = s.sessions.get(key);
    expect(state).toBeDefined();
    expect(JSON.stringify(state)).not.toContain("Tr0ub4dor");
    expect(Object.keys(state!).sort()).toEqual(["language", "lastShownProductIds", "slots"].sort());
    expect(createSessionStore().size()).toBe(0);
  });

  it("recognises card numbers by the Luhn check, not by length alone", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(checkSafety("order number 1234567890123456")).toEqual({ blocked: false }); // fails Luhn
  });
});

describe("legitimate shopping messages are not mistaken for secrets", () => {
  it("passes the whole legitimate pack and common product, price and order wording", () => {
    const messages = [...LEGITIMATE, "Nova X1 256GB under 150000", "Rs. 129,900 budget", "order VLK-261012-ABCDEFGHJK status", "product cm0item00000001", "call me on 0771234567", "is the 20W charger compatible", "128GB or 256GB", "6.7-inch display with 5000 mAh", "token of appreciation gift", "what is the secret to a good battery life"];
    for (const m of messages) expect(containsSensitive(m), m).toBe(false);
  });
});

describe("sensitive text in the catalogue or an answer is never sent out", () => {
  it("a card whose source text holds a secret is withheld and replaced by the fixed safe text, and the secret is not in the output", async () => {
    const transport = new FixtureErpTransport();
    transport.setName(itemId(8), "Atlas Smartwatch api_key: sk_live_abcdefghijklmnop");
    const failures: string[] = [];
    const s = mockStack(null, { transport, onVerifierFailure: (f) => failures.push(f.code) });
    const { result, events } = await run(s.pipeline, "Tell me about the Atlas Smartwatch");
    expect(JSON.stringify({ result, events })).not.toContain("sk_live_");
    expect(result.cards).toEqual([]);
    expect(result.reply.text).toBe(renderTemplate("verification_failed", "en").text);
    expect(failures).toEqual(["sensitive_leak"]);
  });
});

describe("secrets never reach logs or error responses", () => {
  let server: Started | undefined;
  afterEach(async () => {
    await server?.app.close();
    server = undefined;
  });

  it("does not echo or log a secret sent in a message, in malformed JSON, or in an invalid field", async () => {
    const stack = mockStack(null);
    server = await startServer({ pipeline: stack.pipeline });
    const secret = "Tr0ub4dor&3-unique-9f3a";
    const a = await post(server.url, chat(`my password is ${secret}`, sid(1)), { identity: customer("c1") });
    const b = await post(server.url, null, { raw: `{"sessionId":"x","message":"${secret}` });
    const c = await post(server.url, { sessionId: `${secret}`, message: `bad\u0001${secret}` });
    const d = await post(server.url, { ...chat("hi", sid(2)), message: undefined, extra: secret });
    for (const res of [a, b, c, d]) expect(await res.text()).not.toContain(secret);
    expect(server.logs.join("\n")).not.toContain(secret);
    expect(a.status).toBe(200);
    expect([b.status, c.status, d.status]).toEqual([400, 422, 422]);
  });

  it("an authentication failure reveals nothing about which part was wrong, and logs only a code", async () => {
    server = await startServer();
    const res = await post(server.url, chat(), { secret: "q".repeat(40), headers: { "x-volta-key-id": "k9" } });
    const text = await res.text();
    expect(res.status).toBe(401);
    expect(text).not.toMatch(/signature|key|secret|timestamp|nonce|replay/i);
    expect(server.logs.join("\n")).not.toContain("q".repeat(10));
  });
});

describe("retention and consent stay disabled", () => {
  const base = { AGENT_HMAC_KEYS: `k1:${"s".repeat(40)}` };
  it.each(["AGENT_RETAIN_MESSAGES", "AI_RETENTION_DAYS", "AGENT_CONSENT_REQUIRED", "AI_CONSENT_MODE", "AGENT_LOG_MESSAGES", "AI_LOG_MESSAGE_TEXT", "AGENT_TRAIN_ON_MESSAGES", "AI_TRAINING_ENABLED"])("refuses to start with %s set", (name) => {
    expect(() => loadConfig({ ...base, [name]: "true" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, [name]: "30" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, [name]: "false" })).not.toThrow(); // explicitly off is harmless
  });

  it("the logger has no field that can hold message text", async () => {
    const { createLogger } = await import("../../src/observability/logger");
    const lines: string[] = [];
    createLogger({ write: (l) => lines.push(l) }).log({ requestId: "r", route: "/v1/chat", method: "POST", status: 200, latencyMs: 1, message: "secret text", sessionId: "s", body: "x" } as never);
    expect(Object.keys(JSON.parse(lines[0]!)).sort()).toEqual(["latencyMs", "method", "requestId", "route", "status", "ts"]);
  });
});
