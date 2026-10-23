import { z } from "zod";
import { cleanupAssets, discardDraft, publish, unpublish } from "@/lib/admin/product-content";
import { adminProductRequest, contentErrorResponse } from "@/lib/admin/product-api";
import { invalidateContent } from "@/lib/erp/content-overlay";
import { errorResponse, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const body = z.object({ action: z.enum(["publish", "unpublish", "discard"]) });

/** Admin: publish the saved draft, take the content off the storefront, or throw the draft away. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminProductRequest(req, params, "admin-publish", 30);
  if (!ctx.ok) return ctx.response;
  const parsed = body.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success) return errorResponse(400, "INVALID", "Unknown action.");
  try {
    if (parsed.data.action === "publish") await publish(ctx.db, ctx.id, ctx.admin.email);
    else if (parsed.data.action === "unpublish") await unpublish(ctx.db, ctx.id, ctx.admin.email);
    else await discardDraft(ctx.db, ctx.id, ctx.admin.email);
    invalidateContent();
    await cleanupAssets(ctx.db, ctx.id).catch(() => undefined);
    return json({ ok: true });
  } catch (e) {
    return contentErrorResponse(e);
  }
}
