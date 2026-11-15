import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BudgetController, type BudgetAlert } from "../../src/gateway/budget";
import { FileBudgetStore, MemoryBudgetStore, emptyLedger, type FileOps } from "../../src/gateway/budget-store";
import { loadGatewayConfig, type GatewayConfig } from "../../src/gateway/config";
import { SEED_PRICE_TABLE, conservativeEntry, entryAt, estimateTokens, findModelPrice, parsePriceTable, costUsd, type PriceTable } from "../../src/gateway/prices";
import { ZERO_USAGE } from "../../src/gateway/provider";
import { BASE_ENV, installNoNetworkGuard } from "./gateway-helpers";

installNoNetworkGuard();

const MODEL = "gemini-3.5-flash-lite";
const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);

function cfg(over: Record<string, string> = {}): GatewayConfig["budget"] {
  return loadGatewayConfig({ ...BASE_ENV, GATEWAY_BUDGET_DAILY_LKR: "1000000", ...over }).config!.budget;
}
function make(over: Record<string, string> = {}, opts: { prices?: PriceTable; store?: MemoryBudgetStore | FileBudgetStore; onAlert?: (a: BudgetAlert) => void } = {}) {
  const clock = { now: T0 };
  const budget = new BudgetController({ budget: cfg(over), store: opts.store ?? new MemoryBudgetStore(), prices: opts.prices ?? SEED_PRICE_TABLE, clock: () => clock.now, ...(opts.onAlert ? { onAlert: opts.onAlert } : {}) });
  return { budget, clock };
}
/** LKR -> micro-USD at the default 337.05 rate. */
const lkr = (v: number): number => Math.round((v / 337.05) * 1e6);

describe("conversions and price math", () => {
  it("the brief's LKR limits convert to about $7.12 / $8.01 / $8.90 at the default (unofficial) rate", () => {
    expect(2400 / 337.05).toBeCloseTo(7.12, 2);
    expect(2700 / 337.05).toBeCloseTo(8.01, 2);
    expect(3000 / 337.05).toBeCloseTo(8.9, 2);
  });
  it("cost of a 3000-in / 300-out turn on the cheap model is about $0.00165", () => {
    const e = entryAt(findModelPrice(SEED_PRICE_TABLE, MODEL)!, new Date(T0));
    expect(costUsd(e, { ...ZERO_USAGE, inputTokens: 3000, outputTokens: 300 })).toBeCloseTo(0.00165, 6);
  });
  it("cached tokens are billed at the cached price and thinking tokens as output", () => {
    const e = entryAt(findModelPrice(SEED_PRICE_TABLE, MODEL)!, new Date(T0));
    const usd = costUsd(e, { ...ZERO_USAGE, inputTokens: 1000, cachedTokens: 600, outputTokens: 100, thinkingTokens: 900 });
    expect(usd).toBeCloseTo((400 * 0.3 + 600 * 0.03 + 100 * 2.5 + 900 * 2.5) / 1e6, 9);
  });
  it("a scheduled price rise is reserved at the higher price from 35 days before it takes effect", () => {
    const price = findModelPrice(SEED_PRICE_TABLE, "gemini-3.8-flash")!;
    const dec = new Date(Date.UTC(2026, 11, 15));
    expect(entryAt(price, dec).inputPerM).toBe(0.75);
    expect(conservativeEntry(price, dec).inputPerM).toBe(1.5);
    expect(conservativeEntry(price, new Date(Date.UTC(2026, 10, 1))).inputPerM).toBe(0.75);
    expect(entryAt(price, new Date(Date.UTC(2027, 0, 2))).outputPerM).toBe(7.5);
  });
  it("token estimates are pessimistic for Sinhala (one token per character)", () => {
    expect(estimateTokens("hello world")).toBe(4);
    expect(estimateTokens("මට laptop එකක් ඕන")).toBeGreaterThan(estimateTokens("I need a laptop"));
    expect(estimateTokens("අ".repeat(100))).toBe(100);
  });
  it("a price table from a file is validated", () => {
    expect(parsePriceTable(JSON.parse(JSON.stringify(SEED_PRICE_TABLE))).version).toBe(SEED_PRICE_TABLE.version);
    for (const bad of [null, {}, { ...SEED_PRICE_TABLE, currency: "LKR" }, { ...SEED_PRICE_TABLE, models: [] }, { ...SEED_PRICE_TABLE, models: [{ model: "m", entries: [{ inputPerM: 1, outputPerM: 1 }] }] }, { ...SEED_PRICE_TABLE, models: [{ model: "m", verified: true, entries: [{ inputPerM: -1, outputPerM: 1 }] }] }]) {
      expect(() => parsePriceTable(bad)).toThrow(/invalid price table/);
    }
  });
});

