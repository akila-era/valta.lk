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

/** The light studio object for a banner without a staff picture: matching category art, else the category's photo. */
function bannerObject(banner: ResolvedBanner): string | undefined {
  return categoryVisual(`${banner.eyebrow ?? ""} ${banner.headline}`) ?? banner.image;
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
      {banners.map((b, i) => {
        const object = b.custom ? undefined : bannerObject(b);
        return (
          <article
            key={b.href + b.headline + b.ctaLabel}
            className="group relative grid overflow-hidden rounded-panel shadow-soft ring-1 ring-ink/[0.05] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift motion-reduce:hover:translate-y-0 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"
            style={{ background: i % 2 ? "linear-gradient(145deg,#f6f6f2,#e8e8e0)" : "linear-gradient(145deg,#fff4ec,#f7dfcd)" }}
          >
            {/* 2D: dot grid and an orange ring behind the stage. */}
            <span aria-hidden className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.07)_1px,transparent_1.3px)] [background-size:16px_16px] [mask-image:linear-gradient(120deg,transparent_40%,#000)]" />
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border-[14px] border-brand-500/15 transition-transform duration-500 group-hover:scale-110" />
            <div className="relative z-10 flex flex-col justify-center p-6 sm:p-8">
              {b.eyebrow && <p className="eyebrow">{b.eyebrow}</p>}
              <h2 className="mt-2 max-w-xs font-display text-2xl font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[1.75rem]">{b.headline}</h2>
              {b.text && <p className="mt-2 max-w-xs text-sm leading-6 text-ink/75">{b.text}</p>}
              <Link href={b.href} className="btn-primary mt-6 w-fit shadow-[0_10px_24px_-8px_rgb(255_92_0/0.6)]">
                {b.ctaLabel} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            {b.custom && b.image ? (
              // Staff pictures are shown exactly as uploaded.
              <div className="relative min-h-44 sm:min-h-56 md:min-h-full">
                <Image src={b.image} alt="" fill unoptimized={b.image.startsWith("/api/")} sizes="(min-width:1024px) 36vw, 100vw" className="object-cover" loading="lazy" />
              </div>
            ) : (
              // 3D: the studio object floats over a white disc and a floor shadow, and lifts on hover.
              <div aria-hidden className="relative min-h-48 sm:min-h-56 md:min-h-64">
                <span className="absolute left-1/2 top-1/2 aspect-square h-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-[0_20px_50px_-20px_rgb(27_23_20/0.25)]" />
                <span className="absolute bottom-[13%] left-1/2 h-4 w-[38%] -translate-x-1/2 rounded-[50%] bg-ink/25 blur-md transition-[width,opacity] duration-500 group-hover:w-[30%] group-hover:opacity-60" />
                {object ? (
                  <span className="absolute left-1/2 top-1/2 aspect-square h-[78%] -translate-x-1/2 -translate-y-1/2 mix-blend-multiply transition-transform duration-500 ease-out [mask-image:radial-gradient(closest-side,#000_66%,transparent)] group-hover:-translate-y-[calc(50%+0.5rem)] group-hover:scale-105 motion-reduce:transition-none">
                    <Image src={object} alt="" fill sizes="(min-width:1024px) 22vw, 60vw" className="object-cover [filter:brightness(1.08)_contrast(1.04)]" />
                  </span>
                ) : null}
              </div>
            )}
          </article>
        );
      })}
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
