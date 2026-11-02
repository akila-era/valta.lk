"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Check, Clock, Minus, Plus, RefreshCw, ShieldCheck, ShoppingCart, Store, Truck, Wallet, type LucideIcon } from "lucide-react";
import { effectivePrice, quantityCap, variantChoiceRequired } from "@/lib/erp/product-utils";
import { addedNotice } from "@/store/added-notice";
import { cartActions } from "@/store/cart";
import { MAX_LINE_QTY } from "@/lib/utils/cart-math";
import { formatLkr } from "@/lib/utils/money";
import { Icon3D } from "@/components/ui/icon-3d";
import { Price } from "./price";
import { useVariantChoice } from "./variant-choice";
import { WishlistButton } from "./wishlist-button";

export interface PanelProduct {
  id: string;
  slug: string;
  name: string;
  sku?: string;
  image?: string;
  price: number;
  salePrice?: number | null;
  available: boolean;
  purchasableQuantity: number;
  variants: { key: string; label: string; sku?: string; price?: number; salePrice?: number | null; available: boolean; purchasableQuantity: number }[];
}

/** One delivery / payment fact under the buy buttons. Only facts the store really offers are passed in. */
function Assurance({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <li className="group flex items-start gap-3 rounded-2xl border border-border/80 bg-bg p-3 transition-colors duration-200 hover:border-brand-500 hover:bg-brand-50/30">
      <Icon3D icon={Icon} tone="glass" size="sm" />
      <span className="min-w-0">
        <span className="block font-semibold leading-5 text-ink">{title}</span>
        <span className="block text-xs leading-5 text-muted">{children}</span>
      </span>
    </li>
  );
}

