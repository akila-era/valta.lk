import Link from "next/link";
import { ArrowRight, Headset, PackageSearch, Truck, Wallet, Zap } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";
import { HeroDepth } from "./hero-depth";
import { HeroSlides } from "./hero-slides";

interface HeroProps {
  phonesHref?: string;
  accessoriesHref?: string;
  cod: boolean;
  deliveryCharge: number | null;
}

/** Depth offsets for the hero layers, driven by --mx / --my from HeroDepth (0 on touch and with reduced motion). */
const DEPTH = {
  decor: "[transform:translate3d(calc(var(--mx,0)*10px),calc(var(--my,0)*8px),0)]",
  card: "[transform:perspective(1200px)_rotateY(calc(var(--mx,0)*3deg))_rotateX(calc(var(--my,0)*-3deg))]",
  chipNear: "[transform:translate3d(calc(var(--mx,0)*26px),calc(var(--my,0)*20px),0)]",
  chipFar: "[transform:translate3d(calc(var(--mx,0)*18px),calc(var(--my,0)*14px),0)]",
};

/**
 * Full-bleed light campaign built as 3D depth layers: the studio photographs (moving against the cursor), a tilted
 * orange orbit and dot grid (2D/3D decoration), a frosted glass card with the real HTML copy (it tilts toward the
 * cursor), and two floating glass chips with live ERP facts. Hero and service strip together fill the first screen
 * below the header (see --hdr-h in HeaderShell), so the strip is visible without scrolling.
 */
