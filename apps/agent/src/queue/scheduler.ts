import type { ModelKey } from "../ollama/models";

/**
 * One inference slot for the whole server. The 4 GB machine can hold one model at a time, and switching costs
 * about 5 to 7 seconds (measured), so the order of work matters:
 *  - signed-in customers go before guests,
 *  - jobs for the already loaded model go first (affinity), but only a few in a row,
 *  - and nobody waits longer than the starvation limit.
 */
export type Priority = "customer" | "guest";

export interface Job<T> {
  model: ModelKey;
  priority: Priority;
  /** Absolute time (same clock as `now`) after which the job is abandoned. */
  deadlineAt: number;
  signal?: AbortSignal;
  run: (ctx: { signal: AbortSignal }) => Promise<T>;
}

export class QueueFullError extends Error {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super("The inference queue is full.");
    this.name = "QueueFullError";
    this.retryAfterSec = retryAfterSec;
  }
}
export class JobDeadlineError extends Error {
  readonly phase: "queued" | "running";
  constructor(phase: "queued" | "running") {
    super(`The job exceeded its deadline while ${phase}.`);
    this.name = "JobDeadlineError";
    this.phase = phase;
  }
}
export class JobAbortedError extends Error {
  constructor() {
    super("The job was cancelled.");
    this.name = "JobAbortedError";
  }
}

/** Reported for every job that ran. Carries no request content: only the model, timings and outcome. */
export interface JobEvent {
  model: ModelKey;
  from: ModelKey | null;
  switched: boolean;
  queuedMs: number;
  runMs: number;
  outcome: "ok" | "error" | "deadline" | "aborted";
}

export interface SchedulerOptions {
  /** Called once per job that ran. */
  observer?: (e: JobEvent) => void;
  /** Waiting jobs allowed besides the running one. */
  maxQueued: number;
  now?: () => number;
  /** Most consecutive jobs for the loaded model before a waiting job for the other model is chosen. */
  affinityMax?: number;
  /** A job that has waited this long is chosen next, whatever its model or priority. */
  starvationMs?: number;
  /** If the loaded model does not match and the estimated wait exceeds this, callers should answer with a template instead. */
  degradeWaitMs?: number;
  switchCostMs?: number;
  /** Used for wait estimates until real job times are known. */
  defaultJobMs?: number;
}

interface Queued {
  id: number;
  job: Job<unknown>;
  enqueuedAt: number;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  detach: () => void;
}

export interface SchedulerState {
  running: ModelKey | null;
  loaded: ModelKey | null;
  depth: number;
  switches: number;
  completed: number;
  rejectedFull: number;
  expired: number;
}

const RANK: Record<Priority, number> = { customer: 0, guest: 1 };

export class InferenceScheduler {
  private readonly queue: Queued[] = [];
  private running: ModelKey | null = null;
  private loaded: ModelKey | null = null;
  private consecutive = 0;
  private nextId = 1;
  private switches = 0;
  private completed = 0;
  private rejectedFull = 0;
  private expired = 0;
  private avgJobMs: number | null = null;

  private readonly nowFn: () => number;
  private readonly affinityMax: number;
  private readonly starvationMs: number;
  private readonly degradeWaitMs: number;
  private readonly switchCostMs: number;
  private readonly defaultJobMs: number;

  constructor(private readonly opts: SchedulerOptions) {
    this.nowFn = opts.now ?? Date.now;
    this.affinityMax = opts.affinityMax ?? 3;
    this.starvationMs = opts.starvationMs ?? 8_000;
    this.degradeWaitMs = opts.degradeWaitMs ?? 8_000;
    this.switchCostMs = opts.switchCostMs ?? 6_000;
    this.defaultJobMs = opts.defaultJobMs ?? 12_000;
  }

  submit<T>(job: Job<T>): Promise<T> {
    if (job.signal?.aborted) return Promise.reject(new JobAbortedError());
    if (this.running !== null && this.queue.length >= this.opts.maxQueued) {
      this.rejectedFull++;
      return Promise.reject(new QueueFullError(Math.max(1, Math.ceil(this.estimateWaitMs(job.model) / 1000))));
    }
    return new Promise<T>((resolve, reject) => {
      const item: Queued = {
        id: this.nextId++,
        job: job as Job<unknown>,
        enqueuedAt: this.nowFn(),
        resolve: resolve as (v: unknown) => void,
        reject,
        detach: () => {},
      };
      const remaining = Math.max(0, job.deadlineAt - this.nowFn());
      const timer = setTimeout(() => this.drop(item, new JobDeadlineError("queued"), true), remaining);
      const onAbort = () => this.drop(item, new JobAbortedError(), false);
      job.signal?.addEventListener("abort", onAbort, { once: true });
      item.detach = () => {
        clearTimeout(timer);
        job.signal?.removeEventListener("abort", onAbort);
      };
      this.queue.push(item);
      this.pump();
    });
  }

