import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { contentDocSchema, normalizeDoc, type ContentDoc } from "../content/schema";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT, sniffImage } from "../media/sniff";

export class ContentError extends Error {
  constructor(
    public readonly code: "TOO_LARGE" | "BAD_TYPE" | "TOO_MANY" | "INVALID" | "CONFLICT" | "NOT_FOUND",
    message: string,
    public readonly issues: string[] = [],
  ) {
    super(message);
  }
}

export const productIdSchemaRe = /^[A-Za-z0-9_-]{1,64}$/;
const ORPHAN_GRACE_MS = 60 * 60_000;

export interface ContentRecord {
  draft: ContentDoc;
  published: ContentDoc | null;
  publishedAt: Date | null;
  version: number;
  updatedAt: Date;
  updatedBy: string | null;
}

export async function getRecord(db: PrismaClient, erpItemId: string): Promise<ContentRecord | null> {
  const r = await db.productContent.findUnique({ where: { erpItemId } });
  if (!r) return null;
  return { draft: normalizeDoc(r.draft), published: r.published ? normalizeDoc(r.published) : null, publishedAt: r.publishedAt, version: r.version, updatedAt: r.updatedAt, updatedBy: r.updatedBy };
}

/** Everything the admin list needs about content state, in one query. */
export async function listStates(db: PrismaClient) {
  const rows = await db.productContent.findMany({ select: { erpItemId: true, draft: true, published: true, publishedAt: true, updatedAt: true, version: true } });
  return new Map(rows.map((r) => [r.erpItemId, { draft: normalizeDoc(r.draft), published: r.published ? normalizeDoc(r.published) : null, publishedAt: r.publishedAt, updatedAt: r.updatedAt, version: r.version }]));
}

const issuesOf = (e: { issues: { path: PropertyKey[]; message: string }[] }) => e.issues.slice(0, 8).map((i) => `${i.path.map(String).join(".") || "content"}: ${i.message}`);

/** Stores one validated image for a product. It becomes part of the content only when a draft that lists it is saved. */
export async function addImage(db: PrismaClient, erpItemId: string, bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new ContentError("TOO_LARGE", `Images must be smaller than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
  const type = sniffImage(bytes);
  if (!type) throw new ContentError("BAD_TYPE", "Only JPEG, PNG or WebP images are accepted.");
  const pending = await db.mediaAsset.count({ where: { erpItemId } });
  if (pending >= MAX_IMAGES_PER_PRODUCT + 8) throw new ContentError("TOO_MANY", "Too many uploaded images for this product. Save your changes or remove unused images first.");
  const a = await db.mediaAsset.create({ data: { erpItemId, contentType: type, size: bytes.length, data: Buffer.from(bytes) }, select: { id: true } });
  return a.id;
}

/**
 * Saves the draft. `expectedVersion` is the version the editor loaded; if someone else saved since, nothing is written
 * (CONFLICT). Images and the social image must be uploads of this product; related products may not include itself.
 */
export async function saveDraft(db: PrismaClient, erpItemId: string, input: unknown, expectedVersion: number, by: string): Promise<{ version: number; draft: ContentDoc }> {
  const parsed = contentDocSchema.safeParse(input);
  if (!parsed.success) throw new ContentError("INVALID", "Some fields need attention.", issuesOf(parsed.error));
  const doc = parsed.data;
  if (doc.related.includes(erpItemId)) throw new ContentError("INVALID", "A product cannot be related to itself.", ["related: remove this product from its own related list"]);
  doc.related = [...new Set(doc.related)];

  const ids = [...new Set([...doc.gallery.map((g) => g.id), ...(doc.seo.ogImageId ? [doc.seo.ogImageId] : [])])];
  return db.$transaction(async (tx) => {
    if (ids.length) {
      const have = new Set((await tx.mediaAsset.findMany({ where: { id: { in: ids }, erpItemId }, select: { id: true } })).map((a) => a.id));
      const bad = ids.filter((i) => !have.has(i));
      if (bad.length) throw new ContentError("INVALID", "An image is missing or belongs to another product.", ["gallery: unknown image"]);
    }
    const data = doc as unknown as Prisma.InputJsonValue;
    const cur = await tx.productContent.findUnique({ where: { erpItemId }, select: { version: true } });
    if (!cur) {
      if (expectedVersion !== 0) throw new ContentError("CONFLICT", "This product's content changed. Reload the page to continue.");
      try {
        await tx.productContent.create({ data: { erpItemId, draft: data, version: 1, updatedBy: by } });
      } catch {
        throw new ContentError("CONFLICT", "This product's content changed. Reload the page to continue.");
      }
      return { version: 1, draft: doc };
    }
    const r = await tx.productContent.updateMany({ where: { erpItemId, version: expectedVersion }, data: { draft: data, version: expectedVersion + 1, updatedBy: by } });
    if (r.count !== 1) throw new ContentError("CONFLICT", "Someone else saved this product while you were editing. Reload the page to see their changes.");
    return { version: expectedVersion + 1, draft: doc };
  });
}

/** Makes the saved draft live. Publishing an empty draft is refused so a customer never sees an empty shell. */
export async function publish(db: PrismaClient, erpItemId: string, by: string) {
  return db.$transaction(async (tx) => {
    const r = await tx.productContent.findUnique({ where: { erpItemId } });
    if (!r) throw new ContentError("NOT_FOUND", "Save some content before publishing.");
    await tx.productContent.update({ where: { erpItemId }, data: { published: r.draft as Prisma.InputJsonValue, publishedAt: new Date(), updatedBy: by } });
  });
}

/** Takes the content off the storefront (the draft is kept). The product shows its plain ERP data again. */
export async function unpublish(db: PrismaClient, erpItemId: string, by: string) {
  const r = await db.productContent.updateMany({ where: { erpItemId }, data: { published: Prisma.DbNull, publishedAt: null, updatedBy: by } });
  if (r.count !== 1) throw new ContentError("NOT_FOUND", "Nothing to unpublish.");
}

/** Throws the draft away and goes back to what is published (or to empty when nothing is published). */
export async function discardDraft(db: PrismaClient, erpItemId: string, by: string) {
  const r = await db.productContent.findUnique({ where: { erpItemId } });
  if (!r) throw new ContentError("NOT_FOUND", "Nothing to discard.");
  const back = (r.published ?? normalizeDoc({})) as Prisma.InputJsonValue;
  await db.productContent.update({ where: { erpItemId }, data: { draft: back, version: r.version + 1, updatedBy: by } });
}

/** Deletes uploads that neither the draft nor the published copy uses (with a grace period for editors mid-upload). */
export async function cleanupAssets(db: PrismaClient, erpItemId: string) {
  const r = await db.productContent.findUnique({ where: { erpItemId }, select: { draft: true, published: true } });
  const used = new Set<string>();
  for (const d of [r?.draft, r?.published]) {
    if (!d) continue;
    const doc = normalizeDoc(d);
    doc.gallery.forEach((g) => used.add(g.id));
    if (doc.seo.ogImageId) used.add(doc.seo.ogImageId);
  }
  await db.mediaAsset.deleteMany({ where: { erpItemId, id: { notIn: [...used] }, createdAt: { lt: new Date(Date.now() - ORPHAN_GRACE_MS) } } });
}
