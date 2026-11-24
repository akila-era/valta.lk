"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Cable, ChevronDown, Headphones, Menu, Smartphone, Tablet, Watch, type LucideIcon } from "lucide-react";
import { CategoryDrawer, type DrawerCategory } from "./category-drawer";

export type NavCategory = DrawerCategory;

/** Desktop category bar built from the categories that really exist in the catalogue. */
export function CategoryNav({ categories, showDeals, showBrands = false }: { categories: NavCategory[]; showDeals: boolean; showBrands?: boolean }) {
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
    `relative flex h-12 items-center whitespace-nowrap px-1 text-sm font-medium transition-colors hover:text-brand-600 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 ${
      active ? "text-brand-600 after:bg-brand-500" : "after:bg-transparent"
    }`;

  return (
    <nav aria-label="Categories" className="hidden border-t border-border md:block">
      <div className="container-wide flex flex-nowrap items-center gap-x-5 overflow-x-auto py-2 [scrollbar-width:none] lg:gap-x-7 [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpenedAt(pathname)}
          className="my-1 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-500 hover:text-on-brand"
        >
          <Menu className="h-4 w-4" aria-hidden /> All Categories <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
        <CategoryDrawer open={open} onClose={close} categories={categories} hasDeals={showDeals} />
        <ul className="hidden xl:contents">
          {categories.map((c) => {
            const active = pathname === `/categories/${c.slug}`;
            const Icon = iconFor(c.name);
            return (
              <li key={c.slug}>
                <Link href={`/categories/${c.slug}`} aria-current={active ? "page" : undefined} className={item(active)}>
                  {Icon ? <Icon className="mr-1.5 hidden h-4 w-4 2xl:block" strokeWidth={1.75} aria-hidden /> : null}
                  {c.name}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href="/products" className="inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-ink hover:text-brand-600">
          Shop
        </Link>
        {showDeals && (
          <Link
            href="/products?sale=1"
            aria-current={dealsActive ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-bold ${dealsActive ? "text-brand-600" : "text-brand-600 hover:underline"}`}
          >
            Deals
          </Link>
        )}
        {showBrands && (
          <Link href="/brands" className="inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-ink hover:text-brand-600">
            Brands
          </Link>
        )}
        <Link href="/#products" className="inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-ink hover:text-brand-600">
          New Arrivals
        </Link>
      </div>
    </nav>
  );
}
