import { describe, expect, it } from "vitest";
import { GatewayError } from "../../src/gateway/errors";
import type { FakeStep } from "../../src/gateway/provider";
import { DEFAULT_HISTORY } from "../../src/llm/config";
import { ConversationHistory } from "../../src/llm/history";
import { runLlmTurn, type LlmTurnInput } from "../../src/llm/turn";
import { createMockStack } from "../../src/mock/stack";
import { createLlmTools, LlmToolExecutor, type LlmToolDeps } from "../../src/tools/llm";
import { RichTransport, richSite } from "../fixtures/rich-catalogue";
import { installNoNetworkGuard, makeHarness } from "./gateway-helpers";

/**
 * The turn loop of the LLM-first lane against a SCRIPTED fake model (no network: a guard fails any real call) and the REAL shop tools on the invented fixture
 * catalogue. These tests prove the plumbing and the safety behaviour of the loop (tools, grounding, repair, honest degradation, history, verbatim messages).
 * They prove NOTHING about how well Gemini understands Sinhala or answers general questions: that needs an approved real-model test.
 */
installNoNetworkGuard();

const stack = createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0 });
const toolDeps: LlmToolDeps = { registry: stack.registry };
const newExecutor = () => new LlmToolExecutor({ tools: createLlmTools() });

const input = (message: string, over: Partial<LlmTurnInput> = {}): LlmTurnInput => ({
  requestId: "req_t1",
  sessionKey: "anon|sess_t",
  actor: { kind: "guest" },
  message,
  language: "en",
  honorific: "none",
  ...over,
});

const reply = (text: string): FakeStep => ({ kind: "reply", text, usage: { inputTokens: 500, outputTokens: 60 } });
const call = (name: string, args: Record<string, unknown>, id = "c1"): FakeStep => ({ kind: "reply", toolCalls: [{ id, name, args }], usage: { inputTokens: 500, outputTokens: 20 } });

async function run(steps: FakeStep[], inp: LlmTurnInput, opts: { history?: ConversationHistory; maxModelCalls?: number } = {}) {
  const h = await makeHarness({}, steps);
  const result = await runLlmTurn({ gateway: h.gateway, executor: newExecutor(), toolDeps, ...(opts.history ? { history: opts.history } : {}), ...(opts.maxModelCalls ? { maxModelCalls: opts.maxModelCalls } : {}) }, inp);
  return { result, h };
}

const lastUserText = (h: { provider: { requests: { messages: { role: string; parts: { type: string; text?: string }[] }[] }[] } }, n = 0): string | undefined => {
  const msgs = h.provider.requests[n]!.messages;
  const last = [...msgs].reverse().find((m) => m.role === "user");
  return last?.parts.find((p) => p.type === "text")?.text;
};

describe("general questions go to the model, not to the shop", () => {
  it("'What is the capital of France?' is answered by the model with no tool and no template", async () => {
    const { result, h } = await run([reply("The capital of France is Paris.")], input("What is the capital of France?"));
    expect(result.ok).toBe(true);
    expect(result.source).toBe("llm");
    expect(result.text).toBe("The capital of France is Paris.");
    expect(result.tools).toEqual([]);
    expect(result.modelCalls).toBe(1);
    expect(result.degraded).toBe(false);
    expect(h.provider.requests).toHaveLength(1);
  });

  it("sends the customer's message to the model EXACTLY as received (no rewriting, no normalising)", async () => {
    const odd = "  mama kiwwe eka nemei!!  Kohomada oyata?  ";
    const { h } = await run([reply("Sorry about that. What did you mean?")], input(odd, { language: "singlish" }));
    expect(lastUserText(h)).toBe(odd);
  });

  it("a calculation goes through the calculator tool and the answer matches its result", async () => {
    const { result, h } = await run([call("calculator", { expression: "15% * 2400" }), reply("15% of 2400 is 360.")], input("15% of 2400?"));
    expect(result.ok).toBe(true);
    expect(result.tools).toEqual([{ name: "calculator", status: "ok" }]);
    expect(result.text).toContain("360");
    const second = h.provider.requests[1]!.messages;
    const toolMsg = second.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(JSON.stringify(toolMsg)).toContain("360");
  });
});

