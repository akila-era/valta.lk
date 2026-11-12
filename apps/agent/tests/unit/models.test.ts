import { describe, expect, it } from "vitest";
import { buildChatBody, MODELS, ModelPolicyError, modelKeyOfTag, NUM_CTX, NUM_PREDICT_CAP, type GenerateRequest } from "../../src/ollama/models";

const user = (content: string) => ({ role: "user" as const, content });
const base = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({ model: "qwen", purpose: "reply", messages: [user("hi")], ...over });

describe("model allow-list", () => {
  it("knows exactly the two vetted models", () => {
    expect(Object.keys(MODELS)).toEqual(["qwen", "sinhala"]);
    expect(modelKeyOfTag("qwen3:1.7b-q4_K_M")).toBe("qwen");
    expect(modelKeyOfTag("hf.co/namindu94/SinhalaLLM-1.7B:Q4_K_M")).toBe("sinhala");
    for (const tag of ["glm-5.3-flash:cloud", "qwen3:4b", "llama3", "", "qwen3:1.7b-q4_K_M:cloud"]) expect(modelKeyOfTag(tag), tag).toBeNull();
  });

  it("refuses a model key that is not on the list, so nothing else can be requested", () => {
    expect(() => buildChatBody({ ...base(), model: "glm-5.3-flash:cloud" as never })).toThrow(ModelPolicyError);
    expect(() => buildChatBody({ ...base(), model: "constructor" as never })).toThrow(ModelPolicyError);
  });
});

describe("buildChatBody", () => {
  it("fixes the context window, forces non-streaming and turns Qwen thinking off", () => {
    const b = buildChatBody(base()) as { model: string; stream: boolean; think?: boolean; options: Record<string, number> };
    expect(b).toMatchObject({ model: MODELS.qwen, stream: false, think: false });
    expect(b.options.num_ctx).toBe(NUM_CTX);
    expect(b.options.num_ctx).toBe(2048);
  });

  it("caps output tokens per purpose and never exceeds the cap", () => {
    const n = (purpose: GenerateRequest["purpose"], numPredict?: number) =>
      (buildChatBody(base({ purpose, ...(numPredict !== undefined ? { numPredict } : {}) })) as { options: { num_predict: number } }).options.num_predict;
    expect(n("classifier")).toBe(NUM_PREDICT_CAP.classifier);
    expect(n("tool")).toBe(NUM_PREDICT_CAP.tool);
    expect(n("reply")).toBe(NUM_PREDICT_CAP.reply);
    expect(n("classifier", 500)).toBe(24);
    expect(n("reply", 99_999)).toBe(120);
    expect(n("reply", 10)).toBe(10);
    expect(n("reply", 0)).toBe(1);
    expect(n("reply", -5)).toBe(1);
  });

  it("clamps sampling parameters into safe ranges", () => {
    const o = (buildChatBody(base({ temperature: 9, topP: 5, minP: -1, repeatPenalty: 10 })) as { options: Record<string, number> }).options;
    expect(o).toMatchObject({ temperature: 1, top_p: 1, min_p: 0, repeat_penalty: 2 });
    expect((buildChatBody(base({ temperature: -3 })) as { options: Record<string, number> }).options.temperature).toBe(0);
  });

  it("limits the number and size of messages", () => {
    expect(() => buildChatBody(base({ messages: [] }))).toThrow(ModelPolicyError);
    expect(() => buildChatBody(base({ messages: Array.from({ length: 9 }, () => user("x")) }))).toThrow(ModelPolicyError);
    expect(() => buildChatBody(base({ messages: [user("x".repeat(4001))] }))).toThrow(ModelPolicyError);
    expect(() => buildChatBody(base({ messages: [user("x".repeat(4000))] }))).not.toThrow();
  });

  it("enforces the SinhalaLLM model card: no system prompt and no tools", () => {
    const sin = (over: Partial<GenerateRequest>): GenerateRequest => ({ model: "sinhala", purpose: "reply", messages: [user("hi")], ...over });
    expect(() => buildChatBody(sin({ messages: [{ role: "system", content: "be nice" }, user("hi")] }))).toThrow(/system prompt/);
    expect(() => buildChatBody(sin({ tools: [{ type: "function", function: { name: "x", description: "d", parameters: {} } }] }))).toThrow(/tool/);
    const b = buildChatBody(sin({ repeatPenalty: 1.15, topP: 0.9, minP: 0.1 })) as { think?: unknown; options: Record<string, number> };
    expect(b.think).toBeUndefined();
    expect(b.options).toMatchObject({ repeat_penalty: 1.15, top_p: 0.9, min_p: 0.1 });
  });

  it("lets Qwen carry tools and a constrained output format", () => {
    const b = buildChatBody(
      base({ purpose: "tool", tools: [{ type: "function", function: { name: "search_products", description: "d", parameters: { type: "object" } } }], format: { type: "object" } }),
    ) as { tools?: unknown[]; format?: unknown };
    expect(b.tools).toHaveLength(1);
    expect(b.format).toEqual({ type: "object" });
  });
});
