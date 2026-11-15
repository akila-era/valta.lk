import { randomUUID } from "node:crypto";
import type { GatewayConfig } from "./config";
import { LedgerUnavailableError, emptyBucket, type Bucket, type BudgetStore, type LedgerState, type Reservation } from "./budget-store";
import { conservativeEntry, costUsd, entryAt, estimateCostUsd, findModelPrice, type PriceTable } from "./prices";
import type { Usage } from "./provider";

/**
 * Budget controller: concurrency-safe reservations, settlement from real usage, soft/hard limits, per-category shares of ONE shared
 * budget, reconciliation, alerts.
 *
 * IMPORTANT, stated plainly: this is APPLICATION-SIDE enforcement. It cannot guarantee exact provider billing. Prices and tokenisation can
 * change, thinking and tool-use tokens are only known after a call, usage metadata may differ from the bill, exchange rates, card fees and
 * tax are outside the ledger, and the provider's own bill lags by up to a day. The provider-side controls (prepaid balance, tier caps,
 * the experimental project spend cap) and reconcile() exist for that reason. Never describe this limit as a billing guarantee.
 */
export type Category = "text" | "voice" | "search";
export type Directive = "downgrade_model" | "shorten_history" | "disable_search" | "disable_voice";
export type BudgetRefusal = "hard_limit" | "daily_limit" | "category_limit" | "ledger_unavailable" | "unverified_prices" | "unknown_model";

export type ReserveResult =
  | { ok: true; reservationId: string; reservedLkr: number; directives: Directive[]; alerts: BudgetAlert[] }
  | { ok: false; reason: BudgetRefusal; directives: Directive[] };

export interface BudgetAlert {
  /** soft_50 | soft_80 | soft_100 | hard_80 | hard_100 */
  level: string;
  monthKey: string;
  spentLkr: number;
}

export interface BudgetStatus {
  ledgerOk: boolean;
  monthKey: string;
  dayKey: string;
  spentLkr: { total: number; text: number; voice: number; search: number };
  reservedLkr: number;
  dayLkr: number;
  limits: { softLkr: number; hardLkr: number; reserveLkr: number; monthlyLkr: number; dailyCapLkr: number };
  remainingToSoftLkr: number;
  remainingToHardLkr: number;
  directives: Directive[];
  priceTableVersion: string;
  lkrPerUsd: number;
}

export interface ReconcileResult {
  month: string;
  appUsd: number;
  providerUsd: number;
  driftUsd: number;
  driftPct: number;
  flagged: boolean;
  applied: boolean;
}

export interface BudgetOptions {
  budget: GatewayConfig["budget"];
  store: BudgetStore;
  prices: PriceTable;
  clock?: () => number;
  onAlert?: (a: BudgetAlert) => void;
  newId?: () => string;
}

const ALL_DIRECTIVES: Directive[] = ["downgrade_model", "shorten_history", "disable_search", "disable_voice"];

export class BudgetController {
  private readonly clock: () => number;
  private readonly newId: () => string;

  constructor(private readonly o: BudgetOptions) {
    this.clock = o.clock ?? Date.now;
    this.newId = o.newId ?? (() => randomUUID());
  }

  // ---- conversions and windows -------------------------------------------------------------------------------------------

  private toMicro(lkr: number): number {
    return Math.round((lkr / this.o.budget.lkrPerUsd) * 1e6);
  }
  private toLkr(micro: number): number {
    return (micro / 1e6) * this.o.budget.lkrPerUsd;
  }
  usdToMicro(usd: number): number {
    return Math.ceil(usd * 1e6);
  }

  /** Day and month keys. UTC by default; "Asia/Colombo" shifts the boundary by +05:30. Documented in the report. */
  private parts(at: number): { dayKey: string; monthKey: string; dayOfMonth: number; daysInMonth: number } {
    const shift = this.o.budget.timezone === "Asia/Colombo" ? 330 * 60_000 : 0;
    const d = new Date(at + shift);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const pad = (n: number): string => String(n).padStart(2, "0");
    return { dayKey: `${y}-${pad(m + 1)}-${pad(day)}`, monthKey: `${y}-${pad(m + 1)}`, dayOfMonth: day, daysInMonth: new Date(Date.UTC(y, m + 1, 0)).getUTCDate() };
  }

  // ---- price authorisation and estimates -----------------------------------------------------------------------------------

