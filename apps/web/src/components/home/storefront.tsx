import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Banknote, Headset, PackageSearch, RefreshCw, Star, Truck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CompactProductCard } from "@/components/products/compact-product-card";
import type { HomeData, ResolvedBanner } from "@/lib/home-data";
import type { ErpProduct } from "@/lib/erp/types";
import { instalmentLine } from "@/lib/instalments";
import { brandColor } from "@/lib/brand-colors";
import { categoryTaglines } from "@/lib/category-taglines";
import { cardRatings } from "@/lib/reviews";
import { getContent } from "@/lib/site-content";
import { getStoreInfo } from "@/lib/store-info";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";
import { categoryVisual } from "./category-art";
import { CategoryCarousel, type CategoryTile } from "./category-carousel";
import { HeroBanner, type HeroSlide } from "./hero-banner";
import { ProductTabs } from "./product-tabs";
import { Reveal } from "./reveal";

type Category = HomeData["categories"][number];

/** Campaign photographs for the banner, each tied to the kind of category it shows. Only kinds the catalogue has are used. */
const SLIDE_ART: { test: RegExp; src: string; alt: string; eyebrow: string; title: string; text: string; dark?: boolean }[] = [
  { test: /(?<!head|ear)phone|mobile|smartphone/i, src: "/images/home/volta-hero-electronics.webp", alt: "Smartphone and wireless earbuds in a studio", eyebrow: "Smartphones", title: "The latest phones, in one place.", text: "Compare smartphones and their prices in LKR, with live stock from our catalogue." },
  { test: /audio|earbud|headphone|speaker/i, src: "/images/home/volta-hero-audio.webp", alt: "Wireless earbuds and charging case", eyebrow: "Audio", title: "Sound for every day.", text: "Earbuds, headphones and speakers for work, travel and play." },
  { test: /wear|watch/i, src: "/images/home/volta-hero-watch.webp", alt: "Smartwatch on a stone surface", eyebrow: "Wearables", title: "Smart on your wrist.", text: "Smartwatches and bands that keep up with your day." },
  { test: /accessor|charg|cable|gadget/i, src: "/images/home/volta-hero-accessories.webp", alt: "Backpack, power bank, chargers and cables", eyebrow: "Accessories", title: "Power up and stay connected.", text: "Chargers, cables, power banks and the everyday essentials that go with your devices.", dark: true },
];

/** The banner slides: a store-wide opener, then one slide per known kind of category that exists in the catalogue. */
/** The first banner slide's words, unless staff wrote their own (Admin, Content, Homepage). */
export const OPENER_DEFAULT = { eyebrow: siteConfig.name, title: "Technology that moves you.", text: "Mobile phones, electronics and accessories, with prices in LKR.", cta: "Shop now" };

export function heroSlides(categories: Category[], words: { eyebrow: string; title: string; text: string; cta: string } = OPENER_DEFAULT): HeroSlide[] {
  const opener: HeroSlide = {
    src: "/images/home/volta-hero-match.webp",
    alt: "Smartphones, earbuds, a smartwatch and headphones on a studio stand",
    eyebrow: words.eyebrow,
    title: words.title,
    text: words.text,
    cta: words.cta,
    href: "/products",
  };
  const rest = SLIDE_ART.flatMap(({ test, ...art }) => {
    const c = categories.find((x) => test.test(x.name));
    return c ? [{ ...art, cta: `Shop ${c.name.toLowerCase()}`, href: `/categories/${c.slug}` }] : [];
  });
  return [opener, ...rest];
}

/**
 * Section heading as on ugreen.lk: one plain, bold, centred title. The old label and line props are still accepted so
 * callers need not change, but they are not shown.
 */
export function SectionHead({ id, title }: { id: string; eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <h2 id={id} className="mb-6 text-center font-display text-[clamp(1.5rem,1.1rem+1.3vw,2.1rem)] font-bold leading-tight tracking-title text-ink sm:mb-8">
      {title}
    </h2>
  );
}

