import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { retryOrderNow } from "@/lib/orders/web-orders";
import { errorResponse, guard, json } from "@/lib/security/api";
import { orderRefParamSchema } from "@/lib/validation/checkout";

export const dynamic = "force-dynamic";

/** Admin action: try to send an order to the ERP again now. Idempotent: the ERP never creates a second order for the same reference. */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const blocked = guard(req, { name: "admin-retry", limit: 20, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const ref = orderRefParamSchema.safeParse((await params).ref.trim().toUpperCase());
  if (!ref.success) return errorResponse(404, "NOT_FOUND", "Order not found.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  const r = await retryOrderNow(db, ref.data);
  if (r.kind === "missing") return errorResponse(404, "NOT_FOUND", "Order not found.");
  const row = await db.webOrder.findUnique({ where: { externalRef: ref.data }, select: { syncStatus: true, syncAttempts: true, lastError: true, lastErrorCode: true } });
  return json({ result: r.kind, sync: row });
}
