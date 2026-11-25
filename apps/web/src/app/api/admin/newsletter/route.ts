import { z } from "zod";
import { bannerFront } from "@/lib/admin/banner-api";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { errorResponse, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Admin: download every subscriber as a CSV file (email, source, date). */
export async function GET() {
  const access = await requireAdmin();
  if (access.kind !== "ok") return errorResponse(access.kind === "signed-out" ? 401 : 403, "FORBIDDEN", "You do not have access to this.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  const rows = await db.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, select: { email: true, source: true, createdAt: true } }).catch(() => null);
  if (!rows) return errorResponse(503, "UNAVAILABLE", "The subscriber list is not available yet.");
  const csv = ["email,source,subscribed_at", ...rows.map((r) => `${r.email},${r.source ?? ""},${r.createdAt.toISOString()}`)].join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="newsletter-subscribers.csv"', "Cache-Control": "no-store" } });
}

/** Admin: remove one subscriber ({"id"}). */
export async function DELETE(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = z.object({ id: z.string().regex(/^[a-z0-9]{10,40}$/i) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse(400, "INVALID", "Invalid request.");
  await ctx.db.newsletterSubscriber.deleteMany({ where: { id: body.data.id } }).catch(() => null);
  return json({ ok: true });
}
