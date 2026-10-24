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
import { ArrowLink } from "@/components/ui/chrome";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export { categoryIcon };

export function SectionHeading({ id, title, eyebrow, href, linkLabel = "View all" }: { id: string; title: string; eyebrow?: string; href?: string; linkLabel?: string }) {
  return (
    <Reveal className="mb-4 flex items-end justify-between gap-3 sm:mb-5">
      <div className="min-w-0 border-l-[3px] border-brand-500 pl-3">
        {eyebrow ? <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">{eyebrow}</p> : null}
        <h2 id={id} className="section-title">{title}</h2>
      </div>
      {href && <ArrowLink href={href}>{linkLabel}</ArrowLink>}
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
    <section aria-label="Featured collections" className={`section-space grid gap-3 sm:gap-4 ${banners.length === 2 ? "lg:grid-cols-[1.35fr_1fr]" : banners.length > 2 ? "lg:grid-cols-2" : ""}`}>
      {banners.map((b) => (
        <article key={b.href + b.headline + b.ctaLabel} className="grid overflow-hidden rounded-2xl border border-border bg-surface md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="flex flex-col justify-center p-5 sm:p-7">
            {b.eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">{b.eyebrow}</p>}
            <h2 className="mt-2 max-w-xs text-xl font-bold leading-tight tracking-[-0.015em] text-ink sm:text-2xl">{b.headline}</h2>
            {b.text && <p className="type-meta mt-2 max-w-xs">{b.text}</p>}
            <Link href={b.href} className="btn-primary mt-5 w-fit">
              {b.ctaLabel} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="relative min-h-40 bg-surface sm:min-h-52 md:min-h-full">
            <Image src={bannerPhoto(b)} alt="" fill unoptimized={b.custom} sizes="(min-width:1024px) 36vw, 100vw" className="object-cover" loading="lazy" />
          </div>
        </article>
      ))}
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
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors duration-300 group-hover:bg-brand-500 group-hover:text-on-brand"><I className="h-5 w-5" aria-hidden /></span>
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
