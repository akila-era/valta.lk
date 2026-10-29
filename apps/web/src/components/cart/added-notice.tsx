"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Check, ShoppingBag, X } from "lucide-react";
import { formatLkr } from "@/lib/utils/money";
import { addedNotice, useAddedNotice } from "@/store/added-notice";
import { cartDrawer } from "@/store/cart-drawer";
import { useCart } from "@/store/cart";

/** How long the notice stays before it closes by itself. */
const SHOW_MS = 4500;

/**
 * Small "Added to cart" card under the header after any Add to cart: the product photo, name and price, the cart
 * count and total, and the way on (view the cart drawer, or straight to checkout). It does not cover the page or
 * take focus, so shoppers can keep adding; it closes by itself, with ×, or on the next page.
 */
export function AddedNotice() {
  const notice = useAddedNotice();
  const pathname = usePathname();
  const { count, subtotal } = useCart();

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(addedNotice.hide, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => addedNotice.hide(), [pathname]);

  if (!notice) return null;
  const { item } = notice;
  return (
    <div
      key={notice.n}
      role="status"
      aria-live="polite"
      className="fixed right-3 top-[calc(var(--hdr-sticky,7rem)+0.75rem)] z-50 w-[min(100%-1.5rem,22rem)] animate-[added-in_0.3s_cubic-bezier(0.2,0.7,0.2,1)] overflow-hidden rounded-card border border-border bg-bg text-ink shadow-overlay sm:right-5"
    >
      <div className="flex items-center gap-2 bg-ink px-4 py-2 text-[13px] font-bold text-white">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500">
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        </span>
        Added to cart
        <button type="button" onClick={addedNotice.hide} aria-label="Close" className="-mr-2 ml-auto flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex gap-3 p-4">
        <span className="thumb-stage relative h-16 w-16 shrink-0 overflow-hidden rounded-control">
          {item.image ? <Image src={item.image} alt="" fill sizes="64px" className="object-contain p-1" /> : <ShoppingBag className="absolute inset-0 m-auto h-6 w-6 text-muted" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-5">{item.name}</p>
          {item.variantLabel ? <p className="text-xs text-muted">{item.variantLabel}</p> : null}
          <p className="mt-0.5 text-sm font-bold tabular-nums text-brand-600">
            {item.quantity > 1 ? `${item.quantity} × ` : ""}
            {formatLkr(item.unitPrice)}
          </p>
        </div>
      </div>
      <p className="border-t border-border px-4 py-2 text-xs text-muted">
        Your cart: <span className="font-semibold text-ink">{count} {count === 1 ? "item" : "items"}</span> · <span className="font-semibold tabular-nums text-ink">{formatLkr(subtotal)}</span>
      </p>
      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        <button
          type="button"
          className="btn-secondary min-h-10 text-[13px]"
          onClick={() => {
            addedNotice.hide();
            cartDrawer.open(pathname);
          }}
        >
          View cart
        </button>
        <Link href="/checkout" onClick={addedNotice.hide} className="btn-primary min-h-10 text-[13px]">
          Checkout
        </Link>
      </div>
    </div>
  );
}
