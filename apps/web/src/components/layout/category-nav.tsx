"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Cable, ChevronDown, Flame, Headphones, Menu, Smartphone, Star, Tablet, Watch, type LucideIcon } from "lucide-react";
import { CategoryDrawer, type DrawerCategory } from "./category-drawer";

export type NavCategory = DrawerCategory;

/** Desktop category bar built from the categories that really exist in the catalogue. */
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
    `relative flex h-12 items-center whitespace-nowrap px-1 text-[14px] font-semibold transition-colors text-ink/80 hover:text-brand-600 after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:origin-left after:bg-brand-500 after:transition-transform after:duration-300 ${
      active ? "text-brand-600! after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
    }`;

  return (
    <nav aria-label="Categories" className="hidden border-t border-border md:block">
      {/* One row; on narrow tablets it scrolls sideways instead of wrapping onto a second line. */}
      <div className="container-wide flex items-center gap-x-7 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpenedAt(pathname)}
          className="inline-flex h-12 shrink-0 items-center gap-2.5 bg-brand-500 px-5 text-[13px] font-bold uppercase tracking-[0.06em] text-on-brand transition-colors hover:bg-brand-hover lg:min-w-60"
        >
          <Menu className="h-[18px] w-[18px]" aria-hidden /> All Categories <ChevronDown className="ml-auto h-4 w-4" aria-hidden />
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
            className={`inline-flex min-h-12 shrink-0 items-center gap-1.5 text-[14px] font-bold ${dealsActive ? "text-brand-600" : "text-brand-600 hover:underline"}`}
          >
            <Flame className="h-4 w-4 fill-brand-500/30" strokeWidth={2} aria-hidden /> Deals
          </Link>
        )}
        <Link href="/#new-arrivals" className="inline-flex min-h-12 shrink-0 items-center gap-1.5 text-[14px] font-semibold text-ink/80 hover:text-brand-600">
          <Star className="h-4 w-4" strokeWidth={1.75} aria-hidden /> New Arrivals
        </Link>
      </div>
      <CategoryDrawer open={open} onClose={close} categories={categories} hasDeals={showDeals} />
    </nav>
  );
}
