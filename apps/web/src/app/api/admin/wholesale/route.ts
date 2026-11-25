import { z } from "zod";
import { bannerFront } from "@/lib/admin/banner-api";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { errorResponse, json } from "@/lib/security/api";
import { readApplication, WHOLESALE_PLACEMENT } from "@/lib/wholesale";
import { STATUSES } from "@/lib/wholesale-shared";

export const dynamic = "force-dynamic";

const csvCell = (v: string) => `"${v.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
// Spreadsheets can run text that starts with = + - or @ as a formula, so those cells are made harmless.
const safe = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);

/** Admin: download every application as a CSV file. */
export async function GET() {
  const access = await requireAdmin();
  if (access.kind !== "ok") return errorResponse(access.kind === "signed-out" ? 401 : 403, "FORBIDDEN", "You do not have access to this.");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  const rows = await db.banner.findMany({ where: { placement: WHOLESALE_PLACEMENT }, orderBy: { createdAt: "desc" }, select: { headline: true, text: true, href: true, createdAt: true } }).catch(() => null);
  if (!rows) return errorResponse(503, "UNAVAILABLE", "The applications are not available right now.");
  const head = ["received", "status", "business", "name", "email", "phone", "type", "district", "message"];
  const lines = rows.flatMap((r) => {
    const a = readApplication(r);
    return a ? [[r.createdAt.toISOString(), a.status, a.business, a.name, a.email, a.phone, a.type ?? "", a.district ?? "", a.message ?? ""].map((c) => csvCell(safe(c))).join(",")] : [];
  });
  return new Response([head.join(","), ...lines].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="wholesale-applications.csv"', "Cache-Control": "no-store" } });
}

const idSchema = z.string().regex(/^[a-z0-9]{10,40}$/i);

/** Admin: set the status of one application ({"id","status"}). */
export async function PATCH(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = z.object({ id: idSchema, status: z.enum(STATUSES) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse(400, "INVALID", "Invalid request.");
  const done = await ctx.db.banner.updateMany({ where: { id: body.data.id, placement: WHOLESALE_PLACEMENT }, data: { href: body.data.status, updatedBy: ctx.email } }).catch(() => null);
  if (!done || done.count === 0) return errorResponse(404, "NOT_FOUND", "Application not found.");
  return json({ ok: true });
}

/** Admin: delete one application ({"id"}). */
export async function DELETE(req: Request) {
  const ctx = await bannerFront(req);
  if (!ctx.ok) return ctx.response;
  const body = z.object({ id: idSchema }).safeParse(await req.json().catch(() => null));
  if (!body.success) return errorResponse(400, "INVALID", "Invalid request.");
  await ctx.db.banner.deleteMany({ where: { id: body.data.id, placement: WHOLESALE_PLACEMENT } }).catch(() => null);
  return json({ ok: true });
}
