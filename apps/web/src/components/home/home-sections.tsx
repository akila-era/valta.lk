import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight, Flame } from "lucide-react";
import { AddToCartButton } from "@/components/products/add-to-cart-button";
import { CompactProductCard } from "@/components/products/compact-product-card";
import { ProductImage } from "@/components/products/product-card";
import { WishlistButton } from "@/components/products/wishlist-button";
import { discountPercent, effectivePrice } from "@/lib/erp/product-utils";
import { formatLkr, fromCents, toCents } from "@/lib/utils/money";
import { SectionHeader } from "@/components/ui/chrome";
import { EmptyState } from "@/components/ui/states";
import type { HomeData } from "@/lib/home-data";
import { categoryVisual } from "./category-art";
import { categoryIcon } from "./sections";
import { Reveal } from "./reveal";

/** Most categories shown before the rest are reached through "All products" or the category menu. */
const MAX_CATEGORY_CARDS = 12;

/** A short line under each category card, by the kind of category. Descriptive only; unknown kinds show the count. */
const CATEGORY_LINE: { test: RegExp; line: string }[] = [
  { test: /phone|mobile|smartphone/i, line: "Smartphones" },
  { test: /audio|earbud|headphone|speaker/i, line: "Headphones & speakers" },
  { test: /accessor|charg|cable/i, line: "Chargers, cables & more" },
  { test: /tablet/i, line: "Work, study, create" },
  { test: /wear|watch/i, line: "Smart watches & bands" },
  { test: /gam|console/i, line: "Consoles & controllers" },
];

/**
 * "Shop by Category": one card per real ERP category (name, link and count come from the catalogue), with a studio
 * photograph for known kinds of category, the ERP's own photo otherwise, or a line icon as the last resort.
 */
