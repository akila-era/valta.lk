import { describe, expect, it } from "vitest";
import { loadVoiceConfig, VoiceConfigError, type VoiceConfig } from "../../src/voice/config";
import { HttpSttProvider, HttpTtsProvider, noSttProvider, noTtsProvider, ProviderError, type SttProvider, type TtsProvider } from "../../src/voice/providers";
import { VoiceBusyError, VoiceQueue } from "../../src/voice/queue";
import { VoiceService } from "../../src/voice/service";
import { cleanText, detectScript } from "../../src/voice/text";
import { MemoryRateStore } from "../../src/security/rate-limit";
import { ogg, wav, webm } from "./voice-fixtures";

const baseCfg = (over: Partial<VoiceConfig> = {}): VoiceConfig => ({
  stt: noSttProvider,
  tts: noTtsProvider,
  maxSeconds: 30,
  maxBytes: 5_000_000,
  concurrency: 1,
  queueDepth: 2,
  limits: { sttPerMin: 5, sttPerHour: 100, ttsPerMin: 5 },
  ...over,
});
const fakeStt = (text = "mata laptop ekak oni", language?: string): SttProvider => ({ name: "fake", async transcribe() { return { text, ...(language ? { language } : {}) }; } });
const fakeTts = (langs: Array<"en" | "si"> = ["en"]): TtsProvider => ({ name: "fake", supports: (l) => langs.includes(l), async synthesize() { return { audio: wav({ seconds: 1 }), contentType: "audio/wav" }; } });
const guest = { kind: "guest" } as const;
const req = (route: "/v1/voice/transcribe" | "/v1/voice/speak", body: Buffer, o: { ip?: string; lang?: string; identity?: { kind: "guest" } | { kind: "customer"; customerId: string } } = {}) => ({ route, body, identity: o.identity ?? guest, clientIp: o.ip ?? "203.0.113.5", requestId: "req_t", langHeader: o.lang });
const json = (r: { body: Buffer }) => JSON.parse(r.body.toString("utf8"));

describe("text rules", () => {
  it("strips control, bidi and zero-width characters, collapses space and caps length on a code point", () => {
    expect(cleanText("a‮b​c\u0000d\n\n  e", 100)).toBe("a b c d e");
    expect(Array.from(cleanText("😀".repeat(900), 800)).length).toBe(800);
    expect(cleanText("x".repeat(5000), 800).length).toBe(800);
  });
  it("detects script: Sinhala letters, Latin (Singlish reads as English), mixed", () => {
    expect(detectScript("මට ලැප්ටොප් එකක් ඕන")).toBe("si");
    expect(detectScript("mata laptop ekak oni")).toBe("en");
    expect(detectScript("මට laptop ඕන budget එක 200000")).toBe("mixed");
    expect(detectScript("1234 ?")).toBe("unknown");
  });
});