export function Hero({ phonesHref, accessoriesHref, cod, deliveryCharge }: HeroProps) {
  return (
    <div className="flex min-h-[calc(100svh-var(--hdr-h,8rem))] flex-col md:h-[calc(100svh-var(--hdr-h,10.5rem))] md:min-h-[36rem]">
      <HeroDepth aria-labelledby="hero-title" className="relative isolate flex flex-1 flex-col justify-end overflow-hidden bg-[#f6efe7] text-ink md:justify-center">
        {/* Phones: the photo is a full-width band and the glass card overlaps its lower edge. md+: it fills the hero. */}
        <div className="absolute inset-x-0 top-0 h-[62%] md:inset-0 md:h-auto">
          <HeroSlides />
          {/* A light fade only where the copy sits: the photograph still runs the full width. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-[#f6efe7] from-0% via-transparent via-35% to-transparent md:bg-gradient-to-r md:from-[#f6efe7]/80 md:from-0% md:via-[#f6efe7]/25 md:via-40% md:to-transparent md:to-60%" />
        </div>

        {/* 2D/3D decoration: a dot grid and a tilted orange orbit with a travelling dot. */}
        <div aria-hidden className={`pointer-events-none absolute inset-0 z-[6] ${DEPTH.decor}`}>
          <span className="absolute left-0 top-0 h-2/3 w-1/2 [background-image:radial-gradient(rgb(23_23_23/0.09)_1px,transparent_1.3px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_top_left,#000,transparent_70%)]" />
          <span className="absolute bottom-[8%] right-[6%] hidden aspect-square w-[min(46vw,40rem)] [perspective:900px] md:block">
            <span className="absolute inset-0 rounded-full border-2 border-brand-500/45 [transform:rotateX(74deg)] [transform-style:preserve-3d]">
              <span className="absolute inset-0 animate-[spin_16s_linear_infinite] rounded-full">
                <span className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500 shadow-[0_0_18px_4px_rgb(255_92_0/0.55)]" />
              </span>
            </span>
            <span className="absolute inset-[9%] rounded-full border border-dashed border-ink/15 [transform:rotateX(74deg)]" />
          </span>
          <span className="absolute -left-24 top-[18%] h-80 w-80 animate-glow rounded-full bg-brand-500/15 blur-3xl" />
        </div>

        {/* Front layer: floating glass chips with facts from live ERP settings only. */}
        {cod && (
          <div aria-hidden className={`pointer-events-none absolute right-[7%] top-[14%] z-[8] hidden lg:block ${DEPTH.chipNear}`}>
            <div className="flex animate-float items-center gap-3 rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-[0_18px_40px_-14px_rgb(60_30_10/0.35)] backdrop-blur-xl [--dur:7s]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-on-brand shadow-[0_8px_18px_-6px_rgb(255_92_0/0.6)]"><Wallet className="h-5 w-5" /></span>
              <span><span className="block text-sm font-bold">Cash on Delivery</span><span className="block text-xs text-ink/70">Pay when it arrives</span></span>
            </div>
          </div>
        )}
        {deliveryCharge != null && (
          <div aria-hidden className={`pointer-events-none absolute bottom-[16%] right-[30%] z-[8] hidden xl:block ${DEPTH.chipFar}`}>
            <div className="flex animate-float items-center gap-3 rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-[0_18px_40px_-14px_rgb(60_30_10/0.35)] backdrop-blur-xl [--d:1.2s] [--dur:8s]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-bg"><Truck className="h-5 w-5" /></span>
              <span><span className="block text-sm font-bold">Delivery {formatLkr(deliveryCharge)}</span><span className="block text-xs text-ink/70">Shown before you order</span></span>
            </div>
          </div>
        )}

        {/* The copy on a frosted glass card that tilts toward the cursor. */}
        <div className="pointer-events-none relative z-10 container-wide pb-14 pt-[14rem] md:pb-12 md:pt-6">
          <div className={`pointer-events-auto w-full max-w-xl rounded-[1.75rem] border border-white/70 bg-white/70 p-5 shadow-[0_30px_80px_-30px_rgb(60_30_10/0.45)] backdrop-blur-xl transition-transform duration-200 ease-out sm:p-7 lg:rounded-feature lg:p-9 ${DEPTH.card}`}>
            <p className="inline-flex w-fit animate-fade-up items-center gap-2 rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-bold text-on-brand shadow-[0_8px_18px_-6px_rgb(255_92_0/0.6)]">
              <Zap className="h-3.5 w-3.5 fill-current" aria-hidden /> Latest technology
            </p>
            <h1 id="hero-title" className="mt-4 max-w-[11ch] animate-fade-up [--d:90ms] font-display text-[2.3rem] font-extrabold leading-[0.95] tracking-[-0.035em] sm:text-[3rem] lg:text-[4.25rem]">
              Technology that <span className="text-brand-hover">moves</span> you.
            </h1>
            <p className="mt-4 max-w-md animate-fade-up text-sm leading-6 text-ink/80 [--d:180ms] sm:text-lg sm:leading-7">
              Discover smartphones, everyday tech and accessories at VALTA.LK.
            </p>
            <div className="mt-5 flex animate-fade-up flex-wrap items-center gap-2 [--d:270ms] sm:mt-6 sm:gap-3">
              <Link href="/products" className="btn-primary px-5 shadow-[0_10px_24px_-8px_rgb(255_92_0/0.65)] sm:px-6">
                Shop now <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              {phonesHref && (
                <Link href={phonesHref} className="btn-outline bg-white/80 px-5 sm:px-6">
                  Explore latest phones
                </Link>
              )}
              {accessoriesHref && (
                <Link href={accessoriesHref} className="group inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm font-semibold text-ink underline-offset-4 hover:underline">
                  Explore accessories <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* 2D accent: an orange line fading out along the bottom edge. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[9] h-[3px] bg-[linear-gradient(90deg,#ff5c00,#ff9b52_35%,transparent_78%)]" />
      </HeroDepth>
      <ServiceBar cod={cod} deliveryCharge={deliveryCharge} />
    </div>
  );
}

function ServiceBar({ cod, deliveryCharge }: { cod: boolean; deliveryCharge: number | null }) {
  const items = [
    { icon: Truck, title: deliveryCharge != null ? `Delivery ${formatLkr(deliveryCharge)}` : "Delivery charge", text: "Shown before you order", href: "/shipping-policy" },
    cod && { icon: Wallet, title: "Cash on Delivery", text: "Pay when your order arrives" },
    { icon: PackageSearch, title: "Track Your Order", text: "Follow it online", href: "/track-order" },
    { icon: Headset, title: "Customer Support", text: siteConfig.phone ? `Call ${siteConfig.phone}` : "Here to help you", href: "/contact" },
  ].filter(Boolean) as { icon: typeof Truck; title: string; text: string; href?: string }[];

  return (
    <section aria-label="Shopping with VALTA.LK" className="container-page shrink-0 py-3">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border bg-surface px-4 py-2.5 sm:px-5 lg:grid-cols-4 lg:gap-y-0 lg:divide-x lg:divide-border">
        {items.map(({ icon: I, title, text, href }) => {
          const body = (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-brand-500 shadow-card">
                <I className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <span>
                <span className="block text-xs font-semibold leading-tight text-ink sm:text-[13px]">{title}</span>
                {text && <span className="hidden text-[11px] text-muted sm:block">{text}</span>}
              </span>
            </>
          );
          return (
            <li key={title} className="flex lg:justify-center lg:px-6 lg:first:justify-start lg:first:pl-2 lg:last:justify-end lg:last:pr-2">
              {href ? <Link href={href} className="flex items-center gap-3 hover:text-brand-600 sm:gap-4">{body}</Link> : <div className="flex items-center gap-3 sm:gap-4">{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