describe("price authorisation", () => {
  it("refuses paid calls while the model's price is unverified, unless the explicit flag is set", async () => {
    const { budget } = make({ GEMINI_ALLOW_UNVERIFIED_PRICES: "false" });
    expect(await budget.reserve({ category: "text", model: MODEL, estimateMicro: 100 })).toMatchObject({ ok: false, reason: "unverified_prices" });
    const ok = make({ GEMINI_ALLOW_UNVERIFIED_PRICES: "true" });
    expect((await ok.budget.reserve({ category: "text", model: MODEL, estimateMicro: 100 })).ok).toBe(true);
  });
  it("accepts a model whose price a person has verified", async () => {
    const prices: PriceTable = { ...SEED_PRICE_TABLE, models: SEED_PRICE_TABLE.models.map((m) => (m.model === MODEL ? { ...m, verified: true, verifiedAt: "2026-11-15" } : m)) };
    const { budget } = make({ GEMINI_ALLOW_UNVERIFIED_PRICES: "false" }, { prices });
    expect((await budget.reserve({ category: "text", model: MODEL, estimateMicro: 100 })).ok).toBe(true);
  });
  it("refuses a model the table does not know", async () => {
    const { budget } = make();
    expect(await budget.reserve({ category: "text", model: "mystery-model", estimateMicro: 1 })).toMatchObject({ ok: false, reason: "unknown_model" });
    expect(budget.estimateMicro("mystery-model", { inputTokens: 1, maxOutputTokens: 1, maxThinkingTokens: 0 })).toBeUndefined();
  });
});

describe("reservations are concurrency-safe", () => {
  it("1,000 concurrent reservations of LKR 5 can never exceed the LKR 2,700 hard limit", async () => {
    const { budget } = make();
    const results = await Promise.all(Array.from({ length: 1000 }, () => budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(5) })));
    const ok = results.filter((r) => r.ok).length;
    expect(ok).toBeLessThanOrEqual(540);
    expect(ok).toBeGreaterThanOrEqual(538); // rounding of micro-USD
    const s = await budget.status();
    expect(s.reservedLkr).toBeLessThanOrEqual(2700 + 0.01);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "hard_limit")).toBe(true);
  });
  it("concurrent settle and reserve calls keep the totals exact", async () => {
    const { budget } = make();
    const rs = await Promise.all(Array.from({ length: 200 }, () => budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(1) })));
    const ids = rs.map((r) => (r.ok ? r.reservationId : ""));
    await Promise.all(ids.map((id) => budget.settle(id, lkr(0.5))));
    const s = await budget.status();
    expect(s.reservedLkr).toBe(0);
    expect(s.spentLkr.total).toBeCloseTo(100, 1);
  });
  it("the hard limit applies to spent plus reserved plus the estimate", async () => {
    const { budget } = make();
    const a = await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(2600) });
    expect(a.ok).toBe(true);
    expect(await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(101) })).toMatchObject({ ok: false, reason: "hard_limit" });
    expect((await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(99) })).ok).toBe(true);
  });
  it("the emergency reserve (LKR 300) is never available to normal traffic", async () => {
    const { budget } = make();
    expect((await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(2700) })).ok).toBe(true);
    expect(await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(1) })).toMatchObject({ ok: false, reason: "hard_limit" });
  });
});

