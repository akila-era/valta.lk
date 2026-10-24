import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "../db";
import { getErpSnapshot } from "../erp/catalogue";
import type { ErpProduct } from "../erp/types";
import { dealStatus, type HotDealStatus } from "../hot-deals";
import { errorResponse, guard } from "../security/api";
import { requireAdmin } from "./auth";

type Front = { ok: true; db: PrismaClient; email: string } | { ok: false; response: Response };

/** Origin + rate limit, admin session and website database: the same front door as the other admin APIs. */
export async function hotDealFront(req: Request, mutating: boolean): Promise<Front> {
  const blocked = guard(req, { name: "admin-hot-deals", limit: 60, windowMs: 60_000, mutating });
  if (blocked) return { ok: false, response: blocked };
  const access = await requireAdmin();
  if (access.kind === "signed-out") return { ok: false, response: errorResponse(401, "SIGNED_OUT", "Please sign in.") };
  if (access.kind === "forbidden") return { ok: false, response: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") };
  const db = getDb();
  if (!db) return { ok: false, response: errorResponse(503, "NO_DATABASE", "Website database is not configured.") };
  return { ok: true, db, email: access.admin.email };
}

export const validDealId = (id: string) => /^[a-z0-9]{8,40}$/i.test(id);

/** The ERP catalogue, or null when it cannot be reached (callers decide whether that blocks the action). */
export async function erpProducts(): Promise<Map<string, ErpProduct> | null> {
  return getErpSnapshot()
    .then((s) => s.products)
    .catch(() => null);
}

export interface HotDealRow {
  id: string;
  erpItemId: string;
  sortOrder: number;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  updatedBy: string | null;
  /** What shoppers see right now; "unknown" when the ERP catalogue could not be read. */
  status: HotDealStatus | "unknown";
  /** Read-only ERP facts for the admin list. Prices are shown, never stored or edited here. */
  product: { name: string; sku: string | null; image: string | null; price: number; salePrice: number | null; available: boolean } | null;
}

type DbRow = { id: string; erpItemId: string; sortOrder: number; startsAt: Date; endsAt: Date | null; active: boolean; updatedBy: string | null; createdAt: Date };

export function presentHotDeal(row: DbRow, products: Map<string, ErpProduct> | null, now = new Date()): HotDealRow {
  const p = products?.get(row.erpItemId);
  return {
    id: row.id,
    erpItemId: row.erpItemId,
    sortOrder: row.sortOrder,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    active: row.active,
    updatedBy: row.updatedBy,
    status: products ? dealStatus(row, p, now) : "unknown",
    product: p ? { name: p.name, sku: p.sku ?? null, image: p.images[0] ?? null, price: p.price, salePrice: p.salePrice ?? null, available: p.available } : null,
  };
}

export async function listHotDeals(db: PrismaClient, products: Map<string, ErpProduct> | null): Promise<HotDealRow[]> {
  const rows = await db.hotDeal.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => presentHotDeal(r, products));
}
