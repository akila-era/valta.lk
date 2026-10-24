import Link from "next/link";
import { ArrowRight, Headset, PackageSearch, Truck, Wallet, Zap } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";
import { HeroSlides } from "./hero-slides";

interface HeroProps {
  phonesHref?: string;
  accessoriesHref?: string;
  cod: boolean;
  deliveryCharge: number | null;
}

/**
 * Full-bleed light campaign. The studio photographs slide behind; the headline and actions stay as HTML on the left,
 * over a warm fade so the text keeps its contrast. Hero and service strip together fill the first screen below the
 * header (see --hdr-h in HeaderShell), so the strip is visible without scrolling.
 */
export function Hero({ phonesHref, accessoriesHref, cod, deliveryCharge }: HeroProps) {
  return (
    <div className="flex min-h-[calc(100svh-var(--hdr-h,8rem))] flex-col md:h-[calc(100svh-var(--hdr-h,10.5rem))] md:min-h-[34rem]">
      <section aria-labelledby="hero-title" className="relative flex flex-1 flex-col overflow-hidden bg-[#f6efe7] text-ink md:block">
        <div className="relative min-h-[13rem] flex-1 md:absolute md:inset-0">
          <HeroSlides />
          {/* Fades the photograph into the warm background: leftwards on wide screens, downwards on phones. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-[#f6efe7] via-transparent to-transparent md:bg-gradient-to-r md:from-[#f6efe7] md:from-10% md:via-[#f6efe7]/70 md:via-35% md:to-transparent md:to-60%" />
        </div>
        {/* A soft orange bloom behind the copy ties the text side to the orange fabric in the photographs. */}
        <span aria-hidden className="pointer-events-none absolute -left-32 top-[12%] hidden h-96 w-96 animate-glow rounded-full bg-brand-500/15 blur-3xl md:block" />
        <div className="pointer-events-none relative z-10 md:absolute md:inset-0">
          <div className="container-wide flex h-full flex-col justify-center pb-10 pt-2 md:pb-16 md:pt-6">
            <p className="inline-flex w-fit animate-fade-up items-center gap-2 rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-bold text-on-brand shadow-glow">
              <Zap className="h-3.5 w-3.5 fill-current" aria-hidden /> Latest technology
            </p>
            <h1 id="hero-title" className="mt-4 max-w-[11ch] animate-fade-up [--d:90ms] font-display text-[2.2rem] font-extrabold leading-[0.96] tracking-[-0.028em] sm:text-[2.8rem] lg:text-[4rem]">
              Technology that <span className="text-brand-500">moves</span> you.
            </h1>
            <p className="mt-4 max-w-md animate-fade-up text-sm leading-6 text-ink/75 [--d:180ms] sm:text-lg sm:leading-7">
              Discover smartphones, everyday tech and accessories at VALTA.LK.
            </p>
            <div className="pointer-events-auto mt-5 flex animate-fade-up flex-wrap items-center gap-2 [--d:270ms] sm:gap-3">
              <Link href="/products" className="btn-primary shine px-5 sm:px-6">
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
      </section>
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
