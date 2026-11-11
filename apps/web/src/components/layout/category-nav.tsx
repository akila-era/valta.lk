"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Cable, ChevronDown, Headphones, Menu, Smartphone, Tablet, Watch, type LucideIcon } from "lucide-react";
import { CategoryDrawer, type DrawerCategory } from "./category-drawer";

export type NavCategory = DrawerCategory;

function iconFor(name: string): LucideIcon | null {
  if (/(?<!head|ear)phone|mobile/i.test(name)) return Smartphone;
  if (/audio|headphone|earbud/i.test(name)) return Headphones;
  if (/wearable|watch/i.test(name)) return Watch;
  if (/tablet/i.test(name)) return Tablet;
  if (/accessor/i.test(name)) return Cable;
  return null;
}

/** How many categories the bar shows; every category is in the All Categories drawer. */
const MAX_IN_BAR = 5;

/** Desktop category bar built from the categories that really exist in the catalogue; "All Categories" opens the drawer. */
export function CategoryNav({ categories, showDeals }: { categories: NavCategory[]; showDeals: boolean }) {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const close = useCallback(() => setOpenedAt(null), []);

  const item = (active: boolean) =>
    `relative flex h-11 items-center whitespace-nowrap px-0.5 text-[14px] min-[90rem]:text-[15px] font-semibold transition-colors text-ink/80 hover:text-brand-600 after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:origin-left after:bg-brand-500 after:transition-transform after:duration-300 ${
      active ? "text-brand-600! after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
    }`;

  return (
    <nav aria-label="Categories" className="hidden border-t border-brand-100 bg-bg md:block">
      {/* One row; on narrow tablets it scrolls sideways instead of wrapping onto a second line. */}
      <div className="container-wide flex items-center gap-x-5 overflow-x-auto min-[90rem]:gap-x-7 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpenedAt(open ? null : pathname)}
          className={`my-1.5 inline-flex h-9 shrink-0 items-center gap-2 rounded-control border px-4 text-[13.5px] min-[90rem]:px-5 font-bold uppercase tracking-[0.06em] transition-colors ${open ? "border-ink bg-ink text-white" : "border-border-strong/50 bg-bg text-ink hover:border-ink"}`}
        >
          <Menu className="h-4 w-4" aria-hidden /> All Categories <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {/* As on ugreen.lk: the New Arrivals pill next to All Categories, then a few top categories (the rest, deals and
            brands are in the All Categories drawer), so the row stays short and tidy. */}
        <Link href="/new-arrivals" className="my-1.5 inline-flex h-9 shrink-0 items-center rounded-full bg-ink px-4 text-[12.5px] font-bold uppercase tracking-[0.06em] text-white transition-colors hover:bg-ink/85">
          New Arrivals
        </Link>
        <ul className="contents">
          {categories.slice(0, MAX_IN_BAR).map((c) => {
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
      </div>
      {/* The same left drawer as on phones (ugreen.lk style): categories with a sub-category level, and a site menu. */}
      <CategoryDrawer open={open} onClose={close} categories={categories} hasDeals={showDeals} />
    </nav>
  );
}

/**
 * Desktop, once the page has scrolled (as on ugreen.lk): the top categories sit inline in the slim sticky header,
 * in place of the search bar and the category row, so the header takes less of the screen. Scrolling back to the top
 * brings the full header back.
 */
export function CompactCategoryLinks({ categories }: { categories: NavCategory[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Categories (compact)" className="min-w-0">
      {/* As many as fit without cutting a name: 3 on small laptops, 4 from 1280px, 5 from 1536px. */}
      <ul className="flex items-center gap-x-6 overflow-hidden whitespace-nowrap min-[90rem]:gap-x-7">
        {categories.slice(0, 5).map((c, i) => {
          const active = pathname === `/categories/${c.slug}`;
          const Icon = iconFor(c.name);
          return (
            <li key={c.slug} className={`shrink-0 ${i >= 4 ? "hidden 2xl:block" : i >= 3 ? "hidden xl:block" : ""}`}>
              <Link
                href={`/categories/${c.slug}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-10 items-center text-[14px] font-semibold transition-colors min-[90rem]:text-[15px] ${active ? "text-brand-600" : "text-ink/80 hover:text-brand-600"}`}
              >
                {Icon ? <Icon className="mr-1.5 h-4 w-4" strokeWidth={1.75} aria-hidden /> : null}
                {c.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
