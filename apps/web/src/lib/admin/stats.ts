import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getSnapshot } from "../erp/catalogue";
import { getSettings, ping } from "../erp/settings";
import type { ErpProduct, ErpSettings } from "../erp/types";
import type { DisplayLine } from "../orders/web-orders";
import { accessoryAttachment, averageOrderValue } from "./metrics";

export const LOW_STOCK_AT = 5;
export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export const parseRange = (v: string | undefined): Range => (RANGES.find((r) => String(r) === v) ?? 30) as Range;

const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" }); // YYYY-MM-DD in Sri Lanka time
const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-LK", { month: "short", day: "numeric", timeZone: "UTC" });

const pct = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

export interface CatalogueInfo {
  products: ErpProduct[];
  syncedAt: Date;
}

/** The cached ERP catalogue, or null when the ERP cannot be reached (callers show an honest error). */
export async function catalogue(): Promise<CatalogueInfo | null> {
  try {
    const s = await getSnapshot();
    return { products: [...s.products.values()], syncedAt: new Date(s.syncedAt) };
  } catch {
    return null;
  }
}

export const isLow = (p: ErpProduct) => p.purchasableQuantity > 0 && p.purchasableQuantity <= LOW_STOCK_AT;
export const isOut = (p: ErpProduct) => p.purchasableQuantity <= 0 || !p.available;

export interface ErpHealth {
  reachable: boolean;
  settings: ErpSettings | null;
  checkedAt: Date;
}

/** Live check: "Connected" is only ever shown when the ERP actually answered just now. */
export async function erpHealth(): Promise<ErpHealth> {
  const reachable = await ping();
  let settings: ErpSettings | null = null;
  if (reachable) settings = await getSettings({ fresh: true }).catch(() => null);
  return { reachable, settings, checkedAt: new Date() };
}

