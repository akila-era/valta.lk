"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { categoryIcon } from "@/components/ui/category-icon";

export interface TileItem {
  href: string;
  name: string;
  /** Number of products, shown small under the name when known. */
  count?: number;
  active?: boolean;
  /** A brand tile: the staff-uploaded logo when there is one, otherwise the brand's first letter, instead of an icon. */
  brand?: { logo?: string };
}

/**
 * A row of category / sub-category / brand tiles in the style of large brand stores (ugreen.lk): a large line icon (or a
 * brand's logo) with the name underneath, in fixed-width columns under the title, with no card around each one. The current one is marked in
 * orange. On phones the row scrolls sideways instead of wrapping into several rows.
 */
export function CategoryTileRow({ label, items }: { label: string; items: TileItem[] }) {
  const nav = useRef<HTMLElement>(null);

  // On phones the row scrolls sideways: bring the current tile into view (centred) when the page opens.
  useEffect(() => {
    const el = nav.current;
    const current = el?.querySelector<HTMLElement>("[aria-current=\"page\"]");
    if (!el || !current || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2;
  }, []);

  if (!items.length) return null;
  return (
    <nav ref={nav} aria-label={label} className="relative -mx-4 mt-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mt-5 lg:mx-0 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
      {/* Phones and tablets: one row that scrolls sideways. Desktop: one row spread evenly across the page (up to 10
          tiles), or centred rows when there are more, so there is never a short last row on the left. */}
      <ul className={`flex w-max gap-2 sm:gap-4 lg:w-full lg:flex-wrap lg:justify-center lg:gap-x-5 lg:gap-y-4 ${items.length <= 10 ? "lg:flex-nowrap lg:gap-x-2" : ""}`}>
        {items.map((t) => {
          const Icon = categoryIcon(t.name);
          return (
            <li key={t.href} className={`w-28 shrink-0 sm:w-32 lg:w-36 ${items.length <= 10 ? "lg:w-auto lg:min-w-0 lg:flex-1" : ""}`}>
              <Link
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={`group flex h-full flex-col items-center gap-2 rounded-card px-2 py-2 text-center transition-colors ${t.active ? "text-brand-600" : "text-ink hover:text-brand-600"}`}
              >
                {/* As on ugreen.lk: a large thin line icon (or the brand's logo) with no circle or frame, the name in bold under it. */}
                <span className="flex h-16 w-16 items-center justify-center transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0 sm:h-20 sm:w-20">
                  {t.brand ? (
                    t.brand.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- staff-uploaded logo served by /api/brand-logo
                      <img src={t.brand.logo} alt="" loading="lazy" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
                    ) : (
                      <span aria-hidden className="font-display text-3xl font-extrabold leading-none sm:text-4xl">
                        {t.name.trim().charAt(0).toUpperCase()}
                      </span>
                    )
                  ) : (
                    <Icon className="h-12 w-12 sm:h-14 sm:w-14" strokeWidth={1} aria-hidden />
                  )}
                </span>
                <span className={`border-b-2 pb-0.5 text-[13px] font-bold leading-snug sm:text-[15px] ${t.active ? "border-brand-500" : "border-transparent"}`}>{t.name}</span>
                {t.count != null ? <span className="sr-only">, {t.count} {t.count === 1 ? "product" : "products"}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
