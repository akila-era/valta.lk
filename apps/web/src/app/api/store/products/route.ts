import { z } from "zod";
import { listProducts } from "@/lib/erp/catalogue";
import { mapErpError } from "@/lib/erp/errors";
import { errorResponse, guard, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(80).optional(),
  sort: z.enum(["newest", "price-asc", "price-desc", "name"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
  onSale: z.enum(["1"]).transform(() => true).optional(),
});

export async function GET(req: Request) {
  const blocked = guard(req, { name: "products", limit: 120, windowMs: 60_000 });
  if (blocked) return blocked;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return errorResponse(400, "INVALID_QUERY", "Invalid query parameters.");
  try {
    return json(await listProducts(parsed.data));
  } catch (e) {
    const m = mapErpError(e);
    return errorResponse(m.status, m.code, m.message);
  }
}
