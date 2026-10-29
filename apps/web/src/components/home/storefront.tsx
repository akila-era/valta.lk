import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Banknote, Headset, PackageSearch, RefreshCw, Star, Truck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CompactProductCard } from "@/components/products/compact-product-card";
import type { HomeData, ResolvedBanner } from "@/lib/home-data";
import type { ErpProduct } from "@/lib/erp/types";
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
  { test: /phone|mobile|smartphone/i, src: "/images/home/volta-hero-electronics.webp", alt: "Smartphone and wireless earbuds in a studio", eyebrow: "Smartphones", title: "The latest phones, in one place.", text: "Compare smartphones and their prices in LKR, with live stock from our catalogue." },
  { test: /audio|earbud|headphone|speaker/i, src: "/images/home/volta-hero-audio.webp", alt: "Wireless earbuds and charging case", eyebrow: "Audio", title: "Sound for every day.", text: "Earbuds, headphones and speakers for work, travel and play." },
  { test: /wear|watch/i, src: "/images/home/volta-hero-watch.webp", alt: "Smartwatch on a stone surface", eyebrow: "Wearables", title: "Smart on your wrist.", text: "Smartwatches and bands that keep up with your day." },
  { test: /accessor|charg|cable|gadget/i, src: "/images/home/volta-hero-accessories.webp", alt: "Backpack, power bank, chargers and cables", eyebrow: "Accessories", title: "Power up and stay connected.", text: "Chargers, cables, power banks and the everyday essentials that go with your devices.", dark: true },
];

/** The banner slides: a store-wide opener, then one slide per known kind of category that exists in the catalogue. */
export function heroSlides(categories: Category[]): HeroSlide[] {
  const opener: HeroSlide = {
    src: "/images/home/volta-hero-match.webp",
    alt: "Smartphones, earbuds, a smartwatch and headphones on a studio stand",
    eyebrow: siteConfig.name,
    title: "Technology that moves you.",
    text: "Mobile phones, electronics and accessories, with prices in LKR.",
    cta: "Shop now",
    href: "/products",
  };
  const rest = SLIDE_ART.flatMap(({ test, ...art }) => {
    const c = categories.find((x) => test.test(x.name));
    return c ? [{ ...art, cta: `Shop ${c.name.toLowerCase()}`, href: `/categories/${c.slug}` }] : [];
  });
  return [opener, ...rest];
}

