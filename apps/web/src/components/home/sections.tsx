import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Truck, Wallet, LifeBuoy } from "lucide-react";
import type { ComponentType } from "react";
import type { HomeData, ResolvedBanner } from "@/lib/home-data";
import { formatLkr } from "@/lib/utils/money";
import { categoryIcon } from "@/components/ui/category-icon";
import { categoryVisual } from "./category-art";
import { Reveal } from "./reveal";
import { WideBannerSlider } from "./wide-banner-slider";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export { categoryIcon };

export function SectionHeading({ id, title, href, linkLabel = "View all" }: { id: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <Reveal className="mb-6 flex items-end justify-between gap-4">
      <h2 id={id} className="section-title">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
          {linkLabel} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </Reveal>
  );
}

function bannerPhoto(banner: ResolvedBanner): string {
  if (banner.custom && banner.image) return banner.image;
  const label = `${banner.eyebrow ?? ""} ${banner.headline}`;
  if (/phone|mobile/i.test(label)) return "/images/home/valta-hero-cinematic.webp";
  if (/audio|accessor|gadget|headphone/i.test(label)) return "/images/home/valta-banner-audio.webp";
  return categoryVisual(label) ?? banner.image ?? "/images/home/valta-hero-cinematic.webp";
}

/** Staff-chosen full-width pictures (each optionally a link) that rotate. Sits between "Shop by budget" and "Why shop with VALTA.LK". */
export function WideBanner({ banners }: { banners: HomeData["wideBanners"] }) {
  if (!banners.length) return null;
  return (
    <section aria-label="Promotions" className="pt-14 sm:pt-20">
      <WideBannerSlider slides={banners} />
    </section>
  );
}

export function PromoBanners({ banners }: { banners: ResolvedBanner[] }) {
  if (!banners.length) return null;
  return (
    <section aria-label="Featured collections" className={`mt-14 grid gap-4 sm:mt-16 sm:gap-5 ${banners.length === 2 ? "lg:grid-cols-[1.35fr_1fr]" : banners.length > 2 ? "lg:grid-cols-2" : ""}`}>
      {banners.map((b) => (
        <article key={b.href + b.headline + b.ctaLabel} className="grid overflow-hidden rounded-2xl border border-border bg-surface md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="flex flex-col justify-center p-6 sm:p-8">
            {b.eyebrow && <p className="eyebrow">{b.eyebrow}</p>}
            <h2 className="mt-2 max-w-xs text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">{b.headline}</h2>
            {b.text && <p className="type-meta mt-2 max-w-xs">{b.text}</p>}
            <Link href={b.href} className="btn-primary mt-5 w-fit">
              {b.ctaLabel} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="relative min-h-56 bg-ink md:min-h-full">
            <Image src={bannerPhoto(b)} alt="" fill unoptimized={b.custom} sizes="(min-width:1024px) 36vw, 100vw" className="object-cover" loading="lazy" />
          </div>
        </article>
      ))}
    </section>
  );
}

