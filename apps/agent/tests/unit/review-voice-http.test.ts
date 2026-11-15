import { connect, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { signRequest } from "../../src/auth/hmac";
import { loadConfig } from "../../src/config";
import { createAgentServer, type RunningServer } from "../../src/http/server";
import { createMockStack } from "../../src/mock/stack";
import { createLogger } from "../../src/observability/logger";
import { VoiceService } from "../../src/voice";
import type { VoiceConfig } from "../../src/voice/config";
import { noTtsProvider, type SttProvider, type TtsProvider } from "../../src/voice/providers";
import { wav } from "./voice-fixtures";

/**
 * INDEPENDENT REVIEW (Agent F): the voice routes mounted on the REAL Agent server, attacked over real sockets. Engines are fakes: this tests the
 * HTTP surface, the wiring and the limits, never speech quality. `it.fails` = a REAL DEFECT (asserts the secure behaviour; red once fixed).
 */
const SECRET = "r".repeat(40);
let app: RunningServer | undefined;
let socks: Socket[] = [];
let logLines: string[] = [];
afterEach(async () => {
  socks.forEach((s) => s.destroy());
  socks = [];
  await app?.close();
  app = undefined;
});

const marker = "ZQX-MARKER-TRANSCRIPT-4471";
const fakeStt = (delayMs = 0, text = marker): SttProvider => ({
  name: "fake",
  async transcribe() {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return { text, language: "si" };
  },
});

async function start(o: { stt?: SttProvider; tts?: TtsProvider; maxInFlight?: number; voice?: boolean; limits?: VoiceConfig["limits"]; queueDepth?: number } = {}) {
  const s = createMockStack({});
  const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true", AGENT_MAX_IN_FLIGHT: String(o.maxInFlight ?? 16), AGENT_RATE_IP_PER_MIN: "1000", AGENT_NEW_SESSIONS_PER_HOUR: "200" });
  logLines = [];
  const vcfg: VoiceConfig = { stt: o.stt ?? fakeStt(), tts: o.tts ?? noTtsProvider, maxSeconds: 30, maxBytes: 5_000_000, concurrency: 1, queueDepth: o.queueDepth ?? 3, limits: o.limits ?? { sttPerMin: 1000, sttPerHour: 10_000, ttsPerMin: 1000 } };
  const voice = o.voice === false ? undefined : new VoiceService(vcfg);
  app = createAgentServer({ config, pipeline: s.pipeline, logger: createLogger({ write: (l) => logLines.push(l) }), memory: async () => ({ availableMb: null, swapUsedMb: null }), ...(voice ? { voice } : {}) });
  const { port } = await app.listen();
  return { url: `http://127.0.0.1:${port}`, port, voice };
}

let ipN = 0;
const nextIp = () => `198.51.${Math.floor(++ipN / 250)}.${(ipN % 250) + 1}`;
const audio = () => Buffer.from(wav({ seconds: 1 }));

function signedAudio(url: string, o: { body?: Buffer; ip?: string; nonce?: string; nowMs?: number; secret?: string; keyId?: string; identity?: "guest" | "customer"; headerIdentity?: string; type?: string; path?: string; signPath?: string; lang?: string } = {}) {
  const body = o.body ?? audio();
  const path = o.path ?? "/v1/voice/transcribe";
  const identity = o.identity === "customer" ? ({ kind: "customer", customerId: "c1" } as const) : ({ kind: "guest" } as const);
  const headers: Record<string, string> = signRequest({ keyId: o.keyId ?? "k1", secret: o.secret ?? SECRET, method: "POST", path: o.signPath ?? path, identity, clientIp: o.ip ?? nextIp(), body, ...(o.nonce ? { nonce: o.nonce } : {}), ...(o.nowMs !== undefined ? { nowMs: o.nowMs } : {}) });
  if (o.headerIdentity) headers["x-volta-identity"] = o.headerIdentity;
  if (o.lang) headers["x-volta-voice-lang"] = o.lang;
  return fetch(`${url}${path}`, { method: "POST", headers: { "content-type": o.type ?? "audio/wav", ...headers }, body: new Uint8Array(body) });
}

const chat = async (url: string) => {
  const raw = JSON.stringify({ sessionId: `sess_${"b".repeat(31)}${ipN % 10}`, message: "hi", contractVersion: "1.2" });
  const headers = signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: nextIp(), body: raw });
  const res = await fetch(`${url}/v1/chat`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw });
  return res.status;
};