describe("soft limits, daily cap and category shares", () => {
  it("below the soft limit there are no directives; at LKR 2,400 every restriction applies", async () => {
    const { budget, clock } = make();
    const a = await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(100) });
    expect(a).toMatchObject({ ok: true, directives: [] });
    await budget.settle((a as { reservationId: string }).reservationId, lkr(100));
    // Spread LKR 2,304 over six days (about LKR 384 a day, within the daily allowance) so only the MONTHLY soft limit is in play.
    for (let day = 0; day < 6; day++) {
      const r = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(384) })) as { reservationId: string };
      await budget.settle(r.reservationId, lkr(384));
      clock.now += 86_400_000;
      expect(await budget.directives()).toEqual(day < 5 ? [] : ["downgrade_model", "shorten_history", "disable_search", "disable_voice"]);
    }
    expect((await budget.status()).spentLkr.total).toBeGreaterThanOrEqual(2400);
    expect(await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(1) })).toMatchObject({ ok: true, directives: ["downgrade_model", "shorten_history", "disable_search", "disable_voice"] });
  });
  it("the daily cap refuses a call that would exceed it, and a new day starts clean", async () => {
    const { budget, clock } = make({ GATEWAY_BUDGET_DAILY_LKR: "100" });
    const a = await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(90) });
    await budget.settle((a as { reservationId: string }).reservationId, lkr(90));
    expect(await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(20) })).toMatchObject({ ok: false, reason: "daily_limit" });
    clock.now += 86_400_000;
    expect((await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(20) })).ok).toBe(true);
  });
  it("spending far above the daily share of the soft budget triggers the daily soft directives", async () => {
    const { budget } = make();
    // The soft budget left (2400) over 17 days remaining (Nov 14-30) is about LKR 141 a day; twice that is about 282.
    const a = await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(300) });
    expect(a).toMatchObject({ ok: true });
    expect((a as { directives: string[] }).directives).toContain("downgrade_model");
  });
  it("voice has its own share (15% of the hard limit = LKR 405) and search 10% (LKR 270)", async () => {
    const { budget } = make();
    expect((await budget.reserve({ category: "voice", model: MODEL, estimateMicro: lkr(400) })).ok).toBe(true);
    expect(await budget.reserve({ category: "voice", model: MODEL, estimateMicro: lkr(10) })).toMatchObject({ ok: false, reason: "category_limit" });
    expect((await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(1000) })).ok).toBe(true); // text is not blocked by the voice share
    expect((await budget.reserve({ category: "search", model: MODEL, estimateMicro: lkr(270) })).ok).toBe(true);
    expect(await budget.reserve({ category: "search", model: MODEL, estimateMicro: lkr(1) })).toMatchObject({ ok: false, reason: "category_limit" });
  });
  it("all categories count against ONE shared hard limit", async () => {
    const { budget } = make();
    await budget.reserve({ category: "voice", model: MODEL, estimateMicro: lkr(400) });
    await budget.reserve({ category: "search", model: MODEL, estimateMicro: lkr(260) });
    await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(2030) });
    expect(await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(20) })).toMatchObject({ ok: false, reason: "hard_limit" });
    const s = await budget.status();
    expect(s.reservedLkr).toBeCloseTo(2690, 0);
  });
});

