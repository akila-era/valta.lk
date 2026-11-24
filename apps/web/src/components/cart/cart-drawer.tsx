"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, ShoppingBag, ShoppingCart, Trash2, Truck, X } from "lucide-react";
import { useDialogLifecycle } from "@/components/ui/overlay";
import { lineKey, MAX_LINE_QTY } from "@/lib/utils/cart-math";
import { addMoney, formatLkr, multiplyMoney } from "@/lib/utils/money";
import { cartActions, useCart } from "@/store/cart";
import { cartDrawer, useCartDrawerPath } from "@/store/cart-drawer";

/**
 * The cart as a side drawer, opened from the header cart and the phone tab bar without leaving the page: the lines
 * with quantity and remove, the subtotal, the ERP delivery charge, and the way on to checkout or the full cart page.
 * Prices shown are the last ones seen in this browser; checkout confirms them live (said in the footer).
 */
export function CartDrawer({ deliveryCharge, cod }: { deliveryCharge: number | null; cod: boolean }) {
  const pathname = usePathname();
  const openPath = useCartDrawerPath();
  const open = openPath !== null && openPath === pathname;
  const { lines, count, subtotal } = useCart();
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => cartDrawer.close(), []);
  useDialogLifecycle(open, close, panel);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="presentation">
      <button type="button" tabIndex={-1} aria-label="Close cart" onClick={close} className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-black/50 backdrop-blur-xs" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-md animate-[slide-in-right_0.28s_cubic-bezier(0.2,0.7,0.2,1)] flex-col border-l-[3px] border-brand-500 bg-bg text-ink"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand-500 text-on-brand shadow-neon">
            <ShoppingBag className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="cart-drawer-title" className="font-display text-lg font-extrabold leading-tight">Your Shopping Bag</h2>
            <p className="text-xs text-muted">{count} {count === 1 ? "item" : "items"} selected</p>
          </div>
          <button type="button" onClick={close} aria-label="Close cart" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-500 hover:text-on-brand">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Delivery facts from the live ERP settings only */}
        {deliveryCharge != null || cod ? (
          <p className="flex items-center gap-2 border-b border-brand-100 bg-brand-50 px-5 py-2.5 text-xs font-medium text-brand-700">
            <Truck className="h-4 w-4 shrink-0" aria-hidden />
            {[deliveryCharge != null ? `Delivery ${formatLkr(deliveryCharge)}` : null, cod ? "Cash on delivery" : null].filter(Boolean).join(" · ")}
          </p>
        ) : null}

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-500 ring-8 ring-brand-50/50">
              <ShoppingCart className="h-9 w-9" strokeWidth={1.6} aria-hidden />
            </span>
            <p className="mt-5 font-display text-lg font-extrabold">Your bag is empty</p>
            <p className="mt-1.5 max-w-xs text-sm text-muted">Explore our catalogue of smartphones, audio, wearables and accessories.</p>
            <Link href="/products" onClick={close} className="btn-primary mt-6 px-6">Browse products</Link>
          </div>
        ) : (
          <>
            <ul aria-label="Items in your bag" className="flex-1 divide-y divide-border overflow-y-auto overscroll-contain px-5">
              {lines.map((l) => {
                const key = lineKey(l);
                return (
                  <li key={key} className="flex gap-3 py-4">
                    <Link href={`/products/${l.slug}`} onClick={close} tabIndex={-1} aria-hidden className="thumb-stage relative h-20 w-20 shrink-0 overflow-hidden rounded-card">
                      {l.image ? <Image src={l.image} alt="" fill sizes="80px" className="object-contain p-1.5" /> : <ShoppingBag className="absolute inset-0 m-auto h-6 w-6 text-muted" aria-hidden />}
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start gap-2">
                        <Link href={`/products/${l.slug}`} onClick={close} className="line-clamp-2 flex-1 py-0.5 text-sm font-semibold leading-5 hover:text-brand-600">{l.name}</Link>
                        <button type="button" onClick={() => cartActions.remove(key)} aria-label={`Remove ${l.name}`} className="-mr-2 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-red-50 hover:text-danger">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      {l.variantLabel ? <p className="text-xs text-muted">{l.variantLabel}</p> : null}
                      <p className="text-xs text-muted">{formatLkr(l.unitPrice)} each</p>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                        <div className="flex items-center rounded-full border border-border bg-surface" role="group" aria-label={`Quantity of ${l.name}`}>
                          <button
                            type="button"
                            onClick={() => cartActions.setQuantity(key, l.quantity - 1)}
                            disabled={l.quantity <= 1}
                            aria-label={`Decrease quantity of ${l.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-live="polite">{l.quantity}</span>
                          <button
                            type="button"
                            onClick={() => cartActions.setQuantity(key, l.quantity + 1)}
                            disabled={l.quantity >= MAX_LINE_QTY}
                            aria-label={`Increase quantity of ${l.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                        <span className="font-display text-[15px] font-bold tabular-nums text-brand-600">{formatLkr(multiplyMoney(l.unitPrice, l.quantity))}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Totals and actions */}
            <div className="border-t border-border bg-bg px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="font-semibold tabular-nums">{formatLkr(subtotal)}</dd></div>
                {deliveryCharge != null ? (
                  <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="font-semibold tabular-nums">{formatLkr(deliveryCharge)}</dd></div>
                ) : null}
                <div className="flex items-baseline justify-between border-t border-border pt-2">
                  <dt className="font-bold">Total</dt>
                  <dd className="font-display text-xl font-extrabold tabular-nums text-brand-600">{formatLkr(addMoney(subtotal, deliveryCharge ?? 0))}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] leading-4 text-muted">Prices and stock are confirmed live at checkout.</p>
              <div className="mt-4 grid gap-2">
                <Link href="/checkout" onClick={close} className="btn-primary min-h-12 w-full text-[15px]">Checkout</Link>
                <Link href="/cart" onClick={close} className="btn-secondary w-full">View full cart</Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
