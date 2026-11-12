import { z } from "zod";
import { isLoopbackHost } from "../config";
import { buildChatBody, MODELS, type GenerateRequest, type ModelKey } from "./models";

export type OllamaErrorKind = "UNAVAILABLE" | "TIMEOUT" | "ABORTED" | "CLOUD_DISABLED" | "BAD_RESPONSE" | "HTTP";

export class OllamaError extends Error {
  readonly kind: OllamaErrorKind;
  readonly status?: number;
  constructor(kind: OllamaErrorKind, message: string, status?: number) {
    super(message);
    this.name = "OllamaError";
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

const ToolCall = z.looseObject({ function: z.looseObject({ name: z.string(), arguments: z.record(z.string(), z.unknown()).default({}) }) });

const ChatReply = z.looseObject({
  model: z.string(),
  message: z.looseObject({ role: z.string().optional(), content: z.string().default(""), tool_calls: z.array(ToolCall).optional() }),
  done: z.boolean().optional(),
  total_duration: z.number().optional(),
  load_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  prompt_eval_duration: z.number().optional(),
  eval_count: z.number().optional(),
  eval_duration: z.number().optional(),
});

export interface GenerateResult {
  content: string;
  toolCalls: { name: string; arguments: Record<string, unknown> }[];
  loadMs: number;
  promptTokens: number;
  generatedTokens: number;
  tokensPerSecond: number | null;
}

export interface OllamaLike {
  version(signal?: AbortSignal): Promise<string>;
  loadedModels(signal?: AbortSignal): Promise<string[]>;
  generate(req: GenerateRequest, opts?: { signal?: AbortSignal }): Promise<GenerateResult>;
  unload(model: ModelKey, signal?: AbortSignal): Promise<void>;
}

export interface OllamaClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Per-call cap. The scheduler's deadline signal can only shorten it. */
  requestTimeoutMs?: number;
}

/** Talks to the local Ollama only. The constructor refuses a non-loopback address as a second line of defence. */
export class OllamaClient implements OllamaLike {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: OllamaClientOptions) {
    const u = new URL(opts.baseUrl);
    if (!isLoopbackHost(u.hostname)) throw new Error("OllamaClient refuses a non-loopback address.");
    this.base = u.origin;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.requestTimeoutMs ?? 60_000;
  }

  private async request(method: "GET" | "POST", path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: combined,
      });
    } catch (e) {
      if (signal?.aborted) throw new OllamaError("ABORTED", "Request was cancelled.");
      if (timeout.aborted) throw new OllamaError("TIMEOUT", "Ollama did not answer in time.");
      void e;
      throw new OllamaError("UNAVAILABLE", "Ollama is not reachable.");
    }
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 403 && /ollama cloud is disabled/i.test(text)) throw new OllamaError("CLOUD_DISABLED", "A cloud model was requested, but cloud is disabled.", 403);
      throw new OllamaError("HTTP", `Ollama answered HTTP ${res.status}.`, res.status);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new OllamaError("BAD_RESPONSE", "Ollama sent a response that is not JSON.");
    }
  }

  async version(signal?: AbortSignal): Promise<string> {
    const parsed = z.looseObject({ version: z.string() }).safeParse(await this.request("GET", "/api/version", undefined, signal));
    if (!parsed.success) throw new OllamaError("BAD_RESPONSE", "Unexpected /api/version response.");
    return parsed.data.version;
  }

  async loadedModels(signal?: AbortSignal): Promise<string[]> {
    const parsed = z.looseObject({ models: z.array(z.looseObject({ name: z.string() })).default([]) }).safeParse(await this.request("GET", "/api/ps", undefined, signal));
    if (!parsed.success) throw new OllamaError("BAD_RESPONSE", "Unexpected /api/ps response.");
    return parsed.data.models.map((m) => m.name);
  }

  async generate(req: GenerateRequest, opts: { signal?: AbortSignal } = {}): Promise<GenerateResult> {
    const body = buildChatBody(req); // throws ModelPolicyError before anything leaves the process
    const parsed = ChatReply.safeParse(await this.request("POST", "/api/chat", body, opts.signal));
    if (!parsed.success) throw new OllamaError("BAD_RESPONSE", "Unexpected /api/chat response.");
    const r = parsed.data;
    const evalSec = (r.eval_duration ?? 0) / 1e9;
    return {
      content: r.message.content,
      toolCalls: (r.message.tool_calls ?? []).map((t) => ({ name: t.function.name, arguments: t.function.arguments })),
      loadMs: (r.load_duration ?? 0) / 1e6,
      promptTokens: r.prompt_eval_count ?? 0,
      generatedTokens: r.eval_count ?? 0,
      tokensPerSecond: evalSec > 0 && r.eval_count ? r.eval_count / evalSec : null,
    };
  }

  /** Frees the memory of a model now (keep_alive 0). Only allow-listed tags can be named. */
  async unload(model: ModelKey, signal?: AbortSignal): Promise<void> {
    await this.request("POST", "/api/chat", { model: MODELS[model], messages: [], keep_alive: 0, stream: false }, signal);
  }
}
