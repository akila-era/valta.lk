import { getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getErpSnapshot } from "@/lib/erp/catalogue";
import { boughtBy, reviewInput } from "@/lib/reviews";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/**
 * A shopper's review from the product page. It is saved as waiting for approval (staff approve it in the admin), so
 * nothing anyone posts appears on the site by itself. "Verified buyer" is decided here, never by the browser.
 */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "reviews", limit: 3, windowMs: 10 * 60_000, mutating: true });
  if (blocked) return blocked;
  const parsed = reviewInput.safeParse(await readJson(req, 6_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", parsed.error.issues[0]?.message ?? "Please check the review.");
  const input = parsed.data;
  if (input.company) return json({ ok: true });
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Reviews cannot be sent right now. Please try again later.");

  const snapshot = await getErpSnapshot().catch(() => null);
  if (!snapshot?.products.has(input.productId)) return errorResponse(404, "NOT_FOUND", "This product is no longer available.");

  const customer = await getCurrentCustomer().catch(() => null);
  const verified = customer ? await boughtBy(customer.id, input.productId) : false;
  try {
    await db.productReview.create({
      data: { erpItemId: input.productId, rating: input.rating, title: input.title, body: input.body, name: input.name, customerId: customer?.id, verified },
    });
    return json({ ok: true });
  } catch {
    return errorResponse(500, "SERVER_ERROR", "The review could not be sent. Please try again.");
  }
}
