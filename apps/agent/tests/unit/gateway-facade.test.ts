import { describe, expect, it } from "vitest";
import { GatewayError } from "../../src/gateway/errors";
import type { GatewayResult, GatewayStreamEvent } from "../../src/gateway/gateway";
import type { Message } from "../../src/gateway/provider";
import { BASE_ENV, CHAT_MODEL, FAKE_KEY, FAST_MODEL, installNoNetworkGuard, makeHarness, networkAttempts, userText } from "./gateway-helpers";
import { buildGateway } from "../../src/gateway/factory";

installNoNetworkGuard();

const ask = (text = "hello", extra: Partial<Parameters<Awaited<ReturnType<typeof makeHarness>>["gateway"]["generate"]>[0]> = {}) => ({ messages: [userText(text)], ...extra });
const FAST_BACKOFF = { GATEWAY_BACKOFF_BASE_MS: "10", GATEWAY_BACKOFF_MAX_MS: "20" };
const kindOf = (r: GatewayResult): string => (r.ok ? "ok" : r.error.kind);
const drain = async (it: AsyncGenerator<GatewayStreamEvent>): Promise<GatewayStreamEvent[]> => {
  const out: GatewayStreamEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
};

describe("status gates: the provider is never called unless the gateway is ready", () => {
  it("disabled, not configured and misconfigured all answer with a typed failure and make no provider or network call", async () => {
    for (const [env, kind] of [[{}, "disabled"], [{ GEMINI_ENABLED: "true" }, "not_configured"], [{ ...BASE_ENV, GEMINI_API_BASE_URL: "http://nope.example.com" }, "not_configured"]] as const) {
      const { gateway } = await buildGateway(env);
      const r = await gateway.generate(ask());
      expect(kindOf(r)).toBe(kind);
      if (!r.ok) {
        expect(r.degraded).toBe(true);
        expect(r.userMessage.needsNativeReview).toBe(true);
      }
      const events = await drain(gateway.generateStream(ask()));
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("error");
    }
    expect(networkAttempts.count).toBe(0);
  });
  it("status() reports the state and never the key", async () => {
    const h = await makeHarness();
    const s = await h.gateway.status();
    expect(s.state).toBe("ready");
    expect(s.breaker).toBe("closed");
    expect(s.budget?.limits).toMatchObject({ softLkr: 2400, hardLkr: 2700, reserveLkr: 300 });
    expect(JSON.stringify(s)).not.toContain(FAKE_KEY);
    expect((await (await buildGateway({})).gateway.status()).state).toBe("disabled");
  });
  it("unverified prices refuse the call before the provider is reached", async () => {
    const h = await makeHarness({ GEMINI_ALLOW_UNVERIFIED_PRICES: "false" });
    const r = await h.gateway.generate(ask());
    expect(r).toMatchObject({ ok: false, error: { kind: "budget_exceeded", code: "unverified_prices" } });
    expect(h.provider.requests).toHaveLength(0);
  });
});

describe("request validation (no provider call on a bad request)", () => {
  it("rejects empty, oversized and malformed requests with a fixed code", async () => {
    const h = await makeHarness({ GEMINI_MAX_INPUT_TOKENS: "256" });
    const bad: [string, Parameters<typeof h.gateway.generate>[0]][] = [
      ["messages_count", { messages: [] }],
      ["messages_count", { messages: Array.from({ length: 65 }, () => userText("x")) }],
      ["role", { messages: [{ role: "system" as never, parts: [{ type: "text", text: "x" }] }] }],
      ["empty_message", { messages: [{ role: "user", parts: [] }] }],
      ["part_too_large", { messages: [userText("x".repeat(100_001))] }],
      ["input_too_large", { messages: [userText("අ".repeat(300))] }],
      ["too_many_tools", { messages: [userText("x")], tools: Array.from({ length: 33 }, (_, i) => ({ name: `t${i}`, description: "d", parameters: { type: "object", properties: {} } })) }],
    ];
    for (const [code, req] of bad) {
      const r = await h.gateway.generate(req);
      expect(r).toMatchObject({ ok: false, error: { kind: "bad_request", code } });
    }
    expect(h.provider.requests).toHaveLength(0);
  });
});

