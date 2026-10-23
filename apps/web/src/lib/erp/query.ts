import type { ErpProduct } from "./types";
import { effectivePrice, isOnSale, matchesBrand, matchesSearch } from "./product-utils";

export type SortKey = "newest" | "price-asc" | "price-desc" | "name";

export interface ProductQuery {
  q?: string;
  category?: string;
  /** Sub-category slug within `category` (from the ERP subCategory name). */
  sub?: string;
  /** Exact brand name from the catalogue. Matching is case-insensitive. */
  brand?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  onSale?: boolean;
  /** Published website content marked Featured. Absent content never matches. */
  featured?: boolean;
}

export interface CategorySummary {
  slug: string;
  name: string;
  count: number;
  image?: string;
  /** Name of the product whose photo is used as the category image. */
  imageAlt?: string;
  subs: { slug: string; name: string; count: number }[];
}

export interface BrandSummary {
  name: string;
  count: number;
}

export interface ProductListResult {
  items: ErpProduct[];
  total: number;
  page: number;
  pageCount: number;
  categories: CategorySummary[];
  brands: BrandSummary[];
}

/**
 * Search, filter, sort and page a catalogue snapshot.
 * The ERP has no server-side text search, so this runs on products already loaded from it.
 */
export function queryProducts(all: ErpProduct[], query: ProductQuery = {}): ProductListResult {
  const categoryMap = new Map<string, CategorySummary>();
  for (const p of all) {
    if (!p.category) continue;
    const c = categoryMap.get(p.category.slug) ?? { ...p.category, count: 0, subs: [] };
    c.count++;
    if (!c.image && p.images[0]) {
      c.image = p.images[0];
      c.imageAlt = p.name;
    }
    if (p.subCategory) {
      const sc = c.subs.find((x) => x.slug === p.subCategory!.slug);
      if (sc) sc.count++;
      else c.subs.push({ ...p.subCategory, count: 1 });
    }
    categoryMap.set(p.category.slug, c);
  }
  for (const c of categoryMap.values()) c.subs.sort((a, b) => a.name.localeCompare(b.name));

  const scoped = all.filter((p) => {
    if (query.category && p.category?.slug !== query.category) return false;
    if (query.sub && p.subCategory?.slug !== query.sub) return false;
    return true;
  });

  const brandMap = new Map<string, BrandSummary>();
  for (const p of scoped) {
    const name = p.brand?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const b = brandMap.get(key) ?? { name, count: 0 };
    b.count++;
    brandMap.set(key, b);
  }

  let list = scoped.filter((p) => {
    if (!matchesBrand(p.brand, query.brand)) return false;
    if (query.inStockOnly && !p.available) return false;
    if (query.onSale && !isOnSale(p)) return false;
    if (query.featured && !p.content?.badges.includes("featured")) return false;
    const price = effectivePrice(p);
    if (query.minPrice != null && price < query.minPrice) return false;
    if (query.maxPrice != null && price > query.maxPrice) return false;
    if (!matchesSearch(p, query.q)) return false;
    return true;
  });

  const sort = query.sort ?? "newest";
  list = list.sort((a, b) =>
    sort === "price-asc" ? effectivePrice(a) - effectivePrice(b)
    : sort === "price-desc" ? effectivePrice(b) - effectivePrice(a)
    : sort === "name" ? a.name.localeCompare(b.name)
    : (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt),
  );

  const pageSize = Math.min(48, Math.max(1, query.pageSize ?? 12));
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, query.page ?? 1));
  return {
    items: list.slice((page - 1) * pageSize, page * pageSize),
    total: list.length,
    page,
    pageCount,
    categories: [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    brands: [...brandMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
