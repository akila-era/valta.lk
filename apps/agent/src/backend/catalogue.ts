import type { SiteData } from "./site";
import type { Vocabulary } from "../router/types";
import type { ErpTransport } from "./transport";
import { effectiveCents, type ProductView, type VariantView } from "./types";
import { toCents, type RawProduct } from "./wire";

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** Same rule as the storefront: the ERP has no slug, so name plus ERP id gives a stable, readable URL segment. */
export const productSlug = (name: string, id: string): string => `${slugify(name) || "product"}-${id.toLowerCase()}`;

/** Description text from the ERP/website is untrusted: strip markup and control characters and cap the length. */
export function plainText(input: string | null | undefined, max = 300): string | undefined {
  if (!input) return undefined;
  const text = input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : undefined;
}

export type Audience = "guest" | "customer";

function safeImage(raw: RawProduct, origin: string): string | undefined {
  const img = raw.images[0];
  if (!img) return undefined;
  try {
    const url = /^https?:\/\//i.test(img.url) ? new URL(img.url) : new URL(img.url, origin);
    return /^https?:$/.test(url.protocol) && url.href.length <= 500 ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Maps one ERP product to the view the tools return. Sale prices apply only while the ERP says the discount is active. */
export function mapProduct(raw: RawProduct, origin: string, site: SiteData, audience: Audience): ProductView {
  const variants: VariantView[] = raw.variants.map((v) => {
    const price = toCents(v.price);
    const sale = v.discountActive && v.salePrice != null && toCents(v.salePrice) < price ? toCents(v.salePrice) : null;
    const label = [v.storage, v.color].filter(Boolean).join(" / ") || v.key;
    return {
      key: v.key,
      label,
      ...(v.storage ? { storage: v.storage } : {}),
      ...(v.color ? { color: v.color } : {}),
      priceCents: price,
      saleCents: sale,
      available: v.availability === "IN_STOCK" && v.purchasableQuantity > 0,
      maxQuantity: Math.max(0, v.purchasableQuantity),
    };
  });
  const price = toCents(raw.price);
  const sale = raw.discountActive && raw.salePrice != null && toCents(raw.salePrice) < price ? toCents(raw.salePrice) : null;
  const available = variants.length ? variants.some((v) => v.available) : raw.availability === "IN_STOCK" && raw.purchasableQuantity > 0;

  const specs: { name: string; value: string }[] = [];
  if (raw.brand) specs.push({ name: "Brand", value: raw.brand });
  if (raw.model) specs.push({ name: "Model", value: raw.model });
  if (raw.condition) specs.push({ name: "Condition", value: raw.condition });
  if (raw.warrantyMonths) specs.push({ name: "Warranty", value: `${raw.warrantyMonths} months${raw.warrantyNote ? ` (${raw.warrantyNote})` : ""}` });
  for (const s of site.content[raw.id]?.specs ?? []) if (!specs.some((x) => x.name === s.name)) specs.push(s);

  // An offer is named only when its discount equals the sale the ERP already applies, and a customer-only offer only for customers.
  const offer = sale !== null ? site.promotions.find((p) => p.active && p.productIds.includes(raw.id) && (!p.customerOnly || audience === "customer")) : undefined;

  const category = raw.category?.trim() ? { slug: slugify(raw.category), name: raw.category.trim() } : undefined;
  const sub = category && raw.subCategory?.trim() ? { slug: slugify(raw.subCategory), name: raw.subCategory.trim() } : undefined;
  const image = safeImage(raw, origin);
  const description = plainText(raw.description);

  return {
    id: raw.id,
    slug: productSlug(raw.name, raw.id),
    name: raw.name.trim(),
    ...(raw.brand ? { brand: raw.brand.trim() } : {}),
    ...(raw.model ? { model: raw.model.trim() } : {}),
    ...(category && category.slug ? { category } : {}),
    ...(sub && sub.slug ? { subCategory: sub } : {}),
    ...(image ? { imageUrl: image } : {}),
    priceCents: price,
    saleCents: sale,
    available,
    maxQuantity: variants.length ? Math.max(0, ...variants.map((v) => v.maxQuantity)) : Math.max(0, raw.purchasableQuantity),
    variants,
    ...(offer ? { offerName: offer.name } : {}),
    specs,
    ...(description ? { description } : {}),
    ...(raw.publishedAt ? { publishedAt: raw.publishedAt } : {}),
    updatedAt: raw.updatedAt,
  };
}

export interface SearchParams {
  query?: string | undefined;
  category?: string | undefined;
  brand?: string | undefined;
  minPriceLkr?: number | undefined;
  maxPriceLkr?: number | undefined;
  inStockOnly: boolean;
  onSale?: boolean | undefined;
  sort?: "newest" | "price-asc" | "price-desc" | "name" | undefined;
  limit: number;
}

/** Text the storefront can match: only real catalogue fields. */
const haystack = (p: ProductView, raw: RawProduct): string =>
  [p.name, raw.sku, p.brand, p.model, p.category?.name, p.subCategory?.name, ...p.variants.flatMap((v) => [v.label, raw.variants.find((x) => x.key === v.key)?.sku])]
    .filter((x): x is string => Boolean(x && x.trim()))
    .join(" ")
    .toLowerCase();

export interface CatalogueOptions {
  transport: ErpTransport;
  site: SiteData;
  now?: () => number;
  /** How long a listing is reused. Details, stock and cart checks always read live. */
  ttlMs?: number;
}

export class Catalogue {
  private snapshot: { at: number; raws: Map<string, RawProduct> } | null = null;
  private readonly now: () => number;
  private readonly ttl: number;

  constructor(private readonly opts: CatalogueOptions) {
    this.now = opts.now ?? Date.now;
    this.ttl = opts.ttlMs ?? 30_000;
  }

  get origin(): string {
    return this.opts.transport.origin;
  }

  /** The cached listing, refreshed at most once per TTL. A stale copy is used only if a refresh fails after a success. */
  private async raws(signal?: AbortSignal): Promise<Map<string, RawProduct>> {
    const cur = this.snapshot;
    if (cur && this.now() - cur.at < this.ttl) return cur.raws;
    try {
      const list = await this.opts.transport.listProducts(signal);
      this.snapshot = { at: this.now(), raws: new Map(list.map((p) => [p.id, p])) };
      return this.snapshot.raws;
    } catch (e) {
      if (cur) return cur.raws;
      throw e;
    }
  }

  view(raw: RawProduct, audience: Audience): ProductView {
    return mapProduct(raw, this.opts.transport.origin, this.opts.site, audience);
  }

  /** Live (uncached) single product. null when the ERP does not have it. */
  async live(id: string, audience: Audience, signal?: AbortSignal): Promise<ProductView | null> {
    const raw = await this.opts.transport.getProduct(id, signal);
    return raw ? this.view(raw, audience) : null;
  }

  async listing(audience: Audience, signal?: AbortSignal): Promise<ProductView[]> {
    return [...(await this.raws(signal)).values()].map((r) => this.view(r, audience));
  }

  async search(params: SearchParams, audience: Audience, signal?: AbortSignal): Promise<{ total: number; items: ProductView[] }> {
    const raws = await this.raws(signal);
    const tokens = params.query?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    const brand = params.brand?.trim().toLowerCase();
    const min = params.minPriceLkr !== undefined ? params.minPriceLkr * 100 : undefined;
    const max = params.maxPriceLkr !== undefined ? params.maxPriceLkr * 100 : undefined;

    let list = [...raws.values()]
      .map((raw) => ({ raw, view: this.view(raw, audience) }))
      .filter(({ raw, view }) => {
        if (params.category && view.category?.slug !== params.category) return false;
        if (brand && (view.brand ?? "").trim().toLowerCase() !== brand) return false;
        if (params.inStockOnly && !view.available) return false;
        if (params.onSale && view.saleCents === null) return false;
        const price = effectiveCents(view);
        if (min !== undefined && price < min) return false;
        if (max !== undefined && price > max) return false;
        const hay = haystack(view, raw);
        return tokens.every((t) => hay.includes(t));
      })
      .map((x) => x.view);

    const sort = params.sort ?? "newest";
    list = list.sort((a, b) =>
      sort === "price-asc" ? effectiveCents(a) - effectiveCents(b)
      : sort === "price-desc" ? effectiveCents(b) - effectiveCents(a)
      : sort === "name" ? a.name.localeCompare(b.name)
      : (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt),
    );
    return { total: list.length, items: list.slice(0, params.limit) };
  }

  /** Public catalogue vocabulary for the router: names and ids only, no prices, stock or customer data. */
  async vocabulary(signal?: AbortSignal): Promise<Vocabulary> {
    const views = await this.listing("guest", signal);
    const brands = [...new Map(views.filter((v) => v.brand).map((v) => [v.brand!.toLowerCase(), v.brand!])).values()].sort();
    const categories = [...new Map(views.filter((v) => v.category).map((v) => [v.category!.slug, v.category!])).values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      brands,
      categories,
      products: views.map((v) => ({
        id: v.id,
        name: v.name,
        ...(v.brand ? { brand: v.brand } : {}),
        ...(v.model ? { model: v.model } : {}),
        ...(v.category ? { category: v.category.name } : {}),
        ...(v.variants.length ? { variants: v.variants.map((x) => ({ key: x.key, ...(x.storage ? { storage: x.storage } : {}), ...(x.color ? { color: x.color } : {}) })) } : {}),
      })),
    };
  }
}
