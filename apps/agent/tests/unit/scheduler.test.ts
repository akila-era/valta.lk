import { describe, expect, it } from "vitest";
import type { ModelKey } from "../../src/ollama/models";
import { InferenceScheduler, JobAbortedError, JobDeadlineError, QueueFullError, type Job, type Priority } from "../../src/queue/scheduler";

const FAR = () => Date.now() + 60_000;

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A job that records when it starts and holds the slot until released. */
function heldJob(model: ModelKey, name: string, log: string[], priority: Priority = "guest", over: Partial<Job<string>> = {}) {
  const gate = deferred();
  const job: Job<string> = {
    model,
    priority,
    deadlineAt: FAR(),
    run: async () => {
      log.push(name);
      await gate.promise;
      return name;
    },
    ...over,
  };
  return { job, release: () => gate.resolve() };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

describe("InferenceScheduler", () => {
  it("runs one job at a time", async () => {
    const s = new InferenceScheduler({ maxQueued: 40 });
    let running = 0;
    let peak = 0;
    const mk = (model: ModelKey): Job<number> => ({
      model,
      priority: "guest",
      deadlineAt: FAR(),
      run: async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 2));
        running--;
        return 1;
      },
    });
    await Promise.all(Array.from({ length: 30 }, (_, i) => s.submit(mk(i % 3 === 0 ? "sinhala" : "qwen"))));
    expect(peak).toBe(1);
    expect(s.state()).toMatchObject({ running: null, depth: 0, completed: 30 });
  });

  it("serves signed-in customers before guests, then first come first served", async () => {
    const s = new InferenceScheduler({ maxQueued: 10 });
    const log: string[] = [];
    const first = heldJob("qwen", "first", log);
    const p0 = s.submit(first.job);
    await tick();
    const g1 = heldJob("qwen", "guest1", log);
    const g2 = heldJob("qwen", "guest2", log);
    const c1 = heldJob("qwen", "cust1", log, "customer");
    const ps = [s.submit(g1.job), s.submit(g2.job), s.submit(c1.job)];
    first.release();
    await p0;
    await tick();
    c1.release();
    await tick();
    g1.release();
    await tick();
    g2.release();
    await Promise.all(ps);
    expect(log).toEqual(["first", "cust1", "guest1", "guest2"]);
  });

  it("prefers the already loaded model, but only a few jobs in a row", async () => {
    const s = new InferenceScheduler({ maxQueued: 20, affinityMax: 3 });
    const log: string[] = [];
    const first = heldJob("qwen", "q0", log);
    const p0 = s.submit(first.job);
    await tick();
    const queued = [
      heldJob("sinhala", "s1", log),
      heldJob("qwen", "q1", log),
      heldJob("qwen", "q2", log),
      heldJob("qwen", "q3", log),
      heldJob("qwen", "q4", log),
    ];
    const ps = queued.map((q) => s.submit(q.job));
    first.release();
    for (const q of queued) {
      await tick();
      q.release();
    }
    await Promise.all([p0, ...ps]);
    // q0 ran first (consecutive=1). Affinity lets q1 and q2 follow (consecutive 2, 3); then the older sinhala job gets its turn.
    expect(log).toEqual(["q0", "q1", "q2", "s1", "q3", "q4"]);
    expect(s.state().switches).toBe(2);
  });

  it("never lets a job starve behind a stream of the loaded model's work", async () => {
    let t = 0;
    const s = new InferenceScheduler({ maxQueued: 20, affinityMax: 100, starvationMs: 8_000, now: () => t });
    const log: string[] = [];
    const first = heldJob("qwen", "q0", log, "guest", { deadlineAt: 1_000_000 });
    const p0 = s.submit(first.job);
    await tick();
    const old = heldJob("sinhala", "s-old", log, "guest", { deadlineAt: 1_000_000 });
    const ps = [s.submit(old.job)];
    t = 9_000; // the sinhala job has now waited longer than the starvation limit
    const q1 = heldJob("qwen", "q1", log, "customer", { deadlineAt: 1_000_000 });
    ps.push(s.submit(q1.job));
    first.release();
    await p0;
    await tick();
    expect(log).toEqual(["q0", "s-old"]); // the starved job beat a customer job for the loaded model
    old.release();
    await tick();
    q1.release();
    await Promise.all(ps);
  });

  it("drops a job whose deadline passes while queued, without ever running it", async () => {
    const s = new InferenceScheduler({ maxQueued: 5 });
    const log: string[] = [];
    const blocker = heldJob("qwen", "blocker", log);
    const pb = s.submit(blocker.job);
    await tick();
    let ran = false;
    const doomed = s.submit({ model: "qwen", priority: "guest", deadlineAt: Date.now() + 30, run: async () => ((ran = true), "x") });
    const err = await doomed.catch((e) => e);
    expect(err).toBeInstanceOf(JobDeadlineError);
    expect((err as JobDeadlineError).phase).toBe("queued");
    blocker.release();
    await pb;
    await tick();
    expect(ran).toBe(false);
    expect(s.state()).toMatchObject({ depth: 0, expired: 1 });
  });

  it("aborts a running job at its deadline", async () => {
    const s = new InferenceScheduler({ maxQueued: 5 });
    const p = s.submit({
      model: "qwen",
      priority: "guest",
      deadlineAt: Date.now() + 40,
      run: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted by signal")))),
    });
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(JobDeadlineError);
    expect((err as JobDeadlineError).phase).toBe("running");
    expect(s.state().running).toBeNull();
  });

  it("cancels a queued job when its caller aborts, and a running job through its signal", async () => {
    const s = new InferenceScheduler({ maxQueued: 5 });
    const log: string[] = [];
    const blocker = heldJob("qwen", "blocker", log);
    const pb = s.submit(blocker.job);
    await tick();
    const ac = new AbortController();
    const queued = s.submit({ model: "qwen", priority: "guest", deadlineAt: FAR(), signal: ac.signal, run: async () => "never" });
    ac.abort();
    expect(await queued.catch((e) => e)).toBeInstanceOf(JobAbortedError);
    expect(s.state().depth).toBe(0);
    blocker.release();
    await pb;

    const ac2 = new AbortController();
    const running = s.submit({
      model: "qwen",
      priority: "guest",
      deadlineAt: FAR(),
      signal: ac2.signal,
      run: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("x")))),
    });
    await tick();
    ac2.abort();
    expect(await running.catch((e) => e)).toBeInstanceOf(JobAbortedError);
    expect(await s.submit({ model: "qwen", priority: "guest", deadlineAt: FAR(), signal: ac2.signal, run: async () => 1 }).catch((e) => e)).toBeInstanceOf(JobAbortedError);
  });

  it("rejects with QueueFullError and a retry hint when the queue is full", async () => {
    const s = new InferenceScheduler({ maxQueued: 2 });
    const log: string[] = [];
    const a = heldJob("qwen", "a", log);
    const pa = s.submit(a.job);
    await tick();
    const b = heldJob("qwen", "b", log);
    const c = heldJob("qwen", "c", log);
    const pb = s.submit(b.job);
    const pc = s.submit(c.job);
    const err = await s.submit(heldJob("qwen", "d", log).job).catch((e) => e);
    expect(err).toBeInstanceOf(QueueFullError);
    expect((err as QueueFullError).retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(s.state().rejectedFull).toBe(1);
    for (const j of [a, b, c]) {
      j.release();
      await tick();
    }
    await Promise.all([pa, pb, pc]);
  });

  it("accepts the first job even with a zero-length queue, then refuses while busy", async () => {
    const s = new InferenceScheduler({ maxQueued: 0 });
    const log: string[] = [];
    const a = heldJob("qwen", "a", log);
    const pa = s.submit(a.job);
    expect(await s.submit(heldJob("qwen", "b", log).job).catch((e) => e)).toBeInstanceOf(QueueFullError);
    a.release();
    await pa;
  });

  it("passes a job's own error through unchanged", async () => {
    const s = new InferenceScheduler({ maxQueued: 5 });
    const boom = new Error("boom");
    expect(await s.submit({ model: "qwen", priority: "guest", deadlineAt: FAR(), run: async () => Promise.reject(boom) }).catch((e) => e)).toBe(boom);
    expect(s.state().running).toBeNull();
  });

  it("counts model switches", async () => {
    const s = new InferenceScheduler({ maxQueued: 5 });
    const run = (model: ModelKey) => s.submit({ model, priority: "guest", deadlineAt: FAR(), run: async () => model });
    await run("qwen");
    await run("qwen");
    await run("sinhala");
    await run("qwen");
    expect(s.state()).toMatchObject({ switches: 2, loaded: "qwen" });
  });

  it("estimates waits and advises degrading only when busy with the other model", async () => {
    const s = new InferenceScheduler({ maxQueued: 5, defaultJobMs: 12_000, switchCostMs: 6_000, degradeWaitMs: 8_000 });
    expect(s.estimateWaitMs("qwen")).toBe(0);
    expect(s.shouldDegrade("sinhala")).toBe(false); // idle and nothing loaded
    s.setLoaded("qwen"); // no job has run yet, so the default job time (12 s) drives the estimate
    expect(s.shouldDegrade("sinhala")).toBe(false); // idle: a switch (6 s) is acceptable
    const log: string[] = [];
    const busy = heldJob("qwen", "busy", log);
    const p = s.submit(busy.job);
    await tick();
    expect(s.shouldDegrade("qwen")).toBe(false); // same model: no switch needed
    expect(s.shouldDegrade("sinhala")).toBe(true); // busy and a switch would be needed
    expect(s.estimateWaitMs("sinhala")).toBeGreaterThan(8_000);
    busy.release();
    await p;
  });

  it("keeps the one-at-a-time and every-job-finishes invariants under a random mix", async () => {
    const s = new InferenceScheduler({ maxQueued: 500, affinityMax: 2, starvationMs: 30 });
    let running = 0;
    let peak = 0;
    let done = 0;
    const jobs = Array.from({ length: 120 }, (_, i) => {
      const model: ModelKey = (i * 7919) % 5 < 2 ? "sinhala" : "qwen";
      const priority: Priority = i % 4 === 0 ? "customer" : "guest";
      return s.submit({
        model,
        priority,
        deadlineAt: FAR(),
        run: async () => {
          running++;
          peak = Math.max(peak, running);
          await new Promise((r) => setTimeout(r, 1));
          running--;
          done++;
        },
      });
    });
    await Promise.all(jobs);
    expect(peak).toBe(1);
    expect(done).toBe(120);
    expect(s.state()).toMatchObject({ depth: 0, running: null, completed: 120 });
  });
});