describe("successful calls", () => {
  it("passes Sinhala, Singlish and English through to the provider unchanged and returns the answer with its cost", async () => {
    const texts = ["මට laptop එකක් ඕන", "mata laptop ekak oni", "I need a laptop"];
    const h = await makeHarness({}, [{ kind: "reply", text: "ඔයාගේ budget එක කීයක්ද?", usage: { inputTokens: 300, outputTokens: 40 } }]);
    const messages: Message[] = texts.map(userText);
    const r = await h.gateway.generate({ system: "Be brief.", messages });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.response.text).toBe("ඔයාගේ budget එක කීයක්ද?");
      expect(r.costLkr).toBeGreaterThan(0);
      expect(r.modelName).toBe(CHAT_MODEL);
      expect(r.attempts).toBe(1);
    }
    expect(h.provider.requests[0]!.messages).toEqual(messages);
    expect(h.provider.requests[0]!.system).toBe("Be brief.");
    const st = await h.budget.status();
    expect(st.spentLkr.total).toBeCloseTo(r.ok ? r.costLkr : -1, 6);
    expect(st.reservedLkr).toBe(0);
  });
  it("applies the configured caps to the request it sends", async () => {
    const h = await makeHarness({ GEMINI_MAX_OUTPUT_TOKENS: "200", GEMINI_MAX_THINKING_TOKENS: "50" });
    await h.gateway.generate(ask("hi", { maxOutputTokens: 5000, maxThinkingTokens: 9000 }));
    expect(h.provider.requests[0]).toMatchObject({ model: CHAT_MODEL, maxOutputTokens: 200, maxThinkingTokens: 50 });
  });
  it("selects the model by class and falls back to the main model when none is configured", async () => {
    const h = await makeHarness({ GEMINI_VOICE_MODEL: "gemini-3.5-transcribe" });
    await h.gateway.generate(ask("a", { class: "chat" }));
    await h.gateway.generate(ask("b", { class: "fast" }), { sessionId: "s2" });
    await h.gateway.generate(ask("c", { class: "voice" }), { sessionId: "s3" });
    expect(h.provider.requests.map((r) => r.model)).toEqual([CHAT_MODEL, FAST_MODEL, "gemini-3.5-transcribe"]);
  });
  it("a tool-call round trip: the model asks for a tool, the application answers, the model finishes", async () => {
    const call = { id: "gen_1", name: "volta_search_products", args: { query: "laptop" } };
    const h = await makeHarness({}, [{ kind: "reply", toolCalls: [call] }, { kind: "reply", text: "Here are two laptops." }]);
    const tool = { name: "volta_search_products", description: "Search the catalogue.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } };
    const first = await h.gateway.generate(ask("find a laptop", { tools: [tool], toolMode: "auto" }));
    expect(first.ok && first.response.toolCalls).toEqual([call]);
    expect(first.ok && first.response.finishReason).toBe("tool_calls");
    const history: Message[] = [userText("find a laptop"), { role: "model", parts: [{ type: "tool_call", call }] }, { role: "tool", parts: [{ type: "tool_result", callId: "gen_1", name: "volta_search_products", result: { items: [] } }] }];
    const second = await h.gateway.generate({ messages: history, tools: [tool] });
    expect(second.ok && second.response.text).toBe("Here are two laptops.");
    expect(h.provider.requests[1]!.messages).toEqual(history);
    expect(h.provider.requests[1]!.tools).toEqual([tool]);
  });
});

