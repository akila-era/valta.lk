/**
 * Search and page-fetch accounting. EVERY cap defaults to 0, which means "disabled": nothing can search or fetch until the owner sets caps (and approves a
 * provider). Counts are kept per UTC day and month, per conversation, and globally, in memory only. There is a kill switch. Cost is estimated from configured
 * unit prices that default to 0: no price is ever invented.
 */
export type QuotaKind = "search" | "fetch";
export type QuotaRefusal = "disabled" | "kill_switch" | "session_cap" | "daily_cap" | "monthly_cap";

export interface QuotaConfig {
  perSessionSearches: number;
  perSessionFetches: number;
  dailySearches: number;
  monthlySearches: number;
  dailyFetches: number;
  monthlyFetches: number;
  /** Reference price for the cost estimate, in US dollars per call. 0 = unknown/free: nothing is estimated. */
  unitPriceUsdPerSearch: number;
  unitPriceUsdPerFetch: number;
}

export const DISABLED_QUOTA: QuotaConfig = Object.freeze({
  perSessionSearches: 0,
  perSessionFetches: 0,
  dailySearches: 0,
  monthlySearches: 0,
  dailyFetches: 0,
  monthlyFetches: 0,
  unitPriceUsdPerSearch: 0,
  unitPriceUsdPerFetch: 0,
});

export type QuotaDecision = { ok: true } | { ok: false; reason: QuotaRefusal };

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);
const MAX_SESSIONS = 5_000;

export class SearchQuota {
  private readonly cfg: QuotaConfig;
  private killed = false;
  private readonly day = { key: "", search: 0, fetch: 0 };
  private readonly month = { key: "", search: 0, fetch: 0 };
  private readonly sessions = new Map<string, { search: number; fetch: number }>();

  constructor(config: Partial<QuotaConfig> = {}, private readonly now: () => number = Date.now) {
    this.cfg = { ...DISABLED_QUOTA, ...config };
    for (const [k, v] of Object.entries(this.cfg)) if (!Number.isFinite(v) || v < 0) throw new Error(`Quota setting ${k} must be a number of at least 0.`);
  }

  setKillSwitch(on: boolean): void {
    this.killed = on;
  }

  private roll(): void {
    const t = this.now();
    if (this.day.key !== dayKey(t)) Object.assign(this.day, { key: dayKey(t), search: 0, fetch: 0 });
    if (this.month.key !== monthKey(t)) Object.assign(this.month, { key: monthKey(t), search: 0, fetch: 0 });
  }

  private caps(kind: QuotaKind) {
    return kind === "search"
      ? { session: this.cfg.perSessionSearches, daily: this.cfg.dailySearches, monthly: this.cfg.monthlySearches }
      : { session: this.cfg.perSessionFetches, daily: this.cfg.dailyFetches, monthly: this.cfg.monthlyFetches };
  }

  /** True only when this kind could possibly run (not killed, and every cap is above 0). Used to decide whether a tool is even offered to the model. */
  enabled(kind: QuotaKind): boolean {
    if (this.killed) return false;
    const c = this.caps(kind);
    return c.session > 0 && c.daily > 0 && c.monthly > 0;
  }

  /** Checks every cap and, only when all pass, counts one call. A refused call is never counted. */
  tryConsume(kind: QuotaKind, sessionKey: string): QuotaDecision {
    if (this.killed) return { ok: false, reason: "kill_switch" };
    const c = this.caps(kind);
    if (c.session <= 0 || c.daily <= 0 || c.monthly <= 0) return { ok: false, reason: "disabled" };
    this.roll();
    let s = this.sessions.get(sessionKey);
    if (!s) {
      if (this.sessions.size >= MAX_SESSIONS) this.sessions.clear(); // a full table loosens only the per-conversation cap, never the global ones
      s = { search: 0, fetch: 0 };
      this.sessions.set(sessionKey, s);
    }
    if (s[kind] >= c.session) return { ok: false, reason: "session_cap" };
    if (this.day[kind] >= c.daily) return { ok: false, reason: "daily_cap" };
    if (this.month[kind] >= c.monthly) return { ok: false, reason: "monthly_cap" };
    s[kind]++;
    this.day[kind]++;
    this.month[kind]++;
    return { ok: true };
  }

  /** Counts only. `alert` is "none", "warn" (at least 50% of a cap used) or "critical" (at least 80%). */
  usage(): { day: { search: number; fetch: number }; month: { search: number; fetch: number }; estimatedCostUsdMonth: number; alert: "none" | "warn" | "critical" } {
    this.roll();
    const fractions = [
      this.cfg.dailySearches > 0 ? this.day.search / this.cfg.dailySearches : 0,
      this.cfg.monthlySearches > 0 ? this.month.search / this.cfg.monthlySearches : 0,
      this.cfg.dailyFetches > 0 ? this.day.fetch / this.cfg.dailyFetches : 0,
      this.cfg.monthlyFetches > 0 ? this.month.fetch / this.cfg.monthlyFetches : 0,
    ];
    const worst = Math.max(...fractions);
    return {
      day: { search: this.day.search, fetch: this.day.fetch },
      month: { search: this.month.search, fetch: this.month.fetch },
      estimatedCostUsdMonth: this.month.search * this.cfg.unitPriceUsdPerSearch + this.month.fetch * this.cfg.unitPriceUsdPerFetch,
      alert: worst >= 0.8 ? "critical" : worst >= 0.5 ? "warn" : "none",
    };
  }
}