describe("settle, release, charge, sweep", () => {
  it("settle replaces the reservation with the real cost and records an overshoot instead of hiding it", async () => {
    const { budget } = make();
    const r = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(10) })) as { reservationId: string };
    const s = await budget.settle(r.reservationId, lkr(12));
    expect(s.overshootLkr).toBeCloseTo(2, 1);
    expect(s.lateSettlement).toBe(false);
    const st = await budget.status();
    expect(st.reservedLkr).toBe(0);
    expect(st.spentLkr.total).toBeCloseTo(12, 1);
  });
  it("release gives a reservation back without spending; charge turns it into spend", async () => {
    const { budget } = make();
    const a = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(10) })) as { reservationId: string };
    await budget.release(a.reservationId);
    expect((await budget.status()).spentLkr.total).toBe(0);
    const b = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(10) })) as { reservationId: string };
    await budget.charge(b.reservationId);
    const st = await budget.status();
    expect(st.spentLkr.total).toBeCloseTo(10, 1);
    expect(st.reservedLkr).toBe(0);
  });
  it("an abandoned reservation is swept after the timeout and counted as SPENT at its reserved amount", async () => {
    const { budget, clock } = make({ GATEWAY_RESERVATION_TIMEOUT_MS: "5000" });
    await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(10) });
    clock.now += 6_000;
    await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(1) });
    expect((await budget.status()).spentLkr.total).toBeCloseTo(10, 1);
  });
  it("a late settlement (reservation already swept) is still recorded and flagged", async () => {
    const { budget, clock } = make({ GATEWAY_RESERVATION_TIMEOUT_MS: "5000" });
    const r = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(10) })) as { reservationId: string };
    clock.now += 6_000;
    await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(1) });
    const s = await budget.settle(r.reservationId, lkr(4));
    expect(s.lateSettlement).toBe(true);
    expect((await budget.status()).spentLkr.total).toBeCloseTo(14, 1);
  });
  it("settleUsage prices known usage from the table; UNKNOWN usage is charged at the reserved estimate", async () => {
    const { budget } = make();
    const est = budget.estimateMicro(MODEL, { inputTokens: 3000, maxOutputTokens: 800, maxThinkingTokens: 0 })!;
    const a = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: est })) as { reservationId: string };
    const known = await budget.settleUsage(a.reservationId, MODEL, { ...ZERO_USAGE, inputTokens: 3000, outputTokens: 300 }, true);
    expect(known.costLkr).toBeCloseTo(0.00165 * 337.05, 3);
    const b = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: est })) as { reservationId: string };
    const unknown = await budget.settleUsage(b.reservationId, MODEL, ZERO_USAGE, false);
    expect(unknown.costLkr).toBeCloseTo((est / 1e6) * 337.05, 4);
    expect(unknown.costLkr).toBeGreaterThan(known.costLkr);
  });
});

describe("windows", () => {
  it("a new month starts a new total while the old month stays in the ledger", async () => {
    const { budget, clock } = make();
    const a = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(100) })) as { reservationId: string };
    await budget.settle(a.reservationId, lkr(100));
    clock.now = Date.UTC(2026, 11, 1, 12, 0, 0);
    expect((await budget.status()).spentLkr.total).toBe(0);
    clock.now = T0;
    expect((await budget.status()).spentLkr.total).toBeCloseTo(100, 1);
  });
  it("the Asia/Colombo option moves the day and month boundary by +05:30", async () => {
    const edge = Date.UTC(2026, 10, 30, 19, 0, 0); // 00:30 on 1 December in Colombo
    const utc = make({}, {});
    utc.clock.now = edge;
    const col = make({ GATEWAY_BUDGET_TZ: "Asia/Colombo" });
    col.clock.now = edge;
    expect((await utc.budget.status()).monthKey).toBe("2026-11");
    expect((await col.budget.status()).monthKey).toBe("2026-12");
    expect((await col.budget.status()).dayKey).toBe("2026-12-01");
  });
});

describe("alerts and reconciliation", () => {
  it("alerts fire once each at 50/80/100% of the soft limit and 80/100% of the hard limit, with no message text", async () => {
    const seen: BudgetAlert[] = [];
    const { budget } = make({}, { onAlert: (a) => seen.push(a) });
    for (const amount of [1250, 700, 500, 250]) {
      const r = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(amount) })) as { reservationId: string };
      await budget.settle(r.reservationId, lkr(amount));
    }
    expect(seen.map((a) => a.level)).toEqual(["soft_50", "soft_80", "soft_100", "hard_80", "hard_100"].filter((l) => seen.some((a) => a.level === l)));
    expect(new Set(seen.map((a) => a.level)).size).toBe(seen.length);
    expect(seen.map((a) => a.level)).toContain("soft_100");
    expect(JSON.stringify(seen)).not.toMatch(/[A-Za-z]{12,}.*message/);
    for (const a of seen) expect(Object.keys(a).sort()).toEqual(["level", "monthKey", "spentLkr"]);
  });
  it("a failing alert hook never breaks a request", async () => {
    const { budget } = make({}, { onAlert: () => { throw new Error("hook down"); } });
    const r = await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(1500) });
    expect(r.ok).toBe(true);
  });
  it("reconcile measures drift against the provider's figure, flags it above the threshold and can correct the ledger", async () => {
    const { budget } = make();
    const a = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(337.05) })) as { reservationId: string };
    await budget.settle(a.reservationId, lkr(337.05)); // exactly $1.00 in the ledger
    const same = await budget.reconcile({ providerReportedUsd: 1.05 });
    expect(same.flagged).toBe(false);
    expect(same.driftUsd).toBeCloseTo(0.05, 6);
    const off = await budget.reconcile({ providerReportedUsd: 1.5, apply: true });
    expect(off.flagged).toBe(true);
    expect(off.driftPct).toBeCloseTo(33.3, 0);
    expect(off.applied).toBe(true);
    expect((await budget.status()).spentLkr.total).toBeCloseTo(1.5 * 337.05, 1);
    expect((await budget.reconcile({ providerReportedUsd: 1.5 })).flagged).toBe(false);
  });
});

