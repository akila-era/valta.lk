/**
 * The audio worker slot(s): at most `concurrency` jobs run, at most `maxDepth` wait, everything else is refused at once. Waiting jobs
 * hold only the (already size-capped) request they were given, so memory is bounded by (concurrency + maxDepth) times the audio cap.
 */
export class VoiceBusyError extends Error {
  constructor(readonly retryAfterSec: number) {
    super("busy");
    this.name = "VoiceBusyError";
  }
}

/** A job that did not finish inside its own deadline (a provider that ignores the abort signal). The slot is released regardless. */
export class VoiceDeadlineError extends Error {
  constructor() {
    super("deadline");
    this.name = "VoiceDeadlineError";
  }
}

export class VoiceQueue {
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly concurrency: number, private readonly maxDepth: number, private readonly maxWaitMs = 15_000) {}

  state(): { running: number; waiting: number } {
    return { running: this.running, waiting: this.waiting.length };
  }

  async run<T>(job: () => Promise<T>, deadlineMs?: number): Promise<T> {
    if (this.running < this.concurrency) {
      this.running++;
    } else {
      if (this.waiting.length >= this.maxDepth) throw new VoiceBusyError(5);
      // The slot is handed over by the job that finishes (running is not decremented then), so a newcomer can never jump the queue.
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => {
          const i = this.waiting.indexOf(go);
          if (i >= 0) this.waiting.splice(i, 1);
          reject(new VoiceBusyError(5));
        }, this.maxWaitMs);
        const go = (): void => {
          clearTimeout(t);
          resolve();
        };
        this.waiting.push(go);
      });
    }
    try {
      if (deadlineMs === undefined) return await job();
      // The job is raced against its own deadline so one provider that never answers (and ignores the abort signal) cannot hold the slot
      // forever (VO-04). The abandoned promise is given a no-op rejection handler so a late failure is never an unhandled rejection.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const running = job();
      running.catch(() => {});
      try {
        return await Promise.race([
          running,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new VoiceDeadlineError()), deadlineMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }
}
