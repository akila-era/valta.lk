"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { CategoryDrawer, type DrawerCategory } from "./category-drawer";

/** Event the phone search icon sends to open this drawer with the search box focused. */
export const OPEN_SEARCH_EVENT = "volta:open-search";

export function MobileMenu({ categories, hasDeals = false, popular = [] }: { categories: DrawerCategory[]; hasDeals?: boolean; popular?: { label: string; href: string }[] }) {
  const pathname = usePathname();
  // Open state is tied to the path it was opened on, so navigating closes the menu without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [forSearch, setForSearch] = useState(false);
  const close = useCallback(() => setOpenedAt(null), []);
  useEffect(() => {
    const open = () => {
      setForSearch(true);
      setOpenedAt(window.location.pathname);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, open);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, open);
  }, []);
  return (
    <div className="md:hidden">
      <button type="button" className="-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-ink transition-colors hover:bg-surface" aria-label="Open menu" aria-haspopup="dialog" onClick={() => {
          setForSearch(false);
          setOpenedAt(pathname);
        }}>
        <Menu className="h-6 w-6" aria-hidden />
      </button>
      <CategoryDrawer open={openedAt === pathname} onClose={close} categories={categories} hasDeals={hasDeals} focusSearch={forSearch} popular={popular} />
    </div>
  );
}
