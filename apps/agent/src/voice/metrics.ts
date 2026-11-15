/**
 * Voice processing metrics as a PURE interface. The orchestrator can plug these hooks into the Agent's `Metrics` later; nothing here
 * touches HTTP, files or logs. Only codes, counts and durations are recorded: never audio, never a transcript, never an address,
 * never an identity.
 */
export interface VoiceMetrics {
  /** One finished request: route, HTTP status, and the error code when it failed. */
  request(route: string, status: number, errorCode?: string): void;
  /** Time spent in the speech engine for one job. */
  engineLatency(kind: "stt" | "tts", ms: number): void;
  /** Time a job waited for the worker slot before it started. */
  queueWait(ms: number): void;
  /** A request refused before the engine, by a fixed reason code (for example an audio refusal reason, `rate_limited`, `queue_full`). */
  rejected(reason: string): void;
}

export const noVoiceMetrics: VoiceMetrics = {
  request() {},
  engineLatency() {},
  queueWait() {},
  rejected() {},
};

export interface VoiceMetricsSnapshot {
  requests: Record<string, number>;
  errors: Record<string, number>;
  rejected: Record<string, number>;
  stt: LatencySummary;
  tts: LatencySummary;
  queueWait: LatencySummary;
}

export interface LatencySummary {
  count: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

const MAX_SAMPLES = 500;
/** Keys are fixed code names, but the map is still bounded so a bug upstream can never grow it without limit. */
const MAX_KEYS = 100;

function bump(map: Map<string, number>, key: string): void {
  const k = key.slice(0, 60);
  if (!map.has(k) && map.size >= MAX_KEYS) return;
  map.set(k, (map.get(k) ?? 0) + 1);
}

class Samples {
  private readonly values: number[] = [];
  add(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.values.push(ms);
    if (this.values.length > MAX_SAMPLES) this.values.shift();
  }
  summary(): LatencySummary {
    if (this.values.length === 0) return { count: 0, p50: null, p95: null, max: null };
    const s = [...this.values].sort((a, b) => a - b);
    const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
    return { count: s.length, p50: at(0.5), p95: at(0.95), max: s[s.length - 1]! };
  }
}

/** Bounded in-memory implementation (the last 500 samples per series). */
export class InMemoryVoiceMetrics implements VoiceMetrics {
  private readonly requests = new Map<string, number>();
  private readonly errors = new Map<string, number>();
  private readonly rejects = new Map<string, number>();
  private readonly stt = new Samples();
  private readonly tts = new Samples();
  private readonly wait = new Samples();

  request(route: string, status: number, errorCode?: string): void {
    bump(this.requests, `${route} ${status}`);
    if (errorCode) bump(this.errors, errorCode);
  }
  engineLatency(kind: "stt" | "tts", ms: number): void {
    (kind === "stt" ? this.stt : this.tts).add(ms);
  }
  queueWait(ms: number): void {
    this.wait.add(ms);
  }
  rejected(reason: string): void {
    bump(this.rejects, reason);
  }
  snapshot(): VoiceMetricsSnapshot {
    return {
      requests: Object.fromEntries(this.requests),
      errors: Object.fromEntries(this.errors),
      rejected: Object.fromEntries(this.rejects),
      stt: this.stt.summary(),
      tts: this.tts.summary(),
      queueWait: this.wait.summary(),
    };
  }
}
