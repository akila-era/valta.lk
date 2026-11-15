import { describe, expect, it } from "vitest";
import { GatewayError } from "../../src/gateway/errors";
import { GeminiProvider, buildGenerateContentRequest, parseGenerateContentResponse, parseUsage, sseData } from "../../src/gateway/gemini-provider";
import type { ModelRequest, ModelStreamEvent } from "../../src/gateway/provider";
import { Secret } from "../../src/gateway/secret";
import { FAKE_KEY, installNoNetworkGuard } from "./gateway-helpers";

installNoNetworkGuard();

// NOTE: every fixture below is HAND-WRITTEN from the field names on Google's reference page (see the comment at the top of
// gemini-provider.ts). They prove this adapter matches THOSE shapes; they do not prove Google's live service accepts the requests.

const BASE = "https://generativelanguage.googleapis.com";
const req = (over: Partial<ModelRequest> = {}): ModelRequest => ({ model: "gemini-3.5-flash-lite", messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }], ...over });

describe("request building", () => {
  it("builds the generateContent URL and a minimal body", () => {
    const { url, body } = buildGenerateContentRequest(req(), BASE);
    expect(url).toBe(`${BASE}/v1beta/models/gemini-3.5-flash-lite:generateContent`);
    expect(body).toEqual({ contents: [{ role: "user", parts: [{ text: "hello" }] }] });
  });
  it("uses the streaming path with alt=sse for streams", () => {
    expect(buildGenerateContentRequest(req(), BASE, "v1beta", true).url).toBe(`${BASE}/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse`);
  });
  it("puts the system prompt in systemInstruction and never in contents", () => {
    const { body } = buildGenerateContentRequest(req({ system: "You are VOLTA's assistant." }), BASE);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "You are VOLTA's assistant." }] });
    expect(JSON.stringify(body.contents)).not.toContain("VOLTA");
  });
  it("declares tools with standard JSON Schema and an optional tool mode", () => {
    const tool = { name: "volta_search_products", description: "Search the VOLTA catalogue.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } };
    const { body } = buildGenerateContentRequest(req({ tools: [tool], toolMode: "any", allowedTools: ["volta_search_products"] }), BASE);
    expect(body.tools).toEqual([{ functionDeclarations: [{ name: "volta_search_products", description: "Search the VOLTA catalogue.", parametersJsonSchema: tool.parameters }] }]);
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["volta_search_products"] } });
  });
  it("allowedFunctionNames is sent only in ANY mode", () => {
    const tool = { name: "t", description: "d", parameters: { type: "object", properties: {} } };
    const { body } = buildGenerateContentRequest(req({ tools: [tool], toolMode: "auto", allowedTools: ["t"] }), BASE);
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: "AUTO" } });
  });
  it("generation limits and thinking go into generationConfig", () => {
    const a = buildGenerateContentRequest(req({ maxOutputTokens: 500, temperature: 0.2, maxThinkingTokens: 0, responseJson: true }), BASE).body;
    expect(a.generationConfig).toEqual({ maxOutputTokens: 500, temperature: 0.2, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } });
    const b = buildGenerateContentRequest(req({ thinkingLevel: "low", maxThinkingTokens: 5 }), BASE).body;
    expect(b.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: "LOW" } });
  });
  it("omits generationConfig entirely when nothing is set", () => {
    expect(buildGenerateContentRequest(req(), BASE).body.generationConfig).toBeUndefined();
  });
  it("Sinhala, Singlish and English text survive byte for byte", () => {
    const texts = ["මට laptop එකක් ඕන", "mata laptop ekak oni, budget eka 200000", "I need a laptop for office work", "ඔයාගේ budget එක කීයක් වගේද? 😀"];
    const { body } = buildGenerateContentRequest(req({ messages: texts.map((t) => ({ role: "user" as const, parts: [{ type: "text" as const, text: t }] })) }), BASE);
    const wire = JSON.stringify(body);
    expect(JSON.parse(wire).contents.map((c: { parts: { text: string }[] }) => c.parts[0]!.text)).toEqual(texts);
    expect(Buffer.from(wire, "utf8").toString("utf8")).toBe(wire);
  });
  it("rejects an invalid model id and an unsupported tool schema with fixed codes", () => {
    expect(() => buildGenerateContentRequest(req({ model: "../models/x" }), BASE)).toThrow(/invalid_model_id/);
    const tool = { name: "t", description: "d", parameters: { type: "object", properties: { a: { anyOf: [] } } } };
    expect(() => buildGenerateContentRequest(req({ tools: [tool] }), BASE)).toThrow(/unsupported_schema/);
  });
  it("replays a model tool call exactly as received (a thought signature stays intact) and sends the result as functionResponse", () => {
    const raw = { functionCall: { name: "volta_search_products", args: { query: "laptop" }, id: "call-77" }, thoughtSignature: "opaque-signature-bytes" };
    const call = { id: "call-77", name: "volta_search_products", args: { query: "laptop" }, providerData: raw };
    const { body } = buildGenerateContentRequest(
      req({
        messages: [
          { role: "user", parts: [{ type: "text", text: "find a laptop" }] },
          { role: "model", parts: [{ type: "tool_call", call }] },
          { role: "tool", parts: [{ type: "tool_result", callId: "call-77", name: "volta_search_products", result: { items: [{ id: "p1", price: 150000 }] } }] },
        ],
      }),
      BASE,
    );
    const contents = body.contents as { role: string; parts: unknown[] }[];
    expect(contents[1]).toEqual({ role: "model", parts: [raw] });
    expect(contents[2]).toEqual({ role: "user", parts: [{ functionResponse: { name: "volta_search_products", response: { items: [{ id: "p1", price: 150000 }] }, id: "call-77" } }] });
  });
  it("wraps a non-object tool result and omits ids the adapter generated itself", () => {
    const { body } = buildGenerateContentRequest(
      req({
        messages: [
          { role: "model", parts: [{ type: "tool_call", call: { id: "gen_1", name: "calculator", args: { expression: "2+2" } } }] },
          { role: "tool", parts: [{ type: "tool_result", callId: "gen_1", name: "calculator", result: 4 }] },
        ],
      }),
      BASE,
    );
    const contents = body.contents as { parts: Record<string, unknown>[] }[];
    expect(contents[0]!.parts[0]).toEqual({ functionCall: { name: "calculator", args: { expression: "2+2" } } });
    expect(contents[1]!.parts[0]).toEqual({ functionResponse: { name: "calculator", response: { result: 4 } } });
  });
});