  authoriseModel(model: string): { ok: true } | { ok: false; reason: "unknown_model" | "unverified_prices" } {
    const price = findModelPrice(this.o.prices, model);
    if (!price) return { ok: false, reason: "unknown_model" };
    if (!price.verified && !this.o.budget.allowUnverifiedPrices) return { ok: false, reason: "unverified_prices" };
    return { ok: true };
  }

  /** Worst-case cost of a call in micro-USD (the dearer of now and the next 35 days). Returns undefined for an unknown model. */
  estimateMicro(model: string, input: { inputTokens: number; maxOutputTokens: number; maxThinkingTokens: number; audioSeconds?: number }, at = this.clock()): number | undefined {
    const price = findModelPrice(this.o.prices, model);
    if (!price) return undefined;
    return this.usdToMicro(estimateCostUsd(conservativeEntry(price, new Date(at)), input));
  }

  /** Search is treated as billable from the first query (the free allowance's billing conditions are unverified). */
  estimateSearchMicro(queries: number): number {
    const s = this.o.prices.search;
    return this.usdToMicro((queries * s.per1000Usd) / 1000);
  }

  // ---- ledger arithmetic (all inside store.transact, so concurrent callers are serialised) ---------------------------------------

  private sweep(s: LedgerState, now: number): void {
    for (const r of Object.values(s.reservations)) {
      if (r.createdAt + this.o.budget.reservationTimeoutMs <= now) {
        this.add(s, r.dayKey, r.monthKey, r.category, r.micro); // outcome unknown: the reserved amount is treated as spent
        delete s.reservations[r.id];
      }
    }
  }

  private add(s: LedgerState, dayKey: string, monthKey: string, cat: Category, micro: number): void {
    const d = (s.days[dayKey] ??= emptyBucket());
    const m = (s.months[monthKey] ??= emptyBucket());
    d[cat] += micro;
    m[cat] += micro;
    d.calls += 1;
    m.calls += 1;
  }

  private monthSpent(s: LedgerState, monthKey: string): number {
    const b = s.months[monthKey];
    return (b ? b.text + b.voice + b.search : 0) + (s.offsetMicro[monthKey] ?? 0);
  }
  private daySpent(s: LedgerState, dayKey: string): number {
    const b = s.days[dayKey];
    return b ? b.text + b.voice + b.search : 0;
  }
  private reservedFor(s: LedgerState, key: "monthKey" | "dayKey", value: string, cat?: Category): number {
    let t = 0;
    for (const r of Object.values(s.reservations)) if (r[key] === value && (!cat || r.category === cat)) t += r.micro;
    return t;
  }

  private directivesFor(s: LedgerState, at: number): Directive[] {
    const p = this.parts(at);
    const month = this.monthSpent(s, p.monthKey) + this.reservedFor(s, "monthKey", p.monthKey);
    if (month >= this.toMicro(this.o.budget.softLkr)) return [...ALL_DIRECTIVES];
    // Daily soft rule: spending today above twice the average daily allowance left in the soft budget.
    const day = this.daySpent(s, p.dayKey) + this.reservedFor(s, "dayKey", p.dayKey);
    const monthBeforeToday = month - day;
    const daysLeft = Math.max(1, p.daysInMonth - p.dayOfMonth + 1);
    const dailySoft = Math.max(0, (this.toMicro(this.o.budget.softLkr) - monthBeforeToday) / daysLeft) * 2;
    return day > dailySoft ? [...ALL_DIRECTIVES] : [];
  }

  private newAlerts(s: LedgerState, at: number): BudgetAlert[] {
    const p = this.parts(at);
    const total = this.monthSpent(s, p.monthKey) + this.reservedFor(s, "monthKey", p.monthKey);
    const soft = this.toMicro(this.o.budget.softLkr);
    const hard = this.toMicro(this.o.budget.hardLkr);
    const checks: [string, boolean][] = [
      ["soft_50", total >= soft * 0.5],
      ["soft_80", total >= soft * 0.8],
      ["soft_100", total >= soft],
      ["hard_80", total >= hard * 0.8],
      ["hard_100", total >= hard],
    ];
    const fired = (s.alerts[p.monthKey] ??= []);
    const out: BudgetAlert[] = [];
    for (const [level, hit] of checks) {
      if (hit && !fired.includes(level)) {
        fired.push(level);
        out.push({ level, monthKey: p.monthKey, spentLkr: this.toLkr(total) });
      }
    }
    return out;
  }

  private emit(alerts: BudgetAlert[]): void {
    for (const a of alerts) {
      try {
        this.o.onAlert?.(a);
      } catch {
        // An alert hook must never break a customer request.
      }
    }
  }

