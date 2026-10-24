import Link from "next/link";
import { Fragment } from "react";
import { ArrowDown, ArrowRight, Headset, PackageSearch, Truck, Wallet } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";
import { Icon3D } from "@/components/ui/icon-3d";
import { HeroDepth } from "./hero-depth";
import { Accent } from "./story/chapter";
import { StoryStage } from "./story/story-stage";

interface HeroProps {
  phonesHref?: string;
  accessoriesHref?: string;
  cod: boolean;
  deliveryCharge: number | null;
}

const HEADLINE = ["Technology", "that", "moves", "you."];

/**
 * Chapter 01 of the homepage story: a large light statement with a serif accent word, the product on a 3D stage in the
 * middle (it turns and rises as the page scrolls, and follows the cursor), and a short serif note with live ERP facts.
 * Hero and service strip together fill the first screen below the header (see --hdr-h in HeaderShell).
 */
export function Hero({ phonesHref, accessoriesHref, cod, deliveryCharge }: HeroProps) {
  const facts = ["Prices in LKR", cod && "Cash on Delivery", deliveryCharge != null && `Delivery ${formatLkr(deliveryCharge)}`].filter(
    Boolean,
  ) as string[];

  return (
    // Pulled up under the sticky header (by --hdr-sticky) so header and hero read as one scene until the page scrolls.
    <div
      id="story-intro"
      className="-mt-[var(--hdr-sticky,7rem)] flex min-h-[calc(100svh-var(--hdr-h,8rem)+var(--hdr-sticky,7rem))] flex-col md:min-h-[calc(100svh-var(--hdr-h,9rem)+var(--hdr-sticky,7rem))]"
    >
      <HeroDepth
        aria-labelledby="hero-title"
        className="relative isolate flex flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_55%_55%,#fbf4ec,#f6efe7_45%,#efe5da)] text-ink"
      >
        {/* 2D decoration: a dot grid fading from the top left and a soft orange bloom. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.08)_1px,transparent_1.3px)] [background-size:20px_20px] [mask-image:radial-gradient(ellipse_at_25%_20%,#000,transparent_65%)]" />
        <span aria-hidden className="pointer-events-none absolute -left-24 top-[22%] h-80 w-80 animate-glow rounded-full bg-brand-500/10 blur-3xl" />

        <div className="container-page relative z-10 grid flex-1 items-center gap-x-8 gap-y-4 pb-12 pt-[calc(var(--hdr-sticky,7rem)+1.25rem)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.65fr)] lg:pb-16 lg:pt-[calc(var(--hdr-sticky,7rem)+2rem)]">
          {/* Left: kicker, statement, copy and actions. */}
          <div>
            <p className="kicker animate-fade-up">
              <span className="text-brand-600">01</span> / VALTA.LK
            </p>
            {/* Each word rises out of its own mask in turn; the spaces stay real text so the heading reads normally. */}
            <h1 id="hero-title" className="statement mt-4 max-w-[11ch] text-[clamp(2.8rem,1.4rem+5vw,6.5rem)]">
              {HEADLINE.map((w, i) => (
                <Fragment key={w}>
                  {i > 0 && " "}
                  <span className="-mb-[0.12em] inline-block overflow-y-clip pb-[0.12em] align-top">
                    <span className="inline-block word-rise" style={{ "--i": i } as React.CSSProperties}>
                      {w === "moves" ? <Accent>moves</Accent> : w}
                    </span>
                  </span>
                </Fragment>
              ))}
            </h1>
            <p className="mt-5 max-w-md animate-fade-up text-base leading-7 text-ink/75 [--d:180ms] sm:text-lg">
              Discover smartphones, everyday tech and accessories at VALTA.LK.
            </p>
            <div className="mt-6 flex animate-fade-up flex-wrap items-center gap-2 [--d:270ms] sm:gap-3">
              <Link href="/products" className="btn-primary px-6 shadow-[0_10px_24px_-8px_rgb(255_92_0/0.65)]">
                Shop now <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              {phonesHref && (
                <Link href={phonesHref} className="btn-outline bg-white/70 px-6 backdrop-blur-sm">
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

          {/* Centre: the product on its 3D stage (the 3D model slot). */}
          <div className="animate-scale-in [--d:120ms]">
            <StoryStage src="/images/home/valta-category-smartphones.webp" alt="" />
          </div>

          {/* Right: a serif note and facts from live ERP settings only. */}
          <div className="hidden animate-fade-up [--d:360ms] lg:block lg:justify-self-end">
            <p className="max-w-[14ch] font-serif text-[1.75rem] italic leading-[1.15] text-ink/85">Chosen with care, delivered to your door.</p>
            <ul className="mt-5 space-y-2.5 border-t border-ink/15 pt-4">
              {facts.map((f) => (
                <li key={f} className="flex items-center gap-2 text-label font-semibold uppercase tracking-[0.18em] text-ink/70">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Scroll cue to the next chapter. */}
        <a
          href="#story-lifestyle"
          className="absolute bottom-11 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 rounded-full p-1 text-label font-semibold uppercase tracking-[0.22em] text-ink/60 transition-colors hover:text-ink lg:flex"
        >
          Scroll
          <span aria-hidden className="flex h-9 w-6 justify-center rounded-full border border-ink/25 pt-1.5">
            <ArrowDown className="h-3 w-3 animate-cue" />
          </span>
        </a>
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
    // A frosted glass strip that overlaps the hero's lower edge (3D layering). Motion: the four facts rise in one after
    // another, a band of light sweeps across the glass, the icon tiles bob in a wave and a tile lifts on hover. The
    // global reduced-motion rule stops all of it.
    <section aria-label="Shopping with VALTA.LK" className="container-page relative z-20 -mt-5 shrink-0 pb-3 md:-mt-7">
      <div className="relative overflow-hidden rounded-2xl bg-white/80 p-2 shadow-float ring-1 ring-ink/[0.06] backdrop-blur-xl sm:p-2.5">
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/4 animate-sweep bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.85),rgb(255_92_0/0.12),transparent)] [--d:1.2s]" />
        <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(255_92_0/0.6),transparent)]" />
        <ul className="relative grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4">
          {items.map(({ icon: I, title, text, href }, i) => {
            const body = (
              <>
                <span className="animate-bob" style={{ "--d": `${i * 320}ms` } as React.CSSProperties}>
                  <Icon3D icon={I} tone="glass" size="sm" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold leading-tight text-ink sm:text-[13px]">{title}</span>
                  {text && <span className="mt-0.5 block text-[11px] leading-4 text-muted sm:text-xs">{text}</span>}
                </span>
              </>
            );
            const tile =
              "group flex h-full items-center gap-2.5 rounded-xl px-2 py-2 transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-soft motion-reduce:hover:translate-y-0 sm:gap-3.5 sm:px-3";
            return (
              <li key={title} className="animate-fade-up" style={{ "--d": `${250 + i * 120}ms` } as React.CSSProperties}>
                {href ? <Link href={href} className={tile}>{body}</Link> : <div className={tile}>{body}</div>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