describe("response parsing", () => {
  const ok = (parts: unknown[], extra: Record<string, unknown> = {}) => ({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }, modelVersion: "gemini-x-001", ...extra });

  it("reads text, usage and the model that answered", () => {
    const r = parseGenerateContentResponse(ok([{ text: "Hello " }, { text: "there" }]), "alias", 12);
    expect(r).toMatchObject({ text: "Hello there", finishReason: "stop", usageKnown: true, modelUsed: "gemini-x-001", latencyMs: 12 });
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 5, thinkingTokens: 0, cachedTokens: 0, toolUseTokens: 0, audioSeconds: 0 });
  });
  it("maps every usageMetadata field", () => {
    const { usage, known } = parseUsage({ promptTokenCount: 100, cachedContentTokenCount: 40, candidatesTokenCount: 30, toolUsePromptTokenCount: 7, thoughtsTokenCount: 20, totalTokenCount: 157 });
    expect(known).toBe(true);
    expect(usage).toMatchObject({ inputTokens: 100, cachedTokens: 40, outputTokens: 30, toolUseTokens: 7, thinkingTokens: 20 });
  });
  it("missing or malformed usage is reported as unknown, not as zero cost", () => {
    expect(parseGenerateContentResponse({ candidates: [{ content: { parts: [{ text: "x" }] }, finishReason: "STOP" }] }, "m", 1).usageKnown).toBe(false);
    expect(parseUsage("nope").known).toBe(false);
    expect(parseUsage({ promptTokenCount: -5, candidatesTokenCount: "x" }).usage.outputTokens).toBe(0);
  });
  it("thought summaries are never part of the answer", () => {
    expect(parseGenerateContentResponse(ok([{ text: "private reasoning", thought: true }, { text: "Answer." }]), "m", 1).text).toBe("Answer.");
  });
  it("a function call becomes a tool call carrying the raw part, and ids are generated when absent", () => {
    const part = { functionCall: { name: "volta_product_details", args: { id: "p9" } }, thoughtSignature: "sig" };
    const r = parseGenerateContentResponse(ok([part, { functionCall: { name: "calculator", args: { expression: "15/100*2400" }, id: "abc" } }]), "m", 1);
    expect(r.finishReason).toBe("tool_calls");
    expect(r.toolCalls).toHaveLength(2);
    expect(r.toolCalls[0]).toMatchObject({ id: "gen_1", name: "volta_product_details", args: { id: "p9" }, providerData: part });
    expect(r.toolCalls[1]).toMatchObject({ id: "abc", name: "calculator" });
  });
  it("arguments that are not an object become an empty object", () => {
    const r = parseGenerateContentResponse(ok([{ functionCall: { name: "t", args: "oops" } }]), "m", 1);
    expect(r.toolCalls[0]!.args).toEqual({});
  });
  const finishCases: [string, string][] = [["MAX_TOKENS", "length"], ["MALFORMED_FUNCTION_CALL", "other"], ["OTHER", "other"], ["UNEXPECTED_TOOL_CALL", "other"], ["STOP", "stop"]];
  for (const [fr, want] of finishCases) {
    it(`finishReason ${fr} maps to ${want}`, () => {
      const r = parseGenerateContentResponse({ candidates: [{ content: { parts: [{ text: "partial" }] }, finishReason: fr }], usageMetadata: { promptTokenCount: 1 } }, "m", 1);
      expect(r.finishReason).toBe(want);
    });
  }
  for (const fr of ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE"]) {
    it(`finishReason ${fr} is a block: no text and no tool calls survive`, () => {
      const r = parseGenerateContentResponse({ candidates: [{ content: { parts: [{ text: "should not be shown" }, { functionCall: { name: "t", args: {} } }] }, finishReason: fr }], usageMetadata: { promptTokenCount: 3 } }, "m", 1);
      expect(r).toMatchObject({ finishReason: "safety", text: "", toolCalls: [], blocked: { reason: fr } });
    });
  }
  it("a blocked prompt (promptFeedback.blockReason, no candidates) is a block", () => {
    const r = parseGenerateContentResponse({ promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 4 } }, "m", 1);
    expect(r).toMatchObject({ finishReason: "safety", text: "", blocked: { reason: "SAFETY" } });
  });
  it("unknown fields and an empty response do not crash", () => {
    expect(parseGenerateContentResponse({ whatever: 1, candidates: [] }, "m", 1)).toMatchObject({ text: "", toolCalls: [], finishReason: "stop" });
    expect(parseGenerateContentResponse(null, "m", 1).text).toBe("");
    expect(parseGenerateContentResponse(ok([{ text: "ok", futureField: { a: 1 } }]), "m", 1).text).toBe("ok");
  });
});

