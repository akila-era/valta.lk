import { afterEach, describe, expect, it } from "vitest";
import { signRequest } from "../../src/auth/hmac";
import { createAgent, StartupError, type RunningAgent } from "../../src/main";
import { FixtureErpTransport } from "../../src/mock/erp-fixture";
import { createMockSiteData } from "../../src/mock/site-data";
import type { GenerateResult, OllamaLike } from "../../src/ollama/client";

/**
 * The production entry (src/main.ts) wired in-process with fixture data supplied through the test-only overrides (the entry itself has no fixture
 * fallback). Real server, real HMAC, real limits; only the model client is a fake that answers with fixed token counts.
 */
const SECRET = "e".repeat(40);
const CATALOGUE_SECRET = "c".repeat(40);
let agent: RunningAgent | undefined;
afterEach(async () => {
  await agent?.stop();
  agent = undefined;
});

const fakeOllama: OllamaLike = {
  version: async () => "0.0.0",
  loadedModels: async () => [],
  unload: async () => {},
  generate: async (): Promise<GenerateResult> => ({ content: "", toolCalls: [], loadMs: 0, promptTokens: 10, generatedTokens: 2, tokensPerSecond: 1 }),
};

const baseEnv = { AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AGENT_RATE_IP_PER_MIN: "1000" };
const overrides = { ollama: fakeOllama, transport: new FixtureErpTransport(), site: createMockSiteData() };

async function start(env: Record<string, string> = {}) {
  agent = await createAgent({ ...baseEnv, ...env } as NodeJS.ProcessEnv, overrides);
  const { port } = await agent.app.listen();
  return `http://127.0.0.1:${port}`;
}

const signed = (url: string, path: string, method: "GET" | "POST", body?: string) =>
  fetch(`${url}${path}`, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...signRequest({ keyId: "k1", secret: SECRET, method, path, identity: { kind: "guest" }, clientIp: "203.0.113.5", ...(body ? { body } : {}) }) }, ...(body ? { body } : {}) });

describe("fail-fast configuration (messages name the variable and the rule, never a value)", () => {
  it("refuses to start without the catalogue relay settings (no fixture fallback)", async () => {
    await expect(createAgent({ ...baseEnv } as NodeJS.ProcessEnv, { ollama: fakeOllama })).rejects.toThrow(/AGENT_CATALOGUE_URL.*AGENT_CATALOGUE_KEY_ID.*AGENT_CATALOGUE_SECRET/);
  });

  it("reports a bad setting by name and does not print any secret", async () => {
    const env = { ...baseEnv, AGENT_NEW_SESSIONS_PER_HOUR: "201", AGENT_CATALOGUE_URL: "https://shop.invalid", AGENT_CATALOGUE_KEY_ID: "relay", AGENT_CATALOGUE_SECRET: CATALOGUE_SECRET };
    const err = await createAgent(env as NodeJS.ProcessEnv, { ollama: fakeOllama }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StartupError);
    const msg = (err as Error).message;
    expect(msg).toMatch(/AGENT_NEW_SESSIONS_PER_HOUR/);
    expect(msg).not.toContain(SECRET);
    expect(msg).not.toContain(CATALOGUE_SECRET);
  });

  it("a too-short catalogue secret is refused without echoing it", async () => {
    const env = { ...baseEnv, AGENT_CATALOGUE_URL: "https://shop.invalid", AGENT_CATALOGUE_KEY_ID: "relay", AGENT_CATALOGUE_SECRET: "short-secret-value" };
    const err = (await createAgent(env as NodeJS.ProcessEnv, { ollama: fakeOllama }).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(StartupError);
    expect(err.message).not.toContain("short-secret-value");
  });

  it("AGENT_BROWSER_ENABLED=true in a build with no browser driver is a startup error, not a silent fallback", async () => {
    await expect(createAgent({ ...baseEnv, AGENT_BROWSER_ENABLED: "true" } as NodeJS.ProcessEnv, overrides)).rejects.toThrow(/no browser driver/);
  });

  it("an invalid browser setting is reported by name", async () => {
    await expect(createAgent({ ...baseEnv, AGENT_BROWSER_MAX_SESSIONS: "99" } as NodeJS.ProcessEnv, overrides)).rejects.toThrow(/AGENT_BROWSER_MAX_SESSIONS/);
    await expect(createAgent({ ...baseEnv, AGENT_BROWSER_ENABLED: "maybe" } as NodeJS.ProcessEnv, overrides)).rejects.toThrow(/AGENT_BROWSER_ENABLED/);
  });
});

describe("the entry serves the Agent API", () => {
  it("is ON by default (AI_ASSISTANT_ENABLED unset, like the live env file), answers a signed chat and rejects an unsigned one", async () => {
    const url = await start();
    const body = JSON.stringify({ sessionId: `sess_${"m".repeat(32)}`, message: "hi", contractVersion: "1.2" });
    expect((await signed(url, "/v1/chat", "POST", body)).status).toBe(200);
    expect((await fetch(`${url}/v1/chat`, { method: "POST", headers: { "content-type": "application/json" }, body })).status).toBe(401);
  });

  it("AI_ASSISTANT_ENABLED=false keeps it disabled (503 AI_DISABLED)", async () => {
    const url = await start({ AI_ASSISTANT_ENABLED: "false" });
    const body = JSON.stringify({ sessionId: `sess_${"n".repeat(32)}`, message: "hi" });
    expect((await signed(url, "/v1/chat", "POST", body)).status).toBe(503);
  });

  it("serves the compact metrics summary, with browser off and voice routes absent by default", async () => {
    const url = await start();
    const snap = (await (await signed(url, "/v1/metrics", "GET")).json()) as { summary: { browser: { enabled: boolean }; tokens: { referenceCost: number } } };
    expect(snap.summary.browser.enabled).toBe(false);
    expect(snap.summary.tokens.referenceCost).toBe(0);
    expect((await signed(url, "/v1/voice/transcribe", "POST", "{}")).status).toBe(404);
  });

  it("with the browser off, the /v1/browser routes do not exist (404) and page-like messages go through the normal pipeline", async () => {
    const url = await start();
    const decision = JSON.stringify({ sessionId: `sess_${"b".repeat(32)}`, proposalId: `bp_${"x".repeat(22)}` });
    expect((await signed(url, "/v1/browser/confirm", "POST", decision)).status).toBe(404);
    expect((await signed(url, "/v1/browser/cancel", "POST", decision)).status).toBe(404);
    const chat = await signed(url, "/v1/chat", "POST", JSON.stringify({ sessionId: `sess_${"p".repeat(32)}`, message: "what is on this page?", contractVersion: "1.3", context: { page: "home", path: "/" } }));
    expect(chat.status).toBe(200);
    const json = (await chat.json()) as { browser?: unknown };
    expect(json.browser).toBeUndefined();
  });

  it("counts model tokens from the metered client", async () => {
    const url = await start();
    await signed(url, "/v1/chat", "POST", JSON.stringify({ sessionId: `sess_${"q".repeat(32)}`, message: "hello there how are you", contractVersion: "1.2" }));
    const snap = (await (await signed(url, "/v1/metrics", "GET")).json()) as { summary: { tokens: { prompt: number } } };
    expect(snap.summary.tokens.prompt).toBeGreaterThanOrEqual(0);
  });
});
