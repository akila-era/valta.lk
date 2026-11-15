import { afterEach, describe, expect, it, vi } from "vitest";
import { signRequest } from "../../src/auth/hmac";
import { createAgent, StartupError, type RunningAgent } from "../../src/main";
import { FixtureErpTransport } from "../../src/mock/erp-fixture";
import { createMockSiteData } from "../../src/mock/site-data";
import type { GenerateResult, OllamaLike } from "../../src/ollama/client";

/**
 * The production entry with the LLM-first switch. Real server and real HMAC; the model client is a fake. A guard on the global fetch proves that none of the
 * three modes calls out while Gemini is disabled (the default).
 */
const SECRET = "e".repeat(40);
let agent: RunningAgent | undefined;
const fetchCalls: string[] = [];

afterEach(async () => {
  await agent?.stop();
  agent = undefined;
  vi.unstubAllGlobals();
  fetchCalls.length = 0;
});

const fakeOllama: OllamaLike = {
  version: async () => "0.0.0",
  loadedModels: async () => [],
  unload: async () => {},
  generate: async (): Promise<GenerateResult> => ({ content: "", toolCalls: [], loadMs: 0, promptTokens: 10, generatedTokens: 2, tokensPerSecond: 1 }),
};

const baseEnv = { AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AGENT_RATE_IP_PER_MIN: "1000", AGENT_RATE_SESSION_PER_MIN: "1000", AGENT_NEW_SESSIONS_PER_HOUR: "200" };
const overrides = { ollama: fakeOllama, transport: new FixtureErpTransport(), site: createMockSiteData() };

async function start(env: Record<string, string> = {}) {
  agent = await createAgent({ ...baseEnv, ...env } as NodeJS.ProcessEnv, overrides);
  const { port } = await agent.app.listen();
  // Only AFTER the server is up: guard every outbound call the Agent itself might make while chatting.
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", (input: unknown, init?: unknown) => {
    const url = String(input);
    if (url.startsWith(`http://127.0.0.1:${port}`)) return real(input as string | URL, init as RequestInit);
    fetchCalls.push(url);
    throw new Error("outbound call attempted in a test");
  });
  return `http://127.0.0.1:${port}`;
}

const chat = (url: string, message: string) => {
  const body = JSON.stringify({ sessionId: `sess_${"a".repeat(32)}`, message, contractVersion: "1.2" });
  return fetch(`${url}/v1/chat`, { method: "POST", headers: { "content-type": "application/json", ...signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: "203.0.113.5", body }) }, body });
};

describe("AGENT_LLM_FIRST wiring in the production entry", () => {
  it("unset: the Agent starts and answers exactly as before, with no outbound call", async () => {
    const url = await start();
    const res = await chat(url, "hi");
    expect(res.status).toBe(200);
    expect(fetchCalls).toEqual([]);
  });

  it("an invalid value stops the start, names the variable and never echoes the value", async () => {
    const err = await createAgent({ ...baseEnv, AGENT_LLM_FIRST: "TOP_SECRET_VALUE_zz" } as NodeJS.ProcessEnv, overrides).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StartupError);
    expect((err as Error).message).toMatch(/AGENT_LLM_FIRST/);
    expect((err as Error).message).not.toContain("TOP_SECRET_VALUE_zz");
  });

  it("shadow with Gemini disabled (the default): the customer is answered by the existing pipeline and nothing is sent anywhere", async () => {
    const url = await start({ AGENT_LLM_FIRST: "shadow" });
    const res = await chat(url, "hi");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { reply: { source: string } };
    expect(json.reply.source).toBe("template");
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchCalls).toEqual([]);
  });

  it("on without the test-only shim is fail-closed: the existing pipeline still answers", async () => {
    const url = await start({ AGENT_LLM_FIRST: "on" });
    const res = await chat(url, "hi");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reply: { source: string } }).reply.source).toBe("template");
    expect(fetchCalls).toEqual([]);
  });

  it("an enabled but misconfigured Gemini (no key) does not stop the Agent and nothing is called", async () => {
    const url = await start({ AGENT_LLM_FIRST: "shadow", GEMINI_ENABLED: "true" });
    const res = await chat(url, "hi");
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchCalls).toEqual([]);
  });
});
