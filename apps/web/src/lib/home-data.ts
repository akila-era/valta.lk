import { featuredReviews } from "./reviews";
import "server-only";
import { activeBanners, activeWideBanners, type WideBanner } from "./banners";
import { brandKey, brandLogoMap } from "./brand-logos";
import { budgetBands, getSnapshot, listBrands, listPrices, listProducts, type ProductListResult } from "./erp/catalogue";
import { isOnSale } from "./erp/product-utils";
import { getCheckoutAvailability } from "./erp/settings";
import type { ErpProduct } from "./erp/types";
import { configuredHotDealsWithEnd } from "./hot-deals-store";
import { getDb } from "./db";
import { configuredBanners, configuredReviews, configuredVideos, type BannerConfig, type ReviewConfig, type VideoConfig } from "./home-config";

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

export interface HomeData {
  catalogueOk: boolean;
  totalProducts: number;
  categories: Category[];
  newArrivals: ErpProduct[];
  offers: ErpProduct[];
  /** Products for the Hot Deals panel: staff-picked deals when any are live, otherwise the ERP sale products. */
  hotDeals: ErpProduct[];
  /** True when hotDeals is the staff selection (some may have no price reduction), false when it is ERP sales. */
  hotDealsCurated: boolean;
  /** When the first of the staff-picked deals ends (ISO), for the countdown; null when none has an end date. */
  hotDealsEndAt: string | null;
  featured: ErpProduct[];
  brands: { name: string; count: number; image?: string; logo?: string }[];
  banners: ResolvedBanner[];
  /** True when the banners were created by staff in the admin (not derived from categories). */
  staffBanners: boolean;
  /** Banner pictures uploaded by staff; they open the homepage banner slider, in order. */
  wideBanners: WideBanner[];
  /** Further products beyond the ones already shown in "New Arrivals": same catalogue, next in line. */
  more: ErpProduct[];
  videos: { title: string; items: VideoConfig[] };
  reviews: { title: string; items: ReviewConfig[] };
  /** The products ordered most on this website in the last 90 days (empty until enough orders exist). */
  popular: ErpProduct[];
  rails: { slug: string; name: string; count: number; products: ErpProduct[] }[];
  budget: { under: number; over: number } | null;
  phonesSlug?: string;
  checkout: { cod: boolean; deliveryCharge: number | null };
}

/** How far back "Most Popular" counts website orders, and how many different products it needs before it is shown. */
const POPULAR_DAYS = 90;
const POPULAR_MIN = 4;

/**
 * "Most Popular": the products ordered most (by quantity) on this website in the last 90 days, from the website's own
 * order records; cancelled orders are left out. Only products still in the catalogue and available are shown, and the
 * section stays hidden until at least four different products have been ordered, so it never claims popularity from
 * a handful of orders. Empty without the website database.
 */
async function mostOrdered(products: Map<string, ErpProduct> | null): Promise<ErpProduct[]> {
  const db = getDb();
  if (!db || !products) return [];
  const since = new Date(Date.now() - POPULAR_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.webOrder.findMany({ where: { createdAt: { gte: since }, NOT: { erpStatus: "CANCELLED" } }, select: { items: true }, take: 5000 }).catch(() => []);
  const qty = new Map<string, number>();
  for (const r of rows) {
    for (const l of (Array.isArray(r.items) ? r.items : []) as { itemId?: unknown; quantity?: unknown }[]) {
      if (typeof l?.itemId === "string" && typeof l.quantity === "number") qty.set(l.itemId, (qty.get(l.itemId) ?? 0) + l.quantity);
    }
  }
  const ranked = [...qty.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => products.get(id)).filter((p): p is ErpProduct => Boolean(p?.available));
  return ranked.length >= POPULAR_MIN ? ranked.slice(0, 10) : [];
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
  const [logos, staffBanners, wideBanners, snapshot] = await Promise.all([brandLogoMap(), activeBanners(), activeWideBanners(), safe(() => getSnapshot())]);
  // Staff-picked Hot Deals, matched against the same ERP snapshot as every other section (real prices and stock).
  const curated = await configuredHotDealsWithEnd(snapshot?.products ?? null);
  const curatedDeals = curated?.deals ?? null;
  const saleOffers = (offers?.items ?? []).filter(isOnSale);

  const all = newest?.items ?? [];

  const categories = newest?.categories ?? [];
  // One rail per larger category, newest first
  const railCats = [...categories].filter((c) => c.count >= 3).sort((a, b) => b.count - a.count).slice(0, 4);
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
    // The owner's own reviews (HOME_REVIEWS) when set; otherwise the best approved customer reviews from product pages.
    reviews: await (async () => {
      const r = configuredReviews();
      if (r.reviews.length) return { title: r.title, items: r.reviews };
      return { title: process.env.HOME_REVIEWS_TITLE?.trim().slice(0, 80) || "What Our Customers Say", items: await featuredReviews().catch(() => []) };
    })(),
    popular: await mostOrdered(snapshot?.products ?? null),
    offers: saleOffers,
    hotDeals: curatedDeals ?? saleOffers,
    hotDealsCurated: curatedDeals !== null,
    hotDealsEndAt: curated?.endsAt?.toISOString() ?? null,
    featured: featured?.items ?? [],
    brands: (brands ?? []).map((b) => ({ ...b, logo: logos.get(brandKey(b.name)) })),
    // Banners staff created in the admin win; with none active the category-derived / HOME_BANNERS ones remain.
    banners: staffBanners.length ? staffBanners : resolveBanners(categories),
    staffBanners: staffBanners.length > 0,
    wideBanners,
    rails,
    budget: prices ? budgetBands(prices) : null,
    phonesSlug: categories.find((c) => /phone|mobile/i.test(c.name))?.slug,
    checkout: {
      cod: Boolean(settings?.enabled && settings.settings?.paymentMethods.COD),
      deliveryCharge: settings?.enabled ? (settings.settings?.deliveryCharge ?? null) : null,
    },
  };
}
