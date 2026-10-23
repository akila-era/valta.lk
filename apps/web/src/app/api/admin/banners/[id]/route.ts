import { bannerFront, parseBannerForm } from "@/lib/admin/banner-api";
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
  if (placement === "WIDE" && removeImage && !image) return errorResponse(422, "NO_FILE", "A wide banner needs a picture.");
  const picture = image ? { imageType: image.type, imageData: Buffer.from(image.bytes) } : removeImage ? { imageType: null, imageData: null } : {};
  const done = await ctx.db.banner.update({ where: { id }, data: { ...data, placement, ...picture, updatedBy: ctx.email }, select: { id: true } }).catch(() => null);
  if (!done) return errorResponse(404, "NOT_FOUND", "Banner not found.");
  return json({ ok: true });
}

/** Admin: delete a banner. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  if (!validId(id)) return errorResponse(404, "NOT_FOUND", "Banner not found.");
  await ctx.db.banner.deleteMany({ where: { id } }).catch(() => null);
  return json({ ok: true });
}
