import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests of POST /api/assistant/voice/transcribe and /speak against a FAKE Agent (a local HTTP server that checks the signature
 * over the RAW bytes the way the real Agent does). No speech engine is involved: this proves the website side (gating, limits, signing,
 * mapping, hygiene), not speech quality.
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
  url: string;
  headers: Record<string, string>;
  raw: Buffer;
  signatureValid: boolean;
}
let agent: http.Server;
let agentUrl = "";
let seen: Seen[] = [];
let respond: (s: Seen) => { status: number; headers?: Record<string, string>; body: Buffer | string } = () => ({ status: 200, body: "{}" });
const nonces = new Set<string>();

const wavBytes = (seconds = 1): Buffer => {
  const rate = 16_000;
  const data = Math.round(seconds * rate) * 2;
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(36 + data, 4);
  b.write("WAVEfmt ", 8, "latin1");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "latin1");
  b.writeUInt32LE(data, 40);
  return b;
};

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
        raw,
        signatureValid: h["x-volta-signature"] === expected && h["x-volta-key-id"] === "web1" && fresh && Math.abs(Date.now() / 1000 - Number(h["x-volta-timestamp"])) < 60,
      };
      seen.push(s);
      const r = respond(s);
      res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) });
      res.end(r.body);
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
  respond = () => ({ status: 200, body: JSON.stringify({ voiceVersion: "1", text: "mata laptop ekak oni", language: "en", durationMs: 1000, requestId: "req_1" }) });
  process.env.AI_ASSISTANT_ENABLED = "true";
  process.env.AI_AGENT_URL = agentUrl;
  process.env.AI_AGENT_HMAC_KEY_ID = "web1";
  process.env.AI_AGENT_HMAC_SECRET = SECRET;
  process.env.AI_ASSISTANT_VOICE = "stt,tts";
  delete process.env.AI_AGENT_TIMEOUT_MS;
  delete process.env.AI_ASSISTANT_PREVIEW_KEY;
  (globalThis as unknown as { __voltaRate?: Map<string, unknown> }).__voltaRate?.clear();
});

