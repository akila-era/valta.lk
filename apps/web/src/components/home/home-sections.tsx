import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgePercent, Sparkles } from "lucide-react";
import { ProductCard } from "@/components/products/product-card";
import { SectionHeader } from "@/components/ui/chrome";
import { EmptyState } from "@/components/ui/states";
import type { HomeData } from "@/lib/home-data";
import { ProductCarousel } from "./product-carousel";
import { categoryVisual } from "./category-art";
import { categoryIcon } from "./sections";

/** Compact round icon shortcuts shown above the hero (New arrivals, Deals when real, then real categories). */
export function CategoryShortcuts({ categories, hasDeals }: { categories: HomeData["categories"]; hasDeals: boolean }) {
  if (!categories.length) return null;
  const circle =
    "relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-border bg-surface transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-500 sm:h-16 sm:w-16";
  const label = "mt-2 block text-center text-xs font-semibold leading-tight sm:text-sm";
  const item = "group flex w-[4.75rem] shrink-0 snap-start flex-col items-center sm:w-24";
  return (
    <nav aria-label="Category shortcuts" className="mb-6 sm:mb-8">
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:justify-center sm:gap-4 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <li className={item}>
          <Link href="/#products" className="flex flex-col items-center">
            <span className={`${circle} border-brand-500 bg-brand-500 text-ink`}><Sparkles className="h-6 w-6" aria-hidden /></span>
            <span className={label}>New arrivals</span>
          </Link>
        </li>
        {hasDeals && (
          <li className={item}>
            <Link href="/products?sale=1" className="flex flex-col items-center">
              <span className={`${circle} bg-brand-50 text-brand-600`}><BadgePercent className="h-6 w-6" aria-hidden /></span>
              <span className={label}>Deals</span>
            </Link>
          </li>
        )}
        {categories.slice(0, 8).map((c) => {
          const Icon = categoryIcon(c.name);
          return (
            <li key={c.slug} className={item}>
              <Link href={`/categories/${c.slug}`} className="flex flex-col items-center">
                <span className={circle}>
                  {c.image ? <Image src={c.image} alt="" fill sizes="64px" className="object-contain p-2" /> : <Icon className="h-6 w-6 text-muted group-hover:text-brand-600" aria-hidden />}
                </span>
                <span className={label}>{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Most categories shown before the rest are reached through "All products" or the category menu. */
const MAX_CATEGORY_CARDS = 12;

/**
 * "Shop by Category": a centred title and one icon link per real ERP category (name and link come from the catalogue).
 * A category's first real product photo is used when the ERP has one; otherwise a simple line icon for that kind of
 * category. No cards or counts on screen (the count stays in the accessible name).
 */
export function CategoryTiles({ categories }: { categories: HomeData["categories"] }) {
  if (!categories.length) return null;
  const shown = categories.slice(0, MAX_CATEGORY_CARDS);
  return (
    <section aria-labelledby="cats" className="section-space">
      <SectionHeader id="cats" title="Shop by Category" action={{ href: "/products", label: "View all categories" }} />
      <ProductCarousel label="Shop by category" align="start" step="item" snap="proximity">
        {shown.map((c) => {
          const Icon = categoryIcon(c.name);
          const art = categoryVisual(c.name) ?? c.image;
          return (
            <li key={c.slug} className="w-[78%] shrink-0 snap-start px-1.5 last:snap-end sm:w-[46%] sm:px-2 lg:w-[34%] xl:w-[28%]">
              <Link
                href={`/categories/${c.slug}`}
                aria-label={`${c.name}, ${c.count} ${c.count === 1 ? "product" : "products"}`}
                className="group flex flex-col gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                <span className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface">
                  {art ? (
                    <Image src={art} alt="" fill sizes="(min-width:1280px) 23vw, (min-width:1024px) 30vw, (min-width:640px) 46vw, 78vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none" />
                  ) : (
                    <Icon className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-ink" strokeWidth={1.2} aria-hidden />
                  )}
                </span>
                <span className="text-sm font-semibold tracking-tight text-ink">{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ProductCarousel>
    </section>
  );
}

/** Supporting line for each tab; only states what the data supports. */
const TAB_BLURB: Record<string, string> = {
  new: "The latest products added to our catalogue.",
  offers: "Products with a current price reduction.",
  featured: "Products the shop has marked as featured.",
};

/**
 * Featured Products: New Arrivals, Special Offers (only when real sale prices exist) and the biggest categories as tabs.
 * The ERP has no "featured" or "best seller" data, so none is claimed.
 */
export function TabbedShowcase({ data, tab }: { data: HomeData; tab: string }) {
  const tabs = [
    { id: "new", label: "New Arrivals", href: "/#products", products: data.newArrivals, all: "/products" },
    ...(data.featured.length ? [{ id: "featured", label: "Featured", href: "/?tab=featured#products", products: data.featured, all: "/products" }] : []),
    ...(data.offers.length ? [{ id: "offers", label: "Special Offers", href: "/?tab=offers#products", products: data.offers, all: "/products?sale=1" }] : []),
    ...data.rails.map((r) => ({ id: `c-${r.slug}`, label: r.name, href: `/?tab=c-${r.slug}#products`, products: r.products, all: `/categories/${r.slug}` })),
  ];
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  const blurb = TAB_BLURB[active.id] ?? `Available now in ${active.label}.`;
  return (
    <section id="products" aria-labelledby="featured" className="section-space scroll-mt-40">
      <SectionHeader id="featured" title="Featured Products" center>
        <p aria-live="polite">{blurb}</p>
      </SectionHeader>
      {tabs.length > 1 && (
        <nav aria-label="Product collections" className="mb-6 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="mx-auto flex w-max gap-2">
            {tabs.map((t) => {
              const on = t.id === active.id;
              return (
                <li key={t.id}>
                  <Link
                    href={t.href}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    className={on ? "btn-primary" : "btn-secondary"}
                  >
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      {active.products.length ? (
        // 2 columns on phones, 3 on tablets, 4 on laptops, 5 on wide screens. Extra items are hidden per breakpoint so
        // the last row is never left short: 10 on phones/wide, 9 on tablets, 8 on laptops.
        <ul
          aria-label={`${active.label} products`}
          className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:max-lg:[&>li:nth-child(n+10)]:hidden lg:max-xl:[&>li:nth-child(n+9)]:hidden"
        >
          {active.products.slice(0, 10).map((p, i) => (
            <li key={p.id}>
              <ProductCard product={p} priority={i < 4} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No products to show yet" action={{ href: "/products", label: "Browse all products" }}>
          Products will appear here as soon as they are available.
        </EmptyState>
      )}
      <div className="mt-8 text-center">
        <Link href={active.all} className="btn-outline">
          View all <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/**
 * "Explore More Products": a swipeable carousel of further products from the catalogue (those after the ones shown in
 * New Arrivals). The ERP has no sales data, so this makes no "popular" claim. Hidden when there are fewer than 3.
 */
/** Real products from the accessories category. Device compatibility is not claimed here. */
export function AccessoryShelf({ rail }: { rail?: HomeData["rails"][number] }) {
  if (!rail) return null;
  const items = rail.products.filter((p) => p.available).slice(0, 4);
  if (!items.length) return null;
  return (
    <section aria-labelledby="accessory-shelf" className="mt-14 sm:mt-20">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <div>
          <h2 id="accessory-shelf" className="section-title">Accessories in the catalogue</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">Products filed under {rail.name}. A product page shows an accessory only when it is linked to that device.</p>
        </div>
        <Link href={`/categories/${rail.slug}`} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
          View {rail.name} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map((p) => (
          <li key={p.id}><ProductCard product={p} /></li>
        ))}
      </ul>
    </section>
  );
}

export function MoreProducts({ products }: { products: HomeData["more"] }) {
  if (products.length < 3) return null;
  return (
    <section aria-labelledby="more-products" className="mt-14 sm:mt-20">
      <div className="mb-7 text-center sm:mb-9">
        <h2 id="more-products" className="section-title">Explore More Products</h2>
        <p className="mt-2 text-sm text-muted sm:text-base">More from our catalogue, available now.</p>
      </div>
      <ProductCarousel label="More products">
        {products.map((p) => (
          <li key={p.id} className="w-1/2 shrink-0 snap-start px-1.5 sm:px-2 md:w-1/3 lg:w-1/4 xl:w-1/5">
            <ProductCard product={p} />
          </li>
        ))}
      </ProductCarousel>
    </section>
  );
}
