import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Wallet, Zap } from "lucide-react";
import type { HomeData } from "@/lib/home-data";
import { categoryVisual } from "./category-art";
import { WideBannerSlider } from "./wide-banner-slider";

/**
 * One wide promotional banner. Staff "wide" pictures (admin) win and slide when there are several; otherwise a banner is
 * built from a real category (chargers and cables first) with its studio photo, a headline and a "Shop now" button.
 */
export function PromoBanner({ data }: { data: Pick<HomeData, "wideBanners" | "categories"> }) {
  if (data.wideBanners.length) {
    return (
      <section aria-label="Promotions" className="container-page mt-10 sm:mt-14">
        <WideBannerSlider slides={data.wideBanners} />
      </section>
    );
  }
  const cat =
    data.categories.find((c) => /charg|cable/i.test(c.name)) ??
    data.categories.find((c) => /accessor/i.test(c.name)) ??
    [...data.categories].sort((a, b) => b.count - a.count)[0];
  if (!cat) return null;
  const art = categoryVisual(cat.name) ?? cat.image;
  return (
    <section aria-label="Featured collection" className="container-page mt-10 sm:mt-14">
      <div className="relative isolate grid overflow-hidden rounded-2xl bg-gradient-to-br from-white via-surface to-[#e4e6ee] ring-1 ring-border md:min-h-[24rem] md:grid-cols-[1.05fr_1fr]">
        <div className="relative z-10 flex flex-col justify-center gap-3 p-5 pt-1 sm:gap-4 sm:p-10 lg:p-14">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-brand-600">
            <Zap className="h-3.5 w-3.5 fill-brand-500 text-brand-500" aria-hidden /> VOLTA.LK
          </p>
          <h2 className="max-w-md text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-ink sm:text-4xl lg:text-[2.75rem]">Everything you need for {cat.name}</h2>
          <p className="max-w-sm text-[15px] leading-6 text-muted sm:text-base">Genuine products, delivered island-wide. Pay cash on delivery.</p>
          <ul className="flex flex-wrap gap-2 max-sm:[&>li]:min-h-8">
            <li className="inline-flex min-h-9 items-center gap-1.5 rounded-2xl border border-border bg-white px-3 text-[13px] font-semibold text-ink">
              <BadgeCheck className="h-4 w-4 text-brand-600" aria-hidden /> Genuine products
            </li>
            <li className="inline-flex min-h-9 items-center gap-1.5 rounded-2xl border border-border bg-white px-3 text-[13px] font-semibold text-ink">
              <Wallet className="h-4 w-4 text-brand-600" aria-hidden /> Cash on delivery
            </li>
          </ul>
          <Link href={`/categories/${cat.slug}`} className="btn-primary btn-lg mt-1 w-full justify-center rounded-full sm:w-fit">
            Shop now <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="relative h-52 max-md:order-first sm:h-64 md:h-auto md:min-h-full">
          {art && <Image src={art} alt={cat.name} fill sizes="(min-width:768px) 45vw, 100vw" loading="lazy" className="object-cover object-center max-md:[mask-image:linear-gradient(to_top,transparent,#000_35%)] md:[mask-image:linear-gradient(to_right,transparent,#000_35%)]" />}
        </div>
      </div>
    </section>
  );
}
