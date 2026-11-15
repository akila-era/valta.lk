import { GatewayError } from "./errors";

/** Provider-neutral model interface. The gateway and the future turn loop depend on these types only, never on a wire format. */

export type JsonSchema = { [k: string]: unknown };

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Opaque provider data (for example a thought signature) that MUST be sent back exactly as received with the next request. */
  providerData?: unknown;
}

export type Part =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; callId: string; name: string; result: unknown };

export interface Message {
  role: "user" | "model" | "tool";
  parts: Part[];
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ModelRequest {
  model: string;
  system?: string;
  messages: Message[];
  tools?: ToolDeclaration[];
  toolMode?: "auto" | "any" | "none";
  allowedTools?: string[];
  maxOutputTokens?: number;
  maxThinkingTokens?: number;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  temperature?: number;
  responseJson?: boolean;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  toolUseTokens: number;
  audioSeconds: number;
}

export const ZERO_USAGE: Usage = Object.freeze({ inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0, toolUseTokens: 0, audioSeconds: 0 });

export type FinishReason = "stop" | "length" | "tool_calls" | "safety" | "other";

export interface ModelResponse {
  text: string;
  toolCalls: ToolCall[];
  finishReason: FinishReason;
  usage: Usage;
  /** False when the provider returned no usage figures: the budget then charges the reserved estimate. */
  usageKnown: boolean;
  /** The model name the provider reports it used (may differ from the requested alias). */
  modelUsed: string;
  latencyMs: number;
  /** Set when the provider blocked the prompt or the answer; no text may be shown as an answer in that case. */
  blocked?: { reason: string };
}

export type ModelStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "done"; response: ModelResponse };

export interface ModelProvider {
  readonly name: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
  /** Failures are thrown as GatewayError (also mid-stream). */
  generateStream(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}

// ----------------------------------------------------------------------------------------------------------------------------
// FakeModelProvider: scripted, deterministic, no network. Used by every gateway test and, later, by the turn-loop tests.
// ----------------------------------------------------------------------------------------------------------------------------

export type FakeStep =
  | { kind: "reply"; text?: string; toolCalls?: ToolCall[]; usage?: Partial<Usage>; usageKnown?: boolean; finishReason?: FinishReason; modelUsed?: string; blocked?: { reason: string }; delayMs?: number }
  | { kind: "error"; error: GatewayError; delayMs?: number }
  /** Streams the given chunks, then either finishes (default) or fails with `failAfter`. */
  | { kind: "stream"; chunks: string[]; usage?: Partial<Usage>; usageKnown?: boolean; failAfter?: GatewayError; modelUsed?: string }
  | { kind: "hang" };

export class FakeModelProvider implements ModelProvider {
  readonly name = "fake";
  /** Every request received, for assertions. Tests only. */
  readonly requests: ModelRequest[] = [];
  private readonly steps: FakeStep[];
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(steps: FakeStep[] = [], opts: { sleep?: (ms: number, signal?: AbortSignal) => Promise<void> } = {}) {
    this.steps = [...steps];
    this.sleep = opts.sleep ?? ((ms, signal) => abortableSleep(ms, signal));
  }

  push(...steps: FakeStep[]): void {
    this.steps.push(...steps);
  }

  private next(request: ModelRequest): FakeStep {
    this.requests.push(request);
    return this.steps.shift() ?? { kind: "reply", text: "ok" };
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const step = this.next(request);
    if (step.kind === "hang") {
      await abortableSleep(3_600_000, request.signal);
      throw new GatewayError("timeout");
    }
    if (step.kind === "error") {
      if (step.delayMs) await this.sleep(step.delayMs, request.signal);
      throw step.error;
    }
    if (step.kind === "stream") {
      return this.collect(step, request);
    }
    if (step.delayMs) await this.sleep(step.delayMs, request.signal);
    const toolCalls = step.toolCalls ?? [];
    return {
      text: step.text ?? "",
      toolCalls,
      finishReason: step.finishReason ?? (toolCalls.length ? "tool_calls" : "stop"),
      usage: { ...ZERO_USAGE, inputTokens: 100, outputTokens: 20, ...(step.usage ?? {}) },
      usageKnown: step.usageKnown ?? true,
      modelUsed: step.modelUsed ?? request.model,
      latencyMs: step.delayMs ?? 1,
      ...(step.blocked ? { blocked: step.blocked } : {}),
    };
  }

  private collect(step: Extract<FakeStep, { kind: "stream" }>, request: ModelRequest): ModelResponse {
    if (step.failAfter) throw step.failAfter;
    return {
      text: step.chunks.join(""),
      toolCalls: [],
      finishReason: "stop",
      usage: { ...ZERO_USAGE, inputTokens: 100, outputTokens: 20, ...(step.usage ?? {}) },
      usageKnown: step.usageKnown ?? true,
      modelUsed: step.modelUsed ?? request.model,
      latencyMs: 1,
    };
  }

  async *generateStream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const step = this.next(request);
    if (step.kind === "hang") {
      await abortableSleep(3_600_000, request.signal);
      throw new GatewayError("timeout");
    }
    if (step.kind === "error") throw step.error;
    if (step.kind === "reply") {
      if (step.delayMs) await this.sleep(step.delayMs, request.signal);
      const toolCalls = step.toolCalls ?? [];
      if (step.text) yield { type: "text", text: step.text };
      for (const call of toolCalls) yield { type: "tool_call", call };
      yield {
        type: "done",
        response: {
          text: step.text ?? "",
          toolCalls,
          finishReason: step.finishReason ?? (toolCalls.length ? "tool_calls" : "stop"),
          usage: { ...ZERO_USAGE, inputTokens: 100, outputTokens: 20, ...(step.usage ?? {}) },
          usageKnown: step.usageKnown ?? true,
          modelUsed: step.modelUsed ?? request.model,
          latencyMs: step.delayMs ?? 1,
          ...(step.blocked ? { blocked: step.blocked } : {}),
        },
      };
      return;
    }
    let text = "";
    for (const c of step.chunks) {
      text += c;
      yield { type: "text", text: c };
    }
    if (step.failAfter) throw step.failAfter;
    yield {
      type: "done",
      response: {
        text,
        toolCalls: [],
        finishReason: "stop",
        usage: { ...ZERO_USAGE, inputTokens: 100, outputTokens: 20, ...(step.usage ?? {}) },
        usageKnown: step.usageKnown ?? true,
        modelUsed: step.modelUsed ?? request.model,
        latencyMs: 1,
      },
    };
  }
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GatewayError("timeout", { code: "aborted" }));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(new GatewayError("timeout", { code: "aborted" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