  // ---- public protocol ---------------------------------------------------------------------------------------------------------

  /**
   * Reserve before a call. Atomic with respect to every other reserve/settle: concurrent callers can never overshoot the hard limit.
   * `estimateMicro` is the worst-case cost (see estimateMicro()). Refusals are typed; the caller must degrade honestly.
   */
  async reserve(input: { category: Category; model: string; estimateMicro: number; at?: number }): Promise<ReserveResult> {
    const auth = this.authoriseModel(input.model);
    if (!auth.ok) return { ok: false, reason: auth.reason, directives: [] };
    const at = input.at ?? this.clock();
    const p = this.parts(at);
    const est = Math.max(0, Math.ceil(input.estimateMicro));
    try {
      const out = await this.o.store.transact((s) => {
        this.sweep(s, at);
        const hard = this.toMicro(this.o.budget.hardLkr);
        const month = this.monthSpent(s, p.monthKey) + this.reservedFor(s, "monthKey", p.monthKey);
        if (month + est > hard) return { ok: false as const, reason: "hard_limit" as const, directives: this.directivesFor(s, at), alerts: this.newAlerts(s, at) };
        const day = this.daySpent(s, p.dayKey) + this.reservedFor(s, "dayKey", p.dayKey);
        if (day + est > this.toMicro(this.o.budget.dailyCapLkr)) return { ok: false as const, reason: "daily_limit" as const, directives: this.directivesFor(s, at), alerts: [] };
        if (input.category !== "text") {
          const share = input.category === "voice" ? this.o.budget.voiceShare : this.o.budget.searchShare;
          const b = s.months[p.monthKey] ?? emptyBucket();
          const cat = b[input.category] + this.reservedFor(s, "monthKey", p.monthKey, input.category);
          if (cat + est > share * hard) return { ok: false as const, reason: "category_limit" as const, directives: this.directivesFor(s, at), alerts: [] };
        }
        const id = this.newId();
        const r: Reservation = { id, category: input.category, micro: est, model: input.model, createdAt: at, dayKey: p.dayKey, monthKey: p.monthKey };
        s.reservations[id] = r;
        return { ok: true as const, id, directives: this.directivesFor(s, at), alerts: this.newAlerts(s, at) };
      });
      this.emit(out.alerts);
      if (!out.ok) return { ok: false, reason: out.reason, directives: out.directives };
      return { ok: true, reservationId: out.id, reservedLkr: this.toLkr(est), directives: out.directives, alerts: out.alerts };
    } catch (e) {
      if (e instanceof LedgerUnavailableError) return { ok: false, reason: "ledger_unavailable", directives: [] };
      throw e;
    }
  }

  /** Replace a reservation with the real cost. Overshoot (actual above reserved) is recorded, never hidden. */
  async settle(id: string, actualMicro: number, fallback?: { category: Category }): Promise<{ overshootLkr: number; lateSettlement: boolean }> {
    const at = this.clock();
    const p = this.parts(at);
    const actual = Math.max(0, Math.ceil(actualMicro));
    const res = await this.o.store.transact((s) => {
      const r = s.reservations[id];
      if (r) {
        delete s.reservations[id];
        this.add(s, r.dayKey, r.monthKey, r.category, actual);
        return { overshoot: Math.max(0, actual - r.micro), late: false, alerts: this.newAlerts(s, at) };
      }
      // Already swept (taken as spent at its reserved amount) or unknown: add the actual cost now, flagged as late.
      this.add(s, p.dayKey, p.monthKey, fallback?.category ?? "text", actual);
      return { overshoot: 0, late: true, alerts: this.newAlerts(s, at) };
    });
    this.emit(res.alerts);
    return { overshootLkr: this.toLkr(res.overshoot), lateSettlement: res.late };
  }

  /** Settle from usage metadata. Unknown usage is charged at the reserved estimate (the conservative rule). */
  async settleUsage(id: string, model: string, usage: Usage, usageKnown: boolean, category: Category = "text"): Promise<{ costLkr: number; overshootLkr: number; lateSettlement: boolean }> {
    const price = findModelPrice(this.o.prices, model);
    let micro: number;
    if (usageKnown && price) {
      micro = this.usdToMicro(costUsd(entryAt(price, new Date(this.clock())), usage));
    } else {
      // Unknown usage, or a model the price table does not know: charge what was reserved.
      const r = await this.o.store.transact((s) => s.reservations[id]?.micro, { write: false });
      micro = r ?? 0;
    }
    const s = await this.settle(id, micro, { category });
    return { costLkr: this.toLkr(micro), ...s };
  }

