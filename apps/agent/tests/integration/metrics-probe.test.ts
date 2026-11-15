import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config";
import { createAgentServer, type RunningServer } from "../../src/http/server";
import { createMockStack } from "../../src/mock/stack";
import { Metrics } from "../../src/observability/metrics";
// @ts-expect-error plain .mjs script (no types): the same file operators run
import { crossedAlerts, readFirstKey, signedGet } from "../../scripts/metrics-probe.mjs";

const SECRET = "p".repeat(40);
let app: RunningServer | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("scripts/metrics-probe.mjs (read-only signed metrics read)", () => {
  it("reads the first key from an env file without printing it, and signs a request the real server accepts", async () => {
    const key = readFirstKey(`FOO=bar\nAGENT_HMAC_KEYS=k1:${SECRET},k2:${"q".repeat(40)}\nOTHER=1\n`);
    expect(key).toEqual({ keyId: "k1", secret: SECRET });
    const metrics = new Metrics();
    metrics.request("/v1/chat", 200, 10);
    const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true" });
    app = createAgentServer({ config, pipeline: createMockStack({}).pipeline, metrics, memory: async () => ({ availableMb: null, swapUsedMb: null }) });
    const { port } = await app.listen();
    const res = await signedGet(`http://127.0.0.1:${port}`, "/v1/metrics", key);
    expect(res.status).toBe(200);
    const snap = (await res.json()) as { summary: { requests: { chat: number } } };
    expect(snap.summary.requests.chat).toBe(1);
    const wrong = await signedGet(`http://127.0.0.1:${port}`, "/v1/metrics", { keyId: "k1", secret: "w".repeat(40) });
    expect(wrong.status).toBe(401);
  });

  it("refuses an env file without a usable key, by name (no value in the message)", () => {
    expect(() => readFirstKey("A=b\n")).toThrow(/AGENT_HMAC_KEYS is not set/);
    expect(() => readFirstKey("AGENT_HMAC_KEYS=k1:short\n")).toThrow(/no usable key/);
    try {
      readFirstKey("AGENT_HMAC_KEYS=k1:short-value-here\n");
    } catch (e) {
      expect((e as Error).message).not.toContain("short-value-here");
    }
  });

  it("names the alert thresholds a summary crosses", () => {
    const m = new Metrics();
    for (let i = 0; i < 4; i++) m.request("/v1/chat", 200, 5);
    for (let i = 0; i < 6; i++) m.request("/v1/chat", 429, 5, "RATE_LIMITED");
    m.setGauge("queue_depth", 6);
    m.setGauge("new_sessions_last_hour", 1100);
    m.setGauge("new_sessions_shop_ceiling", 2000);
    const alerts = crossedAlerts(m.snapshot().summary) as string[];
    expect(alerts).toEqual(expect.arrayContaining(["chat_rate_limited_often", "queue_depth_at_maximum", "new_session_ceiling_50pct"]));
    expect(alerts).not.toContain("chat_5xx_rate_high");
    expect(crossedAlerts(new Metrics().snapshot().summary)).toEqual([]);
  });
});