const SHARED = Buffer.alloc(5_000_000, 0x41);

/** A raw upload that declares a big body, sends `sentBytes` and then stalls (or aborts). */
function stalledUpload(port: number, sentBytes: number, path = "/v1/voice/transcribe", declared = 4_900_000): Socket {
  const s = connect({ host: "127.0.0.1", port });
  s.on("error", () => {});
  s.write(`POST ${path} HTTP/1.1\r\nHost: x\r\nContent-Type: ${path === "/v1/chat" ? "application/json" : "audio/wav"}\r\nContent-Length: ${declared}\r\n\r\n`);
  if (sentBytes > 0) s.write(SHARED.subarray(0, sentBytes)); // one shared client buffer: the memory growth we measure is the SERVER's
  socks.push(s);
  return s;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("authentication of the voice route", () => {
  it("unsigned, wrong secret, unknown key id, tampered body, replay, stale timestamp, guest-signed-as-customer, and a chat signature replayed on the voice path are all 401", async () => {
    const { url } = await start();
    const body = audio();
    const unsigned = await fetch(`${url}/v1/voice/transcribe`, { method: "POST", headers: { "content-type": "audio/wav" }, body: new Uint8Array(body) });
    expect(unsigned.status).toBe(401);
    expect((await signedAudio(url, { secret: "x".repeat(40) })).status).toBe(401);
    expect((await signedAudio(url, { keyId: "nope" })).status).toBe(401);
    // tamper: sign one body, send another
    const hdr = signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/voice/transcribe", identity: { kind: "guest" }, clientIp: "198.51.100.9", body });
    const tampered = await fetch(`${url}/v1/voice/transcribe`, { method: "POST", headers: { "content-type": "audio/wav", ...hdr }, body: new Uint8Array(Buffer.concat([body, Buffer.from([0])])) });
    expect(tampered.status).toBe(401);
    const nonce = "cd34".repeat(8);
    expect((await signedAudio(url, { nonce })).status).toBe(200);
    expect((await signedAudio(url, { nonce })).status).toBe(401);
    expect((await signedAudio(url, { nowMs: Date.now() - 600_000 })).status).toBe(401);
    expect((await signedAudio(url, { headerIdentity: "cust:c1" })).status).toBe(401); // signed as guest, header claims a customer
    expect((await signedAudio(url, { signPath: "/v1/chat" })).status).toBe(401); // a signature made for chat does not open the voice route
  });

  it("a content-type lie changes nothing: the bytes decide (json label + wav bytes works; audio/wav label + PNG bytes is 415)", async () => {
    const { url } = await start();
    expect((await signedAudio(url, { type: "application/json" })).status).toBe(200);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]);
    expect((await signedAudio(url, { body: png, type: "audio/wav" })).status).toBe(415);
    expect((await signedAudio(url, { body: Buffer.alloc(0) })).status).toBe(422);
  });

  it("route probing without authentication: voice configured gives 405 for GET (the route exists), not configured gives 404 (recorded: it reveals whether an engine is configured)", async () => {
    const on = await start();
    const getOn = await fetch(`${on.url}/v1/voice/transcribe`);
    await app?.close();
    const off = await start({ voice: false });
    const getOff = await fetch(`${off.url}/v1/voice/transcribe`);
    console.log(`ROUTE-PROBE: unauthenticated GET /v1/voice/transcribe -> configured ${getOn.status}, not configured ${getOff.status}`);
    expect(getOff.status).toBe(404);
    expect([404, 405]).toContain(getOn.status);
  });
});