describe("failures are never reported as successes", () => {
  it("a provider failure becomes ok:false with a fixed message, never provider text", async () => {
    const h = await makeHarness({ GATEWAY_MAX_ATTEMPTS: "1" }, [{ kind: "error", error: new GatewayError("auth", { status: 401 }) }]);
    const r = await h.gateway.generate(ask());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.degraded).toBe(true);
      expect(r.error.kind).toBe("auth");
      expect(r.userMessage.en).not.toMatch(/401|auth|key|api/i);
    }
  });
  it("an unexpected exception from the provider is contained as an internal error", async () => {
    const h = await makeHarness({ GATEWAY_MAX_ATTEMPTS: "1" });
    h.provider.generate = async () => {
      throw new Error("PROVIDER-SENTINEL-TEXT " + FAKE_KEY);
    };
    const r = await h.gateway.generate(ask());
    expect(kindOf(r)).toBe("internal");
    expect(JSON.stringify(r)).not.toContain("PROVIDER-SENTINEL-TEXT");
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(h.logs)).not.toContain("PROVIDER-SENTINEL-TEXT");
  });
  it("a provider block is ok:false, safety_blocked, with no answer text", async () => {
    const h = await makeHarness({}, [{ kind: "reply", text: "blocked content", blocked: { reason: "SAFETY" }, finishReason: "safety" }]);
    const r = await h.gateway.generate(ask());
    expect(r).toMatchObject({ ok: false, error: { kind: "safety_blocked" } });
    expect(JSON.stringify(r)).not.toContain("blocked content");
  });
});

describe("retries, billing of failures and the circuit breaker", () => {
  it("retries rate limits and 5xx, then succeeds; failed attempts that the provider does not bill are released", async () => {
    const h = await makeHarness(FAST_BACKOFF, [
      { kind: "error", error: new GatewayError("rate_limit", { status: 429 }) },
      { kind: "error", error: new GatewayError("unavailable", { status: 503 }) },
      { kind: "reply", text: "ok", usage: { inputTokens: 100, outputTokens: 10 } },
    ]);
    const r = await h.gateway.generate(ask());
    expect(r.ok && r.attempts).toBe(3);
    const st = await h.budget.status();
    expect(st.reservedLkr).toBe(0);
    expect(st.spentLkr.total).toBeCloseTo(r.ok ? r.costLkr : -1, 6); // only the successful attempt was charged
  });
  it("does not retry auth, bad request or safety failures", async () => {
    for (const kind of ["auth", "bad_request", "safety_blocked", "quota"] as const) {
      const h = await makeHarness(FAST_BACKOFF, [{ kind: "error", error: new GatewayError(kind) }, { kind: "reply", text: "should not be reached" }]);
      const r = await h.gateway.generate(ask());
      expect(kindOf(r)).toBe(kind);
      expect(h.provider.requests).toHaveLength(1);
    }
  });
  it("a call with an UNKNOWN outcome (timeout) is charged at the reserved amount; a clean 5xx is not", async () => {
    const t = await makeHarness({ GATEWAY_MAX_ATTEMPTS: "1" }, [{ kind: "error", error: new GatewayError("timeout") }]);
    await t.gateway.generate(ask());
    expect((await t.budget.status()).spentLkr.total).toBeGreaterThan(0.5);
    const u = await makeHarness({ GATEWAY_MAX_ATTEMPTS: "1" }, [{ kind: "error", error: new GatewayError("unavailable", { status: 503 }) }]);
    await u.gateway.generate(ask());
    expect((await u.budget.status()).spentLkr.total).toBe(0);
  });
  it("retries are charged: two unknown-outcome timeouts then a success cost three reservations' worth in total", async () => {
    const h = await makeHarness(FAST_BACKOFF, [{ kind: "error", error: new GatewayError("timeout") }, { kind: "error", error: new GatewayError("timeout") }, { kind: "reply", text: "ok", usage: { inputTokens: 10, outputTokens: 5 } }]);
    const r = await h.gateway.generate(ask());
    expect(r.ok && r.attempts).toBe(3);
    const spent = (await h.budget.status()).spentLkr.total;
    expect(spent).toBeGreaterThan(1.5); // two charged estimates (about LKR 1 each) plus the real cost
  });
  it("a hung provider is cut off by the request deadline and reported as a timeout", async () => {
    const h = await makeHarness({ GATEWAY_REQUEST_TIMEOUT_MS: "1000", GATEWAY_MAX_ATTEMPTS: "1" }, [{ kind: "hang" }]);
    const t0 = Date.now();
    const r = await h.gateway.generate(ask());
    expect(kindOf(r)).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(3000);
    expect((await h.budget.status()).reservedLkr).toBe(0);
  });
  it("opens the circuit after consecutive failures, refuses without calling the provider, then probes once after the cool-down", async () => {
    const h = await makeHarness({ GATEWAY_BREAKER_FAILURES: "2", GATEWAY_MAX_ATTEMPTS: "1", GATEWAY_BREAKER_COOLDOWN_MS: "5000" }, [
      { kind: "error", error: new GatewayError("unavailable") },
      { kind: "error", error: new GatewayError("unavailable") },
      { kind: "reply", text: "back" },
    ]);
    await h.gateway.generate(ask("1"), { sessionId: "a" });
    await h.gateway.generate(ask("2"), { sessionId: "b" });
    expect((await h.gateway.status()).breaker).toBe("open");
    const refused = await h.gateway.generate(ask("3"), { sessionId: "c" });
    expect(kindOf(refused)).toBe("circuit_open");
    expect(h.provider.requests).toHaveLength(2);
    h.advance(5_001);
    const probe = await h.gateway.generate(ask("4"), { sessionId: "d" });
    expect(probe.ok).toBe(true);
    expect((await h.gateway.status()).breaker).toBe("closed");
  });
});

