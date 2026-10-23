import { z } from "zod";
import { ACCESSORY_KINDS } from "@/lib/accessories/resolve";
import { adminProductRequest } from "@/lib/admin/product-api";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { getSnapshot } from "@/lib/erp/catalogue";
import { effectivePrice } from "@/lib/erp/product-utils";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({
  accessoryItemId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  kind: z.enum(ACCESSORY_KINDS).optional(),
  sourceVariantKey: z.string().trim().max(80).regex(/^[A-Za-z0-9_.:-]{0,80}$/).optional(),
});

/** Staff view of explicit links, including ones whose accessory is no longer in the catalogue. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guard(req, { name: "admin-accessories", limit: 60, windowMs: 60_000 });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorResponse(404, "NOT_FOUND", "Product not found.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  try {
    const [links, events, products] = await Promise.all([
      db.accessoryLink.findMany({ where: { sourceItemId: id }, orderBy: { createdAt: "asc" } }),
      db.recommendationEvent.groupBy({ by: ["accessoryItemId", "type"], where: { sourceItemId: id }, _count: { _all: true } }),
      getSnapshot().then((s) => s.products).catch(() => null),
    ]);
    const counts = new Map<string, { impression: number; click: number; add: number }>();
    for (const e of events) {
      const cur = counts.get(e.accessoryItemId) ?? { impression: 0, click: 0, add: 0 };
      if (e.type === "impression" || e.type === "click" || e.type === "add") cur[e.type] = e._count._all;
      counts.set(e.accessoryItemId, cur);
    }
    return json({
      links: links.map((l) => {
        const p = products?.get(l.accessoryItemId);
        return {
          accessoryItemId: l.accessoryItemId,
          sourceVariantKey: l.sourceVariantKey,
          kind: l.kind,
          name: p?.name ?? "Not in the current catalogue",
          inCatalogue: Boolean(p),
          available: Boolean(p?.available),
          unitPrice: p ? effectivePrice(p) : null,
          events: counts.get(l.accessoryItemId) ?? { impression: 0, click: 0, add: 0 },
        };
      }),
    });
  } catch {
    return errorResponse(500, "SERVER_ERROR", "Accessories could not be loaded.");
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await adminProductRequest(req, ctx.params, "admin-accessories", 60);
  if (!gate.ok) return gate.response;
  const parsed = body.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success || !parsed.data.kind) return errorResponse(422, "INVALID", "Choose an accessory from the catalogue and a type.");
  if (parsed.data.accessoryItemId === gate.id) return errorResponse(422, "INVALID", "A product cannot be an accessory for itself.");
  const sourceVariantKey = parsed.data.sourceVariantKey ?? "";
  let products;
  try {
    products = (await getSnapshot()).products;
  } catch {
    return errorResponse(503, "ERP_UNAVAILABLE", "The ERP catalogue could not be reached.");
  }
  const source = products.get(gate.id);
  const accessory = products.get(parsed.data.accessoryItemId);
  if (!accessory) return errorResponse(422, "INVALID", "That accessory is not in the ERP catalogue.");
  if (sourceVariantKey && !source?.variants.some((v) => v.key === sourceVariantKey)) return errorResponse(422, "INVALID", "That variant is not on this product.");
  try {
    await gate.db.accessoryLink.upsert({
      where: { sourceItemId_sourceVariantKey_accessoryItemId: { sourceItemId: gate.id, sourceVariantKey, accessoryItemId: parsed.data.accessoryItemId } },
      create: { sourceItemId: gate.id, sourceVariantKey, accessoryItemId: parsed.data.accessoryItemId, kind: parsed.data.kind, createdBy: gate.admin.email },
      update: { kind: parsed.data.kind },
    });
    return json({ ok: true });
  } catch {
    return errorResponse(500, "SERVER_ERROR", "The accessory link could not be saved.");
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await adminProductRequest(req, ctx.params, "admin-accessories", 60);
  if (!gate.ok) return gate.response;
  const parsed = body.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Choose the accessory to remove.");
  await gate.db.accessoryLink.deleteMany({ where: { sourceItemId: gate.id, accessoryItemId: parsed.data.accessoryItemId, sourceVariantKey: parsed.data.sourceVariantKey ?? "" } });
  return json({ ok: true });
}
