import "server-only";
import { z } from "zod";
import type { PrismaClient, Prisma, WebOrder } from "@/generated/prisma/client";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "./paging";
import { getOrder } from "../erp/order-tracking";


export const SYNC_FILTERS = ["pending", "synced", "failed"] as const;
export const ERP_FILTERS = ["PLACED", "CONFIRMED", "DISPATCHED", "DELIVERED", "CANCELLED"] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const adminQuerySchema = z.object({
  status: z.string().optional(),
  from: day.optional().catch(undefined),
  to: day.optional().catch(undefined),
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  size: z.coerce.number().int().refine((n) => (PAGE_SIZES as readonly number[]).includes(n)).catch(DEFAULT_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type AdminQuery = z.infer<typeof adminQuerySchema>;

export function buildWhere(q: AdminQuery): Prisma.WebOrderWhereInput {
  const and: Prisma.WebOrderWhereInput[] = [];
  const s = q.status ?? "";
  if ((SYNC_FILTERS as readonly string[]).includes(s)) and.push({ syncStatus: s.toUpperCase() as "PENDING" | "SYNCED" | "FAILED" });
  else if ((ERP_FILTERS as readonly string[]).includes(s)) and.push({ erpStatus: s });
  if (q.from) and.push({ createdAt: { gte: new Date(`${q.from}T00:00:00.000Z`) } });
  if (q.to) and.push({ createdAt: { lt: new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + 86_400_000) } });
  if (q.q) {
    const term = q.q;
    and.push({ OR: [{ externalRef: { contains: term.toUpperCase() } }, { customerName: { contains: term, mode: "insensitive" } }, { customerPhone: { contains: term.replace(/[\s-]/g, "") } }] });
  }
  return and.length ? { AND: and } : {};
}

export async function listOrders(db: PrismaClient, q: AdminQuery) {
  const where = buildWhere(q);
  const [rows, total, counts] = await Promise.all([
    db.webOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.size, take: q.size }),
    db.webOrder.count({ where }),
    db.webOrder.groupBy({ by: ["syncStatus"], _count: { _all: true } }),
  ]);
  const bySync = Object.fromEntries(counts.map((c) => [c.syncStatus, c._count._all])) as Record<string, number>;
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / q.size)), bySync };
}

/**
 * Refreshes the cached ERP status of the listed orders (the ERP is authoritative). Bounded concurrency; an ERP failure
 * leaves the previous cached value in place.
 */
export async function refreshFromErp(db: PrismaClient, rows: WebOrder[], maxAgeMs = 60_000): Promise<WebOrder[]> {
  const stale = rows.filter((r) => r.syncStatus === "SYNCED" && (!r.erpStatusAt || Date.now() - r.erpStatusAt.getTime() > maxAgeMs));
  const updated = new Map<string, WebOrder>();
  for (let i = 0; i < stale.length; i += 5) {
    await Promise.all(
      stale.slice(i, i + 5).map(async (r) => {
        try {
          const o = await getOrder(r.externalRef);
          updated.set(
            r.externalRef,
            await db.webOrder.update({
              where: { externalRef: r.externalRef },
              data: { erpStatus: o.status, erpPaymentStatus: o.paymentStatus ?? null, erpStatusAt: new Date(), trackingNumber: o.trackingNumber ?? null, carrierName: o.carrierName ?? null },
            }),
          );
        } catch {
          /* keep the cached copy */
        }
      }),
    );
  }
  return rows.map((r) => updated.get(r.externalRef) ?? r);
}

export const paymentLabel = (r: Pick<WebOrder, "paymentMethod" | "erpPaymentStatus" | "syncStatus">): string => {
  if (r.paymentMethod !== "COD") return r.paymentMethod;
  if (r.erpPaymentStatus === "COD_COLLECTED") return "COD: cash collected";
  return r.syncStatus === "SYNCED" ? "COD: pending collection" : "COD: pending (not yet in ERP)";
};
