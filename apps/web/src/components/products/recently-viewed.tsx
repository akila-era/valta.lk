"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { History, ShoppingBag } from "lucide-react";
import { recentlyViewed, useRecentlyViewed, type ViewedItem } from "@/store/recently-viewed";

/** Records a product page view in this browser's "Recently viewed" list. Renders nothing. */
export function RecordView({ item }: { item: ViewedItem }) {
  useEffect(() => recentlyViewed.record(item), [item]);
  return null;
}

/**
 * "Recently viewed": the products this shopper last opened (this browser only), as a scrolling strip. Hidden when
 * there is nothing to show. `exclude` leaves out the product on the current page. Prices are not repeated here:
 * each tile opens the product page, which has the live price.
 */
export function RecentlyViewed({ exclude }: { exclude?: string }) {
  const items = useRecentlyViewed().filter((i) => i.productId !== exclude).slice(0, 10);
  if (!items.length) return null;
  return (
    <section aria-labelledby="recent" className="mt-14">
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-border pb-3">
        <h2 id="recent" className="flex items-center gap-2 font-display text-xl font-extrabold tracking-title text-ink sm:text-2xl">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-brand-500"><History className="h-4 w-4" aria-hidden /></span>
          Recently viewed
        </h2>
        <button type="button" onClick={() => recentlyViewed.clear()} className="min-h-8 text-xs font-semibold text-muted hover:text-brand-600">
          Clear
        </button>
      </div>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:px-0">
        {items.map((i) => (
          <li key={i.productId} className="w-36 shrink-0 snap-start sm:w-40">
            <Link href={`/products/${i.slug}`} className="group block rounded-card border border-border bg-bg p-2 transition-[border-color,box-shadow] hover:border-brand-500 hover:shadow-neon-lift">
              <span className="relative block aspect-square overflow-hidden rounded-control bg-bg">
                {i.image ? (
                  <Image src={i.image} alt="" fill sizes="160px" className="object-contain p-2 transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <ShoppingBag className="absolute inset-0 m-auto h-8 w-8 text-muted" aria-hidden />
                )}
              </span>
              <span className="mt-2 line-clamp-2 min-h-10 text-[13px] font-semibold leading-5 text-ink group-hover:text-brand-600">{i.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
