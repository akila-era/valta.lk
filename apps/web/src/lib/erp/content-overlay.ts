import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { htmlToText } from "../content/sanitize";
import { normalizeDoc, type ContentDoc } from "../content/schema";
import { getDb } from "../db";
import type { ErpProduct } from "./types";

/**
 * PUBLISHED website content layered over the ERP catalogue when products are read. The ERP keeps name, SKU, price,
 * stock and availability (this layer never touches them); drafts are never read here. Because the overlay is applied
 * to every fresh ERP snapshot, an ERP sync can never overwrite or lose website content. Read failures never break the
 * storefront: the last good copy (or the plain ERP product) is used.
 */
const TTL_MS = 15_000;
export const mediaUrl = (id: string) => `/api/media/${id}`;

const g = globalThis as unknown as {
  __voltaContent?: { at: number; map: Map<string, ContentDoc> };
  __voltaContentLoad?: Promise<Map<string, ContentDoc>>;
  __voltaOverlay?: { src: Map<string, ErpProduct>; at: number; out: Map<string, ErpProduct> };
};

async function load(): Promise<Map<string, ContentDoc>> {
  const db = getDb();
  if (!db) return new Map();
  const rows = await db.productContent.findMany({ where: { published: { not: Prisma.DbNull } }, select: { erpItemId: true, published: true } });
  return new Map(rows.map((r) => [r.erpItemId, normalizeDoc(r.published)]));
}

async function content(): Promise<{ at: number; map: Map<string, ContentDoc> }> {
  const cur = g.__voltaContent;
  if (cur && Date.now() - cur.at < TTL_MS) return cur;
  g.__voltaContentLoad ??= load().finally(() => {
    g.__voltaContentLoad = undefined;
  });
  try {
    g.__voltaContent = { at: Date.now(), map: await g.__voltaContentLoad };
  } catch {
    g.__voltaContent = { at: Date.now(), map: cur?.map ?? new Map() };
  }
  return g.__voltaContent;
}

/** Called after staff publish or unpublish, so the storefront changes at once instead of after the TTL. */
export function invalidateContent() {
  g.__voltaContent = undefined;
  g.__voltaOverlay = undefined;
}

/** Applies one content document to one ERP product. Never changes name, sku, price, stock or availability. */
export function applyContent(p: ErpProduct, c: ContentDoc | null | undefined): ErpProduct {
  if (!c) return p;
  const text = htmlToText(c.descriptionHtml);
  return {
    ...p,
    description: text ? text : p.description,
    images: c.gallery.length ? c.gallery.map((x) => mediaUrl(x.id)) : p.images,
    content: c,
  };
}

/** The ERP products with published website content applied (memoised per ERP snapshot and content version). */
export async function withContent(products: Map<string, ErpProduct>): Promise<Map<string, ErpProduct>> {
  const c = await content();
  const memo = g.__voltaOverlay;
  if (memo && memo.src === products && memo.at === c.at) return memo.out;
  if (c.map.size === 0) return products;
  const out = new Map<string, ErpProduct>();
  for (const [id, p] of products) out.set(id, applyContent(p, c.map.get(id)));
  g.__voltaOverlay = { src: products, at: c.at, out };
  return out;
}
