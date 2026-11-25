import { bannerFront, parseBannerForm } from "@/lib/admin/banner-api";
import { isPictureBanner, MAX_BANNERS } from "@/lib/banners";
import { storeBannerImage } from "@/lib/admin/banner-image";
import { deleteObject } from "@/lib/media/storage";
import { errorResponse, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Admin: create a homepage banner (multipart: headline, ctaLabel, href, eyebrow, text, active, sortOrder, optional file). */
export async function POST(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const parsed = await parseBannerForm(req);
  if (!parsed.ok) return parsed.response;
  if ((await ctx.db.banner.count({ where: { placement: { in: ["CARDS", "WIDE", "SIDE"] } } }).catch(() => MAX_BANNERS)) >= MAX_BANNERS) return errorResponse(422, "TOO_MANY", `You can keep at most ${MAX_BANNERS} banners. Delete one first.`);
  const { data, image, placement } = parsed.form;
  if (isPictureBanner(placement) && !image) return errorResponse(422, "NO_FILE", "This kind of banner needs a picture.");
  const stored = image ? await storeBannerImage(image) : null;
  if (stored === "unavailable") return errorResponse(503, "STORAGE", "The image storage is unavailable. Please try again.");
  const row = await ctx.db.banner
    .create({ data: { ...data, placement, ...(stored ?? { imageType: null, imageData: null, imageKey: null }), updatedBy: ctx.email }, select: { id: true } })
    .catch(() => null);
  if (!row) {
    await deleteObject(stored?.imageKey);
    return errorResponse(500, "SERVER_ERROR", "Could not save the banner. Please try again.");
  }
  return json({ id: row.id }, 201);
}