describe("budget enforcement through the gateway", () => {
  const tiny = { GATEWAY_BUDGET_MONTHLY_LKR: "30", GATEWAY_BUDGET_SOFT_LKR: "24", GATEWAY_BUDGET_HARD_LKR: "27", GATEWAY_BUDGET_RESERVE_LKR: "3" };
  const steps = Array.from({ length: 60 }, () => ({ kind: "reply" as const, text: "ok", usage: { inputTokens: 100, outputTokens: 800 } }));

  it("stops calling the provider when the hard limit is reached, and degrades honestly", async () => {
    const h = await makeHarness({ ...tiny, GATEWAY_RATE_GLOBAL_PER_MIN: "1000", GATEWAY_RATE_SESSION_PER_MIN: "1000" }, steps);
    let firstRefusal = -1;
    for (let i = 0; i < 50; i++) {
      const r = await h.gateway.generate(ask(`m${i}`), { sessionId: `s${i}` });
      if (!r.ok && firstRefusal < 0) {
        firstRefusal = i;
        expect(r).toMatchObject({ error: { kind: "budget_exceeded", code: "hard_limit" }, degraded: true });
      }
    }
    expect(firstRefusal).toBeGreaterThan(5);
    expect(h.provider.requests.length).toBe(firstRefusal);
    const st = await h.budget.status();
    expect(st.spentLkr.total).toBeLessThanOrEqual(27.5);
  });
  it("past the soft limit the chat model is downgraded to the fast model", async () => {
    const h = await makeHarness({ ...tiny, GATEWAY_RATE_GLOBAL_PER_MIN: "1000", GATEWAY_RATE_SESSION_PER_MIN: "1000" }, steps);
    for (let i = 0; i < 40; i++) await h.gateway.generate(ask(`m${i}`), { sessionId: `s${i}` });
    const models = h.provider.requests.map((r) => r.model);
    expect(models[0]).toBe(CHAT_MODEL);
    expect(models).toContain(FAST_MODEL);
    // With this tiny budget the DAILY soft rule (about LKR 2.8 a day) triggers the downgrade after a few calls; once it starts it stays.
    const first = models.indexOf(FAST_MODEL);
    expect(first).toBeGreaterThan(0);
    expect(models.slice(first).every((m) => m === FAST_MODEL)).toBe(true);
  });
  it("with every directive active: model downgraded, history shortened, voice and search refused", async () => {
    const h = await makeHarness({ GATEWAY_BUDGET_SOFT_LKR: "0" });
    const long: Message[] = Array.from({ length: 11 }, (_, i) => (i % 2 === 0 ? userText(`u${i}`) : { role: "model" as const, parts: [{ type: "text" as const, text: `m${i}` }] }));
    const r = await h.gateway.generate({ messages: long });
    expect(r.ok && r.historyTrimmed).toBe(true);
    expect(r.ok && r.modelClass).toBe("fast");
    const sent = h.provider.requests[0]!;
    expect(sent.model).toBe(FAST_MODEL);
    expect(sent.messages.length).toBeLessThanOrEqual(6);
    expect(sent.messages[0]!.role).toBe("user");
    expect(sent.messages.at(-1)).toEqual(long.at(-1));
    const voice = await h.gateway.generate(ask("v", { class: "voice" }), { sessionId: "v" });
    expect(voice).toMatchObject({ ok: false, error: { kind: "budget_exceeded", code: "voice_disabled" } });
    const search = await h.gateway.generate(ask("s"), { sessionId: "s", category: "search" });
    expect(search).toMatchObject({ ok: false, error: { kind: "budget_exceeded", code: "search_disabled" } });
    expect(h.provider.requests).toHaveLength(1);
  });
  it("a corrupt or unwritable ledger refuses every call (fail closed)", async () => {
    const { FileBudgetStore } = await import("../../src/gateway/budget-store");
    const store = new FileBudgetStore("/virtual/ledger.json", {
      readFile: async () => "{broken",
      writeFile: async () => {},
      rename: async () => {},
      mkdir: async () => {},
    });
    const h = await makeHarness({}, [{ kind: "reply", text: "should not be reached" }], { store });
    const r = await h.gateway.generate(ask());
    expect(r).toMatchObject({ ok: false, error: { kind: "budget_exceeded", code: "ledger_unavailable" } });
    expect(h.provider.requests).toHaveLength(0);
  });
});

