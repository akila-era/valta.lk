import type { ChatPipeline, PipelineEvent, PipelineInput, PipelineResult } from "../http/pipeline";
import type { LlmFirstConfig } from "./config";
import type { LlmTurnResult } from "./turn";

/**
 * The feature switch between the existing production pipeline and the LLM-first lane.
 *
 *  off     the existing pipeline answers; this wrapper adds nothing (the factory returns the legacy pipeline itself).
 *  shadow  the existing pipeline answers the customer, UNCHANGED and not delayed; afterwards the new lane runs on the same request in the background and only
 *          COUNTS (verdict, repairs, tools, cost, latency, language agreement). No message text, answer text, address or session id is stored or logged.
 *  on      the new lane answers, and falls back to the existing pipeline whenever it degrades. FAIL-CLOSED: until contract 1.4 has a reply source for model text,
 *          "on" refuses to serve (the legacy pipeline answers and the refusal is counted) unless the explicit test-only shim AGENT_LLM_LEGACY_SOURCE_LABEL=true is set,
 *          which labels model text with the one source value that exists today. That label is NOT truthful, so the shim must never be used for customers.
 */
export interface LaneSnapshot {
  mode: string;
  requests: number;
  shadow: { tried: number; skippedNotReady: number; skippedSample: number; completed: number; degraded: number; errors: number; passed: number; repaired: number; languageAgrees: number; languageDiffers: number };
  on: { served: number; fellBack: number; refusedNoContractSource: number };
  failures: Record<string, number>;
  /** Counts per fixed failure code (for example gateway:unknown_model_price). Codes are fixed strings: never text, ids or addresses. */
  failureCodes: Record<string, number>;
  toolCalls: number;
  modelCalls: number;
  costLkr: number;
  latencyBuckets: { lt2s: number; lt5s: number; lt10s: number; gte10s: number };
}

export class LaneStats {
  private s: LaneSnapshot;
  constructor(mode: string) {
    this.s = {
      mode,
      requests: 0,
      shadow: { tried: 0, skippedNotReady: 0, skippedSample: 0, completed: 0, degraded: 0, errors: 0, passed: 0, repaired: 0, languageAgrees: 0, languageDiffers: 0 },
      on: { served: 0, fellBack: 0, refusedNoContractSource: 0 },
      failures: {},
      failureCodes: {},
      toolCalls: 0,
      modelCalls: 0,
      costLkr: 0,
      latencyBuckets: { lt2s: 0, lt5s: 0, lt10s: 0, gte10s: 0 },
    };
  }
  get raw(): LaneSnapshot {
    return this.s;
  }
  recordResult(r: LlmTurnResult): void {
    this.s.toolCalls += r.tools.length;
    this.s.modelCalls += r.modelCalls;
    this.s.costLkr = Math.round((this.s.costLkr + r.costLkr) * 1e6) / 1e6;
    const b = this.s.latencyBuckets;
    if (r.latencyMs < 2_000) b.lt2s++;
    else if (r.latencyMs < 5_000) b.lt5s++;
    else if (r.latencyMs < 10_000) b.lt10s++;
    else b.gte10s++;
    if (r.failure) this.s.failures[r.failure.kind] = (this.s.failures[r.failure.kind] ?? 0) + 1;
    if (r.failure?.code) {
      const key = `${r.failure.kind}:${r.failure.code}`;
      this.s.failureCodes[key] = (this.s.failureCodes[key] ?? 0) + 1;
    }
  }
  snapshot(): LaneSnapshot {
    return structuredClone(this.s);
  }
}

export interface LlmFirstPipeline extends ChatPipeline {
  stats(): LaneSnapshot;
}

