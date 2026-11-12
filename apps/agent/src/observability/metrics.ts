import { ERROR_CODES } from "../errors";
import type { JobEvent, SchedulerState } from "../queue/scheduler";

/**
 * Operational metrics (M1-E). In-process counters, gauges and bounded latency samples, read through the signed /v1/metrics route.
 *
 * Safe by construction: there is no free-text parameter anywhere. Every counter takes a label from a fixed allow-list (routes,
 * error codes, the ten tool names, model keys, verifier codes) and anything else becomes "(other)", so a model-chosen tool name,
 * a message, an id or a secret can never become a metric label. Only counts and durations are stored.
 * Everything is lost when the process restarts (see the performance report).
 */
export const ROUTE_LABELS = ["/v1/chat", "/v1/chat/stream", "/v1/health", "/v1/metrics", "(unknown)"] as const;
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

export interface MetricsSnapshot {
  startedAt: string;
  uptimeSec: number;
  counters: Record<string, Record<string, number>>;
  gauges: Record<string, number>;
  latencyMs: Record<string, Percentiles>;
  note: string;
}

export type HistogramName = "request" | "queue_wait" | "model_run" | "tool_run";

export class Metrics {
  private readonly counters = new Map<string, Map<string, number>>();
  private readonly hist = new Map<HistogramName, Samples>();
  private readonly gauges = new Map<string, number>();
  private readonly startedAtMs: number;

  constructor(private readonly now: () => number = Date.now) {
    this.startedAtMs = now();
  }

  private bump(name: string, label: string, by = 1): void {
    let m = this.counters.get(name);
    if (!m) this.counters.set(name, (m = new Map()));
    m.set(label, (m.get(label) ?? 0) + by);
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
      note: "Counts and durations only. In-process, reset on restart. Percentiles use the latest 2000 samples per series.",
    };
  }
}