export function CategoryTiles({ categories }: { categories: HomeData["categories"] }) {
  if (!categories.length) return null;
  const shown = categories.slice(0, MAX_CATEGORY_CARDS);
  return (
    <section aria-labelledby="cats" className="section-space">
      <SectionHeader id="cats" eyebrow="Top categories" title="Shop by Category" action={{ href: "/products", label: "View all categories" }} />
      {/* Desktop: one row across the full width, a column per real category (up to eight). */}
      <ul
        className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-[repeat(var(--cat-cols),minmax(0,1fr))]"
        style={{ "--cat-cols": Math.min(shown.length, 8) } as React.CSSProperties}
      >
        {shown.map((c, i) => {
          const Icon = categoryIcon(c.name);
          const art = categoryVisual(c.name) ?? c.image;
          const line = CATEGORY_LINE.find((k) => k.test.test(c.name))?.line ?? `${c.count} ${c.count === 1 ? "product" : "products"}`;
          return (
            <Reveal as="li" key={c.slug} delay={Math.min(i, 7) * 50}>
              <Link
                href={`/categories/${c.slug}`}
                aria-label={`${c.name}, ${c.count} ${c.count === 1 ? "product" : "products"}`}
                className="group flex h-full flex-col rounded-xl border border-border bg-surface p-1.5 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-brand-500/40 hover:bg-bg hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:hover:translate-y-0"
              >
                <span className="relative flex h-20 w-full justify-center overflow-hidden rounded-lg bg-[#efece8] sm:h-28 lg:h-40">
                  {art ? (
                    // The square studio photo fades out at its sides into the card tint, so no hard photo edge shows.
                    <span className="relative aspect-square h-full [mask-image:radial-gradient(ellipse_at_center,#000_75%,transparent_100%)]">
                      <Image src={art} alt="" fill sizes="(min-width:1024px) 160px, 112px" className="object-cover transition-transform duration-500 group-hover:scale-[1.06] motion-reduce:transition-none" />
                    </span>
                  ) : (
                    <Icon className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-ink" strokeWidth={1.2} aria-hidden />
                  )}
                </span>
                <span className="flex flex-1 items-center justify-between gap-1 px-1.5 pb-1 pt-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-ink sm:text-sm">{c.name}</span>
                    <span className="hidden truncate text-xs text-muted sm:block">{line}</span>
                  </span>
                  <span aria-hidden className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg text-ink shadow-card transition-colors duration-200 group-hover:bg-brand-500 sm:flex group-hover:text-on-brand">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </span>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * "Hot Deals": staff-picked products when any are live (see lib/hot-deals.ts), otherwise products with a real ERP price
 * reduction. Prices and discounts always come from the ERP. Hidden when there are none.
 */
/** A large horizontal deal card, used when only one or two deals exist so they fill the panel instead of leaving it empty. */
function DealSpotlight({ product }: { product: HomeData["offers"][number] }) {
  const title = product.content?.displayTitle || product.name;
  const current = effectivePrice(product);
  const pct = discountPercent(product);
  const save = current < product.price ? fromCents(toCents(product.price) - toCents(current)) : 0;
  const href = `/products/${product.slug}`;
  return (
    <article className="group/card grid h-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] overflow-hidden rounded-2xl bg-bg text-ink">
      <Link href={href} tabIndex={-1} aria-hidden className="media-spot relative block min-h-36 overflow-hidden">
        <span className="absolute inset-0 transition-transform duration-500 ease-out group-hover/card:scale-105">
          <ProductImage src={product.images[0]} alt="" sizes="(min-width:640px) 40vw, 40vw" padding="p-3 sm:p-6" />
        </span>
        {pct ? <span className="absolute left-3 top-3 rounded-full bg-brand-500 px-2.5 py-1 text-xs font-bold text-on-brand">-{pct}%</span> : null}
      </Link>
      <div className="flex min-w-0 flex-col justify-center gap-1.5 p-3 sm:gap-2 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{product.brand ?? ""}</span>
          <WishlistButton className="h-8 w-8 shrink-0" item={{ productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: current }} />
        </div>
        <h3 className="line-clamp-2 font-display text-base font-bold leading-tight tracking-[-0.015em] sm:text-2xl">
          <Link href={href} className="hover:text-brand-600">{title}</Link>
        </h3>
        <p className="flex flex-wrap items-baseline gap-x-2">
          {product.hasVariants ? <span className="text-sm text-muted">From</span> : null}
          <span className="font-display text-xl font-bold tabular-nums text-brand-600 sm:text-3xl">{formatLkr(current)}</span>
          {save > 0 && (
            <span className="text-sm text-muted"><span className="sr-only">Regular price</span><s>{formatLkr(product.price)}</s></span>
          )}
        </p>
        {save > 0 && <p className="text-xs font-semibold text-success sm:text-sm">You save {formatLkr(save)}</p>}
        <div className="mt-1 flex flex-wrap gap-2 sm:mt-2 [&_.btn-primary]:max-sm:min-h-9 [&_.btn-primary]:max-sm:text-[13px]">
          {product.available && !product.hasVariants ? (
            <span className="w-full sm:w-auto sm:min-w-44">
              <AddToCartButton line={{ productId: product.id, variantKey: "", slug: product.slug, name: product.name, sku: product.sku, image: product.images[0], unitPrice: current }} />
            </span>
          ) : (
            <Link href={href} className="btn-primary">{product.available ? "Choose options" : "View details"}</Link>
          )}
          <Link href={href} className="btn-outline hidden sm:inline-flex">View details</Link>
        </div>
      </div>
    </article>
  );
}

export function BestDeals({ products, curated = false }: { products: HomeData["hotDeals"]; curated?: boolean }) {
  const items = products.filter((p) => p.available).slice(0, 6);
  if (!items.length) return null;
  return (
    <section aria-labelledby="deals" className="section-space relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-bg to-surface p-3 sm:p-4">
      <span aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="relative mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Flame aria-hidden className="h-8 w-8 animate-flicker fill-brand-500 text-brand-600 drop-shadow-[0_4px_10px_rgb(255_92_0/0.35)]" strokeWidth={1.5} />
          <div>
            <h2 id="deals" className="font-display text-lg font-bold leading-tight sm:text-xl">Hot Deals</h2>
            <p className="text-xs text-muted">{curated ? "Picked by the VALTA team. Prices and stock are live from our catalogue." : "Current price reductions in our catalogue."}</p>
          </div>
        </div>
        <Link href="/products?sale=1" className="btn min-h-9 border border-brand-500 bg-bg px-4 text-[13px] text-brand-700 hover:bg-brand-500 hover:text-on-brand">
          View all deals <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      {items.length <= 2 ? (
        <ul className={`relative grid flex-1 gap-3 ${items.length === 2 ? "lg:grid-cols-2" : ""}`}>
          {items.map((p, i) => (
            <Reveal as="li" key={p.id} delay={i * 80}><DealSpotlight product={p} /></Reveal>
          ))}
        </ul>
      ) : (
        <ul className="relative grid flex-1 content-center grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 max-sm:[&>li:nth-child(n+5)]:hidden sm:max-lg:[&>li:nth-child(n+4)]:hidden lg:max-xl:[&>li:nth-child(n+6)]:hidden">
          {items.map((p, i) => (
            <Reveal as="li" key={p.id} delay={i * 60}><CompactProductCard product={p} panel /></Reveal>
          ))}
        </ul>
      )}
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
      <SectionHeader id="featured" eyebrow="Collections" title="Featured Products">
        <p aria-live="polite">{blurb}</p>
      </SectionHeader>
      {tabs.length > 1 && (
        <nav aria-label="Product collections" className="mb-3 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex w-max gap-1 rounded-full border border-border bg-surface p-1">
            {tabs.map((t) => {
              const on = t.id === active.id;
              return (
                <li key={t.id}>
                  <Link
                    href={t.href}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors duration-200 ${on ? "bg-ink text-bg shadow-card" : "text-muted hover:text-ink"}`}
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
        // 2 columns on phones, 3 on tablets, 5 on laptops, 6 on wide screens. Extra items are hidden per breakpoint so
        // the last row is never left short: 6 on phones, 9 on tablets, 10 on laptops, one row of 6 on wide screens.
        <ul
          aria-label={`${active.label} products`}
          className="grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 max-md:[&>li:nth-child(n+7)]:hidden md:max-lg:[&>li:nth-child(n+10)]:hidden xl:[&>li:nth-child(n+7)]:hidden"
        >
          {active.products.slice(0, 10).map((p, i) => (
            <Reveal as="li" key={p.id} delay={(i % 6) * 50}>
              <CompactProductCard product={p} priority={i < 4} />
            </Reveal>
          ))}
        </ul>
      ) : (
        <EmptyState title="No products to show yet" action={{ href: "/products", label: "Browse all products" }}>
          Products will appear here as soon as they are available.
        </EmptyState>
      )}
      <div className="mt-4 text-center">
        <Link href={active.all} className="btn-outline min-h-10">
          View all <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