describe("rate limits and concurrency", () => {
  it("limits calls per session per minute and recovers as the window slides", async () => {
    const h = await makeHarness({ GATEWAY_RATE_SESSION_PER_MIN: "2" });
    expect([kindOf(await h.gateway.generate(ask(), { sessionId: "a" })), kindOf(await h.gateway.generate(ask(), { sessionId: "a" })), kindOf(await h.gateway.generate(ask(), { sessionId: "a" }))]).toEqual(["ok", "ok", "rate_limit"]);
    expect(kindOf(await h.gateway.generate(ask(), { sessionId: "b" }))).toBe("ok");
    h.advance(61_000);
    expect(kindOf(await h.gateway.generate(ask(), { sessionId: "a" }))).toBe("ok");
  });
  it("limits the whole gateway per minute", async () => {
    const h = await makeHarness({ GATEWAY_RATE_GLOBAL_PER_MIN: "3" });
    const kinds: string[] = [];
    for (let i = 0; i < 5; i++) kinds.push(kindOf(await h.gateway.generate(ask(), { sessionId: `s${i}` })));
    expect(kinds).toEqual(["ok", "ok", "ok", "rate_limit", "rate_limit"]);
  });
  it("with one slot and no queue, a concurrent call is refused at once instead of waiting", async () => {
    const h = await makeHarness({ GATEWAY_MAX_CONCURRENT: "1", GATEWAY_MAX_QUEUE: "0", GATEWAY_MAX_ATTEMPTS: "1" }, [{ kind: "hang" }, { kind: "reply", text: "second" }]);
    const ctl = new AbortController();
    const first = h.gateway.generate(ask("1", { signal: ctl.signal }), { sessionId: "a" });
    await new Promise((r) => setTimeout(r, 30));
    const second = await h.gateway.generate(ask("2"), { sessionId: "b" });
    expect(second).toMatchObject({ ok: false, error: { kind: "rate_limit", code: "queue_full" } });
    ctl.abort();
    expect(kindOf(await first)).toBe("timeout");
    expect((await h.gateway.status()).inFlight).toBe(0);
  });
});

