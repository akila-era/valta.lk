import { describe, expect, it } from "vitest";
import type { ChatPipeline, PipelineEvent, PipelineInput, PipelineResult } from "../../src/http/pipeline";
import { loadLlmFirstConfig } from "../../src/llm/config";
import { createLlmFirst } from "../../src/llm/factory";
import { createLaneWrapper, toPipelineResult } from "../../src/llm/lane";
import type { LlmTurnResult } from "../../src/llm/turn";
import { createMockStack } from "../../src/mock/stack";
import type { FakeStep } from "../../src/gateway/provider";
import { RichTransport, richSite } from "../fixtures/rich-catalogue";
import { installNoNetworkGuard, makeHarness } from "./gateway-helpers";

installNoNetworkGuard();

const SECRET_TEXT = "my-private-message-98765";

const request = (message = SECRET_TEXT, over: Record<string, unknown> = {}): PipelineInput =>
  ({
    requestId: "req_lane_1",
    identity: { kind: "guest" },
    clientIp: "203.0.113.9",
    request: { sessionId: "sess_private_session_id_0123456789", message, contractVersion: "1.2", ...over },
    signal: new AbortController().signal,
    deadlineAt: Date.now() + 30_000,
  }) as unknown as PipelineInput;

const legacyResult = (language = "en"): PipelineResult =>
  ({ language, reply: { text: "legacy answer", source: "template" }, needsNativeReview: language !== "en", cards: [], actions: [], suggestions: [], meta: { model: null, degraded: false, queuedMs: 0 } }) as unknown as PipelineResult;

class Legacy implements ChatPipeline {
  calls = 0;
  constructor(private readonly language = "en") {}
  async run(_i: PipelineInput, _emit: (e: PipelineEvent) => void): Promise<PipelineResult> {
    this.calls++;
    return legacyResult(this.language);
  }
}

const turn = (over: Partial<LlmTurnResult> = {}): LlmTurnResult => ({
  ok: true,
  text: "model answer",
  language: "en",
  needsNativeReview: false,
  source: "llm",
  degraded: false,
  verdict: { verdict: "pass", ok: true, issueCount: 0, codes: {}, severities: {}, categories: {} } as unknown as LlmTurnResult["verdict"],
  firstVerdict: null,
  repairsApplied: [],
  modelCalls: 2,
  costLkr: 0.12,
  modelNames: ["fake-model"],
  tools: [{ name: "calculator", status: "ok" }],
  evidenceCount: 1,
  sources: [],
  proposals: [],
  latencyMs: 800,
  ...over,
});

const tick = () => new Promise<void>((r) => setTimeout(r, 5));
const cfg = (env: Record<string, string>) => loadLlmFirstConfig(env);
const emitted: PipelineEvent[] = [];
const emit = (e: PipelineEvent): void => void emitted.push(e);

describe("mode off", () => {
  it("the factory returns the LEGACY pipeline object itself: nothing wrapped, nothing can call a model", async () => {
    const h = await makeHarness();
    const legacy = new Legacy();
    const stack = createMockStack({ transport: new RichTransport(), site: richSite() });
    expect(createLlmFirst({ legacy, env: {}, gateway: h.gateway, toolDeps: { registry: stack.registry } })).toBe(legacy);
    expect(createLlmFirst({ legacy, env: { AGENT_LLM_FIRST: "off" }, gateway: h.gateway, toolDeps: { registry: stack.registry } })).toBe(legacy);
    expect(createLlmFirst({ legacy, env: { AGENT_LLM_FIRST: "garbage" }, gateway: h.gateway, toolDeps: { registry: stack.registry } })).toBe(legacy);
    expect(h.provider.requests).toHaveLength(0);
  });

  it("the wrapper in off mode delegates and never runs the new lane", async () => {
    const legacy = new Legacy();
    let ran = 0;
    const lane = createLaneWrapper({ legacy, config: cfg({}), runner: async () => (ran++, turn()), ready: () => true });
    const r = await lane.run(request(), emit);
    expect(r).toEqual(legacyResult());
    expect(ran).toBe(0);
    expect(legacy.calls).toBe(1);
  });
});

