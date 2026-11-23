import { z } from "zod";
import { getSnapshot } from "@/lib/erp/catalogue";
import { mapErpError } from "@/lib/erp/errors";
import { toRecentProduct } from "@/lib/recent-products";
import { errorResponse, guard, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const MAX_IDS = 12;
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const querySchema = z.object({ ids: z.string().trim().min(1).max(MAX_IDS * 65) });

/**
 * Read-only "recently viewed" lookup. It accepts a bounded, comma-separated list of product IDs (the shopper's own history,
 * kept in their browser) and returns the whitelisted public fields of those products from the same catalogue snapshot every
 * public page uses: the tenant is whichever ERP the site is configured for, no tenant or URL is ever taken from the request,
 * and only published website content is overlaid. Unknown or removed IDs are simply left out.
 */
export async function GET(req: Request) {
  const blocked = guard(req, { name: "recent", limit: 60, windowMs: 60_000 });
  if (blocked) return blocked;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return errorResponse(400, "INVALID_QUERY", "Invalid query parameters.");
  const requested = parsed.data.ids.split(",").map((s) => s.trim());
  if (requested.length > MAX_IDS || !requested.every((id) => PRODUCT_ID.test(id))) return errorResponse(400, "INVALID_IDS", "Invalid product list.");
  try {
    const { products } = await getSnapshot();
    const found = [...new Set(requested)].flatMap((id) => {
      const p = products.get(id);
      return p ? [toRecentProduct(p)] : [];
    });
    return json({ products: found });
  } catch (e) {
    const m = mapErpError(e);
    return errorResponse(m.status, m.code, m.message);
  }
}
