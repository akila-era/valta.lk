import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Flame } from "lucide-react";
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

/** Warm tile tints, cycled across the category cards (the third carries the brand orange). */
const TILE_TINTS = [
  "linear-gradient(145deg,#f8f6f2,#ece8e1)",
  "linear-gradient(145deg,#f5f6f6,#e6e8ea)",
  "linear-gradient(145deg,#fff4ec,#f7dfcd)",
  "linear-gradient(145deg,#f6f6f2,#e8e8e0)",
];

/**
 * "Shop by Category": one card per real ERP category (name, link and count come from the catalogue), with a studio
 * photograph for known kinds of category, the ERP's own photo otherwise, or a line icon as the last resort.
 * 2D (dotted grid, orange ring) meets 3D (the product floats over a floor shadow and lifts on hover). Phones get a
 * swipeable row; from 640px the cards form a centred grid, up to six per row.
 */
export function CategoryTiles({ categories }: { categories: HomeData["categories"] }) {
  if (!categories.length) return null;
  const shown = categories.slice(0, MAX_CATEGORY_CARDS);
  return (
    <section aria-labelledby="cats" className="section-space">
      {/* No eyebrow: the homepage chapter kicker ("02 / Categories") already labels it. */}
      <SectionHeader id="cats" title="Shop by Category" action={{ href: "/products", label: "View all categories" }}>
        <p className="hidden sm:block">Find the right upgrade in a tap.</p>
      </SectionHeader>
      <ul
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-[repeat(var(--cat-cols),minmax(0,1fr))] [&::-webkit-scrollbar]:hidden"
        style={{ "--cat-cols": Math.min(shown.length, 6) } as React.CSSProperties}
      >
        {shown.map((c, i) => {
          const Icon = categoryIcon(c.name);
          const art = categoryVisual(c.name) ?? c.image;
          const line = CATEGORY_LINE.find((k) => k.test.test(c.name))?.line ?? "Shop the range";
          const count = `${c.count} ${c.count === 1 ? "product" : "products"}`;
          return (
            <Reveal as="li" key={c.slug} delay={Math.min(i, 7) * 50} className="w-[44%] shrink-0 snap-start sm:w-auto">
              <Link
                href={`/categories/${c.slug}`}
                className="group relative flex h-full min-h-[12.5rem] flex-col overflow-hidden rounded-[1.375rem] p-4 ring-1 ring-inset ring-ink/[0.05] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift sm:min-h-[13.5rem] lg:min-h-[15.5rem] lg:rounded-panel lg:p-5 motion-reduce:hover:translate-y-0"
                style={{ background: TILE_TINTS[i % TILE_TINTS.length] }}
              >
                {/* 2D: dotted grid fading in from the lower right, and an orange ring outline. */}
                <span aria-hidden className="absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.08)_1px,transparent_1.3px)] [background-size:14px_14px] [mask-image:linear-gradient(150deg,transparent_45%,#000)]" />
                <span aria-hidden className="absolute -right-7 -top-7 h-24 w-24 rounded-full border-[10px] border-brand-500/15 transition-transform duration-500 group-hover:scale-110 lg:h-28 lg:w-28" />
                <span className="relative z-10 min-w-0 pr-2">
                  <span className="block text-[15px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[17px] lg:text-lg">{c.name}</span>
                  <span className="mt-1 block text-xs leading-4 text-ink/70">{line}</span>
                </span>
                {/* 3D: the studio photo floats above a floor shadow; multiply blends its warm backdrop into the tile. */}
                <span aria-hidden className="absolute bottom-1 right-0 aspect-square h-[64%] max-h-44">
                  <span className="absolute bottom-[9%] left-1/2 h-[9%] w-[62%] -translate-x-1/2 rounded-[50%] bg-ink/30 blur-md transition-[width,opacity] duration-500 group-hover:w-[50%] group-hover:opacity-60" />
                  {art ? (
                    <span className="absolute inset-0 mix-blend-multiply transition-transform duration-500 ease-out [mask-image:radial-gradient(closest-side,#000_70%,transparent)] group-hover:-translate-y-2 group-hover:-rotate-3 group-hover:scale-[1.06] motion-reduce:transition-none">
                      <Image src={art} alt="" fill sizes="(min-width:1024px) 180px, 140px" className="object-cover [filter:brightness(1.07)_contrast(1.04)]" />
                    </span>
                  ) : (
                    <Icon className="absolute left-1/2 top-[42%] h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-ink/80 transition-transform duration-500 group-hover:-translate-y-[60%]" strokeWidth={1.2} />
                  )}
                </span>
                <span className="relative z-10 mt-auto flex items-center gap-2">
                  <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-ink shadow-soft ring-1 ring-ink/[0.06] transition-colors duration-200 group-hover:bg-brand-500 group-hover:text-on-brand">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                  <span className="hidden text-xs font-semibold text-ink/70 sm:inline">{count}</span>
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
      <Link href={href} tabIndex={-1} aria-hidden className="relative block min-h-44 overflow-hidden bg-[linear-gradient(145deg,#f8f7f4,#eeece8)] sm:min-h-56">
        {/* 3D stage: dot grid, white spotlight disc and a floor shadow; the product lifts and tilts on hover. */}
        <span className="absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.07)_1px,transparent_1.3px)] [background-size:14px_14px] [mask-image:linear-gradient(200deg,transparent_50%,#000)]" />
        <span className="absolute left-1/2 top-[46%] aspect-square h-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_16px_40px_-14px_rgb(27_23_20/0.22)] transition-transform duration-500 group-hover/card:scale-105" />
        <span className="absolute bottom-[10%] left-1/2 h-3.5 w-[34%] -translate-x-1/2 rounded-[50%] bg-ink/25 blur-md transition-[width,opacity] duration-500 group-hover/card:w-[26%] group-hover/card:opacity-60" />
        <span className="absolute inset-0 mix-blend-multiply transition-transform duration-500 ease-out group-hover/card:-translate-y-2 group-hover/card:-rotate-2 group-hover/card:scale-[1.04] motion-reduce:transition-none">
          <ProductImage src={product.images[0]} alt="" sizes="(min-width:640px) 40vw, 40vw" padding="p-6 sm:p-9" />
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
        <ul className="relative grid flex-1 content-center grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 max-sm:[&>li:nth-child(n+5)]:hidden sm:max-lg:[&>li:nth-child(n+7)]:hidden lg:max-xl:[&>li:nth-child(n+7)]:hidden xl:max-2xl:[&>li:nth-child(n+9)]:hidden 2xl:[&>li:nth-child(n+11)]:hidden">
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
    // A warm "stage" panel: white product cards stand out on it, and the 2D dot grid echoes the cards' own pattern.
    <section id="products" aria-labelledby="featured" className="section-space relative scroll-mt-40 overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-b from-[#FAF8F5] via-white to-[#F5EFE9]/40 p-4 shadow-soft sm:p-6 lg:p-8">
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 [background-image:radial-gradient(rgb(23_23_23/0.06)_1px,transparent_1.3px)] [background-size:16px_16px] [mask-image:linear-gradient(180deg,#000,transparent)]" />
      <div className="relative">
      <SectionHeader id="featured" title="Featured Products">
        <p aria-live="polite">{blurb}</p>
      </SectionHeader>
      {tabs.length > 1 && (
        <nav aria-label="Product collections" className="-mx-3 mb-4 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:mb-6 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <ul className="flex w-max gap-2">
            {tabs.map((t) => {
              const on = t.id === active.id;
              return (
                <li key={t.id}>
                  <Link
                    href={t.href}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 ${
                      on
                        ? "border-brand-500 bg-brand-500 text-on-brand shadow-[0_8px_18px_-8px_rgb(255_92_0/0.7)]"
                        : "border-border bg-bg text-ink/75 hover:border-ink/30 hover:text-ink"
                    }`}
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
        // Balanced responsive grid: 2 on phones, 3 on tablets/laptops, 4 on desktop, 5 on wide 2XL screens.
        <ul
          aria-label={`${active.label} products`}
          className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 max-md:[&>li:nth-child(n+7)]:hidden md:max-lg:[&>li:nth-child(n+10)]:hidden lg:max-xl:[&>li:nth-child(n+10)]:hidden xl:max-2xl:[&>li:nth-child(n+9)]:hidden 2xl:[&>li:nth-child(n+11)]:hidden"
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
      <div className="mt-6 text-center">
        <Link href={active.all} className="btn-outline min-h-11">
          View all <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
      </div>
    </section>
  );
}
