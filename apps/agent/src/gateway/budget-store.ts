import { promises as fs } from "node:fs";
import { dirname } from "node:path";

/**
 * The spend ledger. Amounts are integers in micro-USD (1e-6 USD) so that thousands of small additions never drift. A restart must NOT
 * reset spend, and a damaged ledger must NOT reset it either: an unreadable or unwritable ledger makes every reservation fail CLOSED
 * (LedgerUnavailableError), because "spend unknown" must never be treated as "spend zero".
 */
export interface Bucket {
  text: number;
  voice: number;
  search: number;
  calls: number;
}

export interface Reservation {
  id: string;
  category: "text" | "voice" | "search";
  micro: number;
  model: string;
  createdAt: number;
  dayKey: string;
  monthKey: string;
}

export interface Reconciliation {
  at: number;
  month: string;
  appMicro: number;
  providerMicro: number;
  driftPct: number;
  applied: boolean;
}

export interface LedgerState {
  version: 1;
  days: Record<string, Bucket>;
  months: Record<string, Bucket>;
  reservations: Record<string, Reservation>;
  /** Corrections from reconciliation against the provider's own figure, per month. */
  offsetMicro: Record<string, number>;
  alerts: Record<string, string[]>;
  reconciliations: Reconciliation[];
}

export const emptyBucket = (): Bucket => ({ text: 0, voice: 0, search: 0, calls: 0 });
export const emptyLedger = (): LedgerState => ({ version: 1, days: {}, months: {}, reservations: {}, offsetMicro: {}, alerts: {}, reconciliations: [] });

export class LedgerUnavailableError extends Error {
  readonly reason: "corrupt" | "unwritable" | "unreadable";
  constructor(reason: "corrupt" | "unwritable" | "unreadable") {
    super(`ledger_${reason}`);
    this.name = "LedgerUnavailableError";
    this.reason = reason;
  }
}

export interface BudgetStore {
  /** Runs fn on the ledger with exclusive access (all callers are serialised) and persists the result unless write is false. */
  transact<T>(fn: (state: LedgerState) => T, opts?: { write?: boolean }): Promise<T>;
}

function validLedger(v: unknown): v is LedgerState {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  const obj = (x: unknown): boolean => !!x && typeof x === "object" && !Array.isArray(x);
  return s.version === 1 && obj(s.days) && obj(s.months) && obj(s.reservations) && obj(s.offsetMicro) && obj(s.alerts) && Array.isArray(s.reconciliations);
}

abstract class SerialStore implements BudgetStore {
  private chain: Promise<unknown> = Promise.resolve();

  protected abstract load(): Promise<LedgerState>;
  protected abstract persist(state: LedgerState): Promise<void>;

  private state: LedgerState | undefined;

  transact<T>(fn: (state: LedgerState) => T, opts: { write?: boolean } = {}): Promise<T> {
    const run = async (): Promise<T> => {
      if (!this.state) this.state = await this.load();
      const before = structuredClone(this.state);
      let result: T;
      try {
        result = fn(this.state);
      } catch (e) {
        this.state = before;
        throw e;
      }
      if (opts.write !== false) {
        try {
          await this.persist(this.state);
        } catch {
          this.state = before; // the change did not reach disk: do not pretend it happened
          throw new LedgerUnavailableError("unwritable");
        }
      }
      return result;
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }
}

export class MemoryBudgetStore extends SerialStore {
  constructor(private readonly initial: LedgerState = emptyLedger()) {
    super();
  }
  protected async load(): Promise<LedgerState> {
    return structuredClone(this.initial);
  }
  protected async persist(): Promise<void> {}
}

export interface FileOps {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

const nodeFs: FileOps = {
  readFile: (p) => fs.readFile(p, "utf8"),
  writeFile: (p, d) => fs.writeFile(p, d, { encoding: "utf8", mode: 0o600 }),
  rename: (a, b) => fs.rename(a, b),
  mkdir: async (p) => {
    await fs.mkdir(p, { recursive: true });
  },
};

/** One JSON file, replaced atomically (write a temp file, then rename). A missing file is a fresh ledger; a damaged one is NOT. */
export class FileBudgetStore extends SerialStore {
  private counter = 0;

  constructor(
    private readonly path: string,
    private readonly ops: FileOps = nodeFs,
  ) {
    super();
  }

  protected async load(): Promise<LedgerState> {
    let text: string;
    try {
      text = await this.ops.readFile(this.path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return emptyLedger();
      throw new LedgerUnavailableError("unreadable");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new LedgerUnavailableError("corrupt");
    }
    if (!validLedger(parsed)) throw new LedgerUnavailableError("corrupt");
    return parsed;
  }

  protected async persist(state: LedgerState): Promise<void> {
    await this.ops.mkdir(dirname(this.path));
    const tmp = `${this.path}.tmp-${process.pid}-${++this.counter}`;
    await this.ops.writeFile(tmp, JSON.stringify(state));
    await this.ops.rename(tmp, this.path);
  }
}
