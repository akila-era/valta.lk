import { ERROR_CODES } from "../errors";
import type { BrowserFailure } from "../browser/tools";
import type { JobEvent, SchedulerState } from "../queue/scheduler";
import type { VoiceMetrics } from "../voice/metrics";

/**
 * Operational metrics (M1-E). In-process counters, gauges and bounded latency samples, read through the signed /v1/metrics route.
 *
 * Safe by construction: there is no free-text parameter anywhere. Every counter takes a label from a fixed allow-list (routes,
 * error codes, the ten tool names, model keys, verifier codes) and anything else becomes "(other)", so a model-chosen tool name,
 * a message, an id or a secret can never become a metric label. Only counts and durations are stored.
 * Everything is lost when the process restarts (see the performance report).
 */
export const ROUTE_LABELS = ["/v1/chat", "/v1/chat/stream", "/v1/health", "/v1/metrics", "/v1/voice/transcribe", "/v1/voice/speak", "/v1/browser/confirm", "/v1/browser/cancel", "(unknown)"] as const;
export const TOOL_LABELS = ["search_products", "get_product_details", "compare_products", "check_stock", "get_accessories", "get_cart", "add_to_cart", "update_cart_quantity", "remove_from_cart", "get_order_status"] as const;
export const TOOL_STATUS_LABELS = ["ok", "error", "invalid_args", "unknown_tool", "forbidden", "duplicate", "too_many", "timeout"] as const;
export const MODEL_LABELS = ["qwen", "sinhala"] as const;
export const VERIFIER_LABELS = [
  "card_without_source",
  "unknown_product",
  "product_mismatch",
  "variant_mismatch",
  "stock_mismatch",
  "accessory_unauthorized",
  "comparison_mismatch",
  "cart_mismatch",
  "order_unauthorized",
  "order_mismatch",
  "action_unauthorized",
  "link_not_approved",
  "reply_unsupported",
  "sensitive_leak",
  "review_flag_missing",
  "contract_version",
] as const;
export const JOB_OUTCOME_LABELS = ["ok", "error", "deadline", "aborted"] as const;
/** Which limiter refused a request (fixed names; never a key, address or identity). */
export const LIMITER_LABELS = ["ip", "session", "identity", "new_session", "shop_ceiling", "concurrency", "cooldown", "auth_failures", "challenge"] as const;
export type LimiterName = (typeof LIMITER_LABELS)[number];
/** Browser tool names and failure reasons (kept in step with browser/tools.ts by the type check below). */
export const BROWSER_TOOL_LABELS = ["browser.open_page", "browser.get_page_state", "browser.find_elements", "browser.click", "browser.type_text", "browser.select", "browser.search", "browser.scroll", "browser.go_back", "browser.go_forward", "browser.take_screenshot", "browser.close_session", "browser.confirm", "browser.cancel"] as const;
export const BROWSER_FAILURE_LABELS = [
  "invalid_arguments", "unknown_tool", "blocked_url", "blocked_redirect", "blocked_resource", "not_your_session", "session_expired", "too_many_sessions",
  "step_limit", "unknown_element", "element_disabled", "confirmation_required", "confirmation_invalid", "refused_financial", "refused_sensitive_field",
  "timeout", "page_error", "driver_error", "injection_signal", "disabled",
] as const satisfies readonly (BrowserFailure | "injection_signal" | "disabled")[];

type Allowed = readonly string[];
const OTHER = "(other)";
const pick = (allowed: Allowed, v: string | number | undefined): string => (v !== undefined && allowed.includes(String(v)) ? String(v) : OTHER);

export type Percentiles = { count: number; max: number; mean: number; p50: number; p95: number; p99: number };

class Samples {
  private readonly ring: number[] = [];
  private next = 0;
  private count = 0;
  private sum = 0;
  private max = 0;
  constructor(private readonly cap = 2_000) {}
  add(ms: number): void {
    const v = Number.isFinite(ms) && ms >= 0 ? ms : 0;
    this.count++;
    this.sum += v;
    if (v > this.max) this.max = v;
    if (this.ring.length < this.cap) this.ring.push(v);
    else {
      this.ring[this.next] = v;
      this.next = (this.next + 1) % this.cap;
    }
  }
  summary(): Percentiles {
    const s = [...this.ring].sort((a, b) => a - b);
    const q = (p: number) => (s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!);
    return { count: this.count, max: this.max, mean: this.count ? this.sum / this.count : 0, p50: q(50), p95: q(95), p99: q(99) };
  }
}