  /** Call failed in a way the provider does not bill (a 4xx/5xx response): give the reservation back. */
  async release(id: string): Promise<void> {
    await this.o.store.transact((s) => {
      delete s.reservations[id];
    });
  }

  /** Outcome unknown (timeout, dropped connection): the reserved amount becomes spent. */
  async charge(id: string): Promise<void> {
    const r = await this.o.store.transact((s) => s.reservations[id]?.micro, { write: false });
    if (r !== undefined) await this.settle(id, r);
  }

  /** The directives that apply right now, without reserving anything. If the ledger is unavailable, everything is restricted. */
  async directives(): Promise<Directive[]> {
    const at = this.clock();
    try {
      return await this.o.store.transact((s) => this.directivesFor(s, at), { write: false });
    } catch (e) {
      if (e instanceof LedgerUnavailableError) return [...ALL_DIRECTIVES];
      throw e;
    }
  }

  async status(): Promise<BudgetStatus> {
    const at = this.clock();
    const p = this.parts(at);
    const base = {
      monthKey: p.monthKey,
      dayKey: p.dayKey,
      limits: { softLkr: this.o.budget.softLkr, hardLkr: this.o.budget.hardLkr, reserveLkr: this.o.budget.reserveLkr, monthlyLkr: this.o.budget.monthlyLkr, dailyCapLkr: this.o.budget.dailyCapLkr },
      priceTableVersion: this.o.prices.version,
      lkrPerUsd: this.o.budget.lkrPerUsd,
    };
    try {
      return await this.o.store.transact(
        (s) => {
          const b: Bucket = s.months[p.monthKey] ?? emptyBucket();
          const offset = s.offsetMicro[p.monthKey] ?? 0;
          const total = b.text + b.voice + b.search + offset;
          const reserved = this.reservedFor(s, "monthKey", p.monthKey);
          return {
            ledgerOk: true,
            ...base,
            spentLkr: { total: this.toLkr(total), text: this.toLkr(b.text), voice: this.toLkr(b.voice), search: this.toLkr(b.search) },
            reservedLkr: this.toLkr(reserved),
            dayLkr: this.toLkr(this.daySpent(s, p.dayKey)),
            remainingToSoftLkr: this.o.budget.softLkr - this.toLkr(total + reserved),
            remainingToHardLkr: this.o.budget.hardLkr - this.toLkr(total + reserved),
            directives: this.directivesFor(s, at),
          };
        },
        { write: false },
      );
    } catch (e) {
      if (!(e instanceof LedgerUnavailableError)) throw e;
      return {
        ledgerOk: false,
        ...base,
        spentLkr: { total: NaN, text: NaN, voice: NaN, search: NaN },
        reservedLkr: NaN,
        dayLkr: NaN,
        remainingToSoftLkr: 0,
        remainingToHardLkr: 0,
        directives: [...ALL_DIRECTIVES],
      };
    }
  }

  /**
   * Record the provider's own figure for the month (typed in from its console or billing export) and measure the drift. When `apply`
   * is true the ledger is corrected by an offset so that it matches the provider's figure.
   */
  async reconcile(input: { providerReportedUsd: number; apply?: boolean; thresholdPct?: number; month?: string }): Promise<ReconcileResult> {
    const at = this.clock();
    const month = input.month ?? this.parts(at).monthKey;
    const providerMicro = this.usdToMicro(Math.max(0, input.providerReportedUsd));
    const threshold = input.thresholdPct ?? 10;
    const res = await this.o.store.transact((s) => {
      const b = s.months[month] ?? emptyBucket();
      const app = b.text + b.voice + b.search + (s.offsetMicro[month] ?? 0);
      const drift = providerMicro - app;
      const pct = providerMicro === 0 ? (app === 0 ? 0 : 100) : (Math.abs(drift) / providerMicro) * 100;
      const apply = input.apply === true;
      if (apply) s.offsetMicro[month] = (s.offsetMicro[month] ?? 0) + drift;
      s.reconciliations.push({ at, month, appMicro: app, providerMicro, driftPct: pct, applied: apply });
      if (s.reconciliations.length > 200) s.reconciliations.splice(0, s.reconciliations.length - 200);
      return { app, drift, pct, apply };
    });
    return {
      month,
      appUsd: res.app / 1e6,
      providerUsd: providerMicro / 1e6,
      driftUsd: res.drift / 1e6,
      driftPct: res.pct,
      flagged: res.pct > threshold,
      applied: res.apply,
    };
  }
}