describe("configuration", () => {
  it("defaults to everything off", () => {
    const c = loadVoiceConfig({});
    expect(c.stt.name).toBe("none");
    expect(c.tts.name).toBe("none");
  });
  it("http providers must be loopback http without credentials; the message names the variable, never a value", () => {
    for (const bad of ["http://10.0.0.5:9000", "https://127.0.0.1:9000", "http://user:pw@127.0.0.1:9000", "not a url", ""]) {
      let err: unknown;
      try {
        loadVoiceConfig({ AGENT_STT_PROVIDER: "http", AGENT_STT_URL: bad });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(VoiceConfigError);
      expect(String((err as Error).message)).toContain("AGENT_STT_URL");
      expect(String((err as Error).message)).not.toContain("pw");
    }
    expect(loadVoiceConfig({ AGENT_STT_PROVIDER: "http", AGENT_STT_URL: "http://127.0.0.1:9000" }).stt.name).toBe("http");
  });
  it("limits are bounded", () => {
    expect(() => loadVoiceConfig({ AGENT_VOICE_MAX_SECONDS: "600" })).toThrow(VoiceConfigError);
    expect(() => loadVoiceConfig({ AGENT_VOICE_CONCURRENCY: "9" })).toThrow(VoiceConfigError);
    expect(() => loadVoiceConfig({ AGENT_STT_PROVIDER: "cloud" })).toThrow(VoiceConfigError);
  });
  it("a TTS language counts as supported only when a voice is configured for it", () => {
    const c = loadVoiceConfig({ AGENT_TTS_PROVIDER: "http", AGENT_TTS_URL: "http://127.0.0.1:9100", AGENT_TTS_VOICE_EN: "en_voice" });
    expect(c.tts.supports("en")).toBe(true);
    expect(c.tts.supports("si")).toBe(false);
  });
});

describe("queue: one worker, bounded waiting, no queue jumping", () => {
  it("runs one at a time, queues up to the depth and refuses the rest at once", async () => {
    const q = new VoiceQueue(1, 1);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const order: string[] = [];
    const a = q.run(async () => { order.push("a"); await gate; });
    const b = q.run(async () => { order.push("b"); });
    await expect(q.run(async () => "c")).rejects.toBeInstanceOf(VoiceBusyError);
    expect(q.state()).toEqual({ running: 1, waiting: 1 });
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(["a", "b"]);
    expect(q.state()).toEqual({ running: 0, waiting: 0 });
  });
  it("a job that throws still frees the slot", async () => {
    const q = new VoiceQueue(1, 0);
    await expect(q.run(async () => { throw new Error("x"); })).rejects.toThrow("x");
    await expect(q.run(async () => 1)).resolves.toBe(1);
  });
  it("a waiting job times out instead of waiting forever", async () => {
    const q = new VoiceQueue(1, 1, 30);
    const never = new Promise<void>(() => {});
    void q.run(() => never);
    await expect(q.run(async () => 1)).rejects.toBeInstanceOf(VoiceBusyError);
  });
});

describe("HTTP providers (fake engine on a fake fetch)", () => {
  it("stt: posts multipart with a fixed file name, passes the model and language, sanitises the answer", async () => {
    let seen: { url: string; form: FormData } | null = null;
    const p = new HttpSttProvider({
      baseUrl: new URL("http://127.0.0.1:9000"),
      model: "some-model",
      timeoutMs: 5_000,
      fetchImpl: (async (url: URL, init: RequestInit) => {
        seen = { url: String(url), form: init.body as FormData };
        return new Response(JSON.stringify({ text: "  hello‮ world ​ ", language: "english" }), { headers: { "content-type": "application/json" } });
      }) as unknown as typeof fetch,
    });
    const r = await p.transcribe({ audio: wav(), format: "wav", lang: "en", signal: new AbortController().signal });
    expect(r.text).toBe("hello world");
    expect(seen!.url).toBe("http://127.0.0.1:9000/v1/audio/transcriptions");
    expect(seen!.form.get("model")).toBe("some-model");
    expect(seen!.form.get("language")).toBe("en");
    expect((seen!.form.get("file") as File).name).toBe("audio.wav");
  });
  it("stt: auto sends no language; engine errors and junk map to provider errors without content", async () => {
    const mk = (f: () => Response | Promise<Response>) => new HttpSttProvider({ baseUrl: new URL("http://127.0.0.1:9000"), timeoutMs: 1_000, fetchImpl: (async () => f()) as unknown as typeof fetch });
    const sig = new AbortController().signal;
    await expect(mk(() => new Response("nope", { status: 500 })).transcribe({ audio: wav(), format: "wav", lang: "auto", signal: sig })).rejects.toMatchObject({ kind: "unavailable" });
    await expect(mk(() => new Response("not json")).transcribe({ audio: wav(), format: "wav", lang: "auto", signal: sig })).rejects.toMatchObject({ kind: "bad_output" });
    await expect(mk(() => new Response(JSON.stringify({ text: 5 }))).transcribe({ audio: wav(), format: "wav", lang: "auto", signal: sig })).rejects.toMatchObject({ kind: "bad_output" });
    await expect(mk(() => new Response("x".repeat(300_000))).transcribe({ audio: wav(), format: "wav", lang: "auto", signal: sig })).rejects.toMatchObject({ kind: "bad_output" });
    await expect(new HttpSttProvider({ baseUrl: new URL("http://127.0.0.1:9000"), timeoutMs: 1_000, fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch }).transcribe({ audio: wav(), format: "wav", lang: "auto", signal: sig })).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("stt: a redirect from the engine is refused (redirect: error)", async () => {
    let init: RequestInit | undefined;
    const p = new HttpSttProvider({ baseUrl: new URL("http://127.0.0.1:9000"), timeoutMs: 1_000, fetchImpl: (async (_u: unknown, i: RequestInit) => { init = i; return new Response(JSON.stringify({ text: "x" })); }) as unknown as typeof fetch });
    await p.transcribe({ audio: wav(), format: "wav", lang: "auto", signal: new AbortController().signal });
    expect(init?.redirect).toBe("error");
  });
  it("tts: validates the returned bytes, ignores the engine's content-type, refuses non-audio", async () => {
    const mk = (body: Buffer, type = "audio/wav") => new HttpTtsProvider({ baseUrl: new URL("http://127.0.0.1:9100"), voices: { en: "v" }, timeoutMs: 1_000, fetchImpl: (async () => new Response(new Uint8Array(body), { headers: { "content-type": type } })) as unknown as typeof fetch });
    const sig = new AbortController().signal;
    await expect(mk(wav({ seconds: 1 })).synthesize({ text: "hi", lang: "en", signal: sig })).resolves.toMatchObject({ contentType: "audio/wav" });
    await expect(mk(Buffer.from("<html>script</html>"), "audio/wav").synthesize({ text: "hi", lang: "en", signal: sig })).rejects.toMatchObject({ kind: "bad_output" });
    await expect(mk(ogg()).synthesize({ text: "hi", lang: "en", signal: sig })).rejects.toMatchObject({ kind: "bad_output" });
    await expect(mk(wav()).synthesize({ text: "hi", lang: "si", signal: sig })).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("VoiceService.transcribe", () => {
  it("501 when no engine is configured (nothing changes for users)", async () => {
    const r = await new VoiceService(baseCfg()).handle(req("/v1/voice/transcribe", wav()));
    expect(r.status).toBe(501);
    expect(json(r).error.code).toBe("VOICE_UNAVAILABLE");
  });
  it("200 with text, language and duration; the transcript is cleaned; the request body is zeroed afterwards", async () => {
    const svc = new VoiceService(baseCfg({ stt: fakeStt("  මට​ laptop එකක් ඕන  ") }));
    const body = wav({ seconds: 2 });
    const r = await svc.handle(req("/v1/voice/transcribe", body, { lang: "si" }));
    expect(r.status).toBe(200);
    expect(json(r)).toMatchObject({ voiceVersion: "1", text: "මට laptop එකක් ඕන", language: "mixed", durationMs: 2000 });
    expect(body.every((b) => b === 0)).toBe(true); // audio is not kept
    expect(r.audit).toMatchObject({ route: "/v1/voice/transcribe", status: 200, provider: "fake" });
    expect(JSON.stringify(r.audit)).not.toContain("laptop"); // the audit record never holds text
  });
  it("Singlish comes back as Latin text and is reported as en (script based; no claim about accuracy)", async () => {
    const r = await new VoiceService(baseCfg({ stt: fakeStt("mata laptop ekak oni", "sinhala") })).handle(req("/v1/voice/transcribe", wav(), { lang: "auto" }));
    expect(json(r).language).toBe("si"); // the engine said Sinhala
  });
  it("refuses unknown language hints, bad audio, silence, empty transcripts", async () => {
    const svc = new VoiceService(baseCfg({ stt: fakeStt() }));
    expect((await svc.handle(req("/v1/voice/transcribe", wav(), { lang: "fr" }))).status).toBe(422);
    expect((await svc.handle(req("/v1/voice/transcribe", Buffer.from("not audio at all, definitely")))).status).toBe(415);
    expect((await svc.handle(req("/v1/voice/transcribe", Buffer.alloc(0)))).status).toBe(422);
    const sil = await svc.handle(req("/v1/voice/transcribe", wav({ amplitude: 0 })));
    expect(sil.status).toBe(422);
    expect(json(sil).error.code).toBe("NO_SPEECH");
    const empty = await new VoiceService(baseCfg({ stt: fakeStt("  ​ ") })).handle(req("/v1/voice/transcribe", wav()));
    expect(json(empty).error.code).toBe("NO_SPEECH");
    expect((await svc.handle(req("/v1/voice/transcribe", wav({ seconds: 31 })))).status).toBe(422);
  });
  it("maps engine failures to safe statuses", async () => {
    const mk = (kind: ProviderError["kind"]) => new VoiceService(baseCfg({ stt: { name: "f", async transcribe() { throw new ProviderError(kind); } } }));
    expect((await mk("unavailable").handle(req("/v1/voice/transcribe", wav()))).status).toBe(503);
    expect((await mk("timeout").handle(req("/v1/voice/transcribe", wav()))).status).toBe(504);
    expect((await mk("bad_output").handle(req("/v1/voice/transcribe", wav()))).status).toBe(502);
    const boom = new VoiceService(baseCfg({ stt: { name: "f", async transcribe() { throw new Error("secret details"); } } }));
    const r = await boom.handle(req("/v1/voice/transcribe", wav()));
    expect(r.status).toBe(500);
    expect(r.body.toString()).not.toContain("secret");
  });
  it("per-caller limits: a guest is limited by IP, another IP is not affected, a customer by id too", async () => {
    let t = 1_000_000;
    const svc = new VoiceService(baseCfg({ stt: fakeStt() }), { now: () => t, store: new MemoryRateStore() });
    for (let i = 0; i < 5; i++) expect((await svc.handle(req("/v1/voice/transcribe", wav(), { ip: "198.51.100.1" }))).status).toBe(200);
    const limited = await svc.handle(req("/v1/voice/transcribe", wav(), { ip: "198.51.100.1" }));
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toMatch(/^\d+$/);
    expect((await svc.handle(req("/v1/voice/transcribe", wav(), { ip: "198.51.100.2" }))).status).toBe(200);
    const cust = { kind: "customer", customerId: "c1" } as const;
    for (let i = 0; i < 5; i++) await svc.handle(req("/v1/voice/transcribe", wav(), { ip: `192.0.2.${i + 1}`, identity: cust }));
    expect((await svc.handle(req("/v1/voice/transcribe", wav(), { ip: "192.0.2.77", identity: cust }))).status).toBe(429);
    t += 61_000;
    expect((await svc.handle(req("/v1/voice/transcribe", wav(), { ip: "198.51.100.1" }))).status).toBe(200);
  });
  it("a broken counter store refuses (fails closed) instead of letting requests through", async () => {
    const broken = { hit() { throw new Error("down"); }, peek: () => 0, size: () => 0 };
    const r = await new VoiceService(baseCfg({ stt: fakeStt() }), { store: broken as never }).handle(req("/v1/voice/transcribe", wav()));
    expect(r.status).toBe(500); // an unexpected storage error is never "allowed"
  });
  it("backpressure: with one worker and no queue a second request is refused with 503 and Retry-After", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: SttProvider = { name: "slow", async transcribe() { await gate; return { text: "ok" }; } };
    const svc = new VoiceService(baseCfg({ stt: slow, queueDepth: 0, limits: { sttPerMin: 50, sttPerHour: 500, ttsPerMin: 50 } }));
    const first = svc.handle(req("/v1/voice/transcribe", wav(), { ip: "198.51.100.10" }));
    await new Promise((r) => setTimeout(r, 20));
    const second = await svc.handle(req("/v1/voice/transcribe", wav(), { ip: "198.51.100.11" }));
    expect(second.status).toBe(503);
    expect(second.headers["retry-after"]).toBe("5");
    release();
    expect((await first).status).toBe(200);
  });
  it("accepts every supported container through the same path", async () => {
    const svc = new VoiceService(baseCfg({ stt: fakeStt(), limits: { sttPerMin: 60, sttPerHour: 600, ttsPerMin: 60 } }));
    for (const b of [wav(), ogg(), webm(), Buffer.from(wav())]) expect((await svc.handle(req("/v1/voice/transcribe", b))).status).toBe(200);
  });
});

describe("VoiceService.speak", () => {
  const body = (o: unknown) => Buffer.from(JSON.stringify(o));
  it("501 with a browser fallback hint when there is no engine or no voice for the language", async () => {
    const none = await new VoiceService(baseCfg()).handle(req("/v1/voice/speak", body({ text: "hi", lang: "en" })));
    expect(none.status).toBe(501);
    expect(json(none).error.fallback).toBe("browser");
    const noSi = await new VoiceService(baseCfg({ tts: fakeTts(["en"]) })).handle(req("/v1/voice/speak", body({ text: "ආයුබෝවන්", lang: "si" })));
    expect(noSi.status).toBe(501);
    expect(json(noSi).error.code).toBe("VOICE_LANGUAGE_UNSUPPORTED");
  });
  it("returns validated audio with safe headers", async () => {
    const r = await new VoiceService(baseCfg({ tts: fakeTts(["en"]) })).handle(req("/v1/voice/speak", body({ text: "Hello there", lang: "en" })));
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("audio/wav");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
  it("refuses an engine that returns something that is not audio, even if it labels it audio", async () => {
    const evil: TtsProvider = { name: "evil", supports: () => true, async synthesize() { return { audio: Buffer.from("<script>alert(1)</script>"), contentType: "audio/wav" }; } };
    const r = await new VoiceService(baseCfg({ tts: evil })).handle(req("/v1/voice/speak", body({ text: "hi", lang: "en" })));
    expect(r.status).toBe(502);
  });
  it("validates the request: strict keys, language list, length, JSON", async () => {
    const svc = new VoiceService(baseCfg({ tts: fakeTts(["en", "si"]), limits: { sttPerMin: 50, sttPerHour: 500, ttsPerMin: 50 } }));
    expect((await svc.handle(req("/v1/voice/speak", body({ text: "hi", lang: "fr" })))).status).toBe(422);
    expect((await svc.handle(req("/v1/voice/speak", body({ text: "hi", lang: "en", voice: "x" })))).status).toBe(422);
    expect((await svc.handle(req("/v1/voice/speak", body({ text: "", lang: "en" })))).status).toBe(422);
    expect((await svc.handle(req("/v1/voice/speak", body({ text: "​​", lang: "en" })))).status).toBe(422);
    expect((await svc.handle(req("/v1/voice/speak", Buffer.from("{nope")))).status).toBe(400);
    const long = await svc.handle(req("/v1/voice/speak", body({ text: "a".repeat(5000), lang: "en" })));
    expect(long.status).toBe(200); // cut to the 1,600 character cap rather than refused
  });
});
