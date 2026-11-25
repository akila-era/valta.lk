"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { BadgeCheck, Boxes, ChevronDown, Flame, Menu, Sparkles } from "lucide-react";
import { CategoryDrawer, type DrawerCategory } from "./category-drawer";

export type NavCategory = DrawerCategory;

/** Desktop category bar: the mega menu button, real catalogue categories with an active underline, and quick links on the right. */
export function CategoryNav({ categories, showDeals, showBrands = false }: { categories: NavCategory[]; showDeals: boolean; showBrands?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const close = useCallback(() => setOpenedAt(null), []);

  const dealsActive = pathname === "/products" && params.get("sale") === "1";
  const tab = (active: boolean) =>
    `relative flex h-12 items-center whitespace-nowrap px-0.5 text-sm font-medium transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full ${
      active ? "text-ink after:bg-brand-500" : "text-ink/75 after:bg-transparent hover:text-ink hover:after:bg-border"
    }`;
  const quick = "group relative inline-flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-ink/75 transition-colors hover:text-ink";

  return (
    <nav aria-label="Categories" className="hidden border-t border-border md:block">
      <div className="container-wide flex flex-nowrap items-center gap-x-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpenedAt(pathname)}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-ink pl-3.5 pr-3 text-sm font-semibold text-white transition-colors hover:bg-brand-500 hover:text-on-brand"
        >
          <Menu className="h-4 w-4" aria-hidden /> All Categories <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
        <CategoryDrawer open={open} onClose={close} categories={categories} hasDeals={showDeals} />
        <ul className="hidden items-center gap-x-6 lg:flex">
          {categories.slice(0, 6).map((c) => {
            const active = pathname === `/categories/${c.slug}`;
            return (
              <li key={c.slug}>
                <Link href={`/categories/${c.slug}`} aria-current={active ? "page" : undefined} className={tab(active)}>
                  {c.name}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="ml-auto flex shrink-0 items-center gap-6">
          <Link
            href="/wholesale"
            aria-current={pathname === "/wholesale" ? "page" : undefined}
            className="group inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-500 px-4 text-sm font-semibold text-brand-600 transition-colors duration-200 hover:bg-brand-500 hover:text-on-brand aria-[current=page]:bg-brand-500 aria-[current=page]:text-on-brand"
          >
            <Boxes className="h-4 w-4" aria-hidden /> Apply Wholesale
          </Link>
          {showBrands && (
            <Link href="/brands" className={quick}>
              <BadgeCheck className="h-4 w-4 transition-colors group-hover:text-brand-600" aria-hidden /> Brands
            </Link>
          )}
          <Link href="/#products" className={quick}>
            <Sparkles className="h-4 w-4 transition-colors group-hover:text-brand-600" aria-hidden /> New Arrivals
          </Link>
          {showDeals && (
            <Link
              href="/products?sale=1"
              aria-current={dealsActive ? "page" : undefined}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-bold text-on-brand shadow-[0_6px_16px_-6px_rgba(6,121,61,0.8)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-8px_rgba(6,121,61,0.9)] motion-reduce:transition-none ${dealsActive ? "bg-brand-600 !text-white" : "bg-gradient-to-r from-brand-500 to-brand-400"}`}
            >
              <Flame className="h-4 w-4 fill-current" aria-hidden />
              Hot Deals
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
