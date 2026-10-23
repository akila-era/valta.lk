import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { bannerFormSchema, isPlacement, wideBannerFormSchema, type Placement } from "../banners";
import { getDb } from "../db";
import { MAX_IMAGE_BYTES, sniffImage, type ImageType } from "../media/sniff";
import { errorResponse, guard } from "../security/api";
import { requireAdmin } from "./auth";

type Front = { ok: true; db: PrismaClient; email: string } | { ok: false; response: Response };

/** Origin + rate limit, admin session and website database: the same front door as the other admin APIs. */
export async function bannerFront(req: Request): Promise<Front> {
  const blocked = guard(req, { name: "admin-banners", limit: 40, windowMs: 60_000, mutating: true });
  if (blocked) return { ok: false, response: blocked };
  const access = await requireAdmin();
  if (access.kind === "signed-out") return { ok: false, response: errorResponse(401, "SIGNED_OUT", "Please sign in.") };
  if (access.kind === "forbidden") return { ok: false, response: errorResponse(403, "FORBIDDEN", "You do not have access to this action.") };
  const db = getDb();
  if (!db) return { ok: false, response: errorResponse(503, "NO_DATABASE", "Website database is not configured.") };
  return { ok: true, db, email: access.admin.email };
}

const LABEL: Record<string, string> = { eyebrow: "Small label", headline: "Headline", text: "Text", ctaLabel: "Button label", href: "Button link" };

export type BannerForm = {
  placement: Placement;
  data: { eyebrow: string | null; headline: string; text: string | null; ctaLabel: string; href: string; active: boolean; sortOrder: number };
  image: { type: ImageType; bytes: Uint8Array } | null;
  removeImage: boolean;
};

/** Reads the multipart form (fields + optional "file"); returns an error response for anything invalid. */
export async function parseBannerForm(req: Request): Promise<{ ok: true; form: BannerForm } | { ok: false; response: Response }> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) return { ok: false, response: errorResponse(413, "TOO_LARGE", "Pictures must be smaller than 2 MB.") };
  const f = await req.formData().catch(() => null);
  if (!f) return { ok: false, response: errorResponse(400, "INVALID", "Invalid form.") };
  const str = (k: string) => {
    const v = f.get(k);
    return typeof v === "string" ? v : "";
  };
  const placement: Placement = isPlacement(str("placement")) ? (str("placement") as Placement) : "CARDS";
  const parsed =
    placement === "WIDE"
      ? wideBannerFormSchema.safeParse({ headline: str("headline"), href: str("href") })
      : bannerFormSchema.safeParse({ eyebrow: str("eyebrow") || undefined, headline: str("headline"), text: str("text") || undefined, ctaLabel: str("ctaLabel"), href: str("href") });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    const field = String(i.path[0] ?? "");
    const msg = field === "href" ? "must be a path on this site, like /categories/mobile-phones" : i.message.toLowerCase();
    return { ok: false, response: errorResponse(422, "INVALID", `${LABEL[field] ?? "Field"}: ${msg}.`) };
  }
  const sortOrder = Math.max(0, Math.min(999, Math.trunc(Number(str("sortOrder")) || 0)));
  let image: BannerForm["image"] = null;
  const file = f.get("file");
  if (file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, response: errorResponse(413, "TOO_LARGE", "Pictures must be smaller than 2 MB.") };
    const type = sniffImage(bytes);
    if (!type) return { ok: false, response: errorResponse(422, "BAD_TYPE", "Only JPEG, PNG or WebP pictures are accepted.") };
    image = { type, bytes };
  }
  const active = str("active") === "1";
  const d = parsed.data as { headline: string; href?: string; eyebrow?: string; text?: string; ctaLabel?: string };
  return {
    ok: true,
    form: {
      placement,
      data: { eyebrow: d.eyebrow || null, headline: d.headline, text: d.text || null, ctaLabel: d.ctaLabel ?? "", href: d.href ?? "", active, sortOrder },
      image,
      removeImage: str("removeImage") === "1",
    },
  };
}
