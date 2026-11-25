import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import { ProductCard } from "@/components/products/product-card";
import { discountPercent } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { ProductCarousel } from "./product-carousel";

/**
 * Hot Deals: products whose ERP price is genuinely reduced, in a warm banner with a swipeable row. The best real saving is
 * quoted in the header, and a countdown (set by the owner in the admin, since the ERP has no end date) can sit beside it.
 */
export function HotDeals({ products, timer, title = "Hot Deals", subtitle }: { products: ErpProduct[]; timer?: React.ReactNode; title?: string; subtitle?: string }) {
  const list = products.filter((p) => p.available);
  if (!list.length) return null;
  const best = Math.max(0, ...list.map((p) => discountPercent(p) ?? 0));
  return (
    <section id="hot-deals" aria-labelledby="hot-deals-title" className="container-page mt-10 scroll-mt-40 sm:mt-14">
      <div className="relative isolate overflow-hidden rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-brand-50 p-4 sm:p-8">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl" />
        <Flame aria-hidden className="pointer-events-none absolute -bottom-10 -left-6 -z-10 h-56 w-56 -rotate-12 fill-brand-500/[0.06] text-brand-500/10" strokeWidth={1} />

        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:mb-6 sm:gap-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-400 text-on-brand shadow-[0_12px_24px_-12px_rgba(6,121,61,0.9)]">
              <Flame className="h-6 w-6 fill-current" aria-hidden />
            </span>
            <div>
              <h2 id="hot-deals-title" className="text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-[2rem]">{title}</h2>
              <p className="text-[15px] text-muted">
                {subtitle || `${list.length} ${list.length === 1 ? "product" : "products"}${best > 0 ? `, up to -${best}%` : ""}`}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-3 sm:w-auto">
            {timer}
            <Link href="/products?sale=1" className="group inline-flex min-h-11 w-full items-center justify-center gap-1.5 sm:min-h-10 sm:w-auto rounded-full bg-ink px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 hover:text-on-brand">
              View all deals <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </Link>
          </div>
        </div>

        <ProductCarousel label="Hot deals" align="start">
          {list.slice(0, 12).map((p, i) => (
            <li key={p.id} className={`shrink-0 snap-start px-1.5 sm:px-2 sm:w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5 ${list.length === 1 ? "w-full max-sm:max-w-[16rem]" : "w-[62%]"}`}>
              <div className="h-full rounded-2xl border border-border bg-white p-1.5 transition-shadow duration-200 hover:shadow-[0_16px_32px_-22px_rgba(17,17,17,0.5)] sm:p-2">
                <ProductCard product={p} priority={i < 2} />
              </div>
            </li>
          ))}
          {list.length < 4 && (
            <li className="hidden w-1/2 shrink-0 snap-start px-1.5 sm:px-2 md:block md:w-1/3 lg:w-1/4 xl:w-1/5">
              <Link href="/products?sale=1" className="group flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-brand-500/40 bg-white/60 p-6 text-center transition-colors hover:border-brand-500 hover:bg-white">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-amber-400 text-on-brand transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none">
                  <Flame className="h-7 w-7 fill-current" aria-hidden />
                </span>
                <span className="text-[15px] font-semibold text-ink">See all hot deals</span>
                <span className="text-[13px] text-muted">New reduced prices appear here</span>
              </Link>
            </li>
          )}
        </ProductCarousel>
      </div>
    </section>
  );
}