describe("shop facts come only from tool results", () => {
  it("a price the shop returned is accepted", async () => {
    const { result } = await run([call("volta_search_products", { query: "Lumen P1" }), reply("The Lumen P1 Smartphone costs Rs. 59,900.")], input("How much is the Lumen P1?"));
    expect(result.ok).toBe(true);
    expect(result.tools[0]).toEqual({ name: "volta_search_products", status: "ok" });
    expect(result.evidenceCount).toBeGreaterThan(0);
    expect(result.verdict?.verdict).toBe("pass");
  });

  it("a made-up price is NOT shown: it is repaired or degraded, never delivered as is", async () => {
    const { result } = await run(
      [call("volta_search_products", { query: "Lumen P1" }), reply("The Lumen P1 Smartphone costs Rs. 49,900."), reply("The Lumen P1 Smartphone costs Rs. 59,900.")],
      input("How much is the Lumen P1?"),
    );
    expect(result.text).not.toContain("49,900");
    expect(result.ok).toBe(true);
    expect(result.text).toContain("59,900");
    expect(result.repairsApplied).toContain("regenerate");
    expect(result.modelCalls).toBe(3);
  });

  it("if the model keeps inventing a price, the customer gets an honest notice, not the invention", async () => {
    const wrong = reply("The Lumen P1 Smartphone costs Rs. 49,900.");
    const { result } = await run([call("volta_search_products", { query: "Lumen P1" }), wrong, wrong, wrong, wrong], input("How much is the Lumen P1?"));
    expect(result.text).not.toContain("49,900");
    if (!result.ok) {
      expect(result.degraded).toBe(true);
      expect(result.source).toBe("notice");
      expect(result.failure?.kind).toBe("unverifiable");
    }
  });
});

describe("customer exclusions are respected", () => {
  it("a recommendation of an excluded brand is not delivered", async () => {
    const { result } = await run(
      [
        call("volta_search_products", { query: "phone" }),
        reply("I recommend the Samsung Test A1 Smartphone."),
        reply("I recommend the Lumen P1 Smartphone, Rs. 59,900."),
      ],
      input("Don't recommend Samsung. Show me a phone.", { exclusions: { brands: ["Samsung"] } }),
    );
    expect(result.text).not.toMatch(/samsung/i);
  });
});

describe("honesty about tools and searches", () => {
  it("tells the model which research tools are unavailable, and a call to one is refused honestly", async () => {
    const { result, h } = await run(
      [call("web_search", { query: "latest official android update" }), reply("I can't search the web right now, so I can't confirm the latest update.")],
      input("Find the latest official Android update."),
    );
    const system = h.provider.requests[0]!.system ?? "";
    expect(system).toMatch(/NOT available right now:.*web_search/);
    expect(result.tools[0]).toMatchObject({ name: "web_search", status: "not_enabled" });
    const toolMsg = JSON.stringify(h.provider.requests[1]!.messages.find((m) => m.role === "tool"));
    expect(toolMsg).toContain("NOT_ENABLED");
    expect(result.ok).toBe(true);
    expect(result.sources).toEqual([]);
  });

  it("an answer that claims a search that never ran is not delivered as is", async () => {
    const claim = reply("I searched the web and found that the latest Android version is 99.");
    const { result } = await run([claim, claim, claim, claim], input("What is the latest Android version?"));
    expect(`${result.ok}:${result.text}`).not.toMatch(/true:.*searched the web/);
  });
});

