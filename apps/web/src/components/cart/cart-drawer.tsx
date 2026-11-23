"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { Drawer } from "@/components/ui/overlay";
import { lineKey, MAX_LINE_QTY } from "@/lib/utils/cart-math";
import { addMoney, formatLkr, multiplyMoney } from "@/lib/utils/money";
import { cartActions, useCart } from "@/store/cart";
import { uiActions, useUi } from "@/store/ui";
import { useCheckoutInfo, useLiveCart } from "./use-live-cart";

/** Slide-in cart. Reads the same browser cart and live availability check as the cart page; it holds no cart state of its own. */
export function CartDrawer() {
  const { cartOpen } = useUi();
  return (
    <Drawer open={cartOpen} label="Shopping cart" side="right" wide onClose={uiActions.closeCart}>
      <CartDrawerBody />
    </Drawer>
  );
}

function CartDrawerBody() {
  const { lines, subtotal, count } = useCart();
  const { live, failed, priceNotes, retry } = useLiveCart();
  const info = useCheckoutInfo();
  const liveFor = (l: (typeof lines)[number]) => live?.find((d) => d.productId === l.productId && d.variantKey === l.variantKey);
  const blocked = lines.some((l) => liveFor(l)?.available === false) || info?.enabled === false;
  const total = info?.deliveryCharge != null ? addMoney(subtotal, info.deliveryCharge) : null;

  return (
    <>
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-lg font-bold tracking-tight">
          Your cart{count ? <span className="ml-2 text-sm font-medium text-muted">({count})</span> : null}
        </h2>
        <button type="button" className="btn-ghost -mr-2 min-h-11 min-w-11 px-2" aria-label="Close cart" onClick={uiActions.closeCart}>
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>

      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-muted">
            <ShoppingBag className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-base font-semibold">Your cart is empty</p>
          <p className="text-sm text-muted">Add products and they will appear here.</p>
          <Link href="/products" onClick={uiActions.closeCart} className="btn-primary mt-2">Continue shopping</Link>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5">
            {failed && (
              <p role="alert" className="mt-4 rounded-lg bg-warn-bg p-3 text-sm text-warn">
                We could not confirm current prices and availability. They are checked again at checkout.{" "}
                <button type="button" className="font-semibold underline" onClick={retry}>Try again</button>
              </p>
            )}
            {info?.enabled === false && (
              <p role="alert" className="mt-4 rounded-lg bg-warn-bg p-3 text-sm text-warn">Online ordering is paused right now. Your cart is saved.</p>
            )}
            <ul className="divide-y divide-border">
              {lines.map((l) => {
                const key = lineKey(l);
                const d = liveFor(l);
                const max = d?.maxQuantity ?? null;
                const note = priceNotes[key];
                return (
                  <li key={key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-4" data-testid="drawer-line">
                    <Link href={`/products/${l.slug}`} onClick={uiActions.closeCart} className="relative h-[4.5rem] w-[4.5rem] overflow-hidden rounded-xl bg-surface" aria-label={`View ${l.name}`}>
                      {l.image ? <Image src={l.image} alt="" fill sizes="72px" className="object-contain p-1.5" /> : null}
                    </Link>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/products/${l.slug}`} onClick={uiActions.closeCart} className="line-clamp-2 text-sm font-semibold leading-5 hover:underline">{l.name}</Link>
                        <button type="button" className="-mr-3 -mt-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-danger" aria-label={`Remove ${l.name}`} onClick={() => cartActions.remove(key)}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      {l.variantLabel && <p className="text-xs text-muted">{l.variantLabel}</p>}
                      {note && <p className="mt-1 text-xs font-medium text-warn">Price updated from {formatLkr(note.from)} to {formatLkr(note.to)}.</p>}
                      {d && !d.available && (
                        <p className="mt-1 text-xs font-medium text-danger">
                          {max && max > 0 ? (
                            <>Only {max} available. <button type="button" className="underline" onClick={() => cartActions.setQuantity(key, max)}>Change to {max}</button></>
                          ) : (
                            <>Out of stock. <button type="button" className="underline" onClick={() => cartActions.remove(key)}>Remove</button></>
                          )}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <div className="flex items-center rounded-lg border border-border" role="group" aria-label={`Quantity for ${l.name}`}>
                          <button type="button" className="flex h-11 w-10 items-center justify-center rounded-l-lg hover:bg-surface disabled:opacity-40" aria-label={`Decrease quantity of ${l.name}`} disabled={l.quantity <= 1} onClick={() => cartActions.setQuantity(key, l.quantity - 1)}>
                            <Minus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                          <button type="button" className="flex h-11 w-10 items-center justify-center rounded-r-lg hover:bg-surface disabled:opacity-40" aria-label={`Increase quantity of ${l.name}`} disabled={l.quantity >= MAX_LINE_QTY || (max != null && l.quantity >= max)} onClick={() => cartActions.setQuantity(key, l.quantity + 1)}>
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                        <p className="whitespace-nowrap text-sm font-bold tabular-nums">{formatLkr(multiplyMoney(l.unitPrice, l.quantity))}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <footer className="pb-safe-lg border-t border-border bg-bg px-5 pt-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="font-semibold tabular-nums" data-testid="drawer-subtotal">{formatLkr(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{info?.deliveryCharge != null ? formatLkr(info.deliveryCharge) : "Calculated at checkout"}</dd></div>
              {total != null && (
                <div className="flex justify-between border-t border-border pt-2 text-base"><dt className="font-semibold">Total</dt><dd className="font-extrabold tabular-nums">{formatLkr(total)}</dd></div>
              )}
            </dl>
            <p className="mt-2 text-xs text-muted">Cash on delivery. Prices and stock are confirmed again when you order.</p>
            <Link href="/checkout" onClick={uiActions.closeCart} className={`btn-primary mt-4 w-full ${blocked ? "pointer-events-none opacity-50" : ""}`} aria-disabled={blocked} tabIndex={blocked ? -1 : undefined}>
              Checkout
            </Link>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link href="/cart" onClick={uiActions.closeCart} className="btn-secondary">View cart</Link>
              <button type="button" className="btn-secondary" onClick={uiActions.closeCart}>Continue shopping</button>
            </div>
          </footer>
        </>
      )}
    </>
  );
}
