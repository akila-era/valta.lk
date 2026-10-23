import { requireAdmin } from "@/lib/admin/auth";
import { filterProducts } from "@/lib/admin/product-filter";
import { catalogue } from "@/lib/admin/stats";
import { errorResponse, guard, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Admin: find ERP products by name, SKU or ID (used to pick related products). */
export async function GET(req: Request) {
  const blocked = guard(req, { name: "admin-product-search", limit: 120, windowMs: 60_000 });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const cat = await catalogue();
  if (!cat) return errorResponse(503, "ERP_UNAVAILABLE", "The ERP catalogue could not be loaded.");
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  if (q.length < 2) return json({ items: [] });
  const byId = cat.products.find((p) => p.id.toLowerCase() === q.toLowerCase());
  const items = [...(byId ? [byId] : []), ...filterProducts(cat.products, { q })].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i).slice(0, 8);
  return json({ items: items.map((p) => ({ id: p.id, name: p.name, sku: p.sku ?? null, image: p.images[0] ?? null })) });
}
