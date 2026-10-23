import { checkAvailability } from "@/lib/erp/availability";
import { mapErpError } from "@/lib/erp/errors";
import { quotePricedLines } from "@/lib/promotions/quote";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";
import { getCurrentCustomer } from "@/lib/auth/session";
import { availabilityRequestSchema } from "@/lib/validation/checkout";

export const dynamic = "force-dynamic";

/** Live availability and authoritative prices for the cart. Used for revalidation, never as a reservation. */
export async function POST(req: Request) {
  const blocked = guard(req, { name: "availability", limit: 60, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorResponse(400, "INVALID_JSON", "Invalid request body.");
  }
  const parsed = availabilityRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "INVALID_REQUEST", "Invalid cart contents.");
  try {
    const lines = parsed.data.lines.map((l) => ({ productId: l.productId, variantKey: l.variantKey, quantity: l.quantity }));
    const result = await checkAvailability(lines);
    const customer = await getCurrentCustomer().catch(() => null);
    const quote = await quotePricedLines(
      result.map((a) => ({
        productId: a.itemId,
        variantKey: a.variantKey,
        quantity: a.requested,
        listPrice: a.listPrice,
        erpPrice: a.unitPrice,
        categoryName: a.categoryName,
      })),
      { customerId: customer?.id ?? null },
    );
    return json({
      lines: lines.map((l) => {
        const a = result.find((x) => x.itemId === l.productId && (x.variantKey ?? "") === l.variantKey);
        const q = quote.lines.find((x) => x.productId === l.productId && x.variantKey === l.variantKey);
        return {
          productId: l.productId,
          variantKey: l.variantKey,
          available: a?.available ?? false,
          maxQuantity: a?.maxQuantity ?? null,
          unitPrice: a?.unitPrice ?? null,
          listPrice: a && a.listPrice > (a.unitPrice ?? 0) ? a.listPrice : null,
          offerName: q?.offerName ?? null,
        };
      }),
    });
  } catch (e) {
    const m = mapErpError(e);
    return errorResponse(m.status, m.code, m.message);
  }
}
