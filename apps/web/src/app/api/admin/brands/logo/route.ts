import { requireAdmin } from "@/lib/admin/auth";
import { brandKey, brandLogoUrl } from "@/lib/brand-logos";
import { getDb } from "@/lib/db";
import { getSnapshot } from "@/lib/erp/catalogue";
import { MAX_IMAGE_BYTES, sniffImage } from "@/lib/media/sniff";
import { errorResponse, guard, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

type Front = { ok: true; db: NonNullable<ReturnType<typeof getDb>>; admin: { email: string } } | { ok: false; response: Response };

/** Origin + rate limit, admin session and website database: the same front door as the product admin APIs. */
async function front(req: Request, name: string): Promise<Front> {
  const blocked = guard(req, { name, limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return { ok: false, response: blocked };
  const access = await requireAdmin();
  if (access.kind === "signed-out") return { ok: false, response: errorResponse(401, "SIGNED_OUT", "Please sign in.") };
  if (access.kind === "forbidden") return { ok: false, response: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") };
  const db = getDb();
  if (!db) return { ok: false, response: errorResponse(503, "NO_DATABASE", "Website database is not configured.") };
  return { ok: true, db, admin: access.admin };
}

/** The brand must be one the ERP catalogue actually uses, so logos can never be attached to an invented brand. */
async function catalogueBrand(raw: unknown): Promise<string | null> {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 80) return null;
  const key = brandKey(raw);
  try {
    for (const p of (await getSnapshot()).products.values()) if (p.brand && brandKey(p.brand) === key) return p.brand.trim();
  } catch {
    return null;
  }
  return null;
}

/** Admin: upload or replace one brand's logo (multipart fields "brand" and "file"). */
export async function POST(req: Request) {
  const ctx = await front(req, "admin-brand-logo");
  if (!ctx.ok) return ctx.response;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) return errorResponse(413, "TOO_LARGE", "Logos must be smaller than 2 MB.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return errorResponse(400, "NO_FILE", "Choose an image to upload.");
  const brand = await catalogueBrand(form?.get("brand"));
  if (!brand) return errorResponse(404, "NOT_FOUND", "This brand is not in the ERP catalogue.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return errorResponse(413, "TOO_LARGE", "Logos must be smaller than 2 MB.");
  const type = sniffImage(bytes);
  if (!type) return errorResponse(422, "BAD_TYPE", "Only JPEG, PNG or WebP images are accepted.");
  const key = brandKey(brand);
  const row = await ctx.db
    .$transaction(async (tx) => {
      await tx.brandLogo.deleteMany({ where: { brandKey: key } });
      return tx.brandLogo.create({ data: { brandKey: key, brandName: brand, contentType: type, size: bytes.length, data: Buffer.from(bytes), updatedBy: ctx.admin.email }, select: { id: true } });
    })
    .catch(() => null);
  if (!row) return errorResponse(500, "SERVER_ERROR", "Could not save the logo. Please try again.");
  return json({ url: brandLogoUrl(row.id) }, 201);
}

/** Admin: remove a brand's logo (JSON body {"brand": "..."}); the storefront goes back to the text label. */
export async function DELETE(req: Request) {
  const ctx = await front(req, "admin-brand-logo");
  if (!ctx.ok) return ctx.response;
  const body = (await req.json().catch(() => null)) as { brand?: unknown } | null;
  if (typeof body?.brand !== "string" || !body.brand.trim() || body.brand.length > 80) return errorResponse(400, "INVALID", "Brand is required.");
  await ctx.db.brandLogo.deleteMany({ where: { brandKey: brandKey(body.brand) } }).catch(() => null);
  return json({ ok: true });
}