describe("server-sent events", () => {
  const stream = (chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start(c) {
        for (const x of chunks) c.enqueue(x);
        c.close();
      },
    });
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  const collect = async (s: ReadableStream<Uint8Array>): Promise<string[]> => {
    const out: string[] = [];
    for await (const d of sseData(s)) out.push(d);
    return out;
  };

  it("reads events split across chunks, CRLF, comments and multi-line data", async () => {
    const out = await collect(stream([enc("data: {\"a\":1}\n\n:c"), enc("omment\n\ndata: line1\ndata: line2\r\n\r\ndata: {\"b\":2}\n\n")]));
    expect(out).toEqual(['{"a":1}', "line1\nline2", '{"b":2}']);
  });
  it("a final event without a trailing blank line is still delivered", async () => {
    expect(await collect(stream([enc('data: {"tail":true}')]))).toEqual(['{"tail":true}']);
  });
  it("one byte at a time, including inside a multi-byte Sinhala character", async () => {
    const payload = JSON.stringify({ text: "මට laptop එකක් ඕන 😀" });
    const bytes = enc(`data: ${payload}\n\ndata: [DONE]\n\n`);
    const out = await collect(stream(Array.from(bytes, (b) => Uint8Array.of(b))));
    expect(out).toEqual([payload, "[DONE]"]);
    expect(JSON.parse(out[0]!).text).toBe("මට laptop එකක් ඕන 😀");
  });
  it("a stream larger than the cap is refused", async () => {
    const big = enc(`data: ${"x".repeat(2_100_000)}\n\n`);
    await expect(collect(stream([big]))).rejects.toMatchObject({ kind: "internal", code: "stream_too_large" });
  });
});

