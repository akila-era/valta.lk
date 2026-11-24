"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Smartphone, Trash2, X } from "lucide-react";
import { AccessoryRail } from "@/components/products/accessory-rail";
import { SaleNote } from "@/components/products/price";
import { SuggestedProducts } from "@/components/products/suggested-products";
import { Dialog } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/states";
import { lineKey, MAX_LINE_QTY } from "@/lib/utils/cart-math";
import { addMoney, formatLkr, fromCents, multiplyMoney, toCents } from "@/lib/utils/money";
import { cartActions, useCart } from "@/store/cart";

interface LiveLine {
  productId: string;
  variantKey: string;
  available: boolean;
  unitPrice: number | null;
  listPrice: number | null;
  offerName: string | null;
  maxQuantity: number | null;
}

interface CheckoutInfo {
  enabled: boolean;
  deliveryCharge: number | null;
}

/**
 * Fetches live availability/prices from the server (which asks the ERP) so the cart reflects ERP state, never only stale
 * local data. Price changes are applied to the cart and remembered as notices so the customer sees what changed.
 */
export function useLiveCart() {
  const { lines } = useCart();
  const [live, setLive] = useState<LiveLine[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [priceNotes, setPriceNotes] = useState<Record<string, { from: number; to: number }>>({});
  const [attempt, setAttempt] = useState(0);
  const signature = lines.map((l) => `${lineKey(l)}x${l.quantity}`).join("|");
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines; // read inside the fetch callback; effects run in order, so this is current when it fires
  });

  useEffect(() => {
    if (!lines.length) return;
    const ctl = new AbortController();
    fetch("/api/store/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: lines.map((l) => ({ productId: l.productId, variantKey: l.variantKey, quantity: l.quantity })) }),
      signal: ctl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = (await r.json()) as { lines: LiveLine[] };
        setLive(data.lines);
        setFailed(false);
        const current = linesRef.current;
        const changed = data.lines.filter((d) => d.unitPrice != null).map((d) => ({ productId: d.productId, variantKey: d.variantKey, unitPrice: d.unitPrice as number }));
        const notes: Record<string, { from: number; to: number }> = {};
        for (const c of changed) {
          const l = current.find((x) => x.productId === c.productId && x.variantKey === c.variantKey);
          if (l && l.unitPrice !== c.unitPrice) notes[lineKey(l)] = { from: l.unitPrice, to: c.unitPrice };
        }
        if (Object.keys(notes).length) {
          setPriceNotes((p) => ({ ...p, ...notes }));
          cartActions.applyPrices(changed);
        }
      })
      .catch((e) => e?.name !== "AbortError" && setFailed(true));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, attempt]);

  return { live, failed, priceNotes, retry: () => setAttempt((n) => n + 1) };
}

/** Delivery charge and whether ordering is possible right now (both come from the ERP through the server). */
function useCheckoutInfo(): CheckoutInfo | null {
  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/store/settings", { signal: ctl.signal })
      .then((r) => r.json())
      .then((d) => setInfo({ enabled: Boolean(d.enabled), deliveryCharge: typeof d.deliveryCharge === "number" ? d.deliveryCharge : null }))
      .catch(() => undefined);
    return () => ctl.abort();
  }, []);
  return info;
}

