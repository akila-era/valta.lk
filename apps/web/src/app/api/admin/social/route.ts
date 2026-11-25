import { z } from "zod";
import { bannerFront } from "@/lib/admin/banner-api";
import { errorResponse, json } from "@/lib/security/api";
import { MAX_SOCIAL, parseSocialUrl, SOCIAL_PLACEMENT } from "@/lib/home-extras";

export const dynamic = "force-dynamic";

const idSchema = z.string().regex(/^[a-z0-9]{10,40}$/i);

/** Admin: add an Instagram or TikTok post ({"url","caption"?}). */
export async function POST(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = z.object({ url: z.string().trim().min(8).max(300), caption: z.string().trim().max(100).optional() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse(422, "INVALID", "Paste the link of an Instagram or TikTok post.");
  const post = parseSocialUrl(body.data.url);
  if (!post) return errorResponse(422, "INVALID", "That link is not an Instagram post/reel or a TikTok video. Open the post and copy its link.");
  const count = await ctx.db.banner.count({ where: { placement: SOCIAL_PLACEMENT } }).catch(() => MAX_SOCIAL);
  if (count >= MAX_SOCIAL) return errorResponse(422, "TOO_MANY", `You can keep at most ${MAX_SOCIAL} posts. Delete one first.`);
  const row = await ctx.db.banner
    .create({ data: { placement: SOCIAL_PLACEMENT, headline: body.data.caption || (post.platform === "instagram" ? "Instagram post" : "TikTok video"), text: post.platform, ctaLabel: "View", href: post.url, sortOrder: count, updatedBy: ctx.email }, select: { id: true } })
    .catch(() => null);
  if (!row) return errorResponse(500, "SERVER_ERROR", "Could not save the post. Please try again.");
  return json({ id: row.id }, 201);
}

/** Admin: show or hide a post ({"id","active"}). */
export async function PATCH(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = z.object({ id: idSchema, active: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse(400, "INVALID", "Invalid request.");
  const done = await ctx.db.banner.updateMany({ where: { id: body.data.id, placement: SOCIAL_PLACEMENT }, data: { active: body.data.active, updatedBy: ctx.email } }).catch(() => null);
  if (!done || done.count === 0) return errorResponse(404, "NOT_FOUND", "Post not found.");
  return json({ ok: true });
}

/** Admin: delete a post ({"id"}). */
export async function DELETE(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = z.object({ id: idSchema }).safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse(400, "INVALID", "Invalid request.");
  await ctx.db.banner.deleteMany({ where: { id: body.data.id, placement: SOCIAL_PLACEMENT } }).catch(() => null);
  return json({ ok: true });
}
