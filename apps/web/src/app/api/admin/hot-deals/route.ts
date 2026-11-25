import { bannerFront } from "@/lib/admin/banner-api";
import { requireAdmin } from "@/lib/admin/auth";
import { getErpSnapshot } from "@/lib/erp/catalogue";
import { HOT_PLACEMENT, hotDealsSchema, toPicker } from "@/lib/hot-deals";
import { errorResponse, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Admin: search the ERP catalogue for products to add to Hot Deals (?q=name, brand or SKU; or ?ids=a,b to look some up). */
export async function GET(req: Request) {
  const access = await requireAdmin();
  if (access.kind !== "ok") return errorResponse(access.kind === "signed-out" ? 401 : 403, "FORBIDDEN", "You do not have access to this.");
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 60);
  const ids = (url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 24);
  try {
    const all = [...(await getErpSnapshot()).products.values()];
    if (ids.length) return json({ items: ids.map((id) => all.find((p) => p.id === id)).filter(Boolean).map((p) => toPicker(p!)) });
    const hit = (p: (typeof all)[number]) => !q || `${p.name} ${p.brand ?? ""} ${p.sku ?? ""}`.toLowerCase().includes(q);
    return json({ items: all.filter(hit).slice(0, 20).map(toPicker) });
  } catch {
    return errorResponse(503, "ERP_UNAVAILABLE", "The catalogue could not be loaded from the ERP.");
  }
}

/** Admin: save the Hot Deals settings (the whole config). */
export async function PUT(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = hotDealsSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const i = body.error.issues[0];
    return errorResponse(422, "INVALID", `${i.path.join(" > ") || "Settings"}: ${i.message.toLowerCase()}.`);
  }
  const cfg = body.data;
  if (cfg.endsAt) {
    const t = Date.parse(cfg.endsAt);
    if (!Number.isFinite(t)) return errorResponse(422, "INVALID", "The end time is not a valid date.");
    if (t <= Date.now() + 60_000) return errorResponse(422, "INVALID", "The end time must be in the future.");
    if (t > Date.now() + 90 * 24 * 3600_000) return errorResponse(422, "INVALID", "The end time can be at most 90 days from now.");
    cfg.endsAt = new Date(t).toISOString();
  }
  if (cfg.mode === "chosen" && cfg.productIds.length === 0) return errorResponse(422, "INVALID", "Choose at least one product, or switch to automatic.");
  cfg.productIds = [...new Set(cfg.productIds)];
  const row = await ctx.db
    .$transaction(async (tx) => {
      await tx.banner.deleteMany({ where: { placement: HOT_PLACEMENT } });
      return tx.banner.create({ data: { placement: HOT_PLACEMENT, headline: cfg.title, text: JSON.stringify(cfg), ctaLabel: "Deals", href: "hot-deals", active: true, updatedBy: ctx.email }, select: { id: true } });
    })
    .catch(() => null);
  if (!row) return errorResponse(500, "SERVER_ERROR", "Could not save. Please try again.");
  return json({ ok: true });
}

/** Admin: back to the defaults (section on, automatic, no countdown). */
export async function DELETE(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  await ctx.db.banner.deleteMany({ where: { placement: HOT_PLACEMENT } }).catch(() => null);
  return json({ ok: true });
}
