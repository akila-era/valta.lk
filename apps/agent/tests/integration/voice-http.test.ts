import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ReplayCache, signRequest, type Identity } from "../../src/auth/hmac";
import { AbuseGuard, DEFAULT_RATE_CONFIG } from "../../src/security/rate-limit";
import { isVoiceRoute, serveVoice, VoiceService, type ServeVoiceResult } from "../../src/voice";
import type { VoiceConfig } from "../../src/voice/config";
import { noSttProvider, noTtsProvider, type SttProvider, type TtsProvider } from "../../src/voice/providers";
import { ogg, wav, webm } from "../unit/voice-fixtures";

/**
 * The real signing, replay and slow-down code and the real voice handlers, behind a small HTTP server that mounts voice exactly the way
 * the Agent server does (`serveVoice`). The engine is a FAKE: this proves the HTTP surface, not any speech model.
 */
const SECRET = "s".repeat(40);
const keys = new Map([["web1", SECRET]]);
let server: http.Server;
let base = "";
let stt: SttProvider = noSttProvider;
let tts: TtsProvider = noTtsProvider;
let svc: VoiceService;
let guard: AbuseGuard;
let replay: ReplayCache;
let log: ServeVoiceResult[] = [];
let cfgOver: Partial<VoiceConfig> = {};

const cfg = (): VoiceConfig => ({ stt, tts, maxSeconds: 30, maxBytes: 5_000_000, concurrency: 1, queueDepth: 1, limits: { sttPerMin: 4, sttPerHour: 100, ttsPerMin: 4 }, ...cfgOver });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const route = new URL(req.url ?? "/", "http://x").pathname;
    if (!isVoiceRoute(route)) {
      res.writeHead(404).end();
      return;
    }
    void serveVoice({ req, res, route, requestId: "req_test", voice: svc, keys, replay, guard, now: Date.now }).then((r) => log.push(r));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

beforeEach(() => {
  stt = noSttProvider;
  tts = noTtsProvider;
  cfgOver = {};
  guard = new AbuseGuard(DEFAULT_RATE_CONFIG);
  replay = new ReplayCache();
  svc = new VoiceService(cfg());
  log = [];
});
const rebuild = () => (svc = new VoiceService(cfg()));

const send = async (route: string, body: Buffer, o: { headers?: Record<string, string>; sign?: boolean; ip?: string; identity?: Identity; nonce?: string; contentType?: string; method?: string; lang?: string } = {}) => {
  const sigHeaders = o.sign === false ? {} : signRequest({ keyId: "web1", secret: SECRET, method: o.method ?? "POST", path: route, identity: o.identity ?? { kind: "guest" }, clientIp: o.ip ?? "203.0.113.9", body, ...(o.nonce ? { nonce: o.nonce } : {}) });
  const res = await fetch(base + route, { method: o.method ?? "POST", headers: { "content-type": o.contentType ?? (route.endsWith("speak") ? "application/json" : "application/octet-stream"), ...(o.lang ? { "x-volta-voice-lang": o.lang } : {}), ...sigHeaders, ...(o.headers ?? {}) }, body: o.method === "GET" ? undefined : new Uint8Array(body) });
  const raw = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, raw, json: () => JSON.parse(raw.toString("utf8")) };
};
const T = "/v1/voice/transcribe";
const S = "/v1/voice/speak";
const goodStt = (): SttProvider => ({ name: "fake", async transcribe(a) { return { text: `heard ${a.format} ${a.lang}` }; } });
const goodTts = (): TtsProvider => ({ name: "fake", supports: (l) => l === "en", async synthesize() { return { audio: wav({ seconds: 1 }), contentType: "audio/wav" }; } });

describe("authentication (same scheme as chat)", () => {
  it("401 without a signature, with a wrong key, or when the body was changed after signing", async () => {
    stt = goodStt();
    rebuild();
    expect((await send(T, wav(), { sign: false })).status).toBe(401);
    const good = signRequest({ keyId: "web1", secret: "w".repeat(40), method: "POST", path: T, identity: { kind: "guest" }, clientIp: "203.0.113.9", body: wav() });
    expect((await send(T, wav(), { sign: false, headers: good })).status).toBe(401);
    const other = wav({ seconds: 2 });
    const sigForOther = signRequest({ keyId: "web1", secret: SECRET, method: "POST", path: T, identity: { kind: "guest" }, clientIp: "203.0.113.9", body: other });
    expect((await send(T, wav({ seconds: 1 }), { sign: false, headers: sigForOther })).status).toBe(401);
    expect(log.every((r) => r.status === 401 && r.authReason)).toBe(true);
  });
  it("a replayed request is refused", async () => {
    stt = goodStt();
    rebuild();
    const body = wav();
    const nonce = "a".repeat(32);
    expect((await send(T, body, { nonce })).status).toBe(200);
    expect((await send(T, body, { nonce })).status).toBe(401);
  });
  it("a socket that keeps failing authentication is slowed down, even for valid requests afterwards", async () => {
    stt = goodStt();
    rebuild();
    for (let i = 0; i < DEFAULT_RATE_CONFIG.authFailPerMin + 1; i++) await send(T, wav(), { sign: false });
    expect((await send(T, wav())).status).toBe(429);
  });
  it("wrong method and unknown media type for the JSON route", async () => {
    expect((await send(T, Buffer.alloc(0), { method: "GET" })).status).toBe(405);
    tts = goodTts();
    rebuild();
    expect((await send(S, Buffer.from('{"text":"hi","lang":"en"}'), { contentType: "text/plain" })).status).toBe(415);
  });
});

