"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Phone category shortcuts: one swipeable row of 44px chips. Scrolls away with the page so the pinned header stays compact. */
export function MobileCategoryChips({ categories, showDeals, showBrands }: { categories: { slug: string; name: string }[]; showDeals: boolean; showBrands: boolean }) {
  const path = usePathname();
  const chip = (on: boolean) => `inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${on ? "bg-ink text-white" : "bg-surface text-ink active:bg-border"}`;
  return (
    <nav aria-label="Browse shortcuts" className="border-b border-border md:hidden">
      <ul className="scrollbar-none flex snap-x gap-2 overflow-x-auto px-4 py-2.5 [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]">
        {showDeals && <li className="snap-start"><Link href="/products?sale=1" className={`${chip(false)} !bg-brand-500 !text-on-brand`}>Deals</Link></li>}
        {categories.map((c) => (
          <li key={c.slug} className="snap-start">
            <Link href={`/categories/${c.slug}`} aria-current={path === `/categories/${c.slug}` ? "page" : undefined} className={chip(path === `/categories/${c.slug}`)}>{c.name}</Link>
          </li>
        ))}
        {showBrands && <li className="snap-start"><Link href="/brands" className={chip(false)}>Brands</Link></li>}
        <li className="snap-start pr-4"><Link href="/#products" className={chip(false)}>New arrivals</Link></li>
      </ul>
    </nav>
  );
}