describe("respectful address (honorifics)", () => {
  it("a title the customer never asked for is removed", async () => {
    const { result } = await run([reply("Thank you, Sir. The Lumen P1 is a good phone.")], input("Tell me about the Lumen P1."));
    expect(result.text).not.toMatch(/\bsir\b/i);
  });

  it("a requested title is allowed once", async () => {
    const { result } = await run([reply("Of course, Sir. Could you tell me roughly what budget you have in mind for the phone?")], input("I need a phone, call me Sir.", { honorific: "sir" }));
    expect(result.ok).toBe(true);
    expect(result.text.match(/\bsir\b/gi)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});

describe("failures are honest, never a canned shopping reply", () => {
  it("when the model is unavailable the result is degraded and carries the gateway's honest message", async () => {
    const steps: FakeStep[] = Array.from({ length: 8 }, () => ({ kind: "error" as const, error: new GatewayError("unavailable") }));
    const { result } = await run(steps, input("hello"));
    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.source).toBe("notice");
    expect(result.failure?.kind).toBe("gateway");
    expect(result.text).toMatch(/unavailable|try again/i);
    expect(result.text).not.toMatch(/laptop|phone|budget/i);
  });

  it("a provider safety block is a notice, not an answer (the gateway already turns it into a failure)", async () => {
    const { result } = await run([{ kind: "reply", text: "blocked text", blocked: { reason: "safety" } }], input("hello"));
    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.source).toBe("notice");
    expect(result.failure?.kind).toBe("gateway");
    expect(result.text).not.toContain("blocked text");
  });

  it("an empty model answer is a notice", async () => {
    const { result } = await run([reply("   ")], input("hello"));
    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe("empty");
  });

  it("a request past its deadline makes no model call at all", async () => {
    const { result, h } = await run([reply("never used")], input("hello", { deadlineAt: Date.now() - 1 }));
    expect(result.failure?.kind).toBe("timeout");
    expect(h.provider.requests).toHaveLength(0);
  });

  it("the number of model calls per turn is capped", async () => {
    const wrong = reply("Rs. 1 for the Lumen P1 Smartphone.");
    const { result, h } = await run([call("volta_search_products", { query: "Lumen P1" }), wrong, wrong, wrong, wrong, wrong, wrong, wrong], input("price?"), { maxModelCalls: 3 });
    expect(h.provider.requests.length).toBeLessThanOrEqual(3);
    expect(result.modelCalls).toBeLessThanOrEqual(3);
  });
});

describe("tool rounds are limited", () => {
  it("after the last allowed round the model is asked to answer without tools", async () => {
    const steps: FakeStep[] = [
      call("calculator", { expression: "1+1" }, "a"),
      call("calculator", { expression: "2+2" }, "b"),
      call("calculator", { expression: "3+3" }, "c"),
      reply("The results were 2, 4 and 6."),
    ];
    const { result, h } = await run(steps, input("add some numbers"));
    expect(result.ok).toBe(true);
    expect(h.provider.requests[3]!.toolMode).toBe("none");
    expect(result.tools).toHaveLength(3);
  });
});

describe("conversation history", () => {
  const history = () => new ConversationHistory({ ...DEFAULT_HISTORY, enabled: true });

  it("earlier turns reach the model, and a correction is sent verbatim", async () => {
    const hist = history();
    const first = await run([reply("What is your budget?")], input("I need a phone."), { history: hist });
    expect(first.result.ok).toBe(true);
    const second = await run([reply("Sorry, I misunderstood. What did you mean?")], input("mama kiwwe eka nemei.", { language: "singlish" }), { history: hist });
    const msgs = second.h.provider.requests[0]!.messages;
    expect(msgs).toHaveLength(3);
    expect(msgs.map((m) => m.role)).toEqual(["user", "model", "user"]);
    expect(lastUserText(second.h)).toBe("mama kiwwe eka nemei.");
    expect(JSON.stringify(msgs[0])).toContain("I need a phone.");
    expect(JSON.stringify(msgs[1])).toContain("What is your budget?");
  });

  it("without history (the default) only the current message is sent", async () => {
    const hist = new ConversationHistory(DEFAULT_HISTORY);
    await run([reply("What is your budget?")], input("I need a phone."), { history: hist });
    const second = await run([reply("Great, I can help with that. Which brand do you prefer?")], input("Around 100000."), { history: hist });
    expect(second.h.provider.requests[0]!.messages).toHaveLength(1);
  });

  it("a failed turn is not stored as if it were an answer", async () => {
    const hist = history();
    const steps: FakeStep[] = Array.from({ length: 8 }, () => ({ kind: "error" as const, error: new GatewayError("unavailable") }));
    await run(steps, input("hello"), { history: hist });
    expect(hist.window("anon|sess_t")).toEqual([]);
  });
});

describe("Sinhala passes through untouched", () => {
  it("a Sinhala message reaches the model byte for byte and a Sinhala answer is not rejected for its script or digits", async () => {
    const message = "ෆෝන් එකක් ඕනේ, රුපියල් 60000ක් විතර";
    const answer = "අවශ්‍ය නම් Lumen P1 බලන්න. ඔබේ සීමාව රුපියල් 60000ක් නිසා එය හොඳ තේරීමක්.";
    const { result, h } = await run([reply(answer)], input(message, { language: "si" }));
    expect(lastUserText(h)).toBe(message);
    expect(Buffer.from(lastUserText(h)!, "utf8").equals(Buffer.from(message, "utf8"))).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.needsNativeReview).toBe(true);
    expect(result.language).toBe("si");
  });
});

describe("what the result may and may not contain", () => {
  it("the result holds counts and codes: the customer's text is only in the answer field", async () => {
    const secret = "my-private-phrase-12345";
    const { result } = await run([reply("Thanks for your message. How can I help you with your shopping today?")], input(`hello ${secret}`));
    const { text, ...rest } = result;
    expect(text).toBe("Thanks for your message. How can I help you with your shopping today?");
    expect(JSON.stringify(rest)).not.toContain(secret);
  });
});
