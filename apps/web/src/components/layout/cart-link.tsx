"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { formatLkr } from "@/lib/utils/money";
import { useCart } from "@/store/cart";
import { openCartFromClick } from "@/store/cart-drawer";

/** Header cart: opens the cart drawer on the same page; a new-tab click still opens the full cart page. */
export function CartLink() {
  const { count, subtotal } = useCart();
  const pathname = usePathname();
  return (
    <Link
      href="/cart"
      aria-haspopup="dialog"
      onClick={(e) => openCartFromClick(e, pathname)}
      className="group inline-flex min-h-11 items-center gap-2.5 rounded-control px-2 transition-colors hover:text-brand-600"
    >
      <span className="relative">
        <ShoppingCart className="h-[26px] w-[26px]" strokeWidth={1.6} aria-hidden />
        {count > 0 && (
          <span key={count} aria-hidden className="absolute -right-2.5 -top-2.5 flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-brand-500 px-1 text-xs font-bold text-on-brand" data-testid="cart-count">
            {count}
          </span>
        )}
      </span>
      {/* The link is named by its own text ("Cart LKR 14,900, 1 item"), so what is read matches what is seen. */}
      <span className="sr-only leading-tight tabular-nums sm:not-sr-only">
        <span className="block text-[11px] text-muted">Cart</span>{" "}
        <span className="block text-sm font-bold">{formatLkr(subtotal)}</span>
      </span>
      <span className="sr-only">{`, ${count} item${count === 1 ? "" : "s"}`}</span>
    </Link>
  );
}
