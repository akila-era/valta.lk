import { z } from "zod";
import { bannerFront } from "@/lib/admin/banner-api";
import { PAGE_PLACEMENT, pageDef, pageSchema } from "@/lib/info-pages";
import { errorResponse, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const putSchema = z.object({ slug: z.string().max(40) }).and(pageSchema);

/** Admin: save the text of an info page ({"slug","title","intro","sections":[{"heading","body"}]}). Replaces any earlier version. */
export async function PUT(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = putSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const i = body.error.issues[0];
    return errorResponse(422, "INVALID", `${i.path.join(" > ") || "Page"}: ${i.message.toLowerCase()}.`);
  }
  if (!pageDef(body.data.slug)) return errorResponse(404, "NOT_FOUND", "Unknown page.");
  const { slug, title, intro, sections } = body.data;
  const row = await ctx.db
    .$transaction(async (tx) => {
      await tx.banner.deleteMany({ where: { placement: PAGE_PLACEMENT, href: slug } });
      return tx.banner.create({ data: { placement: PAGE_PLACEMENT, href: slug, headline: title, text: JSON.stringify({ intro, sections }), ctaLabel: "Page", active: true, updatedBy: ctx.email }, select: { id: true } });
    })
    .catch(() => null);
  if (!row) return errorResponse(500, "SERVER_ERROR", "Could not save the page. Please try again.");
  return json({ ok: true });
}

/** Admin: go back to the default text of a page ({"slug"}). */
export async function DELETE(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = z.object({ slug: z.string().max(40) }).safeParse(await req.json().catch(() => null));
  if (!body.success || !pageDef(body.data.slug)) return errorResponse(400, "INVALID", "Invalid request.");
  await ctx.db.banner.deleteMany({ where: { placement: PAGE_PLACEMENT, href: body.data.slug } }).catch(() => null);
  return json({ ok: true });
}
