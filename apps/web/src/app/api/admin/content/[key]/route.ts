import { requireAdmin } from "@/lib/admin/auth";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";
import { getContent, isContentKey, saveContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

async function front(req: Request, mutating: boolean): Promise<{ ok: true; email: string } | { ok: false; response: Response }> {
  const blocked = guard(req, { name: "admin-settings", limit: 60, windowMs: 60_000, mutating });
  if (blocked) return { ok: false, response: blocked };
  const access = await requireAdmin();
  if (access.kind === "signed-out") return { ok: false, response: errorResponse(401, "SIGNED_OUT", "Please sign in.") };
  if (access.kind === "forbidden") return { ok: false, response: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") };
  return { ok: true, email: access.admin.email };
}

/** Admin: one piece of website content (see lib/site-content.ts). */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await front(req, false);
  if (!ctx.ok) return ctx.response;
  const { key } = await params;
  if (!isContentKey(key)) return errorResponse(404, "NOT_FOUND", "Unknown content.");
  return json({ value: await getContent(key) });
}

/** Admin: save it ({ value }), or { value: null } to go back to the built-in text. */
export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await front(req, true);
  if (!ctx.ok) return ctx.response;
  const { key } = await params;
  if (!isContentKey(key)) return errorResponse(404, "NOT_FOUND", "Unknown content.");
  const body = (await readJson(req, 64_000).catch(() => null)) as { value?: unknown } | null;
  if (!body || !("value" in body)) return errorResponse(400, "INVALID", "Nothing to save.");
  const result = await saveContent(key, body.value, ctx.email).catch(() => ({ ok: false as const, error: "Could not save." }));
  if (!result.ok) return errorResponse(422, "INVALID", result.error);
  return json({ ok: true });
}
