import { afterEach, describe, expect, it } from "vitest";
import { signRequest } from "../../src/auth/hmac";
import { loadConfig } from "../../src/config";
import { createAgentServer, type RunningServer } from "../../src/http/server";
import { createMockStack } from "../../src/mock/stack";
import { Metrics } from "../../src/observability/metrics";
import { meteredOllama } from "../../src/observability/metered-ollama";
import { AbuseGuard, DEFAULT_RATE_CONFIG } from "../../src/security/rate-limit";
import type { GenerateResult, OllamaLike } from "../../src/ollama/client";
import { VoiceService } from "../../src/voice";
import { noSttProvider, noTtsProvider } from "../../src/voice/providers";

/**
 * Wave-2 metrics: privacy-safe counts and durations only. These tests feed the real Metrics class, the real AbuseGuard hook, the real model
 * wrapper and the real signed /v1/metrics route. Nothing is mocked except the model client's answer (a fixed result with token counts).
 */
const SECRET = "m".repeat(40);
let app: RunningServer | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("Metrics: new series", () => {
  it("counts rate-limit refusals by limiter NAME (never a key, address or identity)", () => {
    const m = new Metrics();
    const guard = new AbuseGuard({ ...DEFAULT_RATE_CONFIG, newSessionsPerHour: 1, ipPerMin: 2 }, { onLimit: (l) => m.rateLimited(l) });
    guard.checkNewSession({ identityKey: "anon", clientIp: "203.0.113.1" });
    expect(() => guard.checkNewSession({ identityKey: "anon", clientIp: "203.0.113.1" })).toThrow();
    for (let i = 0; i < 3; i++) {
      try {
        guard.checkRequest({ clientIp: "203.0.113.2", identityKey: "anon" });
      } catch {
        // expected after the second request
      }
    }
    const snap = m.snapshot();
    expect(snap.counters.rate_limit_refusals_total?.new_session).toBe(1);
    expect(snap.counters.rate_limit_refusals_total?.ip).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(snap)).not.toMatch(/203\.0\.113|anon/);
  });

  it("a broken metrics hook never changes what the limiter does", () => {
    const guard = new AbuseGuard({ ...DEFAULT_RATE_CONFIG, newSessionsPerHour: 1 }, { onLimit: () => { throw new Error("boom"); } });
    guard.checkNewSession({ identityKey: "anon", clientIp: "203.0.113.1" });
    expect(() => guard.checkNewSession({ identityKey: "anon", clientIp: "203.0.113.1" })).toThrow(/Too many requests/);
  });

  it("the shop-ceiling gauge source reports the last hour's new conversations and both limits", () => {
    const guard = new AbuseGuard({ ...DEFAULT_RATE_CONFIG, newSessionsPerHour: 50 });
    for (let i = 0; i < 7; i++) guard.checkNewSession({ identityKey: "anon", clientIp: `203.0.113.${i + 1}` });
    expect(guard.newSessionStats()).toEqual({ lastHour: 7, shopCeiling: 2_000, perCallerLimit: 50 });
  });

  it("records tokens and time per model call from the wrapper, and never the text", async () => {
    const m = new Metrics();
    const inner: OllamaLike = {
      version: async () => "x",
      loadedModels: async () => [],
      unload: async () => {},
      generate: async (): Promise<GenerateResult> => ({ content: "SECRET-ANSWER-TEXT", toolCalls: [], loadMs: 0, promptTokens: 120, generatedTokens: 30, tokensPerSecond: 5 }),
    };
    let t = 1_000;
    const metered = meteredOllama(inner, m, () => (t += 250));
    await metered.generate({ model: "qwen", messages: [{ role: "user", content: "SECRET-QUESTION-TEXT" }] } as never);
    const s = m.snapshot();
    expect(s.counters.tokens_prompt_total?.qwen).toBe(120);
    expect(s.counters.tokens_generated_total?.qwen).toBe(30);
    expect(s.summary.models.qwen).toMatchObject({ requests: 1, promptTokens: 120, generatedTokens: 30 });
    expect(s.summary.models.qwen?.runMs?.count).toBe(1);
    expect(JSON.stringify(s)).not.toMatch(/SECRET-/);
  });

  it("a failing model call counts no tokens and rethrows", async () => {
    const m = new Metrics();
    const inner: OllamaLike = { version: async () => "x", loadedModels: async () => [], unload: async () => {}, generate: async () => { throw new Error("down"); } };
    await expect(meteredOllama(inner, m).generate({ model: "qwen", messages: [] } as never)).rejects.toThrow("down");
    expect(m.snapshot().summary.tokens.prompt).toBe(0);
  });

  it("reference cost is 0 unless a price is configured (no invented cost)", () => {
    const free = new Metrics();
    free.modelCall("qwen", 1_000_000, 1_000_000, 10);
    expect(free.snapshot().summary.tokens).toMatchObject({ referencePricePerMillionTokens: 0, referenceCost: 0 });
    const priced = new Metrics({ referencePricePerMillionTokens: 2 });
    priced.modelCall("qwen", 1_000_000, 1_000_000, 10);
    expect(priced.snapshot().summary.tokens.referenceCost).toBe(4);
  });

  it("browser failures and tool calls use fixed labels; anything else becomes (other)", () => {
    const m = new Metrics();
    m.browserTool("browser.open_page", "ok");
    m.browserTool("browser.click", "unknown_element");
    m.browserTool("not-a-tool <script>", "made-up-reason");
    const c = m.snapshot().counters;
    expect(c.browser_calls_total).toMatchObject({ "browser.open_page": 1, "browser.click": 1, "(other)": 1 });
    expect(c.browser_failures_total).toMatchObject({ unknown_element: 1, "(other)": 1 });
    expect(m.snapshot().summary.browser).toMatchObject({ calls: 3, failures: 2 });
  });

  it("the voice hook records codes, counts and durations only, with bounded labels", () => {
    const m = new Metrics();
    const v = m.voiceHook();
    v.request("/v1/voice/transcribe", 200);
    v.request("/v1/voice/transcribe", 415, "UNSUPPORTED_AUDIO");
    v.request("/v1/voice/<img src=x>", 500, "has spaces and Sinhala සිංහල text");
    v.engineLatency("stt", 1200);
    v.queueWait(30);
    v.rejected("queue_full");
    for (let i = 0; i < 100; i++) v.rejected(`code_${i}`);
    const snap = m.snapshot();
    expect(snap.counters.voice_requests_total).toMatchObject({ "/v1/voice/transcribe 200": 1, "/v1/voice/transcribe 415": 1, "(other) 500": 1 });
    expect(snap.counters.voice_errors_total).toMatchObject({ UNSUPPORTED_AUDIO: 1, "(other)": 1 });
    expect(Object.keys(snap.counters.voice_rejected_total ?? {}).length).toBeLessThanOrEqual(41);
    expect(snap.latencyMs.voice_stt?.count).toBe(1);
    expect(JSON.stringify(snap)).not.toMatch(/Sinhala|img src/);
  });

  it("the compact summary gives ratios the alerts need", () => {
    const m = new Metrics();
    for (let i = 0; i < 8; i++) m.request("/v1/chat", 200, 20);
    m.request("/v1/chat", 429, 5, "RATE_LIMITED");
    m.request("/v1/chat", 503, 5, "QUEUE_FULL");
    m.setGauge("queue_depth", 3);
    m.setGauge("new_sessions_last_hour", 1000);
    m.setGauge("new_sessions_shop_ceiling", 2000);
    const s = m.snapshot().summary;
    expect(s.requests).toMatchObject({ chat: 10, errors5xx: 1, rateLimited429: 1 });
    expect(s.ratios.rateLimited).toBeCloseTo(0.1);
    expect(s.ratios.serverErrors).toBeCloseTo(0.1);
    expect(s.queue.depth).toBe(3);
    expect(s.newSessions).toMatchObject({ lastHour: 1000, shopCeiling: 2000, ceilingUsedPct: 50 });
  });
});