export function BrandStrip({ brands, compact = false }: { brands: HomeData["brands"]; compact?: boolean }) {
  if (brands.length < 2) return null;
  const list = brands.slice(0, 12);
  if (compact) {
    // Endless slow ticker: one copy of the brands is repeated until it is wider than the screen, then the whole track is
    // rendered twice and slid by exactly one copy. Pauses on hover/focus; with reduced motion it is a plain scrollable row.
    const copy = Array.from({ length: Math.max(1, Math.ceil(12 / list.length)) }, () => list).flat();
    const tile = (b: (typeof list)[number], hidden: boolean, key: string) => (
      <li key={key} className={`shrink-0 pr-3 sm:pr-4 ${hidden ? "motion-reduce:hidden" : ""}`} aria-hidden={hidden || undefined}>
        <Link
          href={`/search?q=${encodeURIComponent(b.name)}`}
          aria-label={`${b.name}, ${b.count} ${b.count === 1 ? "product" : "products"}`}
          tabIndex={hidden ? -1 : undefined}
          className="flex h-[3.25rem] min-w-[7.5rem] items-center justify-center rounded-2xl border border-[#e7e2dc] bg-white px-7 text-[13px] font-semibold uppercase tracking-[0.16em] text-ink transition-colors hover:border-ink"
        >
          {b.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- staff-uploaded logo served by our own route; no optimiser needed
            <img src={b.logo} alt="" loading="lazy" className="max-h-9 w-auto max-w-[8rem] object-contain" />
          ) : (
            b.name
          )}
        </Link>
      </li>
    );
    return (
      <section aria-labelledby="brands" className="mt-8">
        <h2 id="brands" className="mb-4 text-lg font-bold tracking-tight text-ink">Shop by brand</h2>
        <div className="marquee overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(to_right,transparent,#000_4%,#000_96%,transparent)]">
          <div className="flex w-max animate-marquee motion-reduce:animate-none" style={{ animationDuration: `${copy.length * 4}s` }}>
            {/* Repeats that only fill the row are hidden from assistive tech and the tab order, so each brand is announced once. */}
            <ul className="flex shrink-0">{copy.map((b, i) => tile(b, i >= list.length, `a${i}`))}</ul>
            <ul className="flex shrink-0 motion-reduce:hidden" aria-hidden>{copy.map((b, i) => tile(b, true, `b${i}`))}</ul>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="brands">
      <SectionHeading id="brands" title="Shop by brand" href="/products" linkLabel="All products" />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] sm:gap-4 max-sm:[&>li:last-child:nth-child(odd)]:col-span-2">
        {list.map((b, i) => (
          <Reveal as="li" key={b.name} delay={Math.min(i, 8) * 40}>
            <Link
              href={`/search?q=${encodeURIComponent(b.name)}`}
              aria-label={`${b.name}, ${b.count} ${b.count === 1 ? "product" : "products"}`}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-bg transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/60 hover:shadow-[0_18px_36px_-22px_rgba(16,24,32,0.4)]"
            >
              <span className="relative block aspect-[5/3] bg-white">
                {b.image ? (
                  <Image src={b.image} alt="" fill sizes="(min-width:1280px) 14vw, (min-width:640px) 28vw, 44vw" className="object-contain p-4 transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                ) : (
                  <span aria-hidden className="absolute inset-0 flex items-center justify-center text-4xl font-black tracking-tight text-ink/15">{b.name.slice(0, 2).toUpperCase()}</span>
                )}
              </span>
              <span className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold sm:text-[15px]">{b.name}</span>
                  <span className="block text-xs text-muted">{b.count} {b.count === 1 ? "product" : "products"}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-all group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
              </span>
            </Link>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export function Benefits({ checkout }: { checkout: HomeData["checkout"] }) {
  const items: { icon: Icon; title: string; text: string; href?: string }[] = [
    { icon: ShieldCheck, title: "Secure shopping", text: "Your details travel over an encrypted connection. We never ask for card details." },
    {
      icon: Wallet,
      title: "Payment options",
      text: checkout.cod ? "Pay by cash on delivery when your order arrives." : "Available payment options are shown at checkout.",
    },
    {
      icon: Truck,
      title: "Delivery information",
      text: checkout.deliveryCharge != null ? `Delivery charge of ${formatLkr(checkout.deliveryCharge)}, shown before you order.` : "The delivery charge is shown before you order.",
      href: "/shipping-policy",
    },
    { icon: LifeBuoy, title: "Customer support", text: "Follow your order online, or get in touch if you need help.", href: "/contact" },
  ];
  return (
    <section aria-labelledby="why" className="mt-14 sm:mt-20">
      <h2 id="why" className="section-title mb-6">Why shop with VALTA.LK</h2>
      <div className="rounded-2xl border border-border">
      <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {items.map(({ icon: I, title, text, href }, idx) => (
          <Reveal as="li" key={title} delay={idx * 80} className="group flex gap-4 p-5 sm:p-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors duration-300 group-hover:bg-brand-500 group-hover:text-ink"><I className="h-5 w-5" aria-hidden /></span>
            <div>
              <h3 className="text-sm font-semibold">{href ? <Link href={href} className="hover:underline">{title}</Link> : title}</h3>
              <p className="mt-1 text-sm leading-5 text-muted">{text}</p>
            </div>
          </Reveal>
        ))}
      </ul>
      </div>
    </section>
  );
}
