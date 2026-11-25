import { bannerFront, parseBannerForm } from "@/lib/admin/banner-api";
import { isPictureBanner } from "@/lib/banners";
import { storeBannerImage } from "@/lib/admin/banner-image";
import { deleteObject } from "@/lib/media/storage";
import { errorResponse, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const validId = (id: string) => /^[a-z0-9]{10,40}$/i.test(id);

/** Admin: update a banner. A new "file" replaces the picture; removeImage=1 goes back to the stock photo. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  if (!validId(id)) return errorResponse(404, "NOT_FOUND", "Banner not found.");
  const parsed = await parseBannerForm(req);
  if (!parsed.ok) return parsed.response;
  const { data, image, removeImage, placement } = parsed.form;
  if (isPictureBanner(placement) && removeImage && !image) return errorResponse(422, "NO_FILE", "This kind of banner needs a picture.");
  const old = image || removeImage ? await ctx.db.banner.findUnique({ where: { id }, select: { imageKey: true } }).catch(() => null) : null;
  const stored = image ? await storeBannerImage(image) : null;
  if (stored === "unavailable") return errorResponse(503, "STORAGE", "The image storage is unavailable. Please try again.");
  const picture = stored ?? (removeImage ? { imageType: null, imageData: null, imageKey: null } : {});
  const done = await ctx.db.banner.update({ where: { id }, data: { ...data, placement, ...picture, updatedBy: ctx.email }, select: { id: true } }).catch(() => null);
  if (!done) {
    await deleteObject(stored?.imageKey);
    return errorResponse(404, "NOT_FOUND", "Banner not found.");
  }
  if (old?.imageKey && old.imageKey !== stored?.imageKey) await deleteObject(old.imageKey);
  return json({ ok: true });
}

/** Admin: delete a banner. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  if (!validId(id)) return errorResponse(404, "NOT_FOUND", "Banner not found.");
  const old = await ctx.db.banner.findUnique({ where: { id }, select: { imageKey: true } }).catch(() => null);
  const gone = await ctx.db.banner.deleteMany({ where: { id } }).catch(() => null);
  if (gone && old?.imageKey) await deleteObject(old.imageKey);
  return json({ ok: true });
}
