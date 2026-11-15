import { describe, expect, it } from "vitest";
import { InMemoryVoiceMetrics, noVoiceMetrics } from "../../src/voice";
import { VoiceService } from "../../src/voice";
import type { VoiceConfig } from "../../src/voice/config";
import { HttpSttProvider, noTtsProvider, type SttProvider } from "../../src/voice/providers";
import { mp4, ogg, wav, webm } from "./voice-fixtures";
import { inspectAudio } from "../../src/voice";

const MARKER = "ZZ-SECRET-TRANSCRIPT-9931";
const cfg = (stt: SttProvider, over: Partial<VoiceConfig> = {}): VoiceConfig => ({ stt, tts: noTtsProvider, maxSeconds: 30, maxBytes: 5_000_000, concurrency: 1, queueDepth: 1, limits: { sttPerMin: 1000, sttPerHour: 1000, ttsPerMin: 1000 }, ...over });
const req = (body: Buffer, ip = "203.0.113.4") => ({ route: "/v1/voice/transcribe" as const, body, identity: { kind: "guest" as const }, clientIp: ip, requestId: "req_m" });

describe("voice metrics hooks", () => {
  it("count requests by route and status, errors by code, rejections by reason, and record engine latency and queue wait", async () => {
    const m = new InMemoryVoiceMetrics();
    const svc = new VoiceService(cfg({ name: "fake", async transcribe() { return { text: MARKER }; } }), { metrics: m });
    await svc.handle(req(wav({ seconds: 1 })));
    await svc.handle(req(Buffer.alloc(0))); // empty: refused before the engine
    await svc.handle(req(Buffer.from("not audio at all, just text"))); // unrecognised
    const s = m.snapshot();
    expect(s.requests["/v1/voice/transcribe 200"]).toBe(1);
    expect(s.requests["/v1/voice/transcribe 422"]).toBe(1);
    expect(s.requests["/v1/voice/transcribe 415"]).toBe(1);
    expect(s.errors.INVALID_AUDIO).toBe(1);
    expect(s.errors.UNSUPPORTED_AUDIO).toBe(1);
    expect(s.rejected.INVALID_AUDIO).toBe(1);
    expect(s.rejected.UNSUPPORTED_AUDIO).toBe(1);
    expect(s.stt.count).toBe(1);
    expect(s.queueWait.count).toBe(1);
    expect(s.stt.p50).not.toBeNull();
  });

  it("never holds audio, a transcript, an address or an identity", async () => {
    const m = new InMemoryVoiceMetrics();
    const svc = new VoiceService(cfg({ name: "fake", async transcribe() { return { text: MARKER }; } }), { metrics: m });
    await svc.handle(req(wav({ seconds: 1 }), "198.51.100.77"));
    const dump = JSON.stringify(m.snapshot());
    expect(dump).not.toContain(MARKER);
    expect(dump).not.toContain("198.51.100.77");
    expect(dump).not.toMatch(/anon|cust:/);
  });

  it("is bounded: the series keep the last 500 samples and the key tables cap at 100", () => {
    const m = new InMemoryVoiceMetrics();
    for (let i = 0; i < 2_000; i++) m.engineLatency("stt", i);
    expect(m.snapshot().stt.count).toBe(500);
    for (let i = 0; i < 300; i++) m.rejected(`reason-${i}`);
    expect(Object.keys(m.snapshot().rejected).length).toBe(100);
    m.engineLatency("stt", -5);
    m.engineLatency("stt", Number.NaN);
    expect(m.snapshot().stt.count).toBe(500);
  });

  it("the no-op implementation does nothing and the default service works without metrics", async () => {
    expect(() => noVoiceMetrics.request("/x", 200)).not.toThrow();
    const svc = new VoiceService(cfg({ name: "fake", async transcribe() { return { text: "hello" }; } }));
    expect((await svc.handle(req(wav({ seconds: 1 })))).status).toBe(200);
  });

  it("counts a deadline as a 504 TIMEOUT rejection and frees the slot (VO-04)", async () => {
    const m = new InMemoryVoiceMetrics();
    const svc = new VoiceService(cfg({ name: "hang", transcribe: () => new Promise(() => {}) }), { deadlineMs: 100, metrics: m });
    const out = await svc.handle(req(wav({ seconds: 1 })));
    expect(out.status).toBe(504);
    expect(svc.queueState().running).toBe(0);
    expect(m.snapshot().errors.TIMEOUT).toBe(1);
  });
});