describe("mode shadow", () => {
  it("serves the legacy answer unchanged and then runs the new lane in the background", async () => {
    const legacy = new Legacy();
    let seenSignal: AbortSignal | undefined;
    const lane = createLaneWrapper({ legacy, config: cfg({ AGENT_LLM_FIRST: "shadow" }), runner: async (i) => ((seenSignal = i.signal), turn()), ready: () => true });
    const r = await lane.run(request(), emit);
    expect(r).toEqual(legacyResult());
    await tick();
    const s = lane.stats();
    expect(s.shadow).toMatchObject({ tried: 1, completed: 1, passed: 1, degraded: 0, errors: 0, languageAgrees: 1 });
    expect(s.toolCalls).toBe(1);
    expect(s.modelCalls).toBe(2);
    expect(s.costLkr).toBeCloseTo(0.12, 6);
    expect(s.latencyBuckets.lt2s).toBe(1);
    expect(seenSignal).toBeDefined();
  });

  it("is not delayed by a slow or hanging shadow run", async () => {
    const legacy = new Legacy();
    const lane = createLaneWrapper({ legacy, config: cfg({ AGENT_LLM_FIRST: "shadow" }), runner: () => new Promise<LlmTurnResult>(() => {}), ready: () => true });
    const started = Date.now();
    const r = await lane.run(request(), emit);
    expect(r).toEqual(legacyResult());
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("a failing shadow run never reaches the customer and is only counted", async () => {
    const legacy = new Legacy();
    const lane = createLaneWrapper({ legacy, config: cfg({ AGENT_LLM_FIRST: "shadow" }), runner: async () => { throw new Error("boom"); }, ready: () => true });
    const r = await lane.run(request(), emit);
    expect(r).toEqual(legacyResult());
    await tick();
    expect(lane.stats().shadow.errors).toBe(1);
  });

  it("skips the shadow run when the gateway is not ready", async () => {
    let ran = 0;
    const lane = createLaneWrapper({ legacy: new Legacy(), config: cfg({ AGENT_LLM_FIRST: "shadow" }), runner: async () => (ran++, turn()), ready: async () => false });
    await lane.run(request(), emit);
    await tick();
    expect(ran).toBe(0);
    expect(lane.stats().shadow.skippedNotReady).toBe(1);
  });

  it("honours the sample rate (0 never, 1 always)", async () => {
    let ran = 0;
    const never = createLaneWrapper({ legacy: new Legacy(), config: cfg({ AGENT_LLM_FIRST: "shadow", AGENT_LLM_SHADOW_SAMPLE: "0" }), runner: async () => (ran++, turn()), ready: () => true });
    for (let i = 0; i < 20; i++) await never.run({ ...request(), requestId: `r${i}` }, emit);
    await tick();
    expect(ran).toBe(0);
    expect(never.stats().shadow.skippedSample).toBe(20);
  });

  it("counts degraded results, repairs and language disagreement, and never stores any text", async () => {
    const legacy = new Legacy("si");
    const results = [turn({ degraded: true, ok: false, failure: { kind: "gateway" } }), turn({ repairsApplied: ["regenerate"] }), turn({ language: "en" })];
    let i = 0;
    const lane = createLaneWrapper({ legacy, config: cfg({ AGENT_LLM_FIRST: "shadow" }), runner: async () => results[i++]!, ready: () => true });
    for (let n = 0; n < 3; n++) await lane.run(request(), emit);
    await tick();
    const s = lane.stats();
    expect(s.shadow).toMatchObject({ tried: 3, degraded: 1, completed: 2, repaired: 1, passed: 1, languageDiffers: 2 });
    expect(s.failures).toEqual({ gateway: 1 });
    const dump = JSON.stringify(s);
    expect(dump).not.toContain(SECRET_TEXT);
    expect(dump).not.toContain("sess_private_session_id");
    expect(dump).not.toContain("203.0.113.9");
    expect(dump).not.toContain("model answer");
  });
});

describe("verifier codes of the first answer are counted (codes only)", () => {
  it("sums the codes that the first check found, even when a repair later passed, and holds no text", async () => {
    const first = { verdict: "repairable", ok: false, issueCount: 3, codes: { ungrounded_price: 2, unprompted_honorific: 1 }, severities: {}, categories: {} } as unknown as LlmTurnResult["verdict"];
    const results = [turn({ firstVerdict: first, repairsApplied: ["regenerate"] }), turn({ firstVerdict: first, repairsApplied: ["autofix"] }), turn()];
    let i = 0;
    const lane = createLaneWrapper({ legacy: new Legacy(), config: cfg({ AGENT_LLM_FIRST: "shadow" }), runner: async () => results[i++]!, ready: () => true });
    for (let n = 0; n < 3; n++) await lane.run(request(), emit);
    await tick();
    const s = lane.stats();
    expect(s.verifierFirstCodes).toEqual({ ungrounded_price: 4, unprompted_honorific: 2 });
    expect(JSON.stringify(s)).not.toContain(SECRET_TEXT);
  });
});

describe("mode on", () => {
  it("is FAIL-CLOSED by default: the legacy pipeline answers and the refusal is counted", async () => {
    const legacy = new Legacy();
    let ran = 0;
    const lane = createLaneWrapper({ legacy, config: cfg({ AGENT_LLM_FIRST: "on" }), runner: async () => (ran++, turn()), ready: () => true });
    const r = await lane.run(request(), emit);
    expect(r).toEqual(legacyResult());
    expect(ran).toBe(0);
    expect(lane.stats().on.refusedNoContractSource).toBe(1);
  });

  it("with the explicit test-only shim the new lane answers", async () => {
    emitted.length = 0;
    const legacy = new Legacy();
    const lane = createLaneWrapper({ legacy, config: cfg({ AGENT_LLM_FIRST: "on", AGENT_LLM_LEGACY_SOURCE_LABEL: "true" }), runner: async () => turn({ text: "from the model" }), ready: () => true });
    const r = await lane.run(request(), emit);
    expect(r.reply.text).toBe("from the model");
    expect(legacy.calls).toBe(0);
    expect(lane.stats().on.served).toBe(1);
    expect(emitted).toEqual([{ type: "text", text: "from the model", source: "qwen", needsNativeReview: false }]);
  });

  it("falls back to the legacy pipeline when the new lane degrades, throws or the gateway is not ready", async () => {
    const env = { AGENT_LLM_FIRST: "on", AGENT_LLM_LEGACY_SOURCE_LABEL: "true" };
    for (const [name, runner, ready] of [
      ["degraded", async () => turn({ degraded: true, ok: false, failure: { kind: "gateway" } }), () => true],
      ["throws", async () => { throw new Error("x"); }, () => true],
      ["not ready", async () => turn(), () => false],
    ] as const) {
      const legacy = new Legacy();
      const lane = createLaneWrapper({ legacy, config: cfg(env), runner, ready });
      const r = await lane.run(request(), emit);
      expect(r, name).toEqual(legacyResult());
      expect(lane.stats().on.fellBack, name).toBe(1);
    }
  });

  it("maps a model result to a pipeline result with cards empty and the review flag kept", () => {
    const p = toPipelineResult(turn({ language: "singlish", text: "කොහොමද", needsNativeReview: true }));
    expect(p.language).toBe("mixed");
    expect(p.needsNativeReview).toBe(true);
    expect(p.cards).toEqual([]);
    expect(p.meta.model).toBe("fake-model");
  });
});

describe("factory end to end with a scripted model (shadow)", () => {
  it("the customer gets the legacy answer, the shadow run uses the real turn loop and the message is sent verbatim", async () => {
    const steps: FakeStep[] = [{ kind: "reply", text: "The capital of France is Paris.", usage: { inputTokens: 400, outputTokens: 20 } }];
    const h = await makeHarness({}, steps);
    const legacy = new Legacy();
    const stack = createMockStack({ transport: new RichTransport(), site: richSite() });
    const lane = createLlmFirst({ legacy, env: { AGENT_LLM_FIRST: "shadow", AGENT_LLM_HISTORY: "memory" }, gateway: h.gateway, toolDeps: { registry: stack.registry } }) as ReturnType<typeof createLaneWrapper>;
    const r = await lane.run(request("What is the capital of France?"), emit);
    expect(r).toEqual(legacyResult());
    for (let i = 0; i < 40 && lane.stats().shadow.completed + lane.stats().shadow.degraded + lane.stats().shadow.errors === 0; i++) await tick();
    expect(lane.stats().shadow).toMatchObject({ tried: 1, completed: 1, errors: 0 });
    const last = h.provider.requests[0]!.messages.at(-1)!;
    expect(JSON.stringify(last)).toContain("What is the capital of France?");
    expect(JSON.stringify(lane.stats())).not.toContain("Paris");
  });
});
