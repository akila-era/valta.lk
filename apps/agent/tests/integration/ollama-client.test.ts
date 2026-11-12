import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OllamaClient, OllamaError } from "../../src/ollama/client";
import { MODELS, ModelPolicyError } from "../../src/ollama/models";
import { startFakeOllama, type FakeOllama } from "../fake-ollama/server";

let fake: FakeOllama;
beforeEach(async () => {
  fake = await startFakeOllama();
});
afterEach(async () => {
  await fake.close();
});

const user = (content: string) => ({ role: "user" as const, content });

describe("OllamaClient (against the fake)", () => {
  it("reads version and loaded models", async () => {
    const c = new OllamaClient({ baseUrl: fake.url });
    expect(await c.version()).toBe("0.40.16");
    expect(await c.loadedModels()).toEqual([]);
    await c.generate({ model: "qwen", purpose: "reply", messages: [user("hi")] });
    expect(await c.loadedModels()).toEqual([MODELS.qwen]);
  });

  it("sends only allow-listed tags, with the fixed context and capped output", async () => {
    const c = new OllamaClient({ baseUrl: fake.url });
    await c.generate({ model: "qwen", purpose: "classifier", messages: [user("hi")], numPredict: 9999 });
    await c.generate({ model: "sinhala", purpose: "reply", messages: [user("hi")] });
    expect(fake.requests.map((r) => r.model)).toEqual([MODELS.qwen, MODELS.sinhala]);
    expect(fake.requests[0]).toMatchObject({ numCtx: 2048, numPredict: 24, think: false, hasTools: false, hasSystem: false });
    expect(fake.requests[1]).toMatchObject({ numCtx: 2048, numPredict: 120, hasTools: false, hasSystem: false });
  });

  it("refuses a policy violation BEFORE anything is sent", async () => {
    const c = new OllamaClient({ baseUrl: fake.url });
    await expect(c.generate({ model: "sinhala", purpose: "reply", messages: [{ role: "system", content: "x" }, user("hi")] })).rejects.toBeInstanceOf(ModelPolicyError);
    await expect(c.generate({ model: "cloud" as never, purpose: "reply", messages: [user("hi")] })).rejects.toBeInstanceOf(ModelPolicyError);
    expect(fake.requests).toHaveLength(0);
  });

  it("parses tool calls and timing", async () => {
    fake.setResponder(() => ({ content: "", tool_calls: [{ function: { name: "search_products", arguments: { query: "phone", max_price_lkr: 150000 } } }] }));
    const r = await new OllamaClient({ baseUrl: fake.url }).generate({ model: "qwen", purpose: "tool", messages: [user("find a phone")] });
    expect(r.toolCalls).toEqual([{ name: "search_products", arguments: { query: "phone", max_price_lkr: 150000 } }]);
    expect(r.generatedTokens).toBe(8);
    expect(r.tokensPerSecond).toBe(8);
  });

  it("unloads a model with keep_alive 0", async () => {
    const c = new OllamaClient({ baseUrl: fake.url });
    await c.generate({ model: "qwen", purpose: "reply", messages: [user("hi")] });
    expect(fake.loaded()).toBe(MODELS.qwen);
    await c.unload("qwen");
    expect(fake.loaded()).toBeNull();
  });

  it("maps failures to typed errors", async () => {
    const c = new OllamaClient({ baseUrl: fake.url, requestTimeoutMs: 150 });
    const kind = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as OllamaError).kind;
    fake.setMode("http500");
    expect(await kind(c.version())).toBe("HTTP");
    fake.setMode("notjson");
    expect(await kind(c.version())).toBe("BAD_RESPONSE");
    fake.setMode("malformed");
    expect(await kind(c.generate({ model: "qwen", purpose: "reply", messages: [user("x")] }))).toBe("BAD_RESPONSE");
    fake.setMode("hang");
    expect(await kind(c.version())).toBe("TIMEOUT");
    const ac = new AbortController();
    const pending = c.version(ac.signal).catch((e) => e as OllamaError);
    ac.abort();
    expect(((await pending) as OllamaError).kind).toBe("ABORTED");
  });

  it("reports UNAVAILABLE when Ollama is not there", async () => {
    const url = fake.url;
    await fake.close();
    const err = (await new OllamaClient({ baseUrl: url }).version().catch((e) => e)) as OllamaError;
    expect(err).toBeInstanceOf(OllamaError);
    expect(err.kind).toBe("UNAVAILABLE");
    expect(err.message).not.toContain("127.0.0.1"); // no internals in the message
    fake = await startFakeOllama(); // so afterEach has something to close
  });

  it("recognises the real cloud-disabled answer", async () => {
    const c = new OllamaClient({
      baseUrl: fake.url,
      fetchImpl: async () => new Response(JSON.stringify({ error: "ollama cloud is disabled: remote model is unavailable" }), { status: 403 }),
    });
    const err = (await c.generate({ model: "qwen", purpose: "reply", messages: [user("x")] }).catch((e) => e)) as OllamaError;
    expect(err.kind).toBe("CLOUD_DISABLED");
  });

  it("refuses to be pointed at anything but loopback", () => {
    expect(() => new OllamaClient({ baseUrl: "http://10.0.0.5:11434" })).toThrow(/loopback/);
    expect(() => new OllamaClient({ baseUrl: "https://ollama.com" })).toThrow(/loopback/);
    expect(() => new OllamaClient({ baseUrl: "http://localhost:11434" })).not.toThrow();
  });
});

describe("fake Ollama fidelity (so tests that rely on it are meaningful)", () => {
  it("answers 403 for cloud model names and 404 for unknown ones, like the real server", async () => {
    const post = (model: string) => fetch(`${fake.url}/api/chat`, { method: "POST", body: JSON.stringify({ model, messages: [user("x")] }) });
    const cloud = await post("glm-5.3-flash:cloud");
    expect(cloud.status).toBe(403);
    expect(await cloud.text()).toMatch(/ollama cloud is disabled/);
    expect((await post("nothing")).status).toBe(404);
  });
});