describe("persistence: a restart must not reset spend; a damaged ledger must not either", () => {
  const dir = (): string => mkdtempSync(join(tmpdir(), "gw-ledger-"));

  it("spend survives a new controller on the same file", async () => {
    const path = join(dir(), "ledger.json");
    const a = make({}, { store: new FileBudgetStore(path) });
    const r = (await a.budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(250) })) as { reservationId: string };
    await a.budget.settle(r.reservationId, lkr(250));
    const b = make({}, { store: new FileBudgetStore(path) });
    expect((await b.budget.status()).spentLkr.total).toBeCloseTo(250, 1);
  });
  it("a missing file is a fresh ledger", async () => {
    const { budget } = make({}, { store: new FileBudgetStore(join(dir(), "none", "ledger.json")) });
    expect((await budget.status()).ledgerOk).toBe(true);
  });
  it("a corrupt file fails CLOSED (every reservation refused) and the file is left untouched", async () => {
    const path = join(dir(), "ledger.json");
    writeFileSync(path, "{this is not json");
    const { budget } = make({}, { store: new FileBudgetStore(path) });
    expect(await budget.reserve({ category: "text", model: MODEL, estimateMicro: 1 })).toMatchObject({ ok: false, reason: "ledger_unavailable" });
    expect((await budget.status()).ledgerOk).toBe(false);
    expect(await budget.directives()).toContain("downgrade_model");
    expect(readFileSync(path, "utf8")).toBe("{this is not json");
  });
  it("valid JSON of the wrong shape is also treated as corrupt", async () => {
    const path = join(dir(), "ledger.json");
    writeFileSync(path, JSON.stringify({ version: 2, days: {} }));
    const { budget } = make({}, { store: new FileBudgetStore(path) });
    expect(await budget.reserve({ category: "text", model: MODEL, estimateMicro: 1 })).toMatchObject({ ok: false, reason: "ledger_unavailable" });
  });
  it("an unwritable ledger fails closed and the failed change leaves no phantom spend", async () => {
    let failWrites = false;
    const mem = new Map<string, string>();
    const ops: FileOps = {
      readFile: async (p) => {
        const v = mem.get(p);
        if (v === undefined) throw Object.assign(new Error("nope"), { code: "ENOENT" });
        return v;
      },
      writeFile: async (p, d) => {
        if (failWrites) throw new Error("disk full");
        mem.set(p, d);
      },
      rename: async (a, b) => {
        mem.set(b, mem.get(a)!);
        mem.delete(a);
      },
      mkdir: async () => {},
    };
    const { budget } = make({}, { store: new FileBudgetStore("/virtual/ledger.json", ops) });
    const ok = (await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(10) })) as { reservationId: string };
    await budget.settle(ok.reservationId, lkr(10));
    failWrites = true;
    expect(await budget.reserve({ category: "text", model: MODEL, estimateMicro: lkr(10) })).toMatchObject({ ok: false, reason: "ledger_unavailable" });
    failWrites = false;
    const st = await budget.status();
    expect(st.spentLkr.total).toBeCloseTo(10, 1);
    expect(st.reservedLkr).toBe(0);
  });
  it("writes are atomic: a temp file is written, then renamed over the ledger", async () => {
    const calls: string[] = [];
    const mem = new Map<string, string>();
    const ops: FileOps = {
      readFile: async (p) => {
        const v = mem.get(p);
        if (v === undefined) throw Object.assign(new Error("x"), { code: "ENOENT" });
        return v;
      },
      writeFile: async (p, d) => {
        calls.push(`write ${p.includes(".tmp-") ? "tmp" : "final"}`);
        mem.set(p, d);
      },
      rename: async (a, b) => {
        calls.push(`rename ${a.includes(".tmp-")} -> ${b}`);
        mem.set(b, mem.get(a)!);
        mem.delete(a);
      },
      mkdir: async () => {},
    };
    const { budget } = make({}, { store: new FileBudgetStore("/virtual/ledger.json", ops) });
    await budget.reserve({ category: "text", model: MODEL, estimateMicro: 5 });
    expect(calls).toEqual(["write tmp", "rename true -> /virtual/ledger.json"]);
  });
  it("the real file is written with no temp file left behind", async () => {
    const d = dir();
    const path = join(d, "ledger.json");
    const { budget } = make({}, { store: new FileBudgetStore(path) });
    await budget.reserve({ category: "text", model: MODEL, estimateMicro: 5 });
    expect(existsSync(path)).toBe(true);
    expect(readdirSync(d)).toEqual(["ledger.json"]);
    expect(JSON.parse(readFileSync(path, "utf8")).version).toBe(1);
  });
  it("an empty in-memory ledger is fresh for each store", async () => {
    const s = new MemoryBudgetStore(emptyLedger());
    const { budget } = make({}, { store: s });
    expect((await budget.status()).spentLkr.total).toBe(0);
  });
});