export async function dashboardData(db: PrismaClient, days: Range) {
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const prevSince = new Date(since.getTime() - days * 86_400_000);

  const [orders, recent, customersTotal, customersNew, customersPrev, byPayment, cat, health, syncAll, placed, redemptions, links] = await Promise.all([
    db.webOrder.findMany({
      where: { createdAt: { gte: prevSince } },
      select: { externalRef: true, createdAt: true, total: true, erpStatus: true, syncStatus: true, items: true, paymentMethod: true, erpPaymentStatus: true },
      take: 20_000,
    }),
    db.webOrder.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.customer.count(),
    db.customer.count({ where: { createdAt: { gte: since } } }),
    db.customer.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
    db.webOrder.groupBy({ by: ["paymentMethod", "erpPaymentStatus"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    catalogue(),
    erpHealth(),
    db.webOrder.groupBy({ by: ["syncStatus"], _count: { _all: true } }),
    db.webOrder.count({ where: { erpStatus: "PLACED" } }),
    db.promotionRedemption.findMany({ where: { createdAt: { gte: prevSince } }, select: { createdAt: true, discount: true } }),
    db.accessoryLink.findMany({ select: { sourceItemId: true, accessoryItemId: true } }),
  ]);

  const cur = orders.filter((o) => o.createdAt >= since);
  const prev = orders.filter((o) => o.createdAt < since);
  const live = (o: { erpStatus: string | null }) => o.erpStatus !== "CANCELLED";
  const sum = (xs: typeof orders) => xs.filter(live).reduce((a, o) => a + Number(o.total), 0);

  // daily series (Sri Lanka calendar days)
  const series = new Map<string, number>();
  const counts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(now.getTime() - i * 86_400_000));
    series.set(k, 0);
    counts.set(k, 0);
  }
  for (const o of cur) {
    const k = dayKey(o.createdAt);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const o of cur.filter(live)) {
    const k = dayKey(o.createdAt);
    if (series.has(k)) series.set(k, (series.get(k) ?? 0) + Number(o.total));
  }

  // order status mix
  const status = new Map<string, number>();
  for (const o of cur) {
    const label = o.erpStatus ? o.erpStatus.charAt(0) + o.erpStatus.slice(1).toLowerCase() : o.syncStatus === "FAILED" ? "Needs attention" : "Waiting for ERP";
    status.set(label, (status.get(label) ?? 0) + 1);
  }

  // best sellers from the order lines stored with each order
  const top = new Map<string, { name: string; units: number; revenue: number }>();
  for (const o of cur.filter(live)) {
    for (const l of (o.items as unknown as DisplayLine[]) ?? []) {
      const t = top.get(l.itemId) ?? { name: l.name, units: 0, revenue: 0 };
      t.units += l.quantity;
      t.revenue += l.quantity * l.unitPrice;
      top.set(l.itemId, t);
    }
  }

  // payment method mix (only methods that were really used)
  const pay = new Map<string, number>();
  for (const r of byPayment) {
    const k = r.paymentMethod === "COD" ? (r.erpPaymentStatus === "COD_COLLECTED" ? "Cash on delivery: collected" : "Cash on delivery: to collect") : r.paymentMethod;
    pay.set(k, (pay.get(k) ?? 0) + r._count._all);
  }

  // recent ERP sync activity, derived from stored order records only
  const events = await db.webOrder.findMany({
    where: { OR: [{ syncedAt: { not: null } }, { lastError: { not: null } }] },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { externalRef: true, syncStatus: true, syncedAt: true, lastError: true, updatedAt: true, syncAttempts: true },
  });
  const timeline = events.map((e) =>
    e.syncStatus === "SYNCED" && e.syncedAt
      ? { tone: "green" as const, at: e.syncedAt, title: `Order ${e.externalRef} synced`, text: e.syncAttempts > 1 ? `Reached the ERP after ${e.syncAttempts} attempts` : "Sent to the ERP" }
      : { tone: e.syncStatus === "FAILED" ? ("red" as const) : ("amber" as const), at: e.updatedAt, title: `Order ${e.externalRef} ${e.syncStatus === "FAILED" ? "needs attention" : "waiting for ERP"}`, text: e.lastError ?? "" },
  );

  const lowStock = cat ? cat.products.filter((p) => isLow(p) || isOut(p)).sort((a, b) => a.purchasableQuantity - b.purchasableQuantity) : [];
  const liveCur = cur.filter(live);
  const livePrev = prev.filter(live);
  const aov = averageOrderValue(sum(cur), liveCur.length);
  const aovPrev = averageOrderValue(sum(prev), livePrev.length);
  const promoCur = redemptions.filter((r) => r.createdAt >= since);
  const promoPrev = redemptions.filter((r) => r.createdAt < since);
  const explained = (rows: typeof redemptions) => rows.reduce((n, r) => n + Number(r.discount), 0);
  const attachment = accessoryAttachment(
    liveCur.map((o) => ({ itemIds: ((o.items as unknown as DisplayLine[]) ?? []).map((l) => l.itemId) })),
    links,
  );

  return {
    generatedAt: now.getTime(),
    orders: { count: cur.length, delta: pct(cur.length, prev.length) },
    revenue: { value: sum(cur), delta: pct(sum(cur), sum(prev)) },
    customers: { total: customersTotal, delta: pct(customersNew, customersPrev), added: customersNew },
    products: cat ? cat.products.length : null,
    attention: {
      failed: syncAll.find((g) => g.syncStatus === "FAILED")?._count._all ?? 0,
      pending: syncAll.find((g) => g.syncStatus === "PENDING")?._count._all ?? 0,
      placed,
      low: cat ? cat.products.filter(isLow).length : null,
      out: cat ? cat.products.filter(isOut).length : null,
    },
    lowStockCount: cat ? cat.products.filter(isLow).length + cat.products.filter(isOut).length : null,
    lowStock: lowStock.slice(0, 6),
    health,
    catalogueSyncedAt: cat?.syncedAt ?? null,
    chart: [...series].map(([k, value]) => ({ label: dayLabel(k), value })),
    ordersPerDay: [...counts.values()],
    status: [...status].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    recent,
    timeline,
    top: [...top.values()].sort((a, b) => b.units - a.units).slice(0, 5),
    payments: [...pay].map(([label, value]) => ({ label, value })),
    aov: { value: aov, delta: aov != null && aovPrev != null ? pct(aov, aovPrev) : null },
    promotions: { redemptions: promoCur.length, explained: explained(promoCur), delta: pct(promoCur.length, promoPrev.length) },
    accessories: attachment,
    pendingPayment: liveCur.filter((o) => o.paymentMethod === "COD" && o.erpPaymentStatus !== "COD_COLLECTED").length,
  };
}

export async function customerCounts(db: PrismaClient) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [all, withOrders, recent] = await Promise.all([
    db.customer.count(),
    db.customer.count({ where: { webOrders: { some: {} } } }),
    db.customer.count({ where: { createdAt: { gte: since } } }),
  ]);
  return { all, withOrders, recent };
}
