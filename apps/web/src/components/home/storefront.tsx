import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Banknote, Headset, PackageSearch, Truck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CompactProductCard } from "@/components/products/compact-product-card";
import { categoryIcon } from "@/components/ui/category-icon";
import type { HomeData, ResolvedBanner } from "@/lib/home-data";
import type { ErpProduct } from "@/lib/erp/types";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";
import { categoryVisual } from "./category-art";
import { HeroBanner, type HeroSlide } from "./hero-banner";
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
      <span aria-hidden className="mx-auto mt-3 block h-[3px] w-12 rounded-full bg-brand-500 shadow-[0_0_10px_rgb(255_92_0/0.6)]" />
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
  const shown = categories.slice(0, 12);
  return (
    <section aria-labelledby="cats" className="container-page mt-12 sm:mt-16">
      <SectionHead id="cats" eyebrow="Browse" title="Shop by Category">Find the right device or accessory in a tap.</SectionHead>
      {/* Three per row on phones and tablets, six on wide screens; a short last row stays centred. */}
      <ul className="flex flex-wrap justify-center gap-x-2 gap-y-5 sm:gap-x-4 lg:gap-x-6">
        {shown.map((c, i) => {
          const Icon = categoryIcon(c.name);
          const art = categoryVisual(c.name) ?? c.image;
          const count = `${c.count} ${c.count === 1 ? "product" : "products"}`;
          return (
            <Reveal as="li" key={c.slug} delay={Math.min(i, 6) * 40} className="w-[calc((100%-1rem)/3)] sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-7.5rem)/6)] lg:max-w-52">
              <Link href={`/categories/${c.slug}`} aria-label={`${c.name}, ${count}`} className="group relative flex h-full flex-col items-center p-2 text-center">
                <span aria-hidden className="relative mb-3 flex aspect-square w-full max-w-36 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-100 to-brand-50 ring-2 ring-transparent ring-offset-4 transition-[box-shadow] duration-300 group-hover:shadow-[0_14px_30px_-10px_rgb(255_92_0/0.7)] group-hover:ring-brand-500">
                  {art ? (
                    <Image src={art} alt="" fill sizes="144px" className="object-cover mix-blend-multiply transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />
                  ) : (
                    <Icon className="h-12 w-12 text-ink/70" strokeWidth={1.2} />
                  )}
                </span>
                <span className="text-[13px] font-bold leading-tight text-ink group-hover:text-brand-600 sm:text-[15px]">{c.name}</span>
                <span className="mt-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-100 transition-colors group-hover:bg-brand-500 group-hover:text-on-brand">{count}</span>
              </Link>
            </Reveal>
          );
        })}
      </ul>
      <ViewAll href="/products" label="View all products" />
    </section>
  );
}

/**
 * Spotlight: the two largest categories that have studio art, as big side-by-side tiles with a centred title, a line
 * and one action, the way large brand stores feature their key ranges.
 */