  private drop(item: Queued, error: unknown, countAsExpired: boolean): void {
    const i = this.queue.indexOf(item);
    if (i < 0) return; // already started or finished
    this.queue.splice(i, 1);
    item.detach();
    if (countAsExpired) this.expired++;
    item.reject(error);
  }

  private pickNext(): Queued | null {
    if (this.queue.length === 0) return null;
    const now = this.nowFn();
    const byOrder = (list: Queued[]) =>
      [...list].sort((a, b) => RANK[a.job.priority] - RANK[b.job.priority] || a.enqueuedAt - b.enqueuedAt || a.id - b.id)[0] ?? null;

    const oldest = [...this.queue].sort((a, b) => a.enqueuedAt - b.enqueuedAt || a.id - b.id)[0]!;
    if (now - oldest.enqueuedAt >= this.starvationMs && oldest.job.model !== this.loaded) return oldest;

    const same = this.queue.filter((q) => q.job.model === this.loaded);
    const other = this.queue.filter((q) => q.job.model !== this.loaded);
    if (same.length > 0 && (this.consecutive < this.affinityMax || other.length === 0)) return byOrder(same);
    return byOrder(other.length > 0 ? other : this.queue);
  }

  private pump(): void {
    if (this.running !== null) return;
    const item = this.pickNext();
    if (!item) return;
    this.queue.splice(this.queue.indexOf(item), 1);
    item.detach();

    const model = item.job.model;
    const previous = this.loaded;
    const switched = previous !== null && previous !== model;
    if (this.loaded !== null && this.loaded !== model) {
      this.switches++;
      this.consecutive = 1;
    } else {
      this.consecutive++;
    }
    this.loaded = model;
    this.running = model;

    const startedAt = this.nowFn();
    const deadline = AbortSignal.timeout(Math.max(0, item.job.deadlineAt - startedAt));
    const signal = item.job.signal ? AbortSignal.any([deadline, item.job.signal]) : deadline;

    item.job.run({ signal }).then(
      (value) => this.finish(item, startedAt, () => item.resolve(value), "ok", switched, previous),
      (err) => {
        const outcome: JobEvent["outcome"] = deadline.aborted && !item.job.signal?.aborted ? "deadline" : item.job.signal?.aborted ? "aborted" : "error";
        this.finish(
          item,
          startedAt,
          () => {
            if (outcome === "deadline") item.reject(new JobDeadlineError("running"));
            else if (outcome === "aborted") item.reject(new JobAbortedError());
            else item.reject(err);
          },
          outcome,
          switched,
          previous,
        );
      },
    );
  }

  private finish(item: Queued, startedAt: number, settle: () => void, outcome: JobEvent["outcome"], switched: boolean, from: ModelKey | null): void {
    const took = Math.max(0, this.nowFn() - startedAt);
    try {
      this.opts.observer?.({ model: item.job.model, from, switched, queuedMs: Math.max(0, startedAt - item.enqueuedAt), runMs: took, outcome });
    } catch {
      // an observer must never be able to break scheduling
    }
    this.avgJobMs = this.avgJobMs === null ? took : this.avgJobMs * 0.7 + took * 0.3;
    this.completed++;
    this.running = null;
    settle();
    this.pump();
  }

  /** Rough time until a new job for `model` would start. */
  estimateWaitMs(model: ModelKey): number {
    const ahead = this.queue.length + (this.running !== null ? 1 : 0);
    const perJob = this.avgJobMs ?? this.defaultJobMs;
    const switching = ahead > 0 || this.running !== null ? (model !== this.loaded && this.loaded !== null ? this.switchCostMs : 0) : 0;
    return ahead * perJob + switching;
  }

  /** True when answering from a template is better than waiting for a model switch behind other work. */
  shouldDegrade(model: ModelKey): boolean {
    if (this.loaded === null || model === this.loaded) return false;
    const busy = this.queue.length > 0 || this.running !== null;
    return busy && this.estimateWaitMs(model) > this.degradeWaitMs;
  }

  /** Lets health checks correct the scheduler's belief about which model Ollama really has loaded. */
  setLoaded(model: ModelKey | null): void {
    this.loaded = model;
    this.consecutive = 0;
  }

  state(): SchedulerState {
    return {
      running: this.running,
      loaded: this.loaded,
      depth: this.queue.length,
      switches: this.switches,
      completed: this.completed,
      rejectedFull: this.rejectedFull,
      expired: this.expired,
    };
  }
}