describe("transcribe over HTTP", () => {
  it("501 when voice is not configured", async () => {
    const r = await send(T, wav());
    expect(r.status).toBe(501);
    expect(r.json().error.code).toBe("VOICE_UNAVAILABLE");
  });
  it("200 for each container; the language hint reaches the engine; no-store headers", async () => {
    stt = goodStt();
    cfgOver = { limits: { sttPerMin: 50, sttPerHour: 500, ttsPerMin: 50 } };
    rebuild();
    for (const [b, fmt] of [[wav(), "wav"], [ogg(), "ogg"], [webm(), "webm"]] as const) {
      const r = await send(T, b, { lang: "si" });
      expect(r.status).toBe(200);
      expect(r.json().text).toBe(`heard ${fmt} si`);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("413 when the upload passes the cap, decided while streaming (no full buffering)", async () => {
    stt = goodStt();
    rebuild();
    const big = Buffer.alloc(5_000_001, 1);
    const r = await send(T, big);
    expect(r.status).toBe(413);
    expect(r.headers.get("connection")).toBe("close");
  });
  it("415 and 422 for things that are not usable audio; the Content-Type header is not trusted", async () => {
    stt = goodStt();
    cfgOver = { limits: { sttPerMin: 50, sttPerHour: 500, ttsPerMin: 50 } };
    rebuild();
    const html = await send(T, Buffer.from("<html>hi</html>"), { contentType: "audio/wav" });
    expect(html.status).toBe(415);
    const trunc = await send(T, wav({ seconds: 2 }).subarray(0, 5000), { contentType: "audio/wav" });
    expect(trunc.status).toBe(422);
    const polyglot = await send(T, Buffer.concat([wav(), Buffer.from("PK\x03\x04zip", "latin1")]));
    expect(polyglot.status).toBe(422);
    expect((await send(T, wav({ seconds: 40 }))).status).toBe(422);
    expect((await send(T, Buffer.alloc(0))).status).toBe(422);
  });
  it("429 after the per-caller limit, with Retry-After; another caller is unaffected", async () => {
    stt = goodStt();
    rebuild();
    for (let i = 0; i < 4; i++) expect((await send(T, wav(), { ip: "198.51.100.50" })).status).toBe(200);
    const r = await send(T, wav(), { ip: "198.51.100.50" });
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await send(T, wav(), { ip: "198.51.100.51" })).status).toBe(200);
  });
  it("503 with Retry-After when the audio worker and its queue are full", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    stt = { name: "slow", async transcribe() { await gate; return { text: "ok" }; } };
    cfgOver = { queueDepth: 0, limits: { sttPerMin: 50, sttPerHour: 500, ttsPerMin: 50 } };
    rebuild();
    const first = send(T, wav(), { ip: "198.51.100.60" });
    await new Promise((r) => setTimeout(r, 50));
    const second = await send(T, wav(), { ip: "198.51.100.61" });
    expect(second.status).toBe(503);
    expect(second.headers.get("retry-after")).toBe("5");
    release();
    expect((await first).status).toBe(200);
  });
  it("logs nothing about content: the serve record holds codes and counts only", async () => {
    stt = { name: "fake", async transcribe() { return { text: "my secret phone number is 0771234567" }; } };
    rebuild();
    await send(T, wav());
    expect(JSON.stringify(log)).not.toContain("0771234567");
    expect(log[0]?.audit).toMatchObject({ route: T, status: 200, provider: "fake" });
  });
});

describe("speak over HTTP", () => {
  it("501 without an engine or without a voice for the language, with a browser fallback hint", async () => {
    expect((await send(S, Buffer.from('{"text":"hi","lang":"en"}'))).json().error.fallback).toBe("browser");
    tts = goodTts();
    rebuild();
    const si = await send(S, Buffer.from(JSON.stringify({ text: "ආයුබෝවන්", lang: "si" })));
    expect(si.status).toBe(501);
    expect(si.json().error.code).toBe("VOICE_LANGUAGE_UNSUPPORTED");
  });
  it("200 audio/wav for English", async () => {
    tts = goodTts();
    rebuild();
    const r = await send(S, Buffer.from(JSON.stringify({ text: "Hello", lang: "en" })));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/wav");
    expect(r.raw.subarray(0, 4).toString("latin1")).toBe("RIFF");
  });
  it("413 over the JSON cap and 422 for invalid bodies", async () => {
    tts = goodTts();
    rebuild();
    expect((await send(S, Buffer.alloc(9_000, 0x20))).status).toBe(413);
    expect((await send(S, Buffer.from('{"text":"hi"}'))).status).toBe(422);
  });
});