/** The compact shape alerts read (documented in docs/VOLTA_AI_MONITORING_REPORT.md). Every field is a count, a ratio or a duration. */
export interface MetricsSummary {
  requests: { chat: number; errors5xx: number; rateLimited429: number; unauthorized401: number };
  /** Share of chat requests that were refused 429 / failed 5xx (0 when there were no requests). */
  ratios: { rateLimited: number; serverErrors: number };
  queue: { depth: number; running: boolean; rejectedFullTotal: number };
  newSessions: { lastHour: number; shopCeiling: number; ceilingUsedPct: number; perCallerLimit: number };
  models: Record<string, { requests: number; promptTokens: number; generatedTokens: number; runMs: Percentiles | null }>;
  tokens: { prompt: number; generated: number; referencePricePerMillionTokens: number; referenceCost: number };
  tools: { calls: number; failures: number };
  browser: { enabled: boolean; calls: number; failures: number };
  voice: { requests: number; errors: number; rejected: number };
  rateLimitRefusals: Record<string, number>;
  verifierRejections: number;
}

export interface MetricsSnapshot {
  startedAt: string;
  uptimeSec: number;
  counters: Record<string, Record<string, number>>;
  gauges: Record<string, number>;
  latencyMs: Record<string, Percentiles>;
  summary: MetricsSummary;
  note: string;
}

export type HistogramName = "request" | "queue_wait" | "model_run" | "model_run_qwen" | "model_run_sinhala" | "tool_run" | "browser_task" | "voice_stt" | "voice_tts" | "voice_queue_wait";

export interface MetricsOptions {
  now?: () => number;
  /** Reference price per million tokens, for a "what would this cost elsewhere" figure only. Default 0 (no invented cost): the Agent is self-hosted. */
  referencePricePerMillionTokens?: number;
}

/** Labels that are not from a fixed allow-list (voice outcome codes) must still look like codes and are capped per counter. */
const CODE_LABEL = /^[a-z0-9_.-]{1,40}$/i;
const MAX_FREE_LABELS = 40;

export class Metrics {
  private readonly counters = new Map<string, Map<string, number>>();
  private readonly hist = new Map<HistogramName, Samples>();
  private readonly gauges = new Map<string, number>();
  private readonly startedAtMs: number;

  private readonly now: () => number;
  private readonly refPrice: number;
  private browserEnabled = false;

  constructor(nowOrOpts: (() => number) | MetricsOptions = Date.now) {
    const o: MetricsOptions = typeof nowOrOpts === "function" ? { now: nowOrOpts } : nowOrOpts;
    this.now = o.now ?? Date.now;
    const price = o.referencePricePerMillionTokens;
    this.refPrice = typeof price === "number" && Number.isFinite(price) && price > 0 ? price : 0;
    this.startedAtMs = this.now();
  }

  /** A code-shaped label that is not on a fixed list: kept only while the counter has room, otherwise "(other)". */
  private codeLabel(name: string, label: string): string {
    if (!CODE_LABEL.test(label)) return OTHER;
    const m = this.counters.get(name);
    return m && !m.has(label) && m.size >= MAX_FREE_LABELS ? OTHER : label;
  }

  private bump(name: string, label: string, by = 1): void {
    let m = this.counters.get(name);
    if (!m) this.counters.set(name, (m = new Map()));
    m.set(label, (m.get(label) ?? 0) + by);
  }

  setBrowserEnabled(on: boolean): void {
    this.browserEnabled = on;
  }

  /** A limiter refused a request: which one (fixed names only). */
  rateLimited(limiter: string): void {
    this.bump("rate_limit_refusals_total", pick(LIMITER_LABELS, limiter));
  }

