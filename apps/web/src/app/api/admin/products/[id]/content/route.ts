import { z } from "zod";
import { cleanupAssets, saveDraft } from "@/lib/admin/product-content";
import { adminProductRequest, contentErrorResponse } from "@/lib/admin/product-api";
import { errorResponse, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({ version: z.number().int().min(0), doc: z.unknown() });

/** Admin: save the DRAFT content of a product. Customers see nothing until it is published. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminProductRequest(req, params, "admin-content", 60);
  if (!ctx.ok) return ctx.response;
  const parsed = body.safeParse(await readJson(req, 300_000).catch(() => null));
  if (!parsed.success) return errorResponse(400, "INVALID", "The request was not understood. Reload the page and try again.");
  try {
    const r = await saveDraft(ctx.db, ctx.id, parsed.data.doc, parsed.data.version, ctx.admin.email);
    await cleanupAssets(ctx.db, ctx.id).catch(() => undefined);
    return json({ ok: true, version: r.version, draft: r.draft });
  } catch (e) {
    return contentErrorResponse(e);
  }
}
