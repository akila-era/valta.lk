import { addImage } from "@/lib/admin/product-content";
import { adminProductRequest, contentErrorResponse } from "@/lib/admin/product-api";
import { mediaUrl } from "@/lib/erp/content-overlay";
import { MAX_IMAGE_BYTES } from "@/lib/media/sniff";
import { errorResponse, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Admin: upload one product image (multipart field "file"). It joins the gallery when a draft that lists it is saved. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminProductRequest(req, params, "admin-upload", 40);
  if (!ctx.ok) return ctx.response;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) return errorResponse(413, "TOO_LARGE", "Images must be smaller than 2 MB.");
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return errorResponse(400, "NO_FILE", "Choose an image to upload.");
  try {
    const id = await addImage(ctx.db, ctx.id, new Uint8Array(await file.arrayBuffer()));
    return json({ id, url: mediaUrl(id) }, 201);
  } catch (e) {
    return contentErrorResponse(e);
  }
}