  /** Tokens and wall time of ONE model call (Ollama's own counts). Counts and durations only; never the prompt or the answer. */
  modelCall(model: string, promptTokens: number, generatedTokens: number, ms: number): void {
    const m = pick(MODEL_LABELS, model);
    const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
    this.bump("tokens_prompt_total", m, n(promptTokens));
    this.bump("tokens_generated_total", m, n(generatedTokens));
    this.bump("model_calls_total", m);
    this.bump("inference_ms_total", m, n(ms));
    if (m === "qwen") this.observe("model_run_qwen", ms);
    else if (m === "sinhala") this.observe("model_run_sinhala", ms);
  }

  /** One browser tool call: tool name and outcome (a failure reason code or "ok"). */
  browserTool(tool: string, outcome: string): void {
    this.bump("browser_calls_total", pick(BROWSER_TOOL_LABELS, tool));
    if (outcome !== "ok") this.bump("browser_failures_total", pick(BROWSER_FAILURE_LABELS, outcome));
  }

  browserTaskMs(ms: number): void {
    this.observe("browser_task", ms);
  }

  /** The adapter that plugs the voice module's hooks into these counters. */
  voiceHook(): VoiceMetrics {
    return {
      request: (route, status, errorCode) => {
        this.bump("voice_requests_total", `${pick(ROUTE_LABELS, route)} ${Math.trunc(status) || 0}`);
        if (errorCode) this.bump("voice_errors_total", this.codeLabel("voice_errors_total", errorCode));
      },
      engineLatency: (kind, ms) => this.observe(kind === "stt" ? "voice_stt" : "voice_tts", ms),
      queueWait: (ms) => this.observe("voice_queue_wait", ms),
      rejected: (reason) => this.bump("voice_rejected_total", this.codeLabel("voice_rejected_total", reason)),
    };
  }

  private observe(name: HistogramName, ms: number): void {
    let s = this.hist.get(name);
    if (!s) this.hist.set(name, (s = new Samples()));
    s.add(ms);
  }

  request(route: string, status: number, latencyMs: number, errorCode?: string): void {
    this.bump("requests_total", `${pick(ROUTE_LABELS, route)} ${Math.trunc(status) || 0}`);
    this.observe("request", latencyMs);
    if (errorCode) {
      this.bump("errors_total", pick(ERROR_CODES, errorCode));
      if (errorCode === "VALIDATION_FAILED" || errorCode === "INVALID_REQUEST" || errorCode === "PAYLOAD_TOO_LARGE" || errorCode === "UNSUPPORTED_MEDIA_TYPE") this.bump("validation_failures_total", errorCode);
      if (errorCode === "RATE_LIMITED" || errorCode === "CHALLENGE_REQUIRED") this.bump("rate_limit_rejections_total", errorCode);
    }
  }

  tool(tool: string, status: string): void {
    this.bump("tool_calls_total", pick(TOOL_LABELS, tool));
    if (status !== "ok") this.bump("tool_failures_total", `${pick(TOOL_LABELS, tool)} ${pick(TOOL_STATUS_LABELS, status)}`);
  }

  /** Time to validate and run one turn's tool calls (reads in parallel, proposals in order). */
  toolBatchMs(ms: number): void {
    this.observe("tool_run", ms);
  }

  verifierRejected(code: string): void {
    this.bump("verifier_rejections_total", pick(VERIFIER_LABELS, code));
  }

  /** Fed by the scheduler for every job that ran: model selection, switching, queue wait and run time. */
  job(e: JobEvent): void {
    this.bump("model_requests_total", pick(MODEL_LABELS, e.model));
    this.bump("jobs_total", pick(JOB_OUTCOME_LABELS, e.outcome));
    if (e.switched) this.bump("model_switches_total", `${pick(MODEL_LABELS, e.from ?? undefined)}->${pick(MODEL_LABELS, e.model)}`);
    this.observe("queue_wait", e.queuedMs);
    this.observe("model_run", e.runMs);
  }

  setGauge(name: string, v: number): void {
    this.gauges.set(name, v);
  }

  /** Copies the scheduler's current numbers (depth, running, cumulative rejections and expiries) into gauges. */
  fromScheduler(st: SchedulerState): void {
    this.setGauge("queue_depth", st.depth);
    this.setGauge("queue_running", st.running ? 1 : 0);
    this.setGauge("queue_rejected_full_total", st.rejectedFull);
    this.setGauge("queue_expired_total", st.expired);
  }

