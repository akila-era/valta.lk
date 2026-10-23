import { bannerFront, parseBannerForm } from "@/lib/admin/banner-api";
import { MAX_BANNERS } from "@/lib/banners";
import { errorResponse, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Admin: create a homepage banner (multipart: headline, ctaLabel, href, eyebrow, text, active, sortOrder, optional file). */
export async function POST(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const parsed = await parseBannerForm(req);
  if (!parsed.ok) return parsed.response;
  if ((await ctx.db.banner.count().catch(() => MAX_BANNERS)) >= MAX_BANNERS) return errorResponse(422, "TOO_MANY", `You can keep at most ${MAX_BANNERS} banners. Delete one first.`);
  const { data, image, placement } = parsed.form;
  if (placement === "WIDE" && !image) return errorResponse(422, "NO_FILE", "A wide banner needs a picture.");
  const row = await ctx.db.banner
    .create({ data: { ...data, placement, imageType: image?.type ?? null, imageData: image ? Buffer.from(image.bytes) : null, updatedBy: ctx.email }, select: { id: true } })
    .catch(() => null);
  if (!row) return errorResponse(500, "SERVER_ERROR", "Could not save the banner. Please try again.");
  return json({ id: row.id }, 201);
}
