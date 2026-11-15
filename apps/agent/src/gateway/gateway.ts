import type { BudgetController, BudgetStatus, Category, Directive } from "./budget";
import type { GatewayConfig, LoadedGatewayConfig } from "./config";
import { GatewayError, isGatewayError, userMessage, type ErrorKind, type UserMessage } from "./errors";
import { estimateTokens } from "./prices";
import type { Message, ModelProvider, ModelRequest, ModelResponse, ToolCall, ToolDeclaration } from "./provider";
import { CircuitBreaker, ConcurrencyLimiter, SlidingWindowLimiter, timeoutSignal, withRetry, type BreakerState } from "./resilience";

/**
 * The gateway facade. Every call goes: status gate -> request validation -> rate limits -> circuit breaker -> budget directives ->
 * model selection -> concurrency slot -> [reserve -> provider call with timeout -> settle or release] with bounded retries.
 *
 * Guarantees: (1) when Gemini is disabled, not configured or misconfigured the provider is NEVER called; (2) a failure is never reported as
 * a success (the result is a discriminated union with ok:false and a fixed user-safe message, never provider text); (3) no secret, message
 * text or address reaches a log or a metric; (4) spend is reserved before and settled after every call (see budget.ts for what that does
 * and does not guarantee about the provider's bill).
 */
export type ModelClass = "chat" | "fast" | "voice";

export interface GatewayRequest {
  class?: ModelClass;
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

export interface GatewayContext {
  sessionId?: string;
  category?: Category;
}

export interface GatewayFailure {
  ok: false;
  error: { kind: ErrorKind; code: string; retryable: boolean; retryAfterMs?: number };
  userMessage: UserMessage;
  /** Always true: the caller must degrade honestly (it must not present anything as a generated answer). */
  degraded: true;
  costLkr: number;
  /** Text received before a stream failed. Never to be shown as a complete answer. */
  partialText?: string;
}

export interface GatewaySuccess {
  ok: true;
  response: ModelResponse;
  modelClass: ModelClass;
  modelName: string;
  costLkr: number;
  directives: Directive[];
  historyTrimmed: boolean;
  attempts: number;
}

export type GatewayResult = GatewaySuccess | GatewayFailure;

export type GatewayStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "done"; result: GatewaySuccess }
  | { type: "error"; result: GatewayFailure };

export interface GatewayLogger {
  log(entry: Record<string, string | number | boolean>): void;
}

export interface GatewayDeps {
  config: LoadedGatewayConfig;
  /** Required when the status is "ready". */
  provider?: ModelProvider;
  budget?: BudgetController;
  clock?: () => number;
  logger?: GatewayLogger;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Counters and durations only: never message text, tool arguments, addresses or keys. */
export class GatewayMetrics {
  private readonly counts = new Map<string, number>();
  private readonly durations = new Map<string, { n: number; sumMs: number; maxMs: number }>();

