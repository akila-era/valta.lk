"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, PackageSearch, ShoppingCart, Store, User, type LucideIcon } from "lucide-react";
import { useCart } from "@/store/cart";
import { useWishlist } from "@/store/wishlist";

/**
 * Phone-only tab bar fixed to the bottom of the screen, as in shopping apps: Shop, Wishlist, Cart and My account (or
 * Track order when customer accounts are off). Counts come from the same stores as the header.
 */
export function MobileTabBar({ accounts }: { accounts: boolean }) {
  const pathname = usePathname();
  const { count: cartCount } = useCart();
  const { count: wishCount } = useWishlist();
  const tabs: { href: string; label: string; icon: LucideIcon; badge?: number; match: (p: string) => boolean }[] = [
    { href: "/products", label: "Shop", icon: Store, match: (p) => p.startsWith("/products") || p.startsWith("/categories") || p.startsWith("/search") },
    { href: "/wishlist", label: "Wishlist", icon: Heart, badge: wishCount, match: (p) => p.startsWith("/wishlist") },
    { href: "/cart", label: "Cart", icon: ShoppingCart, badge: cartCount, match: (p) => p.startsWith("/cart") || p.startsWith("/checkout") },
    accounts
      ? { href: "/account", label: "My account", icon: User, match: (p) => p.startsWith("/account") }
      : { href: "/track-order", label: "Track order", icon: PackageSearch, match: (p) => p.startsWith("/track-order") },
  ];
  return (
    <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgb(16_24_40/0.3)] backdrop-blur md:hidden">
      <ul className="grid h-16 grid-cols-4">
        {tabs.map(({ href, label, icon: Icon, badge, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={badge ? `${label}, ${badge} item${badge === 1 ? "" : "s"}` : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${active ? "text-brand-600" : "text-ink/75 hover:text-brand-600"}`}
              >
                {active ? <span aria-hidden className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-brand-500 shadow-[0_0_8px_rgb(255_92_0/0.8)]" /> : null}
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" strokeWidth={1.7} aria-hidden />
                  {badge ? (
                    <span aria-hidden className="absolute -right-2.5 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-on-brand">
                      {badge}
                    </span>
                  ) : null}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