type FetchCall = { url: string; init: RequestInit };
function fakeFetch(handler: (c: FetchCall) => Response | Promise<Response>): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const c = { url: String(url), init: init ?? {} };
    calls.push(c);
    return handler(c);
  }) as typeof fetch;
  return { fetch: f, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const provider = (f: typeof fetch): GeminiProvider => new GeminiProvider({ apiKey: new Secret(FAKE_KEY), baseUrl: BASE, fetch: f });

describe("GeminiProvider over an injected fetch (no network)", () => {
  it("sends the key only in the x-goog-api-key header: never in the URL or body", async () => {
    const { fetch: f, calls } = fakeFetch(() => json({ candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1 } }));
    const r = await provider(f).generate(req());
    expect(r.text).toBe("hi");
    const c = calls[0]!;
    expect((c.init.headers as Record<string, string>)["x-goog-api-key"]).toBe(FAKE_KEY);
    expect(c.url).not.toContain(FAKE_KEY);
    expect(String(c.init.body)).not.toContain(FAKE_KEY);
    expect(c.init.method).toBe("POST");
    expect(c.init.redirect).toBe("error");
  });
  const failures: [number, string, boolean][] = [
    [400, "bad_request", false],
    [401, "auth", false],
    [403, "auth", false],
    [402, "quota", false],
    [404, "bad_request", false],
    [408, "timeout", true],
    [429, "rate_limit", true],
    [500, "unavailable", true],
    [503, "unavailable", true],
  ];
  for (const [status, kind, retryable] of failures) {
    it(`HTTP ${status} becomes ${kind} (retryable: ${retryable}) and never carries provider text`, async () => {
      const { fetch: f } = fakeFetch(() => json({ error: { code: status, message: `SECRET-PROVIDER-TEXT ${FAKE_KEY}`, status: "SOME_STATUS" } }, status));
      const e = (await provider(f).generate(req()).catch((x) => x)) as GatewayError;
      expect(e).toBeInstanceOf(GatewayError);
      expect(e).toMatchObject({ kind, retryable, status });
      expect(JSON.stringify(e)).not.toContain("SECRET-PROVIDER-TEXT");
      expect(String(e.message) + String(e.stack)).not.toContain(FAKE_KEY);
      expect(String(e.message)).not.toContain("SECRET-PROVIDER-TEXT");
    });
  }
  it("a 400 whose error status names a safety block is safety_blocked", async () => {
    const { fetch: f } = fakeFetch(() => json({ error: { status: "SAFETY" } }, 400));
    await expect(provider(f).generate(req())).rejects.toMatchObject({ kind: "safety_blocked", retryable: false });
  });
  it("Retry-After (seconds and HTTP date) is carried on the error", async () => {
    const a = fakeFetch(() => json({}, 429, { "retry-after": "7" }));
    await expect(provider(a.fetch).generate(req())).rejects.toMatchObject({ kind: "rate_limit", retryAfterMs: 7000 });
    const b = fakeFetch(() => json({}, 429, { "retry-after": new Date(Date.now() + 5000).toUTCString() }));
    const e = (await provider(b.fetch).generate(req()).catch((x) => x)) as GatewayError;
    expect(e.retryAfterMs).toBeGreaterThan(0);
    expect(e.retryAfterMs).toBeLessThanOrEqual(5000);
  });
  it("a network failure is unavailable with an unknown outcome; an abort is a timeout with an unknown outcome", async () => {
    const net = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(provider(net.fetch).generate(req())).rejects.toMatchObject({ kind: "unavailable", outcomeUnknown: true });
    const ctl = new AbortController();
    ctl.abort();
    const ab = fakeFetch(() => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    await expect(provider(ab.fetch).generate(req({ signal: ctl.signal }))).rejects.toMatchObject({ kind: "timeout", outcomeUnknown: true });
  });
  it("a non-JSON success body is an internal error, not a crash", async () => {
    const { fetch: f } = fakeFetch(() => new Response("<html>oops</html>", { status: 200 }));
    await expect(provider(f).generate(req())).rejects.toMatchObject({ kind: "internal", code: "bad_response" });
  });
  it("a body over the size cap is refused before any request is made", async () => {
    const { fetch: f, calls } = fakeFetch(() => json({}));
    const huge = "x".repeat(4_100_000);
    await expect(provider(f).generate(req({ messages: [{ role: "user", parts: [{ type: "text", text: huge }] }] }))).rejects.toMatchObject({ kind: "bad_request", code: "input_too_large" });
    expect(calls).toHaveLength(0);
  });

  const sse = (events: unknown[]): Response =>
    new Response(events.map((e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
  const drain = async (it: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> => {
    const out: ModelStreamEvent[] = [];
    for await (const e of it) out.push(e);
    return out;
  };

  it("streams text deltas and ends with a done event carrying the usage of the last chunk", async () => {
    const { fetch: f, calls } = fakeFetch(() =>
      sse([
        { candidates: [{ content: { parts: [{ text: "ඔයාගේ " }] } }] },
        { candidates: [{ content: { parts: [{ text: "budget එක?" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 6 }, modelVersion: "gemini-x" },
      ]),
    );
    const events = await drain(provider(f).generateStream(req()));
    expect(calls[0]!.url).toContain(":streamGenerateContent?alt=sse");
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text)).toEqual(["ඔයාගේ ", "budget එක?"]);
    const done = events.at(-1)!;
    expect(done.type).toBe("done");
    if (done.type === "done") expect(done.response).toMatchObject({ text: "ඔයාගේ budget එක?", finishReason: "stop", usageKnown: true, modelUsed: "gemini-x" });
  });
  it("streams a tool call", async () => {
    const { fetch: f } = fakeFetch(() => sse([{ candidates: [{ content: { parts: [{ functionCall: { name: "volta_search_products", args: { query: "phone" } } }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 9 } }]));
    const events = await drain(provider(f).generateStream(req()));
    expect(events.some((e) => e.type === "tool_call")).toBe(true);
    const done = events.at(-1)!;
    if (done.type === "done") expect(done.response.finishReason).toBe("tool_calls");
  });
  it("a malformed event fails the stream with a fixed code", async () => {
    const { fetch: f } = fakeFetch(() => sse(["{not json"]));
    await expect(drain(provider(f).generateStream(req()))).rejects.toMatchObject({ kind: "internal", code: "bad_stream_event" });
  });
  it("a stream that stops without a done-able finish still ends with a done event whose usage is unknown", async () => {
    const { fetch: f } = fakeFetch(() => sse([{ candidates: [{ content: { parts: [{ text: "cut off" }] } }] }]));
    const events = await drain(provider(f).generateStream(req()));
    const done = events.at(-1)!;
    expect(done.type).toBe("done");
    if (done.type === "done") expect(done.response.usageKnown).toBe(false);
  });
  it("an HTTP error before the stream starts is classified like any other", async () => {
    const { fetch: f } = fakeFetch(() => json({}, 503));
    await expect(drain(provider(f).generateStream(req()))).rejects.toMatchObject({ kind: "unavailable" });
  });
});