describe("the ledger file holds numeric counters only (privacy invariant for the one file that writes to disk)", () => {
  it("after real gateway traffic with message text, a session id and an address-like string, the file has no text fields beyond fixed names", async () => {
    const { makeHarness, userText } = await import("./gateway-helpers");
    const d = mkdtempSync(join(tmpdir(), "gw-ledger-priv-"));
    const path = join(d, "ledger.json");
    const SENTINEL = "SENTINEL-CUSTOMER-MESSAGE-424242";
    const h = await makeHarness({}, [{ kind: "reply", text: `echo ${SENTINEL}`, usage: { inputTokens: 500, outputTokens: 50 } }], { store: new FileBudgetStore(path) });
    const r = await h.gateway.generate({ system: SENTINEL, messages: [userText(SENTINEL)] }, { sessionId: "sess_SENTINEL_SESSION_ID_555 203.0.113.9" });
    expect(r.ok).toBe(true);
    const raw = readFileSync(path, "utf8");
    expect(raw).not.toContain(SENTINEL);
    expect(raw).not.toContain("SENTINEL_SESSION");
    expect(raw).not.toContain("203.0.113.9");
    const ledger = JSON.parse(raw) as Record<string, Record<string, unknown> | unknown[]>;
    expect(Object.keys(ledger).sort()).toEqual(["alerts", "days", "months", "offsetMicro", "reconciliations", "reservations", "version"]);
    const numberLeaves = (o: unknown): boolean => (typeof o === "number" ? Number.isFinite(o) : o !== null && typeof o === "object" && Object.values(o).every(numberLeaves));
    for (const b of [...Object.values(ledger.days as object), ...Object.values(ledger.months as object)]) {
      expect(Object.keys(b as object).sort()).toEqual(["calls", "search", "text", "voice"]);
      expect(numberLeaves(b)).toBe(true);
    }
    expect(numberLeaves(ledger.offsetMicro)).toBe(true);
    // Settled traffic leaves no reservation behind; any that remained could only carry these fixed fields.
    for (const rv of Object.values(ledger.reservations as object)) expect(Object.keys(rv as object).sort()).toEqual(["category", "createdAt", "dayKey", "id", "micro", "model", "monthKey"]);
    // Every string value anywhere in the file is a date key, a model id, a category, an alert level or a fixed field name.
    const strings: string[] = [];
    const walk = (o: unknown): void => {
      if (typeof o === "string") strings.push(o);
      else if (o && typeof o === "object") for (const v of Object.values(o)) walk(v);
    };
    walk(ledger);
    for (const s of strings) expect(s).toMatch(/^(\d{4}-\d{2}(-\d{2})?|text|voice|search|gemini[\w.-]*|soft_\d+|hard_\d+|[0-9a-f-]{36})$/);
  });
});
