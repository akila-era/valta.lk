"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { BadgeCheck, Cable, ChevronDown, Flame, Headphones, Menu, Smartphone, Star, Tablet, Watch, type LucideIcon } from "lucide-react";
import { CategoryDrawer, type DrawerCategory } from "./category-drawer";

export type NavCategory = DrawerCategory;

/** Desktop category bar built from the categories that really exist in the catalogue; "All Categories" opens the drawer. */
export function CategoryNav({ categories, showDeals }: { categories: NavCategory[]; showDeals: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const close = useCallback(() => setOpenedAt(null), []);

  const iconFor = (name: string): LucideIcon | null => {
    if (/phone|mobile/i.test(name)) return Smartphone;
    if (/audio|headphone|earbud/i.test(name)) return Headphones;
    if (/wearable|watch/i.test(name)) return Watch;
    if (/tablet/i.test(name)) return Tablet;
    if (/accessor/i.test(name)) return Cable;
    return null;
  };
  const dealsActive = pathname === "/products" && params.get("sale") === "1";
  const item = (active: boolean) =>
    `relative flex h-11 items-center whitespace-nowrap px-0.5 text-[14px] min-[90rem]:text-[15px] font-semibold transition-colors text-ink/80 hover:text-brand-600 after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:origin-left after:bg-brand-500 after:transition-transform after:duration-300 ${
      active ? "text-brand-600! after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
    }`;

  return (
    <nav aria-label="Categories" className="hidden border-t border-brand-100 bg-bg md:block">
      {/* One row; on narrow tablets it scrolls sideways instead of wrapping onto a second line. */}
      <div className="container-wide flex items-center gap-x-3.5 overflow-x-auto min-[90rem]:gap-x-6 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpenedAt(open ? null : pathname)}
          className={`my-1.5 inline-flex h-9 shrink-0 items-center gap-2 rounded-control px-4 text-[13.5px] min-[90rem]:px-5 font-bold uppercase tracking-[0.06em] transition-colors ${open ? "bg-ink text-white" : "bg-brand-500 text-on-brand hover:bg-ink hover:text-white"}`}
        >
          <Menu className="h-4 w-4" aria-hidden /> All Categories <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <ul className="contents">
          {categories.map((c) => {
            const active = pathname === `/categories/${c.slug}`;
            const Icon = iconFor(c.name);
            return (
              <li key={c.slug}>
                <Link href={`/categories/${c.slug}`} aria-current={active ? "page" : undefined} className={item(active)}>
                  {Icon ? <Icon className="mr-1.5 h-4 w-4" strokeWidth={1.75} aria-hidden /> : null}
                  {c.name}
                </Link>
              </li>
            );
          })}
        </ul>
        {showDeals && (
          <Link
            href="/products?sale=1"
            aria-current={dealsActive ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[14px] min-[90rem]:text-[15px] font-bold ${dealsActive ? "text-brand-600" : "text-brand-600 hover:underline"}`}
          >
            <Flame className="h-4 w-4 fill-brand-500" strokeWidth={2} aria-hidden /> Deals
          </Link>
        )}
        <Link
          href="/brands"
          aria-current={pathname === "/brands" ? "page" : undefined}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[14px] min-[90rem]:text-[15px] font-semibold ${pathname === "/brands" ? "text-brand-600" : "text-ink/80 hover:text-brand-600"}`}
        >
          <BadgeCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Brands
        </Link>
        <Link href="/#new-arrivals" className="my-1.5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-ink px-3 text-[13.5px] min-[90rem]:px-4 font-bold uppercase tracking-[0.06em] text-white transition-colors hover:bg-brand-500 hover:text-on-brand">
          <Star className="h-4 w-4 fill-brand-500 text-brand-500" strokeWidth={1.75} aria-hidden /> New Arrivals
        </Link>
      </div>
      {/* The same left drawer as on phones (ugreen.lk style): categories with a sub-category level, and a site menu. */}
      <CategoryDrawer open={open} onClose={close} categories={categories} hasDeals={showDeals} />
    </nav>
  );
}