/** Section heading, centred as on large brand stores: a small orange label, a bold title, an accent bar and a line. */
export function SectionHead({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-7 text-center sm:mb-9">
      {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
      <h2 id={id} className="font-display text-[clamp(1.6rem,1.15rem+1.5vw,2.4rem)] font-extrabold leading-tight tracking-title text-ink">{title}</h2>
      <span aria-hidden className="mx-auto mt-3 block h-[3px] w-12 rounded-full bg-brand-500" />
      {children ? <p className="mx-auto mt-3 max-w-xl text-sm text-muted sm:text-[15px]">{children}</p> : null}
    </div>
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
export function HomeHero({ categories, banners }: { categories: Category[]; banners: HomeData["wideBanners"] }) {
  const slides: HeroSlide[] = [
    ...banners.map((b) => ({ kind: "image" as const, src: b.image, alt: b.alt, href: b.href || undefined })),
    ...heroSlides(categories),
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
export function ServiceStrip({ checkout }: { checkout: HomeData["checkout"] }) {
  const items: { icon: LucideIcon; title: string; text: string; href?: string }[] = [
    ...(checkout.cod ? [{ icon: Banknote, title: "Cash on Delivery", text: "Pay when your order arrives" }] : []),
    ...(checkout.deliveryCharge != null ? [{ icon: Truck, title: `Delivery ${formatLkr(checkout.deliveryCharge)}`, text: "Shown before you order", href: "/shipping-policy" }] : []),
    { icon: PackageSearch, title: "Track Your Order", text: "Follow it with your reference", href: "/track-order" },
    { icon: Headset, title: "Customer Support", text: "We are here to help", href: "/contact" },
  ];
  return (
    <section aria-label={`Shopping with ${siteConfig.name}`} className="border-b border-border bg-bg">
      <ul className="container-page grid grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: I, title, text, href }, i) => {
          const body = (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-on-brand shadow-neon sm:h-11 sm:w-11"><I className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.75} aria-hidden /></span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-tight text-ink sm:text-sm">{title}</span>
                <span className="hidden text-xs text-muted sm:block">{text}</span>
              </span>
            </>
          );
          return (
            <li key={title} className={`border-border ${i % 2 ? "border-l" : ""} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
              {href ? (
                <Link href={href} className="flex h-full items-center gap-2.5 p-3 transition-colors hover:bg-brand-50 sm:gap-3 sm:p-4 sm:px-6">{body}</Link>
              ) : (
                <div className="flex h-full items-center gap-2.5 p-3 sm:gap-3 sm:p-4 sm:px-6">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
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
 * Spotlight: the two largest categories that have studio art, as two equal side-by-side tiles with a title, a line,
 * one action and the category photo, the way large brand stores feature their key ranges.
 */
export function Spotlight({ categories }: { categories: Category[] }) {
  const picks = [...categories].filter((c) => categoryVisual(c.name)).sort((a, b) => b.count - a.count).slice(0, 2);
  if (picks.length < 2) return null;
  return (
    <section aria-label="Featured ranges" className="container-page mt-14 sm:mt-20">
      {/* Side by side from laptops; stacked full-width below, so the title always has room next to the photo. */}
      <ul className="grid gap-4 lg:grid-cols-2">
        {picks.map((c, i) => {
          // Two tiles with the same layout (text left, photo on a white disc right) in the store's colours: the first
          // black with white text, the second neon orange with black text.
          const dark = i === 0;
          return (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                className={`group grid h-full min-h-52 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 overflow-hidden rounded-panel p-5 sm:min-h-64 sm:gap-6 sm:p-8 ${dark ? "bg-ink text-white" : "bg-brand-500 text-ink"}`}
              >
                <span className="flex min-w-0 flex-col items-start text-left">
                  <span className={`text-xs font-bold uppercase tracking-[0.14em] ${dark ? "text-brand-500" : "text-ink"}`}>{c.count} {c.count === 1 ? "product" : "products"}</span>
                  <span className="mt-2 font-display text-xl font-extrabold leading-tight tracking-title xs:text-2xl sm:text-3xl">{c.name}</span>
                  <span className={`mt-2 max-w-xs text-sm leading-6 ${dark ? "text-white/75" : "text-ink/80"}`}>{collectionLine(c.name, c.count)}</span>
                  <span className={`btn mt-5 min-h-10 rounded-full px-6 text-[13px] ${dark ? "bg-brand-500 text-on-brand group-hover:bg-white group-hover:text-ink" : "bg-ink text-white group-hover:bg-white group-hover:text-ink"}`}>Shop now</span>
                </span>
                <span aria-hidden className={`relative aspect-square w-24 overflow-hidden rounded-full bg-white ring-4 xs:w-32 transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none sm:w-44 lg:w-52 ${dark ? "ring-brand-500" : "ring-ink"}`}>
                  <Image src={categoryVisual(c.name)!} alt="" fill sizes="(min-width:1024px) 208px, (min-width:640px) 176px, 128px" className="object-cover" />
                </span>
              </Link>
            </li>
          );
        })}
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
export function ProductSection({ id, eyebrow, title, text, href, products, priority = false, tinted = false }: {
  id: string;
  eyebrow?: string;
  title: string;
  text?: string;
  href: string;
  products: ErpProduct[];
  priority?: boolean;
  tinted?: boolean;
}) {
  if (!products.length) return null;
  const grid = (
    <>
      <SectionHead id={`${id}-title`} eyebrow={eyebrow} title={title}>{text}</SectionHead>
      <ProductRow label={`${title} products`} products={products} priority={priority} />
      <ViewAll href={href} />
    </>
  );
  return tinted ? (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 scroll-mt-40 border-y border-border bg-surface py-10 sm:mt-16 sm:py-14">
      <div className="container-page">{grid}</div>
    </section>
  ) : (
    <section id={id} aria-labelledby={`${id}-title`} className="container-page mt-12 scroll-mt-40 sm:mt-16">{grid}</section>
  );
}

/** Up to ten product cards in centred rows (two rows at every width: 2, 3, 4 or 5 per row). */
function ProductRow({ label, products, priority = false }: { label: string; products: ErpProduct[]; priority?: boolean }) {
  return (
    <ul
      aria-label={label}
      className="flex flex-wrap justify-center gap-3 sm:gap-4 max-md:[&>li:nth-child(n+5)]:hidden md:max-lg:[&>li:nth-child(n+7)]:hidden lg:max-xl:[&>li:nth-child(n+9)]:hidden"
    >
      {products.slice(0, 10).map((p, i) => (
        <Reveal as="li" key={p.id} delay={(i % 5) * 40} className="w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-1rem)/2)] md:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)] xl:w-[calc((100%-4rem)/5)]">
          <CompactProductCard product={p} priority={priority && i < 4} instalments={siteConfig.instalments} />
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
export function RangeTabs({ newArrivals, rails, tinted = false }: { newArrivals: ErpProduct[]; rails: Rail[]; tinted?: boolean }) {
  const tabs = [
    ...(newArrivals.length ? [{ id: "new-arrivals", label: "New Arrivals", href: "/products", view: "View all new arrivals", products: newArrivals }] : []),
    ...rails.map((r) => ({ id: `c-${r.slug}`, label: r.name, href: `/categories/${r.slug}`, view: `View all ${r.name}`, products: r.products })),
  ];
  if (!tabs.length) return null;
  return (
    <section aria-labelledby="range-title" className={`mt-12 scroll-mt-40 sm:mt-16 ${tinted ? "border-y border-border bg-surface py-10 sm:py-14" : ""}`}>
      <div className="container-page">
        <SectionHead id="range-title" eyebrow="Just in & by category" title="Explore Our Range">The newest products, then each of our larger ranges. Prices and stock are live.</SectionHead>
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
export function FeatureSplit({ rail }: { rail: Rail }) {
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
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-500">{rail.count} {rail.count === 1 ? "product" : "products"}</span>
            <h2 id="feature-title" className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-title sm:text-3xl">{rail.name}</h2>
            <span className="mt-2 max-w-xs text-sm leading-6 text-white/80">{art.title}</span>
            <span className="btn mt-5 min-h-10 rounded-full bg-brand-500 px-6 text-[13px] text-on-brand transition-colors group-hover:bg-white group-hover:text-ink">Shop {rail.name}</span>
          </span>
        </Link>
        <ul aria-label={`${rail.name} products`} className={`grid gap-3 sm:gap-4 ${cols}`}>
          {picks.map((p, i) => (
            <Reveal as="li" key={p.id} delay={i * 40}>
              <CompactProductCard product={p} instalments={siteConfig.instalments} />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** One descriptive line per kind of collection. Descriptive only: no claims about quality, speed or warranty. */
const COLLECTION_LINE: { test: RegExp; line: string }[] = [
  { test: /phone|mobile|smartphone/i, line: "Smartphones from the brands in our catalogue, with live prices and stock." },
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
 * Brand tiles: the staff-uploaded logo (Admin, Brands), or an orange monogram badge until one is uploaded, then the
 * name and the product count. Each opens that brand's products. A short last row stays centred.
 */
export function BrandGrid({ brands }: { brands: HomeData["brands"] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-3 sm:gap-4">
      {brands.map((b) => {
        const count = `${b.count} ${b.count === 1 ? "product" : "products"}`;
        return (
          <li key={b.name} className="w-[calc((100%-1.5rem)/3)] sm:w-[calc((100%-3rem)/4)] lg:w-[calc((100%-5rem)/6)]">
            <Link
              href={`/products?brand=${encodeURIComponent(b.name)}`}
              aria-label={`${b.name}, ${count}`}
              className="group relative flex h-32 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-card border border-brand-100 bg-bg px-2 text-center transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-brand-500 hover:shadow-neon-lift motion-reduce:hover:translate-y-0 sm:h-36"
            >
              {b.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logo} alt="" loading="lazy" className="h-11 max-w-[75%] object-contain transition-transform duration-300 group-hover:scale-105 sm:h-12" />
              ) : (
                <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 font-display text-xl font-extrabold text-on-brand shadow-neon transition-transform duration-300 group-hover:scale-110 sm:h-12 sm:w-12">
                  {b.name.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="max-w-full truncate text-[13px] font-bold uppercase tracking-[0.06em] text-ink transition-colors group-hover:text-brand-600 sm:text-sm">{b.name}</span>
              <span className="text-[11px] font-medium text-muted transition-colors group-hover:text-brand-700">{count}</span>
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-brand-500 transition-transform duration-300 group-hover:scale-x-100" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** "Shop by Brand" on the homepage: up to 12 brands on a light orange band, then a link to every brand. */
export function BrandWall({ brands }: { brands: HomeData["brands"] }) {
  if (!brands.length) return null;
  return (
    <section aria-labelledby="brands" className="mt-12 border-y border-border bg-surface py-10 sm:mt-16 sm:py-14">
      <div className="container-page">
        <SectionHead id="brands" eyebrow={`Brands at ${siteConfig.name}`} title="Shop by Brand">The brands in our catalogue, all in one place.</SectionHead>
        <BrandGrid brands={brands.slice(0, 12)} />
        <ViewAll href="/brands" label="View all brands" />
      </div>
    </section>
  );
}

/**
 * "Why Choose VOLTA.LK" on a black band: only things the store really does (checkout rules come from the live ERP
 * settings). No warranty, authorised-dealer or delivery-time promises, because none are verified.
 */
export function WhyChoose({ checkout }: { checkout: HomeData["checkout"] }) {
  const reasons: { icon: LucideIcon; title: string; text: string }[] = [
    ...(checkout.cod ? [{ icon: Banknote, title: "Cash on Delivery", text: "Pay in cash when your order arrives. No card needed to order." }] : []),
    ...(checkout.deliveryCharge != null ? [{ icon: Truck, title: "One Clear Delivery Charge", text: `A flat ${formatLkr(checkout.deliveryCharge)}, shown before you place your order.` }] : []),
    { icon: RefreshCw, title: "Live Prices & Stock", text: "Every price and stock level comes from our live catalogue and is checked again at checkout." },
    { icon: PackageSearch, title: "Track & Cancel Online", text: "Follow your order with its reference, and cancel online before it is dispatched." },
    { icon: BadgeCheck, title: "Shop by Brand", text: "Every brand in our catalogue in one place, with its own shop page." },
    { icon: Headset, title: "Real People to Help", text: "Questions about an order or a product? Our team answers." },
  ];
  return (
    <section aria-labelledby="why" className="relative mt-14 overflow-hidden bg-ink py-14 text-white sm:mt-20 sm:py-20">
      <div className="container-page relative">
        <div className="mb-9 text-center">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-500">Why choose us</p>
          <h2 id="why" className="font-display text-[clamp(1.6rem,1.15rem+1.5vw,2.4rem)] font-extrabold leading-tight tracking-title">Why Choose {siteConfig.name}</h2>
          <span aria-hidden className="mx-auto mt-3 block h-[3px] w-12 rounded-full bg-brand-500" />
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map(({ icon: I, title, text }) => (
            <li key={title} className="group rounded-card border border-white/10 bg-white/[0.04] p-5 transition-[border-color,background-color,box-shadow] duration-300 hover:border-brand-500 hover:bg-white/[0.07] sm:p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-control bg-brand-500 text-on-brand shadow-neon">
                <I className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-bold">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-white/70">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Customer reviews configured by the owner (HOME_REVIEWS): real reviews only, each with its rating and, when given,
 * where it was posted. Hidden until reviews are configured, so the page never shows invented praise.
 */
export function Reviews({ title, reviews }: { title: string; reviews: HomeData["reviews"]["items"] }) {
  if (!reviews.length) return null;
  return (
    <section aria-labelledby="reviews" className="container-page mt-14 sm:mt-20">
      <SectionHead id="reviews" eyebrow="Reviews" title={title} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
