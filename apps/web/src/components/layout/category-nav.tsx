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
    `relative flex h-8 items-center whitespace-nowrap px-1 text-[12px] font-medium transition-colors text-ink/75 hover:text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:bg-brand-500 after:transition-transform after:duration-300 ${
      active ? "text-brand-600! after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
    }`;

  return (
    <nav aria-label="Categories" className="hidden border-t border-border md:block">
      <div className="container-wide flex flex-wrap items-center gap-x-4 gap-y-0.5 py-px">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpenedAt(pathname)}
          className="my-0.5 inline-flex min-h-7 items-center gap-1.5 rounded-full bg-brand-500 px-3 text-[11.5px] font-semibold text-on-brand transition-colors hover:bg-brand-400 hover:shadow-glow"
        >
          <Menu className="h-3.5 w-3.5" aria-hidden /> All Categories <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
        <CategoryDrawer open={open} onClose={close} categories={categories} hasDeals={showDeals} />
        <ul className="contents">
          {categories.map((c) => {
            const active = pathname === `/categories/${c.slug}`;
            const Icon = iconFor(c.name);
            return (
              <li key={c.slug}>
                <Link href={`/categories/${c.slug}`} aria-current={active ? "page" : undefined} className={item(active)}>
                  {Icon ? <Icon className="mr-1 h-3.5 w-3.5" strokeWidth={1.75} aria-hidden /> : null}
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
            className={`inline-flex min-h-8 shrink-0 items-center gap-1 text-[12px] font-bold ${dealsActive ? "text-brand-600" : "text-brand-600 hover:underline"}`}
          >
            <Flame className="h-3.5 w-3.5 animate-flicker fill-brand-500/30" strokeWidth={2} aria-hidden /> Deals
          </Link>
        )}
        <Link href="/#products" className="inline-flex min-h-8 shrink-0 items-center gap-1 text-[12px] font-medium text-ink/75 hover:text-ink">
          <Star className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden /> New Arrivals
        </Link>
      </div>
    </nav>
  );
}
