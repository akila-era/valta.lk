import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Banknote, Headset, PackageSearch, Truck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CompactProductCard } from "@/components/products/compact-product-card";
import { ArrowLink } from "@/components/ui/chrome";
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

/** Section heading in the store style: a small orange label, a bold title with an accent bar, a line and a "View all" link. */
export function SectionHead({ id, eyebrow, title, children, href, linkLabel = "View all" }: { id: string; eyebrow?: string; title: string; children?: ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-border pb-3 sm:mb-6">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h2 id={id} className="section-title">{title}</h2>
        <span aria-hidden className="mt-2 block h-[3px] w-12 rounded-full bg-brand-500 shadow-[0_0_10px_rgb(255_92_0/0.6)]" />
        {children ? <p className="mt-1 max-w-2xl text-sm text-muted">{children}</p> : null}
      </div>
      {href ? <ArrowLink href={href}>{linkLabel}</ArrowLink> : null}
    </div>
  );
}

/** Side tiles next to the banner: two categories with studio art, so the hero row offers direct ways into the catalogue. */
function SideTile({ category, tint }: { category: Category; tint: string }) {
  const art = categoryVisual(category.name) ?? category.image;
  return (
    <Link href={`/categories/${category.slug}`} aria-label={`${category.name}, ${category.count} ${category.count === 1 ? "product" : "products"}`} className="group relative flex min-h-40 overflow-hidden rounded-panel p-5 ring-1 ring-brand-100 transition-shadow hover:shadow-neon-lift sm:p-6" style={{ background: tint }}>
      <span className="relative z-10 flex max-w-[60%] flex-col">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">{category.count} {category.count === 1 ? "product" : "products"}</span>
        <span className="mt-1.5 font-display text-xl font-bold leading-tight text-ink sm:text-2xl">{category.name}</span>
        <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-ink group-hover:text-brand-600">
          Shop now <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </span>
      {art ? (
        <span aria-hidden className="absolute -bottom-2 -right-2 aspect-square h-[92%] mix-blend-multiply transition-transform duration-500 [mask-image:radial-gradient(closest-side,#000_62%,transparent)] group-hover:scale-105 motion-reduce:transition-none">
          <Image src={art} alt="" fill sizes="(min-width:1024px) 220px, 45vw" className="object-contain" />
        </span>
      ) : null}
    </Link>
  );
}

export function HomeHero({ categories }: { categories: Category[] }) {
  const slides = heroSlides(categories);
  const side = categories.filter((c) => categoryVisual(c.name) ?? c.image).slice(0, 2);
  return (
    <section aria-labelledby="home-title" className="container-page flex flex-1 flex-col pt-4 sm:pt-5">
      <h1 id="home-title" className="sr-only">{siteConfig.name}: mobile phones, electronics and accessories in Sri Lanka</h1>
      <div className={`grid flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-4 ${side.length ? "sm:grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]" : ""}`}>
        <div className="min-h-[18rem] min-w-0 sm:min-h-[22rem]">
          <HeroBanner slides={slides} />
        </div>
        {side.length ? (
          <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-2">
            {side.map((c, i) => <SideTile key={c.slug} category={c} tint={i ? "linear-gradient(135deg,#ffffff,#fff0e7)" : "linear-gradient(135deg,#fff3ea,#ffc9a3)"} />)}
          </div>
        ) : null}
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
    <section aria-label={`Shopping with ${siteConfig.name}`} className="container-page mt-4 sm:mt-5">
      <ul className="grid grid-cols-2 overflow-hidden rounded-panel border border-brand-100 bg-gradient-to-r from-brand-50 via-bg to-brand-50 lg:grid-cols-4">
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
      <SectionHead id="cats" eyebrow="Browse" title="Shop by Category" href="/products" linkLabel="View all products" />
      {/* Up to six per row on wide screens; fewer categories stay centred instead of leaving a gap on the right. */}
      <ul
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-[repeat(var(--cat-cols),minmax(0,13rem))] lg:justify-center"
        style={{ "--cat-cols": Math.min(shown.length, 6) } as React.CSSProperties}
      >
        {shown.map((c, i) => {
          const Icon = categoryIcon(c.name);
          const art = categoryVisual(c.name) ?? c.image;
          const count = `${c.count} ${c.count === 1 ? "product" : "products"}`;
          return (
            <Reveal as="li" key={c.slug} delay={Math.min(i, 6) * 40}>
              <Link href={`/categories/${c.slug}`} aria-label={`${c.name}, ${count}`} className="group flex h-full flex-col items-center rounded-card border border-border bg-bg p-4 text-center transition-[border-color,box-shadow] duration-200 hover:border-brand-500 hover:shadow-neon-lift">
                <span aria-hidden className="relative mb-3 flex aspect-square w-full max-w-36 items-center justify-center overflow-hidden rounded-full bg-brand-50 ring-2 ring-transparent transition-shadow group-hover:ring-brand-500">
                  {art ? (
                    <Image src={art} alt="" fill sizes="144px" className="object-cover mix-blend-multiply transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />
                  ) : (
                    <Icon className="h-12 w-12 text-ink/70" strokeWidth={1.2} />
                  )}
                </span>
                <span className="text-sm font-bold text-ink group-hover:text-brand-600 sm:text-[15px]">{c.name}</span>
                <span className="mt-0.5 text-xs text-muted">{count}</span>
              </Link>
            </Reveal>
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

/** A product section: heading, then a grid of up to ten cards (two rows at every width: 2, 3, 4 or 5 per row). */
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
      <SectionHead id={`${id}-title`} eyebrow={eyebrow} title={title} href={href}>{text}</SectionHead>
      <ul
        aria-label={`${title} products`}
        className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 max-md:[&>li:nth-child(n+5)]:hidden md:max-lg:[&>li:nth-child(n+7)]:hidden lg:max-xl:[&>li:nth-child(n+9)]:hidden"
      >
        {products.slice(0, 10).map((p, i) => (
          <Reveal as="li" key={p.id} delay={(i % 5) * 40}>
            <CompactProductCard product={p} priority={priority && i < 4} />
          </Reveal>
        ))}
      </ul>
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

/** "Featured Brands": one tile per brand in the catalogue, with the staff-uploaded logo when there is one. */
export function BrandWall({ brands }: { brands: HomeData["brands"] }) {
  if (!brands.length) return null;
  return (
    <section aria-labelledby="brands" className="container-page mt-12 sm:mt-16">
      <SectionHead id="brands" eyebrow={`Brands at ${siteConfig.name}`} title="Featured Brands" />
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-6 xl:grid-cols-8">
        {brands.slice(0, 24).map((b) => (
          <li key={b.name}>
            <Link
              href={`/search?q=${encodeURIComponent(b.name)}`}
              aria-label={`${b.name}, ${b.count} ${b.count === 1 ? "product" : "products"}`}
              className="group flex h-20 items-center justify-center rounded-card border border-border bg-bg px-3 transition-[border-color,box-shadow] duration-200 hover:border-brand-500 hover:shadow-neon-lift sm:h-24"
            >
              {b.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logo} alt="" loading="lazy" className="max-h-10 max-w-full object-contain grayscale transition-[filter] duration-300 group-hover:grayscale-0 sm:max-h-12" />
              ) : (
                <span className="truncate font-display text-base font-extrabold uppercase tracking-[0.04em] text-ink/70 group-hover:text-brand-600 sm:text-lg">{b.name}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
