"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Smartphone, Trash2 } from "lucide-react";
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
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
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

        <ul className="divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/80 bg-white shadow-soft">
          {lines.map((l) => {
            const key = lineKey(l);
            const d = liveFor(l);
            const note = priceNotes[key];
            const max = d?.maxQuantity ?? null;
            return (
              <li key={key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center sm:p-5" data-testid="cart-line">
                <Link href={`/products/${l.slug}`} className="thumb-stage relative h-[4.5rem] w-[4.5rem] overflow-hidden rounded-2xl sm:h-[5.5rem] sm:w-[5.5rem]" aria-label={`View ${l.name}`}>
                  {l.image ? <Image src={l.image} alt="" fill sizes="88px" className="object-contain p-2" /> : <Smartphone className="m-auto h-full w-8 text-muted" aria-hidden />}
                </Link>
                <div className="min-w-0">
                  <Link href={`/products/${l.slug}`} className="type-product font-bold hover:text-brand-600 hover:underline">{l.name}</Link>
                  {l.variantLabel && <p className="text-xs font-semibold text-muted">{l.variantLabel}</p>}
                  {l.sku && <p className="text-xs text-muted/80">SKU: <span data-testid="line-sku">{l.sku}</span></p>}
                  <p className="mt-1 text-sm font-medium text-muted">{formatLkr(l.unitPrice)} each</p>
                  <SaleNote listPrice={d?.listPrice} unitPrice={l.unitPrice} offerName={d?.offerName} />
                  {d?.available && <p className="mt-1 text-xs font-semibold text-success">● In stock</p>}
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
                <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
                  <div className="flex items-center rounded-full border border-border bg-surface/70 p-0.5" role="group" aria-label={`Quantity for ${l.name}`}>
                    <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-white" aria-label={`Decrease quantity of ${l.name}`} disabled={l.quantity <= 1} onClick={() => cartActions.setQuantity(key, l.quantity - 1)}>
                      <Minus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span className="w-8 text-center text-xs font-bold tabular-nums" data-testid="line-qty">{l.quantity}</span>
                    <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-white" aria-label={`Increase quantity of ${l.name}`} disabled={l.quantity >= MAX_LINE_QTY || (max != null && l.quantity >= max)} onClick={() => cartActions.setQuantity(key, l.quantity + 1)}>
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <p className="min-w-[6.5rem] text-right font-display text-base font-extrabold tabular-nums text-ink">
                    <span className="sr-only">Line total </span>
                    {formatLkr(multiplyMoney(l.unitPrice, l.quantity))}
                  </p>
                  <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-red-50 hover:text-danger" aria-label={`Remove ${l.name}`} onClick={() => cartActions.remove(key)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
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

      <aside ref={summaryRef} className="rounded-3xl border border-border/80 bg-white p-6 shadow-soft lg:sticky lg:top-28 xl:top-32 h-fit" aria-label="Order summary">
        <h2 className="text-base font-bold text-ink">Order Summary</h2>
        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd data-testid="subtotal" className="font-semibold text-ink">{formatLkr(subtotal)}</dd></div>
          <div className="flex justify-between text-muted">
            <dt>Delivery</dt>
            <dd data-testid="delivery" className={info?.deliveryCharge == null ? "text-muted" : "font-semibold text-ink"}>
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
          <div className="flex items-baseline justify-between border-t border-border/80 pt-3.5 text-base">
            <dt className="font-bold text-ink">{total != null ? "Total" : "Total before delivery"}</dt>
            <dd className="font-display text-2xl font-black tracking-tight tabular-nums text-ink" data-testid="total">{formatLkr(total ?? subtotal)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">Payment is cash on delivery. Prices and stock are confirmed live with our ERP.</p>
        <Link href="/checkout" className={`btn-primary mt-5 w-full rounded-full py-3 text-sm font-bold shadow-[0_8px_20px_-6px_rgb(255_92_0/0.5)] ${blocked ? "pointer-events-none opacity-50" : ""}`} aria-disabled={blocked} tabIndex={blocked ? -1 : undefined}>
          Proceed to Checkout
        </Link>
        <Link href="/products" className="btn-secondary mt-2.5 w-full rounded-full py-2.5 text-xs font-semibold">
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
