import { requireAdmin } from "@/lib/admin/auth";
import { csvCell, filterProducts } from "@/lib/admin/product-filter";
import { catalogue, isLow, isOut } from "@/lib/admin/stats";
import { effectivePrice } from "@/lib/erp/product-utils";
import { errorResponse, guard } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Admin: the filtered product list as CSV (same filters as the products page). */
export async function GET(req: Request) {
  const blocked = guard(req, { name: "admin-export", limit: 10, windowMs: 60_000 });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const cat = await catalogue();
  if (!cat) return errorResponse(503, "ERP_UNAVAILABLE", "The ERP catalogue could not be loaded.");
  const sp = new URL(req.url).searchParams;
  const list = filterProducts(cat.products, { q: sp.get("q") ?? undefined, category: sp.get("category") ?? undefined, brand: sp.get("brand") ?? undefined, stock: sp.get("stock") ?? undefined });
  const rows = [
    ["Name", "SKU", "Category", "Brand", "Price (LKR)", "Stock", "Stock status"],
    ...list.map((p) => [p.name, p.sku, p.category?.name, p.brand, effectivePrice(p).toFixed(2), Math.max(0, p.purchasableQuantity), isOut(p) ? "Out of stock" : isLow(p) ? "Low stock" : "In stock"]),
  ];
  const body = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="products.csv"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
