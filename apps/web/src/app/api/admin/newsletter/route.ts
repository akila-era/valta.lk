import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { getDb } from "@/lib/db";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Origin + rate limit, then an admin session: the same front door as the other admin APIs. */
async function front(req: Request, mutating: boolean): Promise<Response | null> {
  const blocked = guard(req, { name: "admin-newsletter", limit: 30, windowMs: 60_000, mutating });
  if (blocked) return blocked;
  const access = await requireAdmin();
  if (access.kind === "signed-out") return errorResponse(401, "SIGNED_OUT", "Please sign in.");
  if (access.kind === "forbidden") return errorResponse(403, "FORBIDDEN", "You do not have access to this action.");
  return null;
}

/** A CSV cell that a spreadsheet will not run as a formula. */
const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

/** Admin: every subscriber as a CSV file (email, signed up, source), for an email tool such as Mailchimp. */
export async function GET(req: Request) {
  const denied = await front(req, false);
  if (denied) return denied;
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  const rows = await db.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, take: 100_000 });
  const csv = ["email,signed_up,source", ...rows.map((r) => [cell(r.email), cell(r.createdAt.toISOString()), cell(r.source ?? "")].join(","))].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}\r\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="volta-subscribers-${date}.csv"`, "Cache-Control": "no-store" },
  });
}

/** Admin: remove one subscriber (for example when they ask to be taken off the list). */
export async function DELETE(req: Request) {
  const denied = await front(req, true);
  if (denied) return denied;
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return errorResponse(422, "INVALID", "Which subscriber?");
  const db = getDb();
  if (!db) return errorResponse(503, "NO_DATABASE", "Website database is not configured.");
  await db.newsletterSubscriber.deleteMany({ where: { id: parsed.data.id } });
  return json({ ok: true });
}
