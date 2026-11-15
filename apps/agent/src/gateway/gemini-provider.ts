import { GatewayError, classifyHttpFailure } from "./errors";
import type { FinishReason, Message, ModelProvider, ModelRequest, ModelResponse, ModelStreamEvent, Part, ToolCall, Usage } from "./provider";
import { ZERO_USAGE } from "./provider";
import { Secret, redactSecrets } from "./secret";
import { toGeminiFunctionDeclaration } from "./schema";

/**
 * Gemini adapter over the `generateContent` wire format, behind the provider-neutral ModelProvider interface.
 *
 * WHAT WAS VERIFIED against Google's documentation on 2026-11-14 (https://aistudio.google.com/api-reference/generate-content, read through a
 * summarising fetch tool): the endpoints `POST /v1beta/models/{model}:generateContent` and `:streamGenerateContent`; the Content shape (role
 * "user" | "model", parts with text, inlineData, functionCall {name, id, args}, functionResponse {name, response, id, parts}); tools[].
 * functionDeclarations[] with parametersJsonSchema; generationConfig names maxOutputTokens, temperature, topP, topK, seed, responseMimeType,
 * thinkingConfig {thinkingBudget, thinkingLevel, includeThoughts}; the response (candidates[].content.parts, finishReason values,
 * promptFeedback.blockReason, usageMetadata promptTokenCount / cachedContentTokenCount / candidatesTokenCount / toolUsePromptTokenCount /
 * thoughtsTokenCount / totalTokenCount, modelVersion); the API key header `x-goog-api-key` and base host (from the Interactions quickstart).
 *
 * UNVERIFIED (the pages could not be read or do not say): the generateContent REQUEST body page itself; toolConfig.functionCallingConfig
 * and its mode values; the role used for function-result turns (this adapter uses "user"); thoughtSignature handling (this adapter replays the
 * raw model part untouched via ToolCall.providerData, which is the safe choice); the `?alt=sse` query for generateContent (verified only
 * for the Interactions endpoint); whether candidatesTokenCount already includes thoughtsTokenCount (they are summed, which can only
 * over-estimate cost); the case/format of thinkingLevel. ALSO: the current docs present the newer Interactions API
 * (`POST /v1beta/interactions`, header `Api-Revision`) as the primary interface. This adapter is one implementation of ModelProvider; an
 * Interactions adapter can be added without touching the gateway. Hand-written fixtures in the tests prove only that this code matches
 * THESE shapes, not that Google's live service accepts them: that needs one approved, capped test call.
 */
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MAX_BODY_BYTES = 4_000_000;
const MAX_ERROR_BODY_BYTES = 65_536;
const MAX_STREAM_BYTES = 2_000_000;