  private sum(name: string): number {
    let t = 0;
    for (const v of this.counters.get(name)?.values() ?? []) t += v;
    return t;
  }

  private summarise(latencyMs: Record<string, Percentiles>): MetricsSummary {
    const reqs = this.counters.get("requests_total") ?? new Map<string, number>();
    const chat = [...reqs].filter(([l]) => l.startsWith("/v1/chat"));
    const chatTotal = chat.reduce((a, [, v]) => a + v, 0);
    const byStatus = (pred: (st: number) => boolean) => chat.filter(([l]) => pred(Number(l.split(" ")[1]))).reduce((a, [, v]) => a + v, 0);
    const e5 = byStatus((st) => st >= 500);
    const r429 = byStatus((st) => st === 429);
    const ratio = (x: number) => (chatTotal > 0 ? x / chatTotal : 0);
    const models: MetricsSummary["models"] = {};
    for (const m of MODEL_LABELS) {
      const requests = this.counters.get("model_calls_total")?.get(m) ?? this.counters.get("model_requests_total")?.get(m) ?? 0;
      models[m] = { requests, promptTokens: this.counters.get("tokens_prompt_total")?.get(m) ?? 0, generatedTokens: this.counters.get("tokens_generated_total")?.get(m) ?? 0, runMs: latencyMs[`model_run_${m}`] ?? null };
    }
    const prompt = this.sum("tokens_prompt_total");
    const generated = this.sum("tokens_generated_total");
    const ceiling = this.gauges.get("new_sessions_shop_ceiling") ?? 0;
    const lastHour = this.gauges.get("new_sessions_last_hour") ?? 0;
    return {
      requests: { chat: chatTotal, errors5xx: e5, rateLimited429: r429, unauthorized401: [...reqs].filter(([l]) => l.endsWith(" 401")).reduce((a, [, v]) => a + v, 0) },
      ratios: { rateLimited: ratio(r429), serverErrors: ratio(e5) },
      queue: { depth: this.gauges.get("queue_depth") ?? 0, running: (this.gauges.get("queue_running") ?? 0) === 1, rejectedFullTotal: this.gauges.get("queue_rejected_full_total") ?? 0 },
      newSessions: { lastHour, shopCeiling: ceiling, ceilingUsedPct: ceiling > 0 ? Math.round((lastHour / ceiling) * 1000) / 10 : 0, perCallerLimit: this.gauges.get("new_sessions_per_caller_limit") ?? 0 },
      models,
      tokens: { prompt, generated, referencePricePerMillionTokens: this.refPrice, referenceCost: ((prompt + generated) / 1_000_000) * this.refPrice },
      tools: { calls: this.sum("tool_calls_total"), failures: this.sum("tool_failures_total") },
      browser: { enabled: this.browserEnabled, calls: this.sum("browser_calls_total"), failures: this.sum("browser_failures_total") },
      voice: { requests: this.sum("voice_requests_total"), errors: this.sum("voice_errors_total"), rejected: this.sum("voice_rejected_total") },
      rateLimitRefusals: Object.fromEntries(this.counters.get("rate_limit_refusals_total") ?? []),
      verifierRejections: this.sum("verifier_rejections_total"),
    };
  }

  snapshot(): MetricsSnapshot {
    const counters: Record<string, Record<string, number>> = {};
    for (const [n, m] of this.counters) counters[n] = Object.fromEntries(m);
    const latencyMs: Record<string, Percentiles> = {};
    for (const [n, s] of this.hist) latencyMs[n] = s.summary();
    return {
      startedAt: new Date(this.startedAtMs).toISOString(),
      uptimeSec: Math.max(0, Math.round((this.now() - this.startedAtMs) / 1000)),
      counters,
      gauges: Object.fromEntries(this.gauges),
      latencyMs,
      summary: this.summarise(latencyMs),
      note: "Counts and durations only. In-process, reset on restart. Percentiles use the latest 2000 samples per series.",
    };
  }
}