export interface LaneDeps {
  legacy: ChatPipeline;
  config: LlmFirstConfig;
  /** Runs the new lane for one request. It must never throw into the customer path (errors are caught here as well). */
  runner: (input: PipelineInput) => Promise<LlmTurnResult>;
  /** True only when the gateway is enabled and configured: a shadow run is skipped otherwise (it would cost nothing but also prove nothing). */
  ready: () => boolean | Promise<boolean>;
  stats?: LaneStats;
  now?: () => number;
  /** The shadow run gets its own timeout: the customer's request is already over. */
  shadowTimeoutMs?: number;
}

function sampled(requestId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  let h = 2166136261;
  for (let i = 0; i < requestId.length; i++) {
    h ^= requestId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 1000 < Math.floor(rate * 1000);
}

const normaliseLanguage = (l: string): string => (l === "singlish" ? "mixed" : l);

export function toPipelineResult(r: LlmTurnResult): PipelineResult {
  const language = r.language === "singlish" ? "mixed" : r.language;
  return {
    language,
    // Test-only shim: "qwen" is the one existing source value that says "model text". It is NOT accurate for another model (contract 1.4 must add one).
    reply: { text: r.text, source: "qwen" },
    needsNativeReview: r.needsNativeReview,
    cards: [],
    actions: [],
    suggestions: [],
    meta: { model: r.modelNames[0] ?? null, degraded: r.degraded, queuedMs: 0 },
  } as PipelineResult;
}

export function createLaneWrapper(deps: LaneDeps): LlmFirstPipeline {
  const stats = deps.stats ?? new LaneStats(deps.config.mode);
  const now = deps.now ?? Date.now;
  const shadowTimeoutMs = deps.shadowTimeoutMs ?? 30_000;
  const s = stats.raw;

  async function runShadow(input: PipelineInput, legacyLanguage: string): Promise<void> {
    if (!(await deps.ready())) {
      s.shadow.skippedNotReady++;
      return;
    }
    if (!sampled(input.requestId, deps.config.shadowSample)) {
      s.shadow.skippedSample++;
      return;
    }
    s.shadow.tried++;
    try {
      const shadowInput: PipelineInput = { ...input, signal: AbortSignal.timeout(shadowTimeoutMs), deadlineAt: now() + shadowTimeoutMs };
      const r = await deps.runner(shadowInput);
      stats.recordResult(r);
      if (r.degraded) s.shadow.degraded++;
      else {
        s.shadow.completed++;
        if (r.repairsApplied.length > 0) s.shadow.repaired++;
        else s.shadow.passed++;
        if (normaliseLanguage(r.language) === normaliseLanguage(legacyLanguage)) s.shadow.languageAgrees++;
        else s.shadow.languageDiffers++;
      }
    } catch {
      s.shadow.errors++;
    }
  }

  return {
    stats: () => stats.snapshot(),
    async run(input: PipelineInput, emit: (event: PipelineEvent) => void): Promise<PipelineResult> {
      s.requests++;
      const mode = deps.config.mode;
      if (mode === "off") return deps.legacy.run(input, emit);

      if (mode === "shadow") {
        const legacyResult = await deps.legacy.run(input, emit);
        // Not awaited: the customer already has the answer, and a failing shadow run can never reach them.
        void runShadow(input, legacyResult.language).catch(() => {
          s.shadow.errors++;
        });
        return legacyResult;
      }

      // mode === "on"
      if (!deps.config.legacySourceLabel) {
        s.on.refusedNoContractSource++;
        return deps.legacy.run(input, emit);
      }
      if (!(await deps.ready())) {
        s.on.fellBack++;
        return deps.legacy.run(input, emit);
      }
      try {
        const r = await deps.runner(input);
        stats.recordResult(r);
        if (r.degraded) {
          s.on.fellBack++;
          return deps.legacy.run(input, emit);
        }
        s.on.served++;
        emit({ type: "text", text: r.text, source: "qwen", needsNativeReview: r.needsNativeReview });
        return toPipelineResult(r);
      } catch {
        s.on.fellBack++;
        return deps.legacy.run(input, emit);
      }
    },
  };
}
