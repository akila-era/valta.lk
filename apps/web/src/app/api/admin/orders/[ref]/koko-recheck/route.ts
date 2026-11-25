import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { recheckKokoAttempt } from "@/lib/payments/koko-service";
import { errorResponse, guard, json } from "@/lib/security/api";
import { orderRefParamSchema } from "@/lib/validation/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin action: ask Koko (orderView) about every unfinished attempt of an order and apply signed, final answers. */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const blocked = guard(req, { name: "admin-koko-recheck", limit: 20, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const ref = orderRefParamSchema.safeParse((await params).ref.trim().toUpperCase());
  if (!ref.success) return errorResponse(404, "NOT_FOUND", "Order not found.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  const attempts = await db.kokoPayment.findMany({ where: { orderRef: ref.data, status: { in: ["PENDING", "CANCELED", "FAILED"] } }, orderBy: { attemptNo: "desc" }, select: { kokoOrderId: true } });
  if (!attempts.length) return errorResponse(404, "NOT_FOUND", "No unfinished Koko payment for this order.");
  const results: Record<string, string> = {};
  for (const a of attempts) results[a.kokoOrderId] = await recheckKokoAttempt(db, a.kokoOrderId);
  const order = await db.webOrder.findUnique({ where: { externalRef: ref.data }, select: { paymentStatus: true, syncStatus: true } });
  return json({ results, order });
}