const ORIGIN = { origin: "http://shop.test", host: "shop.test" };
const post = (path: string, body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request(`http://shop.test${path}`, { method: "POST", headers: { ...ORIGIN, "x-forwarded-for": "203.0.113.50", ...headers }, body, ...(body ? { duplex: "half" } : {}) } as RequestInit);
const stt = async (body: Buffer | Uint8Array | null, q = "", headers?: Record<string, string>) => (await import("@/app/api/assistant/voice/transcribe/route")).POST(post(`/api/assistant/voice/transcribe${q}`, body ? new Uint8Array(body) : null, { "content-type": "audio/webm", ...headers }));
const tts = async (body: unknown, headers?: Record<string, string>) => (await import("@/app/api/assistant/voice/speak/route")).POST(post("/api/assistant/voice/speak", typeof body === "string" ? body : JSON.stringify(body), { "content-type": "application/json", ...headers }));

describe("transcribe: switched off", () => {
  it("404 and no contact with the Agent unless the assistant is configured AND voice stt is listed", async () => {
    for (const patch of [{ AI_ASSISTANT_VOICE: "" }, { AI_ASSISTANT_VOICE: "tts" }, { AI_ASSISTANT_ENABLED: "false" }, { AI_AGENT_HMAC_SECRET: "short" }]) {
      Object.assign(process.env, patch);
      const r = await stt(wavBytes());
      expect(r.status).toBe(404);
      process.env.AI_ASSISTANT_ENABLED = "true";
      process.env.AI_AGENT_HMAC_SECRET = SECRET;
      process.env.AI_ASSISTANT_VOICE = "stt,tts";
    }
    expect(seen).toHaveLength(0);
  });
  it("404 without the private-preview cookie while a preview key is set", async () => {
    process.env.AI_ASSISTANT_PREVIEW_KEY = "p".repeat(20);
    expect((await stt(wavBytes())).status).toBe(404);
    expect(seen).toHaveLength(0);
  });
});

describe("transcribe: request handling", () => {
  it("403 for a cross-site request (origin check) and never contacts the Agent", async () => {
    const r = await (await import("@/app/api/assistant/voice/transcribe/route")).POST(post("/api/assistant/voice/transcribe", new Uint8Array(wavBytes()), { origin: "http://evil.test", host: "shop.test", "content-type": "audio/wav" }));
    expect(r.status).toBe(403);
    expect(seen).toHaveLength(0);
  });
  it("forwards the audio signed over its raw bytes, with the language hint, and returns only text and language", async () => {
    const audio = wavBytes(2);
    const r = await stt(audio, "?lang=si");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ text: "mata laptop ekak oni", language: "en" });
    expect(seen).toHaveLength(1);
    const s = seen[0]!;
    expect(s.url).toBe("/v1/voice/transcribe");
    expect(s.signatureValid).toBe(true);
    expect(s.headers["x-volta-voice-lang"]).toBe("si");
    expect(s.headers["x-volta-identity"]).toBe("anon");
    expect(s.headers["x-volta-client-ip"]).toBe("203.0.113.50");
    expect(s.raw.equals(audio)).toBe(true); // bytes were not altered by any string conversion
  });
  it("a request without a usable client address is signed with the ONE reserved address (192.0.2.1), never 0.0.0.0 and never raw header text", async () => {
    const cases: Record<string, string>[] = [{ "x-forwarded-for": "not-an-ip" }, { "x-forwarded-for": "a".repeat(2_000) }, { "x-real-ip": "1.2.3.4, 5.6.7.8" }];
    for (const h of cases) {
      seen = [];
      expect((await stt(wavBytes(), "", { "x-forwarded-for": "", ...h })).status).toBe(200);
      expect(seen[0]!.headers["x-volta-client-ip"], JSON.stringify(h).slice(0, 40)).toBe("192.0.2.1");
    }
  });
  it("a signed-in customer is sent as that customer; the body can never choose an identity", async () => {
    customer = { id: "cust_9", name: "A", phone: "0" };
    await stt(wavBytes());
    expect(seen[0]!.headers["x-volta-identity"]).toBe("cust:cust_9");
  });
  it("422 for an unknown language, empty body; 415 for non-audio whatever the Content-Type says", async () => {
    expect((await stt(wavBytes(), "?lang=fr")).status).toBe(422);
    expect((await stt(Buffer.alloc(0))).status).toBe(422);
    const html = await stt(Buffer.from("<html><script>alert(1)</script></html>"), "", { "content-type": "audio/wav" });
    expect(html.status).toBe(415);
    const png = await stt(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]), "", { "content-type": "audio/ogg" });
    expect(png.status).toBe(415);
    expect(seen).toHaveLength(0);
  });
  it("413 when the body passes 5,000,000 bytes (declared or streamed) without contacting the Agent", async () => {
    const big = new Uint8Array(5_000_001);
    big.set(wavBytes().subarray(0, 12));
    const declared = await (await import("@/app/api/assistant/voice/transcribe/route")).POST(post("/api/assistant/voice/transcribe", big, { "content-type": "audio/wav", "content-length": "5000001" }));
    expect(declared.status).toBe(413);
    const streamed = await stt(Buffer.from(big));
    expect(streamed.status).toBe(413);
    expect(seen).toHaveLength(0);
  });
  it("429 after 10 requests per minute from one client", async () => {
    for (let i = 0; i < 10; i++) expect((await stt(wavBytes())).status).toBe(200);
    const r = await stt(wavBytes());
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("transcribe: Agent answers are mapped, never passed through", () => {
  const err = (status: number, code: string, headers: Record<string, string> = {}) => () => ({ status, headers, body: JSON.stringify({ error: { code, message: "Agent wording with secret-detail-123", requestId: "r" } }) });
  it("maps 501, 413, 415, 422 codes, 429 with Retry-After, and 5xx to fixed shopper wording", async () => {
    respond = err(501, "VOICE_UNAVAILABLE");
    expect((await stt(wavBytes())).status).toBe(501);
    respond = err(415, "UNSUPPORTED_AUDIO");
    expect((await stt(wavBytes())).status).toBe(415);
    respond = err(422, "NO_SPEECH");
    const noSpeech = await stt(wavBytes());
    expect(noSpeech.status).toBe(422);
    expect((await noSpeech.json()).error.code).toBe("NO_SPEECH");
    respond = err(422, "SOMETHING_ELSE");
    expect((await (await stt(wavBytes())).json()).error.code).toBe("INVALID");
    respond = err(429, "RATE_LIMITED", { "retry-after": "17" });
    const limited = await stt(wavBytes());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("17");
    respond = err(503, "QUEUE_FULL", { "retry-after": "5" });
    const busy = await stt(wavBytes());
    expect(busy.status).toBe(503);
    const text = JSON.stringify(await busy.json());
    expect(text).not.toContain("secret-detail-123");
  });
  it("an Agent that is down gives 503; junk or an unexpected shape gives 502; oversized answers are refused", async () => {
    process.env.AI_AGENT_URL = "http://127.0.0.1:1";
    expect((await stt(wavBytes())).status).toBe(503);
    process.env.AI_AGENT_URL = agentUrl;
    respond = () => ({ status: 200, body: "not json" });
    expect((await stt(wavBytes())).status).toBe(502);
    respond = () => ({ status: 200, body: JSON.stringify({ voiceVersion: "1", text: "x".repeat(900), language: "en" }) });
    expect((await stt(wavBytes())).status).toBe(502);
    respond = () => ({ status: 200, body: JSON.stringify({ voiceVersion: "2", text: "ok", language: "en" }) });
    expect((await stt(wavBytes())).status).toBe(502);
  });
  it("extra fields from the Agent do not reach the browser", async () => {
    respond = () => ({ status: 200, body: JSON.stringify({ voiceVersion: "1", text: "hello", language: "en", requestId: "req_internal", durationMs: 5, debug: "x" }) });
    expect(await (await stt(wavBytes())).json()).toEqual({ text: "hello", language: "en" });
  });
});

describe("speak", () => {
  it("404 unless tts is listed", async () => {
    process.env.AI_ASSISTANT_VOICE = "stt";
    expect((await tts({ text: "hi", lang: "en" })).status).toBe(404);
    expect(seen).toHaveLength(0);
  });
  it("validates the body: strict keys, language list, length, JSON, size", async () => {
    expect((await tts({ text: "hi", lang: "fr" })).status).toBe(422);
    expect((await tts({ text: "hi", lang: "en", voice: "x" })).status).toBe(422);
    expect((await tts({ text: "", lang: "en" })).status).toBe(422);
    expect((await tts({ text: "a".repeat(1601), lang: "en" })).status).toBe(422);
    expect((await tts("{nope")).status).toBe(422);
    expect((await tts(JSON.stringify({ text: "a".repeat(9000), lang: "en" }))).status).toBe(413);
    expect(seen).toHaveLength(0);
  });
  it("streams validated audio back with safe headers and signs the JSON it forwards", async () => {
    const audio = wavBytes(1);
    respond = () => ({ status: 200, headers: { "content-type": "audio/wav" }, body: audio });
    const r = await tts({ text: "Hello", lang: "en" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/wav");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await r.arrayBuffer()).equals(audio)).toBe(true);
    expect(seen[0]!.signatureValid).toBe(true);
    expect(JSON.parse(seen[0]!.raw.toString())).toEqual({ text: "Hello", lang: "en" });
  });
  it("the speak route uses the same reserved address for an unidentifiable request", async () => {
    respond = () => ({ status: 200, headers: { "content-type": "audio/wav" }, body: wavBytes(1) });
    const r = await tts({ text: "Hello", lang: "en" }, { "x-forwarded-for": "garbage" });
    expect(r.status).toBe(200);
    expect(seen[0]!.headers["x-volta-client-ip"]).toBe("192.0.2.1");
  });
  it("refuses an Agent answer that is not audio even if it is labelled audio", async () => {
    respond = () => ({ status: 200, headers: { "content-type": "audio/wav" }, body: "<html>not audio at all</html>" });
    expect((await tts({ text: "Hello", lang: "en" })).status).toBe(502);
  });
  it("501 from the Agent (no voice for the language) reaches the browser as 501 so it can fall back", async () => {
    respond = () => ({ status: 501, body: JSON.stringify({ error: { code: "VOICE_LANGUAGE_UNSUPPORTED", message: "x", requestId: "r", fallback: "browser" } }) });
    expect((await tts({ text: "ආයුබෝවන්", lang: "si" })).status).toBe(501);
  });
});
