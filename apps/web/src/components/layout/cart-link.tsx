"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { formatLkr } from "@/lib/utils/money";
import { useCart } from "@/store/cart";

export function CartLink() {
  const { count, subtotal } = useCart();
  return (
    <Link
      href="/cart"
      className="group inline-flex min-h-11 items-center gap-3 rounded-lg px-2 transition-colors hover:text-brand-600"
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}${count ? `, ${formatLkr(subtotal)}` : ""}`}
    >
      <span className="relative">
        <ShoppingCart className="h-5 w-5" aria-hidden />
        {count > 0 && (
          <span key={count} className="absolute -right-2.5 -top-2.5 flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-brand-500 px-1 text-xs font-bold text-on-brand" data-testid="cart-count">
            {count}
          </span>
        )}
      </span>
      <span className="hidden text-sm font-semibold tabular-nums sm:block" aria-hidden>Cart{count ? <span className="ml-1.5 font-bold">{formatLkr(subtotal)}</span> : null}</span>
    </Link>
  );
}
