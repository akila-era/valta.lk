"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Search, ShoppingCart, User } from "lucide-react";
import { useCart } from "@/store/cart";
import { uiActions } from "@/store/ui";

/** Pages that already pin their own bar to the bottom of a phone (buy bar, cart total, checkout total). */
const HIDE_ON = [/^\/products\/[^/]+/, /^\/cart/, /^\/checkout/, /^\/order-confirmation/, /^\/admin/];

/**
 * App-style bottom tab bar for phones: Home, Shop, Search, Cart (with a count) and Account, with the active tab marked.
 * Hidden from tablet width up, and on pages that have their own bottom bar. It reserves its own height so no content is covered.
 */
export function MobileTabBar() {
  const path = usePathname();
  const { count } = useCart();
  if (HIDE_ON.some((re) => re.test(path))) return null;

  const tab = "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:bg-surface";
  const on = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  const color = (active: boolean) => (active ? "text-brand-600" : "text-ink/70");
  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/products", label: "Shop", icon: LayoutGrid },
    { href: "/search", label: "Search", icon: Search },
    { href: "/account", label: "Account", icon: User },
  ];

  return (
    <>
      <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav aria-label="App navigation" className="pb-safe-nav fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur md:hidden">
        <ul className="mx-auto flex max-w-xl">
          {items.slice(0, 3).map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex flex-1">
              <Link href={href} aria-current={on(href) ? "page" : undefined} className={`${tab} ${color(on(href))}`}>
                <Icon className="h-[22px] w-[22px]" strokeWidth={on(href) ? 2.2 : 1.7} aria-hidden />
                {label}
                {on(href) && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand-500" />}
              </Link>
            </li>
          ))}
          <li className="flex flex-1">
            <button type="button" onClick={() => uiActions.openCart()} aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`} className={`${tab} text-ink/70`}>
              <span className="relative">
                <ShoppingCart className="h-[22px] w-[22px]" strokeWidth={1.7} aria-hidden />
                {count > 0 && <span className="absolute -right-2.5 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-semibold text-on-brand">{count}</span>}
              </span>
              Cart
            </button>
          </li>
          {items.slice(3).map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex flex-1">
              <Link href={href} aria-current={on(href) ? "page" : undefined} className={`${tab} ${color(on(href))}`}>
                <Icon className="h-[22px] w-[22px]" strokeWidth={on(href) ? 2.2 : 1.7} aria-hidden />
                {label}
                {on(href) && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand-500" />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
