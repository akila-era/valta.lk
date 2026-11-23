import "server-only";
import { activeBanners, activeWideBanners, type WideBanner } from "./banners";
import { brandKey, brandLogoMap } from "./brand-logos";
import { budgetBands, listBrands, listPrices, listProducts, type ProductListResult } from "./erp/catalogue";
import { isOnSale } from "./erp/product-utils";
import { getCheckoutAvailability } from "./erp/settings";
import type { ErpProduct } from "./erp/types";
import { configuredBanners, configuredVideos, type BannerConfig, type VideoConfig } from "./home-config";

export interface ResolvedBanner extends BannerConfig {
  image?: string;
  /** Picture uploaded by staff: shown as is instead of the stock photo. */
  custom?: boolean;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

type Category = ProductListResult["categories"][number];

/** Derives neutral banners from real categories, or validates the configured ones. Unavailable destinations are dropped. */
export function resolveBanners(categories: Category[]): ResolvedBanner[] {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const configured = configuredBanners();

  if (configured) {
    return configured
      .filter((b) => {
        if (b.categorySlug && !bySlug.has(b.categorySlug)) return false;
        const m = b.href.match(/^\/categories\/([^/?#]+)/);
        return !m || bySlug.has(m[1]);
      })
      .map((b) => ({ ...b, image: b.categorySlug ? bySlug.get(b.categorySlug)?.image : undefined }));
  }

  const phones = categories.find((c) => /phone|mobile/i.test(c.name));
  const gadgets = categories.find((c) => c !== phones && /gadget|accessor|wearable|watch|audio|smart/i.test(c.name));
  const out: ResolvedBanner[] = [];
  if (phones) {
    out.push({
      variant: "dark",
      eyebrow: "Smartphones",
      headline: `Explore ${phones.name.toLowerCase()}`,
      text: "Browse the phones in our catalogue and compare prices in LKR.",
      ctaLabel: "Shop phones",
      href: `/categories/${phones.slug}`,
      categorySlug: phones.slug,
      image: phones.image,
    });
  }
  if (gadgets) {
    out.push({
      variant: "light",
      eyebrow: "Gadgets & accessories",
      headline: `Shop ${gadgets.name.toLowerCase()}`,
      text: "Everyday essentials to go with your device.",
      ctaLabel: `Shop ${gadgets.name.toLowerCase()}`,
      href: `/categories/${gadgets.slug}`,
      categorySlug: gadgets.slug,
      image: gadgets.image,
    });
  }
  return out;
}

export interface BudgetPick {
  key: "under" | "mid" | "over";
  label: string;
  href: string;
  count: number;
  /** Available products that really fall in the band, photographed ones first. */
  products: ErpProduct[];
}

export interface Spotlight {
  role: "essentials" | "phones" | "setup";
  slug: string;
  name: string;
  count: number;
  products: ErpProduct[];
}

export const BUDGET_UNDER = 8000;
export const BUDGET_OVER = 35000;

export interface HomeData {
  catalogueOk: boolean;
  totalProducts: number;
  categories: Category[];
  newArrivals: ErpProduct[];
  offers: ErpProduct[];
  featured: ErpProduct[];
  brands: { name: string; count: number; image?: string; logo?: string }[];
  banners: ResolvedBanner[];
  /** True when the banners were created by staff in the admin (shown as written), false when derived from categories. */
  bannersFromStaff: boolean;
  /** Full-width pictures staff placed between "Shop by budget" and "Why shop with VALTA.LK"; they rotate when there are several. */
  wideBanners: WideBanner[];
  /** Further products beyond the ones already shown in "New Arrivals": same catalogue, next in line. */
  more: ErpProduct[];
  videos: { title: string; items: VideoConfig[] };
  rails: { slug: string; name: string; count: number; products: ErpProduct[] }[];
  budget: { under: number; over: number } | null;
  phonesSlug?: string;
  /** Fixed shopping bands from the brief; a band is omitted when the catalogue has nothing available in it. */
  budgetPicks: BudgetPick[];
  /** Real categories behind the editorial campaign panels. */
  spotlights: Spotlight[];
  checkout: { cod: boolean; deliveryCharge: number | null };
}

/** Each source is fetched independently so a failure in one section never breaks the whole page. */
export async function getHomeData(): Promise<HomeData> {
  const [newest, offers, featured, brands, settings, prices] = await Promise.all([
    safe(() => listProducts({ sort: "newest", pageSize: 48 })),
    safe(() => listProducts({ sort: "newest", pageSize: 8, onSale: true })),
    safe(() => listProducts({ featured: true, inStockOnly: true, pageSize: 10 })),
    safe(() => listBrands()),
    safe(() => getCheckoutAvailability()),
    safe(() => listPrices()),
  ]);
  const bandDefs: { key: BudgetPick["key"]; label: string; href: string; q: { minPrice?: number; maxPrice?: number }; sort: "price-desc" | "price-asc" }[] = [
    { key: "under", label: "Under LKR 8,000", href: `/products?max=${BUDGET_UNDER}&sort=price-desc`, q: { maxPrice: BUDGET_UNDER }, sort: "price-desc" },
    { key: "mid", label: "LKR 8,000 – LKR 35,000", href: `/products?min=${BUDGET_UNDER}&max=${BUDGET_OVER}&sort=price-asc`, q: { minPrice: BUDGET_UNDER, maxPrice: BUDGET_OVER }, sort: "price-asc" },
    { key: "over", label: "Over LKR 35,000", href: `/products?min=${BUDGET_OVER}&sort=price-asc`, q: { minPrice: BUDGET_OVER }, sort: "price-asc" },
  ];
  const bandResults = await Promise.all(bandDefs.map((d) => safe(() => listProducts({ ...d.q, sort: d.sort, inStockOnly: true, pageSize: 24 }))));
  const budgetPicks: BudgetPick[] = bandDefs.flatMap((d, i) => {
    const r = bandResults[i];
    if (!r || !r.items.length) return [];
    const items = r.items.filter((p) => p.available);
    const ordered = [...items.filter((p) => p.images.length), ...items.filter((p) => !p.images.length)];
    return items.length ? [{ key: d.key, label: d.label, href: d.href, count: r.total, products: ordered.slice(0, 3) }] : [];
  });
  const [logos, staffBanners, wideBanners] = await Promise.all([brandLogoMap(), activeBanners(), activeWideBanners()]);

  const all = newest?.items ?? [];

  const categories = newest?.categories ?? [];
  const spotDefs: { role: Spotlight["role"]; test: RegExp }[] = [
    { role: "essentials", test: /accessor/i },
    { role: "phones", test: /phone|mobile/i },
    { role: "setup", test: /computer|laptop|tablet/i },
  ];
  const spotlights = (
    await Promise.all(
      spotDefs.map(async (d) => {
        const c = categories.find((x) => d.test.test(x.name));
        if (!c) return null;
        const r = await safe(() => listProducts({ category: c.slug, sort: "newest", inStockOnly: true, pageSize: 6 }));
        return r && r.items.length >= 2 ? ({ role: d.role, slug: c.slug, name: c.name, count: c.count, products: r.items } as Spotlight) : null;
      }),
    )
  ).filter((x): x is Spotlight => Boolean(x));
  // One rail per larger category, newest first
  const railCats = [...categories].filter((c) => c.count >= 3).sort((a, b) => b.count - a.count).slice(0, 3);
  const rails = (
    await Promise.all(
      railCats.map(async (c) => {
        const r = await safe(() => listProducts({ category: c.slug, sort: "newest", pageSize: 10 }));
        return r ? { slug: c.slug, name: c.name, count: c.count, products: r.items } : null;
      }),
    )
  ).filter((r): r is NonNullable<typeof r> => Boolean(r && r.products.length >= 3));

  return {
    catalogueOk: newest !== null,
    totalProducts: newest?.total ?? 0,
    categories,
    newArrivals: all.slice(0, 10),
    more: all.slice(10).filter((p) => p.available).slice(0, 15),
    videos: (() => {
      const v = configuredVideos();
      return { title: v.title, items: v.videos };
    })(),
    offers: (offers?.items ?? []).filter(isOnSale),
    featured: featured?.items ?? [],
    brands: (brands ?? []).map((b) => ({ ...b, logo: logos.get(brandKey(b.name)) })),
    // Banners staff created in the admin win; with none active the category-derived / HOME_BANNERS ones remain.
    banners: staffBanners.length ? staffBanners : resolveBanners(categories),
    bannersFromStaff: staffBanners.length > 0,
    wideBanners,
    rails,
    budget: prices ? budgetBands(prices) : null,
    budgetPicks,
    spotlights,
    phonesSlug: categories.find((c) => /phone|mobile/i.test(c.name))?.slug,
    checkout: {
      cod: Boolean(settings?.enabled && settings.settings?.paymentMethods.COD),
      deliveryCharge: settings?.enabled ? (settings.settings?.deliveryCharge ?? null) : null,
    },
  };
}