export interface GeminiProviderOptions {
  apiKey: Secret;
  baseUrl: string;
  /** Injected. The adapter never touches the global fetch unless the caller passes it in. */
  fetch: typeof fetch;
  apiVersion?: string;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Request building (pure: exported for tests)
// ---------------------------------------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

const isProviderCallId = (id: string): boolean => !id.startsWith("gen_");

function toObject(v: unknown): Json {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : { result: v };
}

function partToWire(p: Part): Json {
  if (p.type === "text") return { text: p.text };
  if (p.type === "tool_call") {
    // Replay the provider's raw part exactly as received (keeps any thought signature intact).
    if (p.call.providerData && typeof p.call.providerData === "object") return p.call.providerData as Json;
    return { functionCall: { name: p.call.name, args: p.call.args, ...(isProviderCallId(p.call.id) ? { id: p.call.id } : {}) } };
  }
  return { functionResponse: { name: p.name, response: toObject(p.result), ...(isProviderCallId(p.callId) ? { id: p.callId } : {}) } };
}

function messageToWire(m: Message): Json {
  // UNVERIFIED: tool results are sent as a "user" turn.
  return { role: m.role === "model" ? "model" : "user", parts: m.parts.map(partToWire) };
}

export function buildGenerateContentRequest(req: ModelRequest, baseUrl: string, apiVersion = "v1beta", stream = false): { url: string; body: Json } {
  if (!MODEL_ID.test(req.model)) throw new GatewayError("bad_request", { code: "invalid_model_id", retryable: false });
  const body: Json = { contents: req.messages.map(messageToWire) };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  if (req.tools && req.tools.length > 0) {
    body.tools = [{ functionDeclarations: req.tools.map(toGeminiFunctionDeclaration) }];
    if (req.toolMode) {
      // UNVERIFIED field names and mode values (the fetched pages document the Interactions API's tool_choice instead).
      body.toolConfig = {
        functionCallingConfig: { mode: req.toolMode.toUpperCase(), ...(req.allowedTools && req.toolMode === "any" ? { allowedFunctionNames: req.allowedTools } : {}) },
      };
    }
  }
  const gen: Json = {};
  if (req.maxOutputTokens !== undefined) gen.maxOutputTokens = req.maxOutputTokens;
  if (req.temperature !== undefined) gen.temperature = req.temperature;
  if (req.responseJson) gen.responseMimeType = "application/json";
  if (req.thinkingLevel) gen.thinkingConfig = { thinkingLevel: req.thinkingLevel.toUpperCase() };
  else if (req.maxThinkingTokens !== undefined) gen.thinkingConfig = { thinkingBudget: req.maxThinkingTokens };
  if (Object.keys(gen).length > 0) body.generationConfig = gen;
  const path = `/${apiVersion}/models/${req.model}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;
  return { url: `${baseUrl.replace(/\/+$/, "")}${path}`, body };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Response parsing (pure, tolerant: unknown fields are ignored, missing usage is reported as unknown)
// ---------------------------------------------------------------------------------------------------------------------------

const SAFETY_FINISH = new Set(["SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION"]);

function asNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

export function parseUsage(meta: unknown): { usage: Usage; known: boolean } {
  if (!meta || typeof meta !== "object") return { usage: { ...ZERO_USAGE }, known: false };
  const m = meta as Json;
  const known = typeof m.promptTokenCount === "number";
  return {
    known,
    usage: {
      inputTokens: asNum(m.promptTokenCount),
      outputTokens: asNum(m.candidatesTokenCount),
      thinkingTokens: asNum(m.thoughtsTokenCount),
      cachedTokens: asNum(m.cachedContentTokenCount),
      toolUseTokens: asNum(m.toolUsePromptTokenCount),
      audioSeconds: 0,
    },
  };
}

interface Accumulator {
  text: string;
  toolCalls: ToolCall[];
  finish: string | undefined;
  blockReason: string | undefined;
  usage: { usage: Usage; known: boolean };
  modelVersion: string | undefined;
}

export const newAccumulator = (): Accumulator => ({ text: "", toolCalls: [], finish: undefined, blockReason: undefined, usage: { usage: { ...ZERO_USAGE }, known: false }, modelVersion: undefined });

/** Folds one GenerateContentResponse (a whole answer or one stream chunk) into the accumulator and returns what is new. */
export function foldChunk(acc: Accumulator, json: unknown): { text: string; calls: ToolCall[] } {
  const out = { text: "", calls: [] as ToolCall[] };
  if (!json || typeof json !== "object") return out;
  const j = json as Json;
  if (typeof j.modelVersion === "string") acc.modelVersion = j.modelVersion;
  const pf = j.promptFeedback as Json | undefined;
  if (pf && typeof pf.blockReason === "string" && pf.blockReason !== "BLOCK_REASON_UNSPECIFIED") acc.blockReason = pf.blockReason;
  if (j.usageMetadata) acc.usage = parseUsage(j.usageMetadata);
  const cand = Array.isArray(j.candidates) ? (j.candidates[0] as Json | undefined) : undefined;
  if (!cand) return out;
  if (typeof cand.finishReason === "string" && cand.finishReason !== "FINISH_REASON_UNSPECIFIED") acc.finish = cand.finishReason;
  const content = cand.content as Json | undefined;
  const parts = content && Array.isArray(content.parts) ? (content.parts as Json[]) : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if (part.thought === true) continue; // thought summaries are never shown or returned as the answer
    if (typeof part.text === "string") {
      acc.text += part.text;
      out.text += part.text;
    }
    const fc = part.functionCall as Json | undefined;
    if (fc && typeof fc.name === "string") {
      const call: ToolCall = {
        id: typeof fc.id === "string" && fc.id ? fc.id : `gen_${acc.toolCalls.length + 1}`,
        name: fc.name,
        args: fc.args && typeof fc.args === "object" && !Array.isArray(fc.args) ? (fc.args as Record<string, unknown>) : {},
        providerData: part,
      };
      acc.toolCalls.push(call);
      out.calls.push(call);
    }
  }
  return out;
}

export function finishAccumulator(acc: Accumulator, requestedModel: string, latencyMs: number): ModelResponse {
  const blockedByFinish = acc.finish !== undefined && SAFETY_FINISH.has(acc.finish);
  const blockReason = acc.blockReason ?? (blockedByFinish ? acc.finish : undefined);
  let finishReason: FinishReason;
  if (blockReason) finishReason = "safety";
  else if (acc.finish === "MAX_TOKENS") finishReason = "length";
  else if (acc.toolCalls.length > 0) finishReason = "tool_calls";
  else if (acc.finish === "STOP" || acc.finish === undefined) finishReason = "stop";
  else finishReason = "other";
  return {
    // A blocked prompt or answer never yields text that could be shown as an answer.
    text: blockReason ? "" : acc.text,
    toolCalls: blockReason ? [] : acc.toolCalls,
    finishReason,
    usage: acc.usage.usage,
    usageKnown: acc.usage.known,
    modelUsed: acc.modelVersion ?? requestedModel,
    latencyMs,
    ...(blockReason ? { blocked: { reason: blockReason } } : {}),
  };
}

export function parseGenerateContentResponse(json: unknown, requestedModel: string, latencyMs: number): ModelResponse {
  const acc = newAccumulator();
  foldChunk(acc, json);
  return finishAccumulator(acc, requestedModel, latencyMs);
}

// ---------------------------------------------------------------------------------------------------------------------------
// Server-sent events
// ---------------------------------------------------------------------------------------------------------------------------

/** Yields the `data:` payload of each SSE event. Handles events split across chunks (also inside a multi-byte character), CRLF, comments and multi-line data. */
export async function* sseData(body: ReadableStream<Uint8Array>, maxBytes = MAX_STREAM_BYTES): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new GatewayError("internal", { code: "stream_too_large", retryable: false });
      buf += decoder.decode(value, { stream: true });
      for (;;) {
        const m = /\r?\n\r?\n/.exec(buf);
        if (!m) break;
        const raw = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0].length);
        const data = eventData(raw);
        if (data !== undefined) yield data;
      }
    }
    buf += decoder.decode();
    const tail = eventData(buf);
    if (tail !== undefined) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function eventData(raw: string): string | undefined {
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line === "" || line.startsWith(":")) continue;
    if (line.startsWith("data:")) lines.push(line.slice(5).replace(/^ /, ""));
  }
  return lines.length ? lines.join("\n") : undefined;
}

// ---------------------------------------------------------------------------------------------------------------------------
// The provider
// ---------------------------------------------------------------------------------------------------------------------------

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const t = Date.parse(h);
  return Number.isNaN(t) ? undefined : Math.max(0, t - Date.now());
}

export class GeminiProvider implements ModelProvider {
  readonly name = "gemini";
  private readonly apiVersion: string;

  constructor(private readonly o: GeminiProviderOptions) {
    this.apiVersion = o.apiVersion ?? "v1beta";
  }

  private async send(url: string, body: Json, signal: AbortSignal | undefined): Promise<Response> {
    const text = JSON.stringify(body);
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new GatewayError("bad_request", { code: "input_too_large", retryable: false });
    let res: Response;
    try {
      res = await this.o.fetch(url, {
        method: "POST",
        // The key goes ONLY here: never in the URL, the body, a log line or an error.
        headers: { "content-type": "application/json", "x-goog-api-key": this.o.apiKey.reveal() },
        body: text,
        redirect: "error",
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      const aborted = signal?.aborted === true || (e as { name?: string })?.name === "AbortError";
      // The outcome of a call that did not complete is unknown: it may still have been billed.
      throw new GatewayError(aborted ? "timeout" : "unavailable", { code: aborted ? "aborted" : "network", outcomeUnknown: true });
    }
    if (res.ok) return res;
    let bodyCode: string | undefined;
    try {
      const raw = (await res.text()).slice(0, MAX_ERROR_BODY_BYTES);
      const j = JSON.parse(redactSecrets(raw, [this.o.apiKey])) as { error?: { status?: unknown; code?: unknown } };
      bodyCode = typeof j.error?.status === "string" ? j.error.status : undefined;
    } catch {
      bodyCode = undefined;
    }
    const err = classifyHttpFailure(res.status, bodyCode);
    const ra = parseRetryAfter(res.headers.get("retry-after"));
    throw new GatewayError(err.kind, { status: res.status, code: err.code, ...(ra !== undefined ? { retryAfterMs: ra } : {}), outcomeUnknown: false });
  }

  async generate(req: ModelRequest): Promise<ModelResponse> {
    const t0 = Date.now();
    const { url, body } = buildGenerateContentRequest(req, this.o.baseUrl, this.apiVersion, false);
    const res = await this.send(url, body, req.signal);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new GatewayError("internal", { code: "bad_response", retryable: false, outcomeUnknown: true });
    }
    return parseGenerateContentResponse(json, req.model, Date.now() - t0);
  }

  async *generateStream(req: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const t0 = Date.now();
    const { url, body } = buildGenerateContentRequest(req, this.o.baseUrl, this.apiVersion, true);
    const res = await this.send(url, body, req.signal);
    if (!res.body) throw new GatewayError("internal", { code: "no_stream_body", retryable: false, outcomeUnknown: true });
    const acc = newAccumulator();
    try {
      for await (const data of sseData(res.body)) {
        if (data === "[DONE]") continue;
        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          throw new GatewayError("internal", { code: "bad_stream_event", retryable: false, outcomeUnknown: true });
        }
        const delta = foldChunk(acc, json);
        if (delta.text) yield { type: "text", text: delta.text };
        for (const call of delta.calls) yield { type: "tool_call", call };
      }
    } catch (e) {
      if (e instanceof GatewayError) throw e;
      const aborted = req.signal?.aborted === true || (e as { name?: string })?.name === "AbortError";
      throw new GatewayError(aborted ? "timeout" : "unavailable", { code: aborted ? "aborted" : "stream_dropped", outcomeUnknown: true });
    }
    yield { type: "done", response: finishAccumulator(acc, req.model, Date.now() - t0) };
  }
}