/** `warranty`: the product's warranty in a few words (from its content or ERP specs), shown as a trust tile when set. */
export function PurchasePanel({ product, offerNames = {}, deliveryCharge, cod = false, warranty, payments = [], pickup }: { product: PanelProduct; offerNames?: Record<string, string>; deliveryCharge?: number; cod?: boolean; warranty?: string | null; /** Payment badges (Admin, Store details) shown under the price, as on ugreen.lk. */ payments?: string[]; /** Store pickup / delivery time from the product content. */ pickup?: { estimate?: string; pickup?: string; notes?: string } }) {
  const router = useRouter();
  const mustChoose = variantChoiceRequired(product.variants.length);
  const only = product.variants.length === 1 ? product.variants[0].key : "";
  const shared = useVariantChoice();
  const [localKey, setLocalKey] = useState(mustChoose ? "" : only);
  const variantKey = shared?.variantKey ?? localKey;
  const setVariantKey = shared?.setVariantKey ?? setLocalKey;
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [showBar, setShowBar] = useState(false);
  const lock = useRef(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  const variant = product.variants.find((v) => v.key === variantKey);
  const chosen = !mustChoose || Boolean(variant);
  const price = variant?.price ?? product.price;
  const salePrice = variant ? variant.salePrice : product.salePrice;
  const stock = variant ? variant.purchasableQuantity : product.purchasableQuantity;
  const maxQty = quantityCap(stock, MAX_LINE_QTY);
  const purchasable = chosen && product.available && (variant ? variant.available : true);

  const unit = useMemo(() => effectivePrice({ price, salePrice }), [price, salePrice]);
  const sku = variant?.sku ?? product.sku;

  useEffect(() => {
    const el = actionsRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShowBar(!entry.isIntersecting), { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Pad the whole page (not just <main>) so the footer and back-to-top button stay reachable above the fixed bar.
    const main = document.body;
    if (!main) return;
    const narrow = window.matchMedia("(max-width: 1023px)").matches;
    main.style.paddingBottom = showBar && narrow ? "6.5rem" : "";
    return () => {
      main.style.paddingBottom = "";
    };
  }, [showBar]);

  function choose(key: string) {
    setVariantKey(key);
    const next = product.variants.find((v) => v.key === key);
    const cap = quantityCap(next?.purchasableQuantity ?? product.purchasableQuantity, MAX_LINE_QTY);
    setQty((q) => Math.min(q, cap));
    setAdded(false);
  }

  /** `silent`: Buy now goes straight to checkout, so no "Added to cart" notice. */
  function add(silent = false) {
    if (lock.current || !purchasable || (mustChoose && !variant)) return false;
    lock.current = true;
    const line = {
      productId: product.id,
      variantKey,
      slug: product.slug,
      name: product.name,
      sku: variant?.sku ?? product.sku,
      variantLabel: variant?.label,
      image: product.image,
      unitPrice: unit,
      quantity: qty,
    };
    cartActions.add(line);
    if (!silent) addedNotice.show(line);
    setAdded(true);
    window.setTimeout(() => {
      lock.current = false;
      setAdded(false);
    }, 2000);
    return true;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <Price price={price} salePrice={salePrice} large offerName={offerNames[variantKey] ?? offerNames[""]} />
        <WishlistButton className="shrink-0" item={{ productId: product.id, slug: product.slug, name: product.name, image: product.image, price: unit }} />
      </div>
      {payments.length > 0 ? (
        <ul aria-label="Ways to pay" className="flex flex-wrap gap-2">
          {payments.map((name) => (
            <li key={name} className="flex h-8 min-w-14 items-center justify-center rounded-[6px] border border-border bg-bg px-2.5 text-[11px] font-extrabold tracking-wide text-ink">{name}</li>
          ))}
        </ul>
      ) : null}

      {product.variants.length > 0 && (
        <fieldset>
          <legend className="label flex w-full items-baseline justify-between gap-3">
            <span>Options</span>
            {variant ? <span className="text-xs font-normal text-muted">{variant.label}</span> : null}
          </legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <label
                key={v.key}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[border-color,background-color,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-600 ${
                  v.key === variantKey ? "border-brand-500 bg-brand-50 font-semibold text-brand-700 shadow-[0_0_0_1px_var(--color-brand-500)]" : "border-border bg-bg hover:border-ink/30"
                } ${v.available ? "" : "cursor-not-allowed opacity-50 line-through decoration-muted/60"}`}
              >
                <input type="radio" name="variant" value={v.key} checked={v.key === variantKey} disabled={!v.available} onChange={() => choose(v.key)} className="sr-only" />
                {v.key === variantKey ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                {v.label}
                {!v.available && <span className="text-xs no-underline">(unavailable)</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <p
          className={`inline-flex items-center gap-2 font-semibold ${purchasable ? "text-success" : mustChoose && !variant ? "text-ink" : "text-danger"}`}
          data-testid="availability"
        >
          <span aria-hidden className={`h-2 w-2 rounded-full ${purchasable ? "bg-success" : mustChoose && !variant ? "bg-muted" : "bg-danger"}`} />
          {mustChoose && !variant ? "Select an option to continue" : purchasable ? "Available" : "Out of stock"}
        </p>
        {purchasable && stock > 0 && stock < MAX_LINE_QTY && <p className="font-medium text-warn">Only {stock} available.</p>}
        {sku ? <p className="ml-auto text-xs text-muted">SKU: {sku}</p> : null}
      </div>

      <div ref={actionsRef} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex h-12 w-fit items-center rounded-control border border-border bg-white" role="group" aria-label="Quantity">
          <button type="button" className="btn-ghost h-full min-w-10 rounded-none px-2" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span className="w-10 text-center text-base font-semibold tabular-nums" aria-live="polite" data-testid="qty">{qty}</span>
          <button type="button" className="btn-ghost h-full min-w-10 rounded-none px-2" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-1 flex-wrap gap-3">
          <button type="button" className="btn-primary min-h-12 min-w-0 flex-1 basis-[8.5rem] whitespace-nowrap rounded-control px-4 text-[13px] font-bold uppercase tracking-[0.04em] sm:px-6" disabled={!purchasable || added} onClick={() => add()}>
            {added ? <><Check className="h-4 w-4" aria-hidden /> Added to cart</> : <><ShoppingCart className="h-4 w-4" aria-hidden /> Add to cart</>}
          </button>
          <button
            type="button"
            className="btn-dark min-h-12 min-w-0 flex-1 basis-[8.5rem] whitespace-nowrap rounded-control px-4 text-[13px] font-bold uppercase tracking-[0.04em] sm:px-6"
            disabled={!purchasable || added}
            onClick={() => {
              if (add(true)) router.push("/checkout");
            }}
          >
            Buy now
          </button>
        </div>
      </div>
      <div className="rounded-card bg-surface p-4 sm:p-5">
      <p className="mb-2 text-[15px] font-semibold text-ink">Delivery Information</p>
      <ul className="grid gap-2 text-sm sm:grid-cols-2" aria-label="Delivery and payment">
        {pickup?.pickup ? <Assurance icon={Store} title="Store pickup"><span className="whitespace-pre-line">{pickup.pickup}</span></Assurance> : null}
        {pickup?.estimate ? <Assurance icon={Clock} title="Delivery time">{pickup.estimate}{pickup.notes ? <span className="block">{pickup.notes}</span> : null}</Assurance> : null}
        {deliveryCharge != null ? (
          <Assurance icon={Truck} title={`Delivery ${formatLkr(deliveryCharge)}`}>
            <Link href="/shipping-policy" className="inline-block py-1 underline underline-offset-2 hover:text-ink">Shipping policy</Link>
          </Assurance>
        ) : null}
        {cod ? <Assurance icon={Wallet} title="Cash on delivery">Pay when your order arrives</Assurance> : null}
        <Assurance icon={RefreshCw} title="Returns">
          <Link href="/returns-policy" className="inline-block py-1 underline underline-offset-2 hover:text-ink">Returns policy</Link>
        </Assurance>
        {warranty ? (
          <Assurance icon={BadgeCheck} title="Warranty">
            {warranty}
          </Assurance>
        ) : null}
        <Assurance icon={ShieldCheck} title="Stock confirmed">Checked again when you order</Assurance>
      </ul>
      </div>
      {showBar ? (
        <div className="fixed inset-x-0 bottom-16 z-40 border-t md:bottom-0 border-border/80 bg-white/95 p-3 shadow-overlay backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <p className="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-[-0.02em] text-ink tabular-nums">{formatLkr(unit)}</p>
            <button type="button" className="btn-primary rounded-full px-5 py-2.5 text-xs font-semibold shrink-0 shadow-soft" disabled={!purchasable || added} aria-label={added ? `Added: ${product.name} is in your cart` : `Add to cart: ${product.name}`} onClick={() => add()}>
              {added ? "Added" : "Add to cart"}
            </button>
          </div>
        </div>
      ) : null}

      <div role="status" aria-live="polite" className="-mt-2 text-sm">
        {added && (
          <Link href="/cart" className="font-semibold text-brand-600 underline">
            View cart
          </Link>
        )}
      </div>
    </div>
  );
}