  record(model: string, category: string, status: string, ms: number): void {
    const key = `${model}|${category}|${status}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    const d = this.durations.get(key) ?? { n: 0, sumMs: 0, maxMs: 0 };
    d.n += 1;
    d.sumMs += ms;
    d.maxMs = Math.max(d.maxMs, ms);
    this.durations.set(key, d);
  }

  snapshot(): { key: string; count: number; avgMs: number; maxMs: number }[] {
    return [...this.counts.entries()].map(([key, count]) => {
      const d = this.durations.get(key)!;
      return { key, count, avgMs: d.n ? Math.round(d.sumMs / d.n) : 0, maxMs: d.maxMs };
    });
  }
}

const MAX_MESSAGES = 64;
const MAX_TOOLS = 32;
const MAX_PART_CHARS = 100_000;
const SHORT_HISTORY = 6;

interface Plan {
  cfg: GatewayConfig;
  modelClass: ModelClass;
  model: string;
  category: Category;
  messages: Message[];
  trimmed: boolean;
  directives: Directive[];
  maxOutputTokens: number;
  maxThinkingTokens: number;
  estimateMicro: number;
}

function failure(kind: ErrorKind, code: string, extra: { retryable?: boolean; retryAfterMs?: number; costLkr?: number; partialText?: string } = {}): GatewayFailure {
  return {
    ok: false,
    error: { kind, code, retryable: extra.retryable ?? false, ...(extra.retryAfterMs !== undefined ? { retryAfterMs: extra.retryAfterMs } : {}) },
    userMessage: userMessage(kind),
    degraded: true,
    costLkr: extra.costLkr ?? 0,
    ...(extra.partialText ? { partialText: extra.partialText } : {}),
  };
}

const fromError = (e: unknown, costLkr = 0, partialText?: string): GatewayFailure => {
  const err = isGatewayError(e) ? e : new GatewayError("internal", { retryable: false });
  return failure(err.kind, err.code, { retryable: err.retryable, ...(err.retryAfterMs !== undefined ? { retryAfterMs: err.retryAfterMs } : {}), costLkr, ...(partialText ? { partialText } : {}) });
};

export interface Gateway {
  status(): Promise<{ state: string; detail: string[]; breaker?: BreakerState; inFlight?: number; budget?: BudgetStatus; metrics: ReturnType<GatewayMetrics["snapshot"]> }>;
  generate(request: GatewayRequest, ctx?: GatewayContext): Promise<GatewayResult>;
  generateStream(request: GatewayRequest, ctx?: GatewayContext): AsyncGenerator<GatewayStreamEvent>;
  readonly breaker: CircuitBreaker | undefined;
  readonly metrics: GatewayMetrics;
}

export function createGateway(deps: GatewayDeps): Gateway {
  const clock = deps.clock ?? Date.now;
  const metrics = new GatewayMetrics();
  const loaded = deps.config;
  const cfg = loaded.status.state === "ready" ? loaded.config : undefined;
  const provider = deps.provider;
  const budget = deps.budget;
  const ready = !!(cfg && provider && budget);

  const breaker = cfg ? new CircuitBreaker(cfg.resilience.breakerFailures, cfg.resilience.breakerCooldownMs, clock) : undefined;
  const limiter = cfg ? new ConcurrencyLimiter(cfg.resilience.maxConcurrent, cfg.resilience.maxQueue) : undefined;
  const sessionRate = cfg ? new SlidingWindowLimiter(cfg.rate.perSessionPerMin, 60_000, clock) : undefined;
  const globalRate = cfg ? new SlidingWindowLimiter(cfg.rate.globalPerMin, 60_000, clock, 1) : undefined;

  const log = (entry: Record<string, string | number | boolean>): void => {
    try {
      deps.logger?.log(entry);
    } catch {
      // logging must never break a request
    }
  };

  function gate(): GatewayFailure | undefined {
    const s = loaded.status.state;
    if (s === "disabled") return failure("disabled", "disabled");
    if (s !== "ready" || !ready) return failure("not_configured", s === "ready" ? "no_provider" : s);
    return undefined;
  }

  function validate(req: GatewayRequest): GatewayFailure | undefined {
    const c = cfg!;
    if (!Array.isArray(req.messages) || req.messages.length === 0 || req.messages.length > MAX_MESSAGES) return failure("bad_request", "messages_count");
    if ((req.tools?.length ?? 0) > MAX_TOOLS) return failure("bad_request", "too_many_tools");
    let tokens = estimateTokens(req.system ?? "");
    for (const m of req.messages) {
      if (m.role !== "user" && m.role !== "model" && m.role !== "tool") return failure("bad_request", "role");
      if (!Array.isArray(m.parts) || m.parts.length === 0) return failure("bad_request", "empty_message");
      for (const p of m.parts) {
        const text = p.type === "text" ? p.text : JSON.stringify(p.type === "tool_call" ? p.call.args : p.result);
        if (typeof text !== "string" || text.length > MAX_PART_CHARS) return failure("bad_request", "part_too_large");
        tokens += estimateTokens(text);
      }
    }
    for (const t of req.tools ?? []) tokens += estimateTokens(t.description) + estimateTokens(JSON.stringify(t.parameters));
    if (tokens > c.limits.maxInputTokens) return failure("bad_request", "input_too_large");
    return undefined;
  }

  const trim = (messages: Message[]): Message[] => {
    const kept = messages.slice(-SHORT_HISTORY);
    while (kept.length > 1 && kept[0]!.role !== "user") kept.shift();
    return kept;
  };

  async function plan(req: GatewayRequest, ctx: GatewayContext): Promise<Plan | GatewayFailure> {
    const c = cfg!;
    const category: Category = ctx.category ?? (req.class === "voice" ? "voice" : "text");
    const key = ctx.sessionId ?? "anon";
    if (!sessionRate!.hit(key) || !globalRate!.hit("*")) return failure("rate_limit", "gateway_rate", { retryable: false });
    if (!breaker!.allow()) return failure("circuit_open", "circuit_open");
    const directives = await budget!.directives();
    // A probe slot taken by breaker.allow() must be released if we refuse before calling the provider.
    const refuse = (f: GatewayFailure): GatewayFailure => {
      breaker!.onFailure("bad_request");
      return f;
    };
    if (category === "voice" && directives.includes("disable_voice")) return refuse(failure("budget_exceeded", "voice_disabled"));
    if (category === "search" && directives.includes("disable_search")) return refuse(failure("budget_exceeded", "search_disabled"));
    let modelClass: ModelClass = req.class ?? "chat";
    if (directives.includes("downgrade_model") && modelClass === "chat") modelClass = "fast";
    const model = c.models[modelClass];
    let messages = req.messages;
    let trimmed = false;
    if (directives.includes("shorten_history") && messages.length > SHORT_HISTORY) {
      messages = trim(messages);
      trimmed = true;
    }
    const maxOutputTokens = Math.min(req.maxOutputTokens ?? c.limits.maxOutputTokens, c.limits.maxOutputTokens);
    const maxThinkingTokens = Math.min(req.maxThinkingTokens ?? c.limits.maxThinkingTokens, c.limits.maxThinkingTokens);
    let inputTokens = estimateTokens(req.system ?? "");
    for (const m of messages) for (const p of m.parts) inputTokens += estimateTokens(p.type === "text" ? p.text : JSON.stringify(p.type === "tool_call" ? p.call.args : p.result));
    for (const t of req.tools ?? []) inputTokens += estimateTokens(t.description) + estimateTokens(JSON.stringify(t.parameters));
    const estimate = budget!.estimateMicro(model, { inputTokens, maxOutputTokens, maxThinkingTokens });
    if (estimate === undefined) return refuse(failure("not_configured", "unknown_model_price"));
    return { cfg: c, modelClass, model, category, messages, trimmed, directives, maxOutputTokens, maxThinkingTokens, estimateMicro: estimate };
  }

  const wire = (req: GatewayRequest, p: Plan, signal: AbortSignal): ModelRequest => ({
    model: p.model,
    messages: p.messages,
    maxOutputTokens: p.maxOutputTokens,
    maxThinkingTokens: p.maxThinkingTokens,
    signal,
    ...(req.system !== undefined ? { system: req.system } : {}),
    ...(req.tools ? { tools: req.tools } : {}),
    ...(req.toolMode ? { toolMode: req.toolMode } : {}),
    ...(req.allowedTools ? { allowedTools: req.allowedTools } : {}),
    ...((req.thinkingLevel ?? p.cfg.limits.thinkingLevel) ? { thinkingLevel: (req.thinkingLevel ?? p.cfg.limits.thinkingLevel)! } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.responseJson ? { responseJson: true } : {}),
  });

  async function generate(req: GatewayRequest, ctx: GatewayContext = {}): Promise<GatewayResult> {
    const t0 = clock();
    const refused = gate() ?? validate(req);
    if (refused) {
      metrics.record("-", ctx.category ?? "text", refused.error.kind, 0);
      return refused;
    }
    const p = await plan(req, ctx);
    if ("ok" in p) {
      metrics.record("-", ctx.category ?? "text", p.error.kind, clock() - t0);
      return p;
    }
    let release: (() => void) | undefined;
    try {
      release = await limiter!.acquire(req.signal);
    } catch (e) {
      breaker!.onFailure("bad_request");
      const f = fromError(e);
      metrics.record(p.model, p.category, f.error.kind, clock() - t0);
      return f;
    }
    let attempts = 0;
    let spentLkr = 0;
    try {
      const out = await withRetry(
        async (attempt) => {
          attempts = attempt;
          if (attempt > 1 && !breaker!.allow()) throw new GatewayError("circuit_open", { retryable: false });
          const r = await budget!.reserve({ category: p.category, model: p.model, estimateMicro: p.estimateMicro, at: clock() });
          if (!r.ok) {
            breaker!.onFailure("bad_request");
            throw new GatewayError("budget_exceeded", { code: r.reason, retryable: false });
          }
          const t = timeoutSignal(p.cfg.resilience.timeoutMs, req.signal);
          try {
            let response: ModelResponse;
            try {
              response = await provider!.generate(wire(req, p, t.signal));
            } catch (e) {
              const err = isGatewayError(e) ? e : new GatewayError("internal", { retryable: false, outcomeUnknown: true });
              const effective = t.timedOut() && err.kind !== "timeout" ? new GatewayError("timeout", { code: "deadline", outcomeUnknown: true }) : err;
              // A response the provider does not bill (4xx/5xx) gives the reservation back; an unknown outcome is charged.
              if (effective.outcomeUnknown) await budget!.charge(r.reservationId);
              else await budget!.release(r.reservationId);
              breaker!.onFailure(effective.kind);
              throw effective;
            }
            const settled = await budget!.settleUsage(r.reservationId, p.model, response.usage, response.usageKnown, p.category);
            spentLkr += settled.costLkr;
            breaker!.onSuccess();
            return response;
          } finally {
            t.dispose();
          }
        },
        {
          maxAttempts: p.cfg.resilience.maxAttempts,
          baseMs: p.cfg.resilience.backoffBaseMs,
          maxMs: p.cfg.resilience.backoffMaxMs,
          ...(deps.random ? { random: deps.random } : {}),
          ...(deps.sleep ? { sleep: deps.sleep } : {}),
          ...(req.signal ? { signal: req.signal } : {}),
        },
      );
      metrics.record(p.model, p.category, out.blocked ? "safety_blocked" : "ok", clock() - t0);
      log({ event: "gateway_call", model: p.model, category: p.category, status: out.blocked ? "safety_blocked" : "ok", attempts, ms: clock() - t0 });
      if (out.blocked) return failure("safety_blocked", "provider_block", { costLkr: spentLkr });
      return { ok: true, response: out, modelClass: p.modelClass, modelName: p.model, costLkr: spentLkr, directives: p.directives, historyTrimmed: p.trimmed, attempts };
    } catch (e) {
      const f = fromError(e, spentLkr);
      metrics.record(p.model, p.category, f.error.kind, clock() - t0);
      log({ event: "gateway_call", model: p.model, category: p.category, status: f.error.kind, attempts, ms: clock() - t0 });
      return f;
    } finally {
      release?.();
    }
  }

  async function* generateStream(req: GatewayRequest, ctx: GatewayContext = {}): AsyncGenerator<GatewayStreamEvent> {
    const t0 = clock();
    const refused = gate() ?? validate(req);
    if (refused) {
      metrics.record("-", ctx.category ?? "text", refused.error.kind, 0);
      yield { type: "error", result: refused };
      return;
    }
    const p = await plan(req, ctx);
    if ("ok" in p) {
      metrics.record("-", ctx.category ?? "text", p.error.kind, clock() - t0);
      yield { type: "error", result: p };
      return;
    }
    let release: (() => void) | undefined;
    try {
      release = await limiter!.acquire(req.signal);
    } catch (e) {
      breaker!.onFailure("bad_request");
      yield { type: "error", result: fromError(e) };
      return;
    }
    // Streams are not retried: once output has started, a retry would repeat text the shopper has already seen.
    const r = await budget!.reserve({ category: p.category, model: p.model, estimateMicro: p.estimateMicro, at: clock() });
    if (!r.ok) {
      breaker!.onFailure("bad_request");
      release();
      const f = failure("budget_exceeded", r.reason);
      metrics.record(p.model, p.category, "budget_exceeded", clock() - t0);
      yield { type: "error", result: f };
      return;
    }
    const t = timeoutSignal(p.cfg.resilience.timeoutMs, req.signal);
    let text = "";
    let outTokens = 0;
    const overrunLimit = (p.maxOutputTokens + p.maxThinkingTokens) * 2 + 64;
    try {
      for await (const ev of provider!.generateStream(wire(req, p, t.signal))) {
        if (ev.type === "text") {
          // Check BEFORE appending, so a failure's partialText holds only what was actually delivered to the caller.
          const next = outTokens + estimateTokens(ev.text);
          if (next > overrunLimit) throw new GatewayError("budget_exceeded", { code: "stream_overrun", outcomeUnknown: true, retryable: false });
          if (breaker!.current === "open") throw new GatewayError("circuit_open", { outcomeUnknown: true, retryable: false });
          outTokens = next;
          text += ev.text;
          yield { type: "text", text: ev.text };
        } else if (ev.type === "tool_call") {
          yield { type: "tool_call", call: ev.call };
        } else {
          const settled = await budget!.settleUsage(r.reservationId, p.model, ev.response.usage, ev.response.usageKnown, p.category);
          breaker!.onSuccess();
          metrics.record(p.model, p.category, ev.response.blocked ? "safety_blocked" : "ok", clock() - t0);
          if (ev.response.blocked) {
            yield { type: "error", result: failure("safety_blocked", "provider_block", { costLkr: settled.costLkr, ...(text ? { partialText: text } : {}) }) };
          } else {
            yield { type: "done", result: { ok: true, response: ev.response, modelClass: p.modelClass, modelName: p.model, costLkr: settled.costLkr, directives: p.directives, historyTrimmed: p.trimmed, attempts: 1 } };
          }
          return;
        }
      }
      // The stream ended without a final event: the outcome is unknown.
      await budget!.charge(r.reservationId);
      breaker!.onFailure("unavailable");
      metrics.record(p.model, p.category, "unavailable", clock() - t0);
      yield { type: "error", result: failure("unavailable", "stream_incomplete", { retryable: false, ...(text ? { partialText: text } : {}) }) };
    } catch (e) {
      const err = isGatewayError(e) ? e : new GatewayError("internal", { retryable: false, outcomeUnknown: true });
      const effective = t.timedOut() && err.kind !== "timeout" ? new GatewayError("timeout", { code: "deadline", outcomeUnknown: true }) : err;
      if (effective.outcomeUnknown) await budget!.charge(r.reservationId);
      else await budget!.release(r.reservationId);
      if (effective.kind !== "budget_exceeded" && effective.kind !== "circuit_open") breaker!.onFailure(effective.kind);
      metrics.record(p.model, p.category, effective.kind, clock() - t0);
      yield { type: "error", result: fromError(effective, 0, text || undefined) };
    } finally {
      t.dispose();
      release?.();
    }
  }

  return {
    breaker,
    metrics,
    generate,
    generateStream,
    async status() {
      const s = loaded.status;
      const detail = s.state === "not_configured" ? s.missing.map((m) => `${m} is not set.`) : s.state === "misconfigured" ? s.issues : [];
      if (!ready || !budget || !limiter || !breaker) return { state: s.state, detail, metrics: metrics.snapshot() };
      return { state: s.state, detail, breaker: breaker.current, inFlight: limiter.inFlight, budget: await budget.status(), metrics: metrics.snapshot() };
    },
  };
}
