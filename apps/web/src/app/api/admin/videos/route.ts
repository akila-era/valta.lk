import { z } from "zod";
import { bannerFront } from "@/lib/admin/banner-api";
import { errorResponse, json } from "@/lib/security/api";
import { MAX_VIDEOS, parseYouTubeId, VIDEO_PLACEMENT } from "@/lib/videos";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  url: z.string().trim().min(5).max(300),
  title: z.string().trim().min(2).max(100),
  channel: z.string().trim().max(60).optional(),
});
const idSchema = z.string().regex(/^[a-z0-9]{10,40}$/i);

/** Admin: add a YouTube video to the homepage ({"url","title","channel"?}). */
export async function POST(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = createSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse(422, "INVALID", "Enter a YouTube link and a title (2 to 100 characters).");
  const id = parseYouTubeId(body.data.url);
  if (!id) return errorResponse(422, "INVALID", "That is not a YouTube link. Paste a link like https://www.youtube.com/watch?v=...");
  const count = await ctx.db.banner.count({ where: { placement: VIDEO_PLACEMENT } }).catch(() => MAX_VIDEOS);
  if (count >= MAX_VIDEOS) return errorResponse(422, "TOO_MANY", `You can keep at most ${MAX_VIDEOS} videos. Delete one first.`);
  const row = await ctx.db.banner
    .create({ data: { placement: VIDEO_PLACEMENT, headline: body.data.title, text: body.data.channel || null, ctaLabel: "Watch", href: id, sortOrder: count, updatedBy: ctx.email }, select: { id: true } })
    .catch(() => null);
  if (!row) return errorResponse(500, "SERVER_ERROR", "Could not save the video. Please try again.");
  return json({ id: row.id }, 201);
}

/** Admin: show or hide a video ({"id","active"}). */
export async function PATCH(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = z.object({ id: idSchema, active: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse(400, "INVALID", "Invalid request.");
  const done = await ctx.db.banner.updateMany({ where: { id: body.data.id, placement: VIDEO_PLACEMENT }, data: { active: body.data.active, updatedBy: ctx.email } }).catch(() => null);
  if (!done || done.count === 0) return errorResponse(404, "NOT_FOUND", "Video not found.");
  return json({ ok: true });
}

/** Admin: delete a video ({"id"}). */
export async function DELETE(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = z.object({ id: idSchema }).safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse(400, "INVALID", "Invalid request.");
  await ctx.db.banner.deleteMany({ where: { id: body.data.id, placement: VIDEO_PLACEMENT } }).catch(() => null);
  return json({ ok: true });
}
