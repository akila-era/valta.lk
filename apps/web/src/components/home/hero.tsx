import Link from "next/link";
import { ArrowRight, Headset, PackageSearch, Truck, Wallet } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";
import { HeroSlides } from "./hero-slides";

interface HeroProps {
  phonesHref?: string;
  accessoriesHref?: string;
  cod: boolean;
  deliveryCharge: number | null;
}

/** Full-width campaign. The photograph slides; the headline and actions stay as HTML on the left. */
export function Hero({ phonesHref, accessoriesHref, cod, deliveryCharge }: HeroProps) {
  return (
    <>
      <section aria-labelledby="hero-title" className="bg-bg">
        <div className="container-wide py-4 sm:py-5">
          <div className="overflow-hidden rounded-[1.5rem] bg-[#f7f1ea] sm:rounded-[1.75rem] md:relative md:h-[clamp(21rem,36vw,27rem)]">
            <div className="relative aspect-[16/9] md:absolute md:inset-0 md:aspect-auto">
              <HeroSlides />
            </div>
            <div className="pointer-events-none relative z-10 flex flex-col justify-center px-5 py-6 sm:px-8 md:absolute md:inset-y-0 md:left-0 md:w-[46%] md:bg-gradient-to-r md:from-white/70 md:via-white/30 md:to-transparent md:pb-12 md:pl-16 md:pr-4 md:pt-6 lg:pl-20">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-600 sm:text-xs">Latest technology</p>
              <h1 id="hero-title" className="mt-2 max-w-[11ch] text-[2rem] font-black leading-[0.98] tracking-[-0.04em] text-ink sm:text-4xl lg:text-[2.9rem]">
                Technology that <span className="text-brand-500">moves</span> you.
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-ink/70 sm:mt-4 sm:text-base sm:leading-7">
                Discover smartphones, everyday tech and accessories at VALTA.LK.
              </p>
              <div className="pointer-events-auto mt-5 flex flex-wrap items-center gap-2.5 sm:mt-6 sm:gap-3">
                <Link href="/products" className="btn-primary rounded-full px-5 sm:btn-lg sm:px-7">
                  Shop now <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                {phonesHref && (
                  <Link href={phonesHref} className="btn-outline rounded-full bg-white px-5 sm:btn-lg sm:px-7">
                    Explore latest phones
                  </Link>
                )}
                {accessoriesHref && (
                  <Link href={accessoriesHref} className="btn-text rounded-full px-2">
                    Explore accessories
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      <ServiceBar cod={cod} deliveryCharge={deliveryCharge} />
    </>
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
    <section aria-label="Shopping with VALTA.LK" className="border-y border-border bg-bg">
      <ul className="container-page grid grid-cols-1 gap-y-4 py-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0 lg:divide-x lg:divide-border">
        {items.map(({ icon: I, title, text, href }) => {
          const body = (
            <>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
                <I className="h-5 w-5" strokeWidth={1.6} aria-hidden />
              </span>
              <span>
                <span className="block text-base font-semibold text-ink">{title}</span>
                {text && <span className="block text-sm text-muted">{text}</span>}
              </span>
            </>
          );
          return (
            <li key={title} className="flex lg:justify-center lg:px-6 lg:first:justify-start lg:first:pl-0 lg:last:justify-end lg:last:pr-0">
              {href ? <Link href={href} className="flex items-center gap-4 hover:text-brand-600">{body}</Link> : <div className="flex items-center gap-4">{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