describe("bodies: size, chunking, pre-authentication buffering", () => {
  /** The headers of a well-formed request whose signature does not match the body that follows (so only the signature step can refuse it). */
  const wellFormedHeaders = (): string => {
    const h = signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/voice/transcribe", identity: { kind: "guest" }, clientIp: nextIp(), body: Buffer.from("something else") });
    return Object.entries(h).map(([k, v]) => `${k}: ${v}\r\n`).join("");
  };

  it("a chunked body with no Content-Length that passes 5 MB is cut with 413 (not buffered whole), once the headers are well formed", async () => {
    const { port } = await start();
    const res = await new Promise<string>((resolve) => {
      const s = connect({ host: "127.0.0.1", port });
      socks.push(s);
      let out = "";
      s.on("data", (d) => (out += d.toString("latin1")));
      s.on("close", () => resolve(out));
      s.on("error", () => resolve(out));
      s.write(`POST /v1/voice/transcribe HTTP/1.1\r\nHost: x\r\nContent-Type: audio/wav\r\nTransfer-Encoding: chunked\r\n${wellFormedHeaders()}\r\n`);
      const chunk = Buffer.alloc(1_000_000, 0x41);
      for (let i = 0; i < 7; i++) {
        s.write(`${chunk.length.toString(16)}\r\n`);
        s.write(chunk);
        s.write("\r\n");
      }
      setTimeout(() => resolve(out), 3_000);
    });
    expect(res).toMatch(/^HTTP\/1\.1 413/);
  });

  it("FIXED (VO-02): an UNAUTHENTICATED upload is refused from its headers alone: 30 unsigned uploads declaring 4.9 MB each are answered at once (401, then 429 from the existing slow-down) and none of them is read", async () => {
    const { port } = await start();
    const answers = await Promise.all(
      Array.from({ length: 30 }, () => new Promise<string>((resolve) => {
        const s = stalledUpload(port, 1_000_000);
        let out = "";
        s.on("data", (d) => {
          out += d.toString("latin1");
          if (out.includes("\r\n\r\n")) resolve(out);
        });
        s.on("close", () => resolve(out));
        setTimeout(() => resolve(out), 2_000);
      })),
    );
    // The first 20 failures from one socket address are 401; after that the existing slow-down answers 429. Either way every one is answered at once.
    expect(answers.every((a) => /^HTTP\/1\.1 (401|429)/.test(a))).toBe(true);
    expect(answers.filter((a) => a.startsWith("HTTP/1.1 401")).length).toBeGreaterThanOrEqual(20);
  });

  // Was DEFECT V-02 (voice bodies read before authentication, so a few stalled unauthenticated uploads made the CHAT route answer 503). Fixed in voice/http.ts.
  it("FIXED: stalled unauthenticated voice uploads cannot take the chat route's capacity (AGENT_MAX_IN_FLIGHT)", async () => {
    const { url, port } = await start({ maxInFlight: 3 });
    for (let i = 0; i < 4; i++) stalledUpload(port, 10);
    await wait(500);
    expect(await chat(url)).toBe(200);
  });

  // Was recorded as an open defect (the same stall on /v1/chat exhausted AGENT_MAX_IN_FLIGHT). Fixed in http/preauth.ts + server.ts (wave 2): unsigned/ill-formed requests never have their body read.
  it("FIXED: stalled unauthenticated uploads on /v1/chat no longer exhaust AGENT_MAX_IN_FLIGHT", async () => {
    const { url, port } = await start({ maxInFlight: 3 });
    for (let i = 0; i < 4; i++) stalledUpload(port, 10, "/v1/chat", 100);
    await wait(500);
    expect(await chat(url)).toBe(200);
  });

  it("an upload aborted half-way releases its in-flight slot (no leak): chat works again after 6 aborted uploads with AGENT_MAX_IN_FLIGHT=3", async () => {
    const { url, port } = await start({ maxInFlight: 3 });
    const ups = Array.from({ length: 6 }, () => stalledUpload(port, 1_000));
    await wait(300);
    ups.forEach((s) => s.destroy());
    await wait(1_500);
    expect(await chat(url)).toBe(200);
  });
});

