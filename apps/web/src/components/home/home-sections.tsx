import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ProductCard } from "@/components/products/product-card";
import { EmptyState } from "@/components/ui/states";
import type { HomeData } from "@/lib/home-data";
import { categoryVisual } from "./category-art";
import { Reveal } from "./reveal";

/** Large headline used by every homepage section: an optional small label, the title and an optional supporting line. */
export function SectionIntro({ id, eyebrow, title, children, action }: { id: string; eyebrow?: string; title: string; children?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <Reveal className="mb-6 flex flex-col gap-3 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 id={id} className="max-w-2xl text-3xl font-bold leading-[1.05] tracking-[-0.035em] text-ink sm:text-4xl lg:text-5xl">{title}</h2>
        {children && <div className="mt-3 max-w-lg text-sm leading-6 text-muted sm:text-base">{children}</div>}
      </div>
      {action && (
        <Link href={action.href} className="group inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:text-brand-600 hover:underline">
          {action.label} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </Link>
      )}
    </Reveal>
  );
}

/** The five departments from the brief, in this order, but only those that exist in the live catalogue. */
const WANTED = [/phone|mobile/i, /accessor/i, /audio/i, /tablet/i, /wear|watch/i];
const MAX_TILES = 5;

function pickCategories(all: HomeData["categories"]) {
  const out: HomeData["categories"] = [];
  for (const re of WANTED) {
    const c = all.find((x) => re.test(x.name) && !out.includes(x));
    if (c) out.push(c);
  }
  // Catalogues that lack some of those departments are filled with their largest real categories instead.
  for (const c of [...all].sort((a, b) => b.count - a.count)) {
    if (out.length >= MAX_TILES) break;
    if (!out.includes(c)) out.push(c);
  }
  return out.slice(0, MAX_TILES);
}

/** "Explore categories": one large photographic tile per real category (a bento on wide screens, a 2-column grid on phones). */
export function CategoryTiles({ categories }: { categories: HomeData["categories"] }) {
  const shown = pickCategories(categories);
  if (!shown.length) return null;
  const bento = shown.length === 5;
  return (
    <section aria-labelledby="cats" className="mt-12 sm:mt-20">
      <SectionIntro id="cats" eyebrow="Explore" title="Find your category" action={{ href: "/products", label: "All products" }} />
      <ul className={`grid grid-cols-2 gap-3 sm:gap-4 ${bento ? "lg:grid-cols-4 lg:grid-rows-2" : "lg:grid-cols-3"}`}>
        {shown.map((c, i) => {
          const art = categoryVisual(c.name) ?? c.image;
          const feature = bento && i === 0;
          return (
            <Reveal as="li" key={c.slug} delay={i * 70} className={feature ? "col-span-2 lg:col-span-2 lg:row-span-2" : ""}>
              <Link
                href={`/categories/${c.slug}`}
                aria-label={`${c.name}, ${c.count} ${c.count === 1 ? "product" : "products"}`}
                className={`group relative block overflow-hidden rounded-[1.75rem] bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${feature ? "aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[28rem]" : "aspect-[4/5] sm:aspect-square lg:aspect-auto lg:h-full lg:min-h-[13.5rem]"}`}
              >
                {art && (
                  <Image
                    src={art}
                    alt=""
                    fill
                    sizes={feature ? "(min-width:1024px) 50vw, 100vw" : "(min-width:1024px) 25vw, 50vw"}
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transition-none"
                  />
                )}
                <span className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2 rounded-2xl bg-white/90 px-3 py-2.5 backdrop-blur-sm sm:inset-x-4 sm:bottom-4 sm:px-4 sm:py-3">
                  <span className="min-w-0">
                    <span className={`block break-words font-semibold leading-tight tracking-tight text-ink ${feature ? "text-lg sm:text-2xl" : "text-base"}`}>{c.name}</span>
                    <span className="block text-xs text-muted">{c.count} {c.count === 1 ? "product" : "products"}</span>
                  </span>
                  <span className={`h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors group-hover:bg-brand-500 group-hover:text-on-brand ${feature ? "flex" : "hidden sm:flex"}`}>
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
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

/** Supporting line for each tab; only states what the data supports. */
const TAB_BLURB: Record<string, string> = {
  new: "The latest products added to our catalogue.",
  offers: "Products with a current price reduction.",
  featured: "Products the shop has marked as featured.",
};

/**
 * Discovery tabs: New arrivals, Featured (marked by staff), Offers (only real sale prices) and the biggest categories.
 * The ERP has no sales or trend data, so no "best seller" or "trending" claim is made.
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
    <section id="products" aria-labelledby="featured" className="mt-16 scroll-mt-40 sm:mt-24">
      <SectionIntro id="featured" eyebrow="Discover" title="Featured Products" action={{ href: active.all, label: "View all" }}>
        <p aria-live="polite">{blurb}</p>
      </SectionIntro>
      {tabs.length > 1 && (
        <nav aria-label="Product collections" className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <ul className="flex w-max gap-2">
            {tabs.map((t) => {
              const on = t.id === active.id;
              return (
                <li key={t.id}>
                  <Link
                    href={t.href}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold transition-colors motion-reduce:transition-none ${on ? "bg-ink text-white" : "bg-surface text-ink hover:bg-border"}`}
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
        // Phones swipe sideways through the collection; larger screens show a balanced grid (8 on laptops, 10 on wide screens).
        <ul
          aria-label={`${active.label} products`}
          className="-mx-4 flex scroll-px-4 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 xl:grid-cols-5 sm:max-lg:[&>li:nth-child(n+10)]:hidden lg:max-xl:[&>li:nth-child(n+9)]:hidden [&::-webkit-scrollbar]:hidden"
        >
          {active.products.slice(0, 10).map((p, i) => (
            <li key={p.id} className="w-[46%] shrink-0 snap-start min-[430px]:w-[42%] sm:w-auto">
              <ProductCard product={p} priority={i < 4} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No products to show yet" action={{ href: "/products", label: "Browse all products" }}>
          Products will appear here as soon as they are available.
        </EmptyState>
      )}
    </section>
  );
}