/** The section's "View all" action, a pill centred under its content. */
export function ViewAll({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <div className="mt-8 flex justify-center">
      <Link href={href} className="btn group min-h-11 rounded-full border border-ink/15 bg-bg px-6 text-ink hover:border-brand-500 hover:text-brand-600 hover:shadow-neon">
        {label} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * The banner row: one full-width slider with the staff banner pictures first (shown exactly as uploaded), then the
 * studio photographs with captions for the kinds of category the catalogue has.
 */
export async function HomeHero({ categories, banners }: { categories: Category[]; banners: HomeData["wideBanners"] }) {
  const words = await getContent("hero-opener");
  const slides: HeroSlide[] = [
    ...banners.map((b) => ({ kind: "image" as const, src: b.image, alt: b.alt, href: b.href || undefined })),
    ...heroSlides(categories, words ?? OPENER_DEFAULT),
  ];
  return (
    <section aria-labelledby="home-title" className="flex flex-1 flex-col">
      <h1 id="home-title" className="sr-only">{siteConfig.name}: mobile phones, electronics and accessories in Sri Lanka</h1>
      {/* The slider fills whatever height the first screen leaves (absolute, so the flex item's height is definite). */}
      <div className="relative min-h-[20rem] min-w-0 flex-1 sm:min-h-[24rem]">
        <div className="absolute inset-0">
          <HeroBanner slides={slides} bleed />
        </div>
      </div>
    </section>
  );
}

/** The service strip under the banner: only facts the store can stand behind (checkout rules come from the live ERP). */
/** The strip's built-in items (facts from the live ERP settings); staff can replace them (Admin, Content, Homepage). */
export function defaultStripItems(checkout: HomeData["checkout"]): { icon: LucideIcon; title: string; text: string; href?: string }[] {
  return [
    ...(checkout.cod ? [{ icon: Banknote, title: "Cash on Delivery", text: "Pay when your order arrives" }] : []),
    ...(checkout.deliveryCharge != null ? [{ icon: Truck, title: `Delivery ${formatLkr(checkout.deliveryCharge)}`, text: "Shown before you order", href: "/shipping-policy" }] : []),
    { icon: PackageSearch, title: "Track Your Order", text: "Follow it with your reference", href: "/track-order" },
    { icon: Headset, title: "Customer Support", text: "We are here to help", href: "/contact" },
  ];
}
const ICON_CYCLE: LucideIcon[] = [Banknote, Truck, PackageSearch, Headset, RefreshCw, BadgeCheck];

export async function ServiceStrip({ checkout }: { checkout: HomeData["checkout"] }) {
  const saved = await getContent("service-strip");
  const items: { icon: LucideIcon; title: string; text: string; href?: string }[] = saved
    ? saved.items.map((x, i) => ({ icon: ICON_CYCLE[i % ICON_CYCLE.length], title: x.title, text: x.text }))
    : defaultStripItems(checkout);
  return (
    // As on ugreen.lk: a black bar under the banner with neon orange words moving slowly across. The words are
    // written twice so the line loops without a gap; the copy is hidden from screen readers and the keyboard.
    // With reduced motion it stands still.
    <section aria-label={`Shopping with ${siteConfig.name}`} className="group/strip overflow-hidden bg-ink">
      <div className="flex w-max animate-[marquee_40s_linear_infinite] group-hover/strip:[animation-play-state:paused] group-focus-within/strip:[animation-play-state:paused] motion-reduce:w-full motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1 || undefined} className={`flex shrink-0 items-center ${copy === 1 ? "motion-reduce:hidden" : "motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center"}`}>
            {items.map(({ icon: I, title, text, href }) => {
              const body = (
                <>
                  <I className="h-4 w-4 shrink-0 text-brand-500" strokeWidth={2} aria-hidden />
                  <span className="whitespace-nowrap text-sm font-bold text-white">{title}</span>
                  <span className="whitespace-nowrap text-xs text-white/60">{text}</span>
                </>
              );
              return (
                <li key={title} className="px-6 sm:px-10">
                  {href ? (
                    <Link href={href} tabIndex={copy === 1 ? -1 : undefined} className="flex min-h-10 items-center gap-2 hover:underline hover:decoration-brand-500 hover:underline-offset-4">{body}</Link>
                  ) : (
                    <div className="flex min-h-10 items-center gap-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
      </div>
    </section>
  );
}

/** "Shop by Category": one tile per real ERP category, with studio art, the ERP's own photo or an icon, and the count. */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  if (!categories.length) return null;
  const tiles: CategoryTile[] = categories.slice(0, 12).map((c) => ({ slug: c.slug, name: c.name, count: c.count, art: categoryVisual(c.name) ?? c.image }));
  return (
    <section aria-labelledby="cats" className="container-page mt-12 sm:mt-16">
      <SectionHead id="cats" eyebrow="Browse" title="Shop by Category">Find the right device or accessory in a tap.</SectionHead>
      <CategoryCarousel tiles={tiles} />
      <ViewAll href="/products" label="View all products" />
    </section>
  );
}

/**
 * Spotlight, laid out as on ugreen.lk: up to four of the largest categories with studio art as light grey tiles in two
 * rows of a narrow and a wide tile (wide first on the second row). Each has a small orange line, the name, a Shop now
 * button and the category photo on the right.
 */
export async function Spotlight({ categories }: { categories: Category[] }) {
  const picks = [...categories].filter((c) => categoryVisual(c.name)).sort((a, b) => b.count - a.count).slice(0, 4);
  const taglines = await categoryTaglines();
  if (picks.length < 2) return null;
  // 12-column grid: 5 + 7 on the first row, 7 + 5 on the second; two tiles share a row equally; a third alone is full width
  const span = (i: number) => (picks.length === 2 ? "lg:col-span-6" : i === 0 || i === 3 ? "lg:col-span-5" : i === 2 && picks.length === 3 ? "sm:col-span-2 lg:col-span-12" : "lg:col-span-7");
  return (
    <section aria-label="Featured ranges" className="container-page mt-14 sm:mt-20">
      <h2 className="mb-6 text-center font-display text-[clamp(1.5rem,1.1rem+1.3vw,2.1rem)] font-bold leading-tight tracking-title text-ink sm:mb-8">{siteConfig.name} Products Sri Lanka</h2>
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-12">
        {picks.map((c, i) => (
          <li key={c.slug} className={span(i)}>
            <Link href={`/categories/${c.slug}`} className="group relative flex h-full min-h-52 overflow-hidden rounded-card bg-[#f4f4f4] text-ink sm:min-h-60">
              <span aria-hidden className="absolute inset-y-0 right-0 w-[55%]">
                <Image src={categoryVisual(c.name)!} alt="" fill sizes="(min-width:1024px) 400px, 55vw" className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />
                <span className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-[#f4f4f4] to-transparent" />
              </span>
              <span className="relative flex max-w-[55%] flex-col items-start p-5 text-left sm:p-6">
                <span className="text-xs font-semibold text-brand-600">{taglines[c.slug] || `${c.count} ${c.count === 1 ? "product" : "products"}`}</span>
                <span className="mt-1 font-display text-2xl font-bold leading-tight tracking-title sm:text-[1.9rem]">{c.name}</span>
                <span className="btn mt-4 min-h-9 rounded-control bg-brand-500 px-4 text-xs font-bold uppercase text-on-brand transition-colors group-hover:bg-ink group-hover:text-white">Shop now</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Staff promo cards (from the admin): a row of picture tiles with one action each, like a store's offer banners. */
export function PromoTiles({ banners }: { banners: ResolvedBanner[] }) {
  if (!banners.length) return null;
  const cols = banners.length >= 4 ? "lg:grid-cols-4" : banners.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
  return (
    <section aria-label="Offers" className="container-page mt-12 sm:mt-16">
      <ul className={`grid gap-3 sm:grid-cols-2 sm:gap-4 ${cols}`}>
        {banners.map((b) => {
          const art = b.custom ? b.image : (categoryVisual(`${b.eyebrow ?? ""} ${b.headline}`) ?? b.image);
          return (
            <li key={b.href + b.headline + b.ctaLabel}>
              <article className={`group relative flex h-full min-h-56 overflow-hidden rounded-panel ${b.custom ? "bg-night text-white" : "bg-surface text-ink"}`}>
                {art ? (
                  <Image
                    src={art}
                    alt=""
                    fill
                    unoptimized={art.startsWith("/api/")}
                    sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw"
                    className={`transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none ${b.custom ? "object-cover" : "object-contain object-right-bottom mix-blend-multiply"}`}
                    loading="lazy"
                  />
                ) : null}
                {b.custom ? <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/10" /> : null}
                <div className="relative flex max-w-[65%] flex-col p-5 sm:p-6">
                  {b.eyebrow ? <p className={`text-xs font-bold uppercase tracking-[0.14em] ${b.custom ? "text-brand-400" : "text-brand-600"}`}>{b.eyebrow}</p> : null}
                  <h2 className="mt-1.5 font-display text-xl font-bold leading-tight">{b.headline}</h2>
                  {b.text ? <p className={`mt-1.5 text-sm leading-5 ${b.custom ? "text-white/80" : "text-ink/70"}`}>{b.text}</p> : null}
                  <Link href={b.href} className="btn-primary mt-auto min-h-10 w-fit px-4 text-[13px] uppercase tracking-[0.06em]">
                    {b.ctaLabel}
                  </Link>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A product section: heading, then up to ten cards in centred rows (two rows at every width: 2, 3, 4 or 5 per row). */
export function ProductSection({ id, eyebrow, title, text, href, products, priority = false, aside }: {
  id: string;
  eyebrow?: string;
  title: string;
  text?: string;
  href: string;
  products: ErpProduct[];
  priority?: boolean;
  /** Grey band (no longer used: every section sits on white, as on ugreen.lk). */
  tinted?: boolean;
  /** Shown between the heading and the products (the Hot Deals countdown). */
  aside?: ReactNode;
}) {
  if (!products.length) return null;
  const grid = (
    <>
      <SectionHead id={`${id}-title`} eyebrow={eyebrow} title={title}>{text}</SectionHead>
      {aside}
      <ProductRow label={`${title} products`} products={products} priority={priority} />
      <ViewAll href={href} />
    </>
  );
  return <section id={id} aria-labelledby={`${id}-title`} className="container-page mt-12 scroll-mt-40 sm:mt-16">{grid}</section>;
}

/** Up to ten product cards in centred rows (two rows at every width: 2, 3, 4 or 5 per row). */
async function ProductRow({ label, products, priority = false }: { label: string; products: ErpProduct[]; priority?: boolean }) {
  const [instalments, ratings] = await Promise.all([instalmentLine(), cardRatings()]);
  return (
    <ul
      aria-label={label}
      className="flex flex-wrap justify-center gap-3 sm:gap-4 max-md:[&>li:nth-child(n+5)]:hidden md:max-lg:[&>li:nth-child(n+7)]:hidden lg:max-xl:[&>li:nth-child(n+9)]:hidden"
    >
      {products.slice(0, 10).map((p, i) => (
        <Reveal as="li" key={p.id} delay={(i % 5) * 40} className="w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-1rem)/2)] md:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)] xl:w-[calc((100%-4rem)/5)]">
          <CompactProductCard product={p} priority={priority && i < 4} instalments={instalments} rating={ratings.get(p.id)} />
        </Reveal>
      ))}
    </ul>
  );
}

type Rail = HomeData["rails"][number];

/**
 * "Explore Our Range": New Arrivals and the larger categories as tabs of one block (instead of one long section each).
 * Each tab keeps its section id (new-arrivals, c-<category>) and its own "View all" link.
 */
export function RangeTabs({ newArrivals, rails }: { newArrivals: ErpProduct[]; rails: Rail[]; tinted?: boolean }) {
  const tabs = [
    ...(newArrivals.length ? [{ id: "new-arrivals", label: "New Arrivals", href: "/new-arrivals", view: "View all new arrivals", products: newArrivals }] : []),
    ...rails.map((r) => ({ id: `c-${r.slug}`, label: r.name, href: `/categories/${r.slug}`, view: `View all ${r.name}`, products: r.products })),
  ];
  if (!tabs.length) return null;
  return (
    <section aria-labelledby="range-title" className="mt-12 scroll-mt-40 sm:mt-16">
      <div className="container-page">
        <SectionHead id="range-title" title={`${siteConfig.name} New Arrivals`}>The newest products, then each of our larger ranges. Prices and stock are live.</SectionHead>
        <ProductTabs
          label="Product ranges"
          tabs={tabs.map((t) => ({
            id: t.id,
            label: t.label,
            content: (
              <>
                <ProductRow label={`${t.label} products`} products={t.products} />
                <ViewAll href={t.href} label={t.view} />
              </>
            ),
          }))}
        />
      </div>
    </section>
  );
}

/** The campaign photograph (and its words) for a category, when the store has one for that kind of category. */
export function featureArt(name: string) {
  return SLIDE_ART.find((a) => a.test.test(name));
}

/**
 * One category as a split block: its campaign photograph as a tall banner on the left (with a Shop now action), and
 * four of its products on the right. Breaks up the rows of cards, as on a brand store.
 */
export async function FeatureSplit({ rail }: { rail: Rail }) {
  const [instalments, ratings] = await Promise.all([instalmentLine(), cardRatings()]);
  const art = featureArt(rail.name);
  if (!art || rail.products.length < 2) return null;
  const href = `/categories/${rail.slug}`;
  const picks = rail.products.slice(0, 4);
  // no empty slots: four products sit 2 x 2 (4 across on wide screens); three sit 3 across (two on phones)
  const cols = picks.length === 4 ? "grid-cols-2 xl:grid-cols-4" : picks.length === 3 ? "grid-cols-2 sm:grid-cols-3 max-sm:[&>li:nth-child(3)]:hidden" : "grid-cols-2";
  return (
    <section aria-labelledby="feature-title" className="container-page mt-12 sm:mt-16">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-5">
        <Link href={href} className="group relative isolate flex min-h-72 overflow-hidden rounded-panel bg-ink text-white sm:min-h-80">
          <Image src={art.src} alt="" fill sizes="(min-width:1024px) 33vw, 100vw" className="-z-10 object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none" />
          <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <span className="mt-auto flex flex-col items-start p-6 sm:p-8">
            <h2 id="feature-title" className="font-display text-2xl font-extrabold leading-tight tracking-title sm:text-3xl">{rail.name}</h2>
            <span className="mt-2 max-w-xs text-sm leading-6 text-white/80">{art.title}</span>
            <span className="btn mt-5 min-h-10 rounded-full bg-brand-500 px-6 text-[13px] text-on-brand transition-colors group-hover:bg-white group-hover:text-ink">Shop {rail.name}</span>
          </span>
        </Link>
        <ul aria-label={`${rail.name} products`} className={`grid gap-3 sm:gap-4 ${cols}`}>
          {picks.map((p, i) => (
            <Reveal as="li" key={p.id} delay={i * 40}>
              <CompactProductCard product={p} instalments={instalments} rating={ratings.get(p.id)} />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** One descriptive line per kind of collection. Descriptive only: no claims about quality, speed or warranty. */
const COLLECTION_LINE: { test: RegExp; line: string }[] = [
  { test: /(?<!head|ear)phone|mobile|smartphone/i, line: "Smartphones from the brands in our catalogue, with live prices and stock." },
  { test: /audio|earbud|headphone|speaker/i, line: "Earbuds, headphones and speakers for music, calls and travel." },
  { test: /accessor|charg|cable/i, line: "Chargers, cables, power banks and the everyday essentials for your devices." },
  { test: /wear|watch/i, line: "Smartwatches and fitness bands for every day." },
  { test: /tablet/i, line: "Tablets for work, study and entertainment." },
  { test: /laptop|computer/i, line: "Laptops and computer essentials for work and study." },
  { test: /gam|console/i, line: "Consoles, controllers and gaming gear." },
];

export function collectionLine(name: string, count: number): string {
  return COLLECTION_LINE.find((k) => k.test.test(name))?.line ?? `${count} ${count === 1 ? "product" : "products"} in ${name}.`;
}

/**
 * Brand tiles: a white tile with the staff-uploaded logo (Admin, Brands), or the
 * brand's name as a wordmark in its own colour until a logo is uploaded, and the name underneath. Each opens that
 * brand's page, which is shown in the brand's colour.
 */
/** Brand tiles. On the homepage panel: small tiles centred in rows. On the Brands page (`page`): a full-width grid of
 * larger tiles with the product count, so the page is filled evenly. */
export async function BrandGrid({ brands, page = false }: { brands: HomeData["brands"]; page?: boolean }) {
  const colors = await Promise.all(brands.map((b) => brandColor(b.name)));
  if (page) {
    return (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {brands.map((b, i) => {
          const count = `${b.count} ${b.count === 1 ? "product" : "products"}`;
          return (
            <li key={b.name}>
              <Link
                href={`/products?brand=${encodeURIComponent(b.name)}`}
                aria-label={`${b.name}, ${count}`}
                className="group flex h-full flex-col items-center justify-center gap-3 rounded-card border border-border bg-white px-4 py-7 text-center transition-[border-color,box-shadow] duration-200 hover:border-brand-500 hover:shadow-neon-lift sm:py-9"
              >
                <span className="flex h-14 w-full items-center justify-center">
                  {b.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logo} alt="" loading="lazy" className="max-h-14 max-w-[70%] object-contain" />
                  ) : (
                    <span aria-hidden data-wordmark className="max-w-full truncate font-display text-2xl font-extrabold uppercase tracking-[0.04em] sm:text-3xl" style={{ color: colors[i] }}>
                      {b.name}
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted group-hover:text-ink">{count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-4 gap-2 sm:gap-4 lg:grid-cols-8">
      {brands.map((b, i) => {
        const count = `${b.count} ${b.count === 1 ? "product" : "products"}`;
        return (
          <li key={b.name}>
            <Link
              href={`/products?brand=${encodeURIComponent(b.name)}`}
              aria-label={`${b.name}, ${count}`}
              className="group flex h-16 items-center justify-center rounded-card border border-border bg-white px-1.5 text-center transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-neon-lift motion-reduce:hover:translate-y-0 sm:h-24 sm:px-3"
            >
              {/* The brand's logo only (its name is the link's label for screen readers); the wordmark when there is no logo. */}
              <span className="flex h-14 w-full items-center justify-center">
                {b.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logo} alt="" loading="lazy" className="max-h-14 max-w-[90%] object-contain" />
                ) : (
                  <span aria-hidden data-wordmark className="max-w-full truncate font-display text-[13px] font-extrabold sm:text-[15px] uppercase tracking-[0.04em]" style={{ color: colors[i] }}>
                    {b.name}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** "Explore our brands" on the homepage: every brand as a white tile on a light neon-orange panel, then a link to all. */
export function BrandWall({ brands }: { brands: HomeData["brands"] }) {
  if (!brands.length) return null;
  // Laid out like Shop by Category above it: the same heading, an even row of tiles and a "View all" pill.
  return (
    <section aria-labelledby="brands" className="container-page mt-12 sm:mt-16">
      <SectionHead id="brands" title="Explore our brands" />
      <BrandGrid brands={brands.slice(0, 16)} />
      <ViewAll href="/brands" label="View all brands" />
    </section>
  );
}

/**
 * "Why Choose VOLTA.LK" on a black band: only things the store really does (checkout rules come from the live ERP
 * settings). No warranty, authorised-dealer or delivery-time promises, because none are verified.
 */
export function defaultWhyChoose(checkout: HomeData["checkout"]): { icon: LucideIcon; title: string; text: string }[] {
  return [
    ...(checkout.cod ? [{ icon: Banknote, title: "Cash on Delivery", text: "Pay in cash when your order arrives. No card needed to order." }] : []),
    ...(checkout.deliveryCharge != null ? [{ icon: Truck, title: "One Clear Delivery Charge", text: `A flat ${formatLkr(checkout.deliveryCharge)}, shown before you place your order.` }] : []),
    { icon: RefreshCw, title: "Live Prices & Stock", text: "Every price and stock level comes from our live catalogue and is checked again at checkout." },
    { icon: PackageSearch, title: "Track & Cancel Online", text: "Follow your order with its reference, and cancel online before it is dispatched." },
    { icon: BadgeCheck, title: "Shop by Brand", text: "Every brand in our catalogue in one place, with its own shop page." },
    { icon: Headset, title: "Real People to Help", text: "Questions about an order or a product? Our team answers." },
  ];
}

export async function WhyChoose({ checkout }: { checkout: HomeData["checkout"] }) {
  // Staff can write their own cards (Admin, Content, Homepage); otherwise the built-in, verifiable ones.
  const saved = await getContent("why-choose");
  const reasons = saved ? saved.items.map((x, i) => ({ icon: ICON_CYCLE[(i + 1) % ICON_CYCLE.length], title: x.title, text: x.text })) : defaultWhyChoose(checkout);
  return (
    // As on ugreen.lk: a plain centred title, then light grey cards with an outline icon, a title and a short line.
    <section aria-labelledby="why" className="container-page mt-14 sm:mt-20">
      <SectionHead id="why" title={`Why Choose ${siteConfig.name}`} />
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {reasons.slice(0, 4).map(({ icon: I, title, text }) => (
          <li key={title} className="rounded-card bg-[#f6f6f6] px-4 py-6 text-center sm:px-6 sm:py-8">
            <I className="mx-auto h-9 w-9 text-ink sm:h-10 sm:w-10" strokeWidth={1.4} aria-hidden />
            <h3 className="mt-3 text-[15px] font-bold leading-snug text-ink sm:text-lg">{title}</h3>
            <p className="mt-1.5 text-[13px] leading-6 text-muted sm:text-sm">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Customer reviews configured by the owner (HOME_REVIEWS): real reviews only, each with its rating and, when given,
 * where it was posted. Hidden until reviews are configured, so the page never shows invented praise.
 */
export async function Reviews({ title, reviews }: { title: string; reviews: HomeData["reviews"]["items"] }) {
  // The store's real Google rating (Admin, Store details), shown beside the reviews as on ugreen.lk.
  const info = await getStoreInfo();
  const rating = info.googleRating ? Number(info.googleRating) : null;
  if (!reviews.length && rating == null) return null;
  const summary =
    rating != null ? (
      <div className="flex flex-col justify-center rounded-card border border-border bg-bg p-5 sm:p-6">
        <p className="text-sm font-bold text-ink">{siteConfig.name} on Google</p>
        <p className="mt-2 flex items-center gap-2">
          <span className="text-2xl font-extrabold tabular-nums text-ink">{rating.toFixed(1)}</span>
          <span className="flex gap-0.5" aria-label={`Rated ${rating.toFixed(1)} out of 5 on Google`}>
            {Array.from({ length: 5 }, (_, k) => (
              <Star key={k} aria-hidden className={`h-4 w-4 ${k < Math.round(rating) ? "fill-brand-500 text-brand-500" : "text-border-strong/40"}`} />
            ))}
          </span>
        </p>
        {info.googleReviewCount ? <p className="mt-1 text-sm text-muted">Based on {Number(info.googleReviewCount).toLocaleString("en-US")} reviews</p> : null}
        {info.googleUrl ? (
          <a href={info.googleUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex w-fit min-h-9 items-center rounded-full border border-border px-4 text-sm font-semibold text-ink hover:border-ink">
            Review us on Google<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    ) : null;
  return (
    <section aria-labelledby="reviews" className="container-page mt-14 sm:mt-20">
      <SectionHead id="reviews" eyebrow="Reviews" title={title} />
      <ul className={`grid gap-4 sm:grid-cols-2 ${summary ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {summary ? <li>{summary}</li> : null}
        {reviews.map((r, i) => (
          <li key={i} className="flex flex-col rounded-card border border-border bg-bg p-5 transition-[border-color,box-shadow] hover:border-brand-500 hover:shadow-neon-lift sm:p-6">
            <p className="flex gap-0.5" aria-label={`Rated ${r.rating} out of 5`}>
              {Array.from({ length: 5 }, (_, k) => (
                <Star key={k} aria-hidden className={`h-4 w-4 ${k < r.rating ? "fill-brand-500 text-brand-500" : "text-border-strong/40"}`} />
              ))}
            </p>
            <blockquote className="mt-3 flex-1 text-[15px] leading-7 text-ink">“{r.text}”</blockquote>
            <p className="mt-4 flex items-center gap-3 border-t border-border pt-4">
              <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-ink font-bold text-brand-500">{r.name.charAt(0).toUpperCase()}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{r.name}</span>
                {r.source || r.date ? <span className="block text-xs text-muted">{[r.source ? `on ${r.source}` : null, r.date].filter(Boolean).join(" · ")}</span> : null}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The strip banner (as on ugreen.lk): one full-width staff picture, rounded, optionally a link. */
export function StripBanner({ banner }: { banner: HomeData["stripBanner"] }) {
  if (!banner) return null;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={banner.image} alt={banner.alt} loading="lazy" className="block h-auto w-full rounded-panel object-cover" />
  );
  return (
    <section aria-label="Promotion" className="container-page mt-10 sm:mt-14">
      {banner.href ? <Link href={banner.href} className="block overflow-hidden rounded-panel">{img}</Link> : img}
    </section>
  );
}
