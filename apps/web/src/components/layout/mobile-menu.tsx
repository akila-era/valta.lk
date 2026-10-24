"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Menu } from "lucide-react";
import { CategoryDrawer, type DrawerCategory } from "./category-drawer";

export function MobileMenu({ categories, hasDeals = false }: { categories: DrawerCategory[]; hasDeals?: boolean }) {
  const pathname = usePathname();
  // Open state is tied to the path it was opened on, so navigating closes the menu without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const close = useCallback(() => setOpenedAt(null), []);
  return (
    <div className="md:hidden">
      <button type="button" className="-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-ink transition-colors hover:bg-surface" aria-label="Open menu" aria-haspopup="dialog" onClick={() => setOpenedAt(pathname)}>
        <Menu className="h-6 w-6" aria-hidden />
      </button>
      <CategoryDrawer open={openedAt === pathname} onClose={close} categories={categories} hasDeals={hasDeals} />
    </div>
  );
}