describe("limits, queue and what the server logs", () => {
  it("a flood of 30 simultaneous signed uploads against 1 worker + queue depth 3: the excess is refused with 503, memory is bounded by the queue, and the queue drains to zero", async () => {
    const { url, voice } = await start({ stt: fakeStt(300) });
    const results = await Promise.all(Array.from({ length: 30 }, () => signedAudio(url)));
    const codes = results.map((r) => r.status);
    const ok = codes.filter((c) => c === 200).length;
    const busy = codes.filter((c) => c === 503).length;
    console.log(`FLOOD: 30 requests -> ${ok} x 200, ${busy} x 503, others ${codes.filter((c) => c !== 200 && c !== 503).join(",") || "none"}`);
    expect(ok + busy).toBe(30);
    expect(ok).toBeLessThanOrEqual(6);
    expect(busy).toBeGreaterThanOrEqual(24);
    await wait(500);
    expect(voice!.queueState()).toEqual({ running: 0, waiting: 0 });
  });

  it("per-address limit: the 11th transcription in a minute from one address is 429 with Retry-After; another address is unaffected", async () => {
    const { url } = await start({ limits: { sttPerMin: 10, sttPerHour: 100, ttsPerMin: 10 } });
    const ip = "203.0.113.77";
    for (let i = 0; i < 10; i++) expect((await signedAudio(url, { ip })).status).toBe(200);
    const eleventh = await signedAudio(url, { ip });
    expect(eleventh.status).toBe(429);
    expect(Number(eleventh.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await signedAudio(url, { ip: "203.0.113.78" })).status).toBe(200);
  });

  it("neither the audio bytes nor the transcript appear in any log line the server wrote (the logger accepts only fixed fields)", async () => {
    const { url } = await start({ stt: fakeStt(0, marker) });
    const wavWithMarker = Buffer.from(wav({ seconds: 1 }));
    const r = await signedAudio(url, { body: wavWithMarker });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain(marker); // the transcript is the RESPONSE (for the shopper), not a log
    await signedAudio(url, { body: Buffer.from("not audio at all, ZQX-AUDIO-BODY-MARKER") });
    const all = logLines.join("\n");
    expect(logLines.length).toBeGreaterThan(0);
    expect(all).not.toContain(marker);
    expect(all).not.toContain("ZQX-AUDIO-BODY-MARKER");
    expect(all).not.toMatch(/"text"|"transcript"|"body"/i);
  });

  it("speak: oversized body 413, bad language 422, an engine that returns HTML labelled audio/wav is refused 502, a real WAV passes", async () => {
    const goodWav = Buffer.from(wav({ seconds: 1 }));
    let mode: "good" | "html" = "good";
    const tts: TtsProvider = { name: "fake", supports: () => true, async synthesize() { return mode === "good" ? { audio: goodWav, contentType: "audio/wav" } : { audio: Buffer.from("<html><script>alert(1)</script></html>"), contentType: "audio/wav" }; } };
    const { url } = await start({ tts });
    const speak = (body: unknown, path = "/v1/voice/speak") => {
      const raw = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
      const headers = signRequest({ keyId: "k1", secret: SECRET, method: "POST", path, identity: { kind: "guest" }, clientIp: nextIp(), body: raw });
      return fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: new Uint8Array(raw) });
    };
    expect((await speak({ text: "x".repeat(9_000), lang: "en" })).status).toBe(413);
    expect((await speak({ text: "hello", lang: "fr" })).status).toBe(422);
    expect((await speak({ text: "hello", lang: "en", extra: 1 })).status).toBe(422);
    expect((await speak("{not json")).status).toBe(400);
    const ok = await speak({ text: "hello", lang: "en" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("audio/wav");
    mode = "html";
    expect((await speak({ text: "hello", lang: "en" })).status).toBe(502);
  });
});

describe("a provider that ignores the abort signal", () => {
  // DEFECT V-04 (defence in depth): VoiceService passes an AbortSignal but never races the job against its deadline, so an engine (or a future
  // provider) that ignores the signal holds the single worker slot forever and the request never answers.
  it("FIXED: the request is answered (504) at the deadline even if the engine never answers, and the worker slot is released", async () => {
    const hang: SttProvider = { name: "hang", transcribe: () => new Promise(() => {}) };
    const cfg: VoiceConfig = { stt: hang, tts: noTtsProvider, maxSeconds: 30, maxBytes: 5_000_000, concurrency: 1, queueDepth: 1, limits: { sttPerMin: 100, sttPerHour: 100, ttsPerMin: 100 } };
    const svc = new VoiceService(cfg, { deadlineMs: 200 });
    const out = await Promise.race([svc.handle({ route: "/v1/voice/transcribe", body: audio(), identity: { kind: "guest" }, clientIp: "203.0.113.5", requestId: "req_x" }), new Promise<"never">((r) => setTimeout(() => r("never"), 2_500))]);
    expect(out).not.toBe("never");
    expect(svc.queueState().running).toBe(0);
  });
});