export function Spotlight({ categories }: { categories: Category[] }) {
  const picks = [...categories].filter((c) => categoryVisual(c.name)).sort((a, b) => b.count - a.count).slice(0, 2);
  if (picks.length < 2) return null;
  return (
    <section aria-label="Featured ranges" className="container-page mt-14 sm:mt-20">
      <ul className="grid gap-4 md:grid-cols-2">
        {picks.map((c, i) => (
          <li key={c.slug}>
            <Link
              href={`/categories/${c.slug}`}
              className={`group relative flex h-[19rem] flex-col items-center overflow-hidden rounded-panel px-6 pt-7 text-center sm:h-[26rem] sm:pt-9 ${i ? "bg-[linear-gradient(160deg,#fff4ec,#ffe0c8)]" : "bg-[linear-gradient(160deg,#f6f6f7,#e9eaec)]"}`}
            >
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">{c.count} {c.count === 1 ? "product" : "products"}</span>
              <span className="mt-2 font-display text-2xl font-extrabold tracking-title text-ink sm:text-3xl">{c.name}</span>
              <span className="mt-2 max-w-sm text-sm text-muted">{collectionLine(c.name, c.count)}</span>
              <span className="btn-primary mt-5 min-h-10 rounded-full px-6 text-[13px]">Shop now</span>
              <span aria-hidden className="absolute bottom-[-6%] left-1/2 aspect-square h-[58%] -translate-x-1/2 mix-blend-multiply transition-transform duration-500 group-hover:-translate-y-2 group-hover:scale-105 motion-reduce:transition-none">
                <Image src={categoryVisual(c.name)!} alt="" fill sizes="(min-width:768px) 30vw, 70vw" className="object-contain [mask-image:radial-gradient(closest-side,#000_70%,transparent)]" />
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
      <ul
        aria-label={`${title} products`}
        className="flex flex-wrap justify-center gap-3 sm:gap-4 max-md:[&>li:nth-child(n+5)]:hidden md:max-lg:[&>li:nth-child(n+7)]:hidden lg:max-xl:[&>li:nth-child(n+9)]:hidden"
      >
        {products.slice(0, 10).map((p, i) => (
          <Reveal as="li" key={p.id} delay={(i % 5) * 40} className="w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-1rem)/2)] md:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)] xl:w-[calc((100%-4rem)/5)]">
            <CompactProductCard product={p} priority={priority && i < 4} />
          </Reveal>
        ))}
      </ul>
      <ViewAll href={href} />
    </>
  );
  return tinted ? (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 scroll-mt-40 bg-gradient-to-b from-brand-50 to-bg py-10 sm:mt-16 sm:py-14">
      <div className="container-page">{grid}</div>
    </section>
  ) : (
    <section id={id} aria-labelledby={`${id}-title`} className="container-page mt-12 scroll-mt-40 sm:mt-16">{grid}</section>
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
 * "Shop by Brand": one tile per catalogue brand on a light orange band, centred so a short list never leaves empty
 * cells. Staff-uploaded logos show in grey and turn to colour on hover; brands without a logo show their name.
 */
export function BrandWall({ brands }: { brands: HomeData["brands"] }) {
  if (!brands.length) return null;
  return (
    <section aria-labelledby="brands" className="mt-12 bg-gradient-to-b from-brand-50 to-bg py-10 sm:mt-16 sm:py-14">
      <div className="container-page">
        <SectionHead id="brands" eyebrow={`Brands at ${siteConfig.name}`} title="Shop by Brand">The brands in our catalogue, all in one place.</SectionHead>
        <ul className="flex flex-wrap justify-center gap-3 sm:gap-4">
          {brands.slice(0, 24).map((b) => {
            const count = `${b.count} ${b.count === 1 ? "product" : "products"}`;
            return (
              <li key={b.name} className="w-[calc((100%-1.5rem)/3)] sm:w-[calc((100%-3rem)/4)] lg:w-[calc((100%-5rem)/6)]">
                <Link
                  href={`/products?brand=${encodeURIComponent(b.name)}`}
                  aria-label={`${b.name}, ${count}`}
                  className="group relative flex h-24 flex-col items-center justify-center overflow-hidden rounded-card border border-brand-100 bg-bg px-3 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-brand-500 hover:shadow-neon-lift motion-reduce:hover:translate-y-0 sm:h-28"
                >
                  {b.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logo} alt="" loading="lazy" className="max-h-9 max-w-[70%] object-contain opacity-70 grayscale transition-[filter,opacity] duration-300 group-hover:opacity-100 group-hover:grayscale-0 sm:max-h-11" />
                  ) : (
                    <span className="truncate font-display text-base font-extrabold uppercase tracking-[0.08em] text-ink/70 transition-colors group-hover:text-brand-600 sm:text-xl">{b.name}</span>
                  )}
                  <span className="mt-1 text-[11px] font-medium text-muted transition-colors group-hover:text-brand-700">{count}</span>
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-brand-500 shadow-[0_0_10px_rgb(255_92_0/0.8)] transition-transform duration-300 group-hover:scale-x-100" />
                </Link>
              </li>
            );
          })}
        </ul>
        <ViewAll href="/products" label="View all products" />
      </div>
    </section>
  );
}