describe("streaming", () => {
  it("streams text then a done event with the cost", async () => {
    const h = await makeHarness({}, [{ kind: "stream", chunks: ["ඔයාගේ ", "budget එක?"], usage: { inputTokens: 200, outputTokens: 30 } }]);
    const events = await drain(h.gateway.generateStream(ask()));
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text)).toEqual(["ඔයාගේ ", "budget එක?"]);
    const last = events.at(-1)!;
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.result.costLkr).toBeGreaterThan(0);
    expect((await h.budget.status()).reservedLkr).toBe(0);
  });
  it("a stream that fails part-way reports the text already delivered as partial (never as a complete answer) and charges the reservation", async () => {
    const h = await makeHarness({}, [{ kind: "stream", chunks: ["partial ", "text"], failAfter: new GatewayError("unavailable", { outcomeUnknown: true }) }]);
    const events = await drain(h.gateway.generateStream(ask()));
    const last = events.at(-1)!;
    expect(last.type).toBe("error");
    if (last.type === "error") {
      expect(last.result.partialText).toBe("partial text");
      expect(last.result.degraded).toBe(true);
    }
    expect((await h.budget.status()).spentLkr.total).toBeGreaterThan(0.5);
  });
  it("a provider that streams far more than allowed is cut off as a budget overrun", async () => {
    const h = await makeHarness({ GEMINI_MAX_OUTPUT_TOKENS: "16" }, [{ kind: "stream", chunks: ["x".repeat(30), "y".repeat(600), "z"] }]);
    const events = await drain(h.gateway.generateStream(ask()));
    const last = events.at(-1)!;
    expect(last.type).toBe("error");
    if (last.type === "error") {
      expect(last.result.error).toMatchObject({ kind: "budget_exceeded", code: "stream_overrun" });
      expect(last.result.partialText).toBe("x".repeat(30));
    }
  });
  it("the breaker opening mid-stream stops the stream with the partial text", async () => {
    const h = await makeHarness({ GATEWAY_BREAKER_FAILURES: "1" }, [{ kind: "stream", chunks: ["one ", "two ", "three"] }]);
    const seen: GatewayStreamEvent[] = [];
    for await (const e of h.gateway.generateStream(ask())) {
      seen.push(e);
      if (e.type === "text" && seen.length === 1) h.gateway.breaker!.onFailure("unavailable");
    }
    const last = seen.at(-1)!;
    expect(last.type).toBe("error");
    if (last.type === "error") {
      expect(last.result.error.kind).toBe("circuit_open");
      expect(last.result.partialText).toBe("one ");
    }
  });
  it("budget refusal and a provider block are reported as error events", async () => {
    const h = await makeHarness({ GATEWAY_BUDGET_SOFT_LKR: "0" });
    const refused = await drain(h.gateway.generateStream(ask("v", { class: "voice" }), { sessionId: "v" }));
    expect(refused[0]).toMatchObject({ type: "error", result: { error: { code: "voice_disabled" } } });
    const b = await makeHarness({}, [{ kind: "reply", text: "x", blocked: { reason: "SAFETY" } }]);
    const events = await drain(b.gateway.generateStream(ask()));
    expect(events.at(-1)).toMatchObject({ type: "error", result: { error: { kind: "safety_blocked" } } });
  });
});

describe("telemetry and secrets", () => {
  it("metrics, logs and status hold counters and codes only: never message text, tool arguments or the key", async () => {
    const SENTINEL = "SENTINEL-CUSTOMER-TEXT-98765";
    const h = await makeHarness({ GATEWAY_MAX_ATTEMPTS: "1" }, [{ kind: "reply", text: `echo ${SENTINEL}` }, { kind: "error", error: new GatewayError("unavailable") }]);
    const a = await h.gateway.generate({ system: SENTINEL, messages: [userText(SENTINEL)] }, { sessionId: "x" });
    const b = await h.gateway.generate({ messages: [userText(SENTINEL)] }, { sessionId: "y" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    const dump = JSON.stringify({ metrics: h.gateway.metrics.snapshot(), logs: h.logs, status: await h.gateway.status(), failure: b });
    expect(dump).not.toContain(SENTINEL);
    expect(dump).not.toContain(FAKE_KEY);
    expect(h.gateway.metrics.snapshot().length).toBeGreaterThan(0);
    for (const entry of h.logs) expect(Object.keys(entry).every((k) => ["event", "model", "category", "status", "attempts", "ms"].includes(k))).toBe(true);
  });
  it("the key never appears in any result, event or error the gateway produces", async () => {
    const h = await makeHarness({ GATEWAY_MAX_ATTEMPTS: "1" }, [{ kind: "error", error: new GatewayError("auth", { status: 401 }) }, { kind: "reply", text: "fine" }, { kind: "stream", chunks: ["a"] }]);
    const all = [await h.gateway.generate(ask(), { sessionId: "1" }), await h.gateway.generate(ask(), { sessionId: "2" }), await drain(h.gateway.generateStream(ask(), { sessionId: "3" }))];
    expect(JSON.stringify(all)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(h.logs)).not.toContain(FAKE_KEY);
  });
  it("makes no real network call anywhere in these tests", () => {
    expect(networkAttempts.count).toBe(0);
  });
});