describe("the engine's own length is a second opinion on the cap", () => {
  it("a result that reports more than the cap is dropped (422 AUDIO_TOO_LONG); a plausible length is kept", async () => {
    const long = new VoiceService(cfg({ name: "fake", async transcribe() { return { text: "x y z", durationMs: 45_000 }; } }));
    const a = await long.handle(req(wav({ seconds: 1 })));
    expect(a.status).toBe(422);
    expect(JSON.parse(a.body.toString()).error.code).toBe("AUDIO_TOO_LONG");
    const ok = new VoiceService(cfg({ name: "fake", async transcribe() { return { text: "x y z", durationMs: 1_100 }; } }));
    expect((await ok.handle(req(wav({ seconds: 1 })))).status).toBe(200);
  });

  it("the http provider reads `duration` (seconds) from verbose_json and ignores nonsense", async () => {
    const reply = (json: unknown): typeof fetch => (async () => new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const mk = (json: unknown) => new HttpSttProvider({ baseUrl: new URL("http://127.0.0.1:1"), timeoutMs: 1_000, fetchImpl: reply(json) });
    const call = (p: HttpSttProvider) => p.transcribe({ audio: wav({ seconds: 1 }), format: "wav", lang: "auto", signal: new AbortController().signal });
    expect((await call(mk({ text: "hello", duration: 12.34 }))).durationMs).toBe(12_340);
    expect((await call(mk({ text: "hello", duration: "5" }))).durationMs).toBeUndefined();
    expect((await call(mk({ text: "hello", duration: -1 }))).durationMs).toBeUndefined();
    expect((await call(mk({ text: "hello", duration: 1e9 }))).durationMs).toBeUndefined();
  });
});

describe("VO-01: compressed durations are never exact and are bounded by the bytes", () => {
  it("only WAV is labelled exact", () => {
    for (const f of [ogg({ seconds: 3 }), webm({ seconds: 2, withDuration: true }), mp4({ seconds: 4 })]) {
      const r = inspectAudio(f);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.exact).toBe(false);
    }
    const w = inspectAudio(wav({ seconds: 2 }));
    expect(w.ok && w.exact).toBe(true);
  });

  it("a long recording that is honest in size is accepted; the same declared length carrying far too many bytes is refused", () => {
    expect(inspectAudio(mp4({ seconds: 29, mdatBytes: 200_000 })).ok).toBe(true);
    const heavy = inspectAudio(mp4({ seconds: 29, mdatBytes: 3_000_000 })); // over the hard ceiling for 30 s (about 2.4 MB)
    expect(heavy).toEqual({ ok: false, reason: "too_long" });
    const lying = inspectAudio(mp4({ seconds: 2, mdatBytes: 1_000_000 })); // 2 s declared, 1 MB carried: 500 kB/s
    expect(lying).toEqual({ ok: false, reason: "too_long" });
  });

  it("the hard ceiling follows the configured cap: a 10 s cap refuses a 1 MB compressed file whatever it declares", () => {
    expect(inspectAudio(mp4({ seconds: 9, mdatBytes: 1_000_000 }), { maxSeconds: 10 })).toEqual({ ok: false, reason: "too_long" });
    expect(inspectAudio(mp4({ seconds: 9, mdatBytes: 100_000 }), { maxSeconds: 10 }).ok).toBe(true);
  });
});