describe("signed /v1/metrics through the real server", () => {
  async function start() {
    const stack = createMockStack({});
    const metrics = new Metrics();
    const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true", AGENT_NEW_SESSIONS_PER_HOUR: "1", AGENT_RATE_IP_PER_MIN: "1000" });
    const voice = new VoiceService({ stt: noSttProvider, tts: noTtsProvider, maxSeconds: 30, maxBytes: 5_000_000, concurrency: 1, queueDepth: 1, limits: { sttPerMin: 5, sttPerHour: 100, ttsPerMin: 5 } }, { metrics: metrics.voiceHook() });
    app = createAgentServer({ config, pipeline: stack.pipeline, metrics, voice, memory: async () => ({ availableMb: null, swapUsedMb: null }) });
    const { port } = await app.listen();
    return `http://127.0.0.1:${port}`;
  }
  const signed = (url: string, path: string, method: "GET" | "POST", body?: string, ip = "203.0.113.9") =>
    fetch(`${url}${path}`, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...signRequest({ keyId: "k1", secret: SECRET, method, path, identity: { kind: "guest" }, clientIp: ip, ...(body ? { body } : {}) }) }, ...(body ? { body } : {}) });

  it("shows the new-session gauges, the per-limiter refusal counts and the summary", async () => {
    const url = await start();
    const chat = (sid: string) => signed(url, "/v1/chat", "POST", JSON.stringify({ sessionId: `sess_${sid.padEnd(32, "a")}`, message: "hi", contractVersion: "1.2" }));
    expect((await chat("one")).status).toBe(200);
    expect((await chat("two")).status).toBe(429); // per-caller allowance of 1 new conversation per hour
    const snap = (await (await signed(url, "/v1/metrics", "GET")).json()) as { gauges: Record<string, number>; counters: Record<string, Record<string, number>>; summary: { newSessions: { lastHour: number; perCallerLimit: number }; rateLimitRefusals: Record<string, number> } };
    expect(snap.gauges.new_sessions_last_hour).toBeGreaterThanOrEqual(1);
    expect(snap.gauges.new_sessions_per_caller_limit).toBe(1);
    expect(snap.summary.rateLimitRefusals.new_session).toBeGreaterThanOrEqual(1);
    expect(snap.summary.newSessions.perCallerLimit).toBe(1);
    expect(JSON.stringify(snap)).not.toMatch(/203\.0\.113/);
  });

  it("is still refused without a signature", async () => {
    const url = await start();
    expect((await fetch(`${url}/v1/metrics`)).status).toBe(401);
  });
});