export function CartView() {
  const { lines, subtotal } = useCart();
  const { live, failed, priceNotes, retry } = useLiveCart();
  const info = useCheckoutInfo();
  const summaryRef = useRef<HTMLElement>(null);
  const [dockSummary, setDockSummary] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const closeConfirm = useCallback(() => setConfirmClear(false), []);

  useEffect(() => {
    const el = summaryRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setDockSummary(!entry.isIntersecting), { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [lines.length]);

  useEffect(() => {
    // Pad the whole page (not just <main>) so the footer and back-to-top button stay reachable above the fixed bar.
    const main = document.body;
    if (!main) return;
    const narrow = window.matchMedia("(max-width: 1023px)").matches;
    main.style.paddingBottom = dockSummary && narrow && lines.length ? "6.5rem" : "";
    return () => {
      main.style.paddingBottom = "";
    };
  }, [dockSummary, lines.length]);

  if (!lines.length) {
    return (
      <>
        <EmptyState title="Your cart is empty" action={{ href: "/products", label: "Continue shopping" }}>
          Add products to your cart and they will appear here.
        </EmptyState>
        <SuggestedProducts />
      </>
    );
  }

  const liveFor = (l: (typeof lines)[number]) => live?.find((d) => d.productId === l.productId && d.variantKey === l.variantKey);
  const problems = lines.filter((l) => liveFor(l)?.available === false);
  const savings = lines.reduce((sum, l) => {
    const list = liveFor(l)?.listPrice;
    if (list == null || list <= l.unitPrice) return sum;
    return sum + (toCents(list) - toCents(l.unitPrice)) * l.quantity;
  }, 0);
  const total = info?.deliveryCharge != null ? addMoney(subtotal, info.deliveryCharge) : null;
  const blocked = problems.length > 0 || info?.enabled === false;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
      <div>
        {live === null && !failed && (
          <p role="status" className="mb-4 text-sm text-muted">Checking current prices and availability.</p>
        )}
        {failed && (
          <p role="alert" className="mb-4 rounded-lg bg-warn-bg p-3 text-sm text-warn">
            We could not confirm current prices and availability. They will be checked again at checkout.{" "}
            <button type="button" className="font-semibold underline" onClick={retry}>Try again</button>
          </p>
        )}
        {problems.length > 0 && (
          <p role="alert" className="mb-4 rounded-lg bg-danger-bg p-3 text-sm text-danger">
            Some items are unavailable in the quantity requested. Please update or remove them before checking out.
          </p>
        )}
        {info?.enabled === false && (
          <p role="alert" className="mb-4 rounded-lg bg-warn-bg p-3 text-sm text-warn">
            Online ordering is not available right now, so checkout is paused. Your cart is saved.
          </p>
        )}

        {/* As on ugreen.lk: a plain table (✕, photo, product, price, quantity, subtotal) with a header row on wider screens. */}
        <div className="hidden grid-cols-[2rem_4.5rem_minmax(0,1fr)_7rem_7.5rem_8rem] items-center gap-x-4 border-b border-border pb-3 text-[13px] font-semibold uppercase tracking-[0.03em] text-ink sm:grid" aria-hidden>
          <span />
          <span />
          <span>Product</span>
          <span>Price</span>
          <span>Quantity</span>
          <span className="text-right">Subtotal</span>
        </div>
        <ul className="divide-y divide-border border-b border-border">
          {lines.map((l) => {
            const key = lineKey(l);
            const d = liveFor(l);
            const note = priceNotes[key];
            const max = d?.maxQuantity ?? null;
            return (
              <li key={key} className="grid grid-cols-[2rem_4.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 py-4 sm:grid-cols-[2rem_4.5rem_minmax(0,1fr)_7rem_7.5rem_8rem]" data-testid="cart-line">
                <button type="button" className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:text-danger" aria-label={`Remove ${l.name}`} onClick={() => cartActions.remove(key)}>
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <Link href={`/products/${l.slug}`} className="relative h-[4.5rem] w-[4.5rem] overflow-hidden" aria-label={`View ${l.name}`}>
                  {l.image ? <Image src={l.image} alt="" fill sizes="72px" className="object-contain" /> : <Smartphone className="m-auto h-full w-8 text-muted" aria-hidden />}
                </Link>
                <div className="min-w-0">
                  <Link href={`/products/${l.slug}`} className="py-1 text-[15px] font-semibold leading-snug text-ink hover:text-brand-600">{l.name}</Link>
                  {l.variantLabel && <p className="text-xs font-semibold text-muted">{l.variantLabel}</p>}
                  {l.sku && <p className="text-[13px] text-muted"><span className="font-semibold text-ink">SKU:</span> <span data-testid="line-sku">{l.sku}</span></p>}
                  <p className="text-sm text-muted sm:hidden">{formatLkr(l.unitPrice)} each</p>
                  <SaleNote listPrice={d?.listPrice} unitPrice={l.unitPrice} offerName={d?.offerName} />
                  {note && (
                    <p className="mt-1 text-xs font-medium text-warn" data-testid="price-note">
                      Price updated from {formatLkr(note.from)} to {formatLkr(note.to)}.
                    </p>
                  )}
                  {d && !d.available && (
                    <p className="mt-1 text-xs font-semibold text-danger" data-testid="stock-note">
                      {max && max > 0 ? (
                        <>
                          Only {max} available.{" "}
                          <button type="button" className="underline font-bold" onClick={() => cartActions.setQuantity(key, max)}>Change to {max}</button>
                        </>
                      ) : (
                        <>
                          Out of stock.{" "}
                          <button type="button" className="underline font-bold" onClick={() => cartActions.remove(key)}>Remove</button>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <p className="hidden text-sm text-muted tabular-nums sm:block">{formatLkr(l.unitPrice)}</p>
                <div className="col-start-3 flex items-center justify-between gap-3 sm:col-start-auto sm:contents">
                  <div className="flex h-9 w-fit items-center rounded-control border border-border" role="group" aria-label={`Quantity for ${l.name}`}>
                    <button type="button" className="flex h-full w-8 items-center justify-center text-ink transition-colors hover:bg-surface" aria-label={`Decrease quantity of ${l.name}`} disabled={l.quantity <= 1} onClick={() => cartActions.setQuantity(key, l.quantity - 1)}>
                      <Minus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span className="flex h-full w-9 items-center justify-center border-x border-border text-sm tabular-nums" data-testid="line-qty">{l.quantity}</span>
                    <button type="button" className="flex h-full w-8 items-center justify-center text-ink transition-colors hover:bg-surface" aria-label={`Increase quantity of ${l.name}`} disabled={l.quantity >= MAX_LINE_QTY || (max != null && l.quantity >= max)} onClick={() => cartActions.setQuantity(key, l.quantity + 1)}>
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <p className="text-right text-lg font-bold tabular-nums text-brand-500">
                    <span className="sr-only">Line total </span>
                    {formatLkr(multiplyMoney(l.unitPrice, l.quantity))}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn-text mt-4 text-muted hover:text-danger" onClick={() => setConfirmClear(true)}>
          <Trash2 className="h-4 w-4" aria-hidden /> Clear cart
        </button>
        <Dialog open={confirmClear} title="Remove all items?" onClose={closeConfirm}>
          <p className="text-muted">
            {lines.length === 1 ? "This removes the item from your cart. You can add it again later." : `This removes all ${lines.length} items from your cart. You can add them again later.`}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={closeConfirm}>Keep my cart</button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                cartActions.clear();
                setConfirmClear(false);
              }}
            >
              Remove all
            </button>
          </div>
        </Dialog>
        <AccessoryRail productIds={lines.map((l) => l.productId)} selections={lines.map((l) => ({ productId: l.productId, variantKey: l.variantKey }))} />
      </div>

      <aside ref={summaryRef} className="h-fit rounded-card border-2 border-border p-5 sm:p-6 lg:sticky lg:top-28 xl:top-32" aria-label="Order summary">
        <h2 className="text-xl font-semibold uppercase tracking-[0.01em] text-ink">Cart totals</h2>
        <dl className="mt-4 divide-y divide-border text-sm [&>div]:py-3.5">
          <div className="flex justify-between"><dt className="font-semibold text-ink">Subtotal</dt><dd data-testid="subtotal" className="text-muted">{formatLkr(subtotal)}</dd></div>
          <div className="flex justify-between">
            <dt className="font-semibold text-ink">Delivery</dt>
            <dd data-testid="delivery" className="text-muted">
              {info?.deliveryCharge != null ? formatLkr(info.deliveryCharge) : "Calculated at checkout"}
            </dd>
          </div>
          {savings > 0 && (
            <div className="flex justify-between font-semibold text-success">
              <dt>Catalogue savings</dt>
              <dd>{formatLkr(fromCents(savings))}</dd>
            </div>
          )}
          {[...new Set(lines.map((l) => liveFor(l)?.offerName).filter((name): name is string => Boolean(name)))].map((name) => (
            <div key={name} className="text-xs text-muted">{name}</div>
          ))}
          <div className="flex items-baseline justify-between text-base">
            <dt className="font-bold text-ink">{total != null ? "Total" : "Total before delivery"}</dt>
            <dd className="text-2xl font-bold tabular-nums text-brand-500" data-testid="total">{formatLkr(total ?? subtotal)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">Payment is cash on delivery. Prices and stock are confirmed live with our ERP.</p>
        <Link href="/checkout" className={`btn-primary mt-5 min-h-12 w-full rounded-control text-[13px] font-bold uppercase tracking-[0.04em] ${blocked ? "pointer-events-none opacity-50" : ""}`} aria-disabled={blocked} tabIndex={blocked ? -1 : undefined}>
          Proceed to Checkout
        </Link>
        <Link href="/products" className="mt-3 block py-1 text-center text-sm font-semibold text-muted hover:text-ink">
          Continue Shopping
        </Link>
      </aside>
      {dockSummary && (
        <div className="fixed inset-x-0 bottom-16 z-40 border-t md:bottom-0 border-border bg-bg/95 p-3 shadow-overlay backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <p className="min-w-0 flex-1">
              <span className="block text-xs text-muted">{total != null ? "Total" : "Total before delivery"}</span>
              <span className="font-display text-lg font-bold tracking-[-0.02em] tabular-nums text-ink">{formatLkr(total ?? subtotal)}</span>
            </p>
            <Link href="/checkout" className={`btn-primary shrink-0 ${blocked ? "pointer-events-none opacity-50" : ""}`} aria-disabled={blocked} aria-label="Checkout" tabIndex={blocked ? -1 : undefined}>
              Checkout
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
