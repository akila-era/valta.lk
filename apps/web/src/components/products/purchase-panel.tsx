"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { effectivePrice, quantityCap, variantChoiceRequired } from "@/lib/erp/product-utils";
import { cartActions } from "@/store/cart";
import { MAX_LINE_QTY } from "@/lib/utils/cart-math";
import { formatLkr } from "@/lib/utils/money";
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

export function PurchasePanel({ product, offerNames = {}, deliveryCharge, cod = false }: { product: PanelProduct; offerNames?: Record<string, string>; deliveryCharge?: number; cod?: boolean }) {
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
    const main = document.getElementById("main");
    if (!main) return;
    const narrow = window.matchMedia("(max-width: 1023px)").matches;
    main.style.paddingBottom = showBar && narrow ? "4.5rem" : "";
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

  function add() {
    if (lock.current || !purchasable || (mustChoose && !variant)) return false;
    lock.current = true;
    cartActions.add({
      productId: product.id,
      variantKey,
      slug: product.slug,
      name: product.name,
      sku: variant?.sku ?? product.sku,
      variantLabel: variant?.label,
      image: product.image,
      unitPrice: unit,
      quantity: qty,
    });
    setAdded(true);
    window.setTimeout(() => {
      lock.current = false;
      setAdded(false);
    }, 2000);
    return true;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <Price price={price} salePrice={salePrice} large offerName={offerNames[variantKey] ?? offerNames[""]} />
        <WishlistButton className="shrink-0" item={{ productId: product.id, slug: product.slug, name: product.name, image: product.image, price: unit }} />
      </div>
      {sku ? <p className="text-sm text-muted">SKU: {sku}</p> : null}

      {product.variants.length > 0 && (
        <fieldset>
          <legend className="label">Options</legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <label
                key={v.key}
                className={`flex min-h-11 cursor-pointer items-center rounded-lg border px-4 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-600 ${
                  v.key === variantKey ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-border bg-bg"
                } ${v.available ? "" : "cursor-not-allowed opacity-50"}`}
              >
                <input type="radio" name="variant" value={v.key} checked={v.key === variantKey} disabled={!v.available} onChange={() => choose(v.key)} className="sr-only" />
                {v.label}
                {!v.available && <span className="ml-2 text-xs">(unavailable)</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <p className={`text-sm font-medium ${purchasable ? "text-success" : mustChoose && !variant ? "text-ink" : "text-danger"}`} data-testid="availability">
        {mustChoose && !variant ? "Select an option to continue" : purchasable ? "Available" : "Out of stock"}
      </p>
      {purchasable && stock > 0 && stock < MAX_LINE_QTY && (
        <p className="text-sm text-muted">Only {stock} available.</p>
      )}

      <div ref={actionsRef} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex w-fit items-center rounded-lg border border-border bg-bg" role="group" aria-label="Quantity">
          <button type="button" className="btn-ghost px-3" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span className="w-10 text-center text-sm font-semibold" aria-live="polite" data-testid="qty">{qty}</span>
          <button type="button" className="btn-ghost px-3" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-1 gap-3">
          <button type="button" className="btn-primary min-w-0 flex-1 whitespace-nowrap sm:min-w-44 sm:flex-none" disabled={!purchasable || added} onClick={add}>
            {added ? <><Check className="h-4 w-4" aria-hidden /> Added to cart</> : "Add to cart"}
          </button>
          <button
            type="button"
            className="btn-dark min-w-0 flex-1 whitespace-nowrap sm:min-w-40 sm:flex-none"
            disabled={!purchasable || added}
            onClick={() => {
              if (add()) router.push("/checkout");
            }}
          >
            Buy now
          </button>
        </div>
      </div>
      <ul className="space-y-1 text-xs text-muted">
        <li>Stock is confirmed again when you place your order.</li>
        {deliveryCharge != null ? <li>Delivery {formatLkr(deliveryCharge)}. <Link href="/shipping-policy" className="font-semibold text-ink underline">Shipping policy</Link></li> : null}
        {cod ? <li>Cash on delivery.</li> : null}
        <li><Link href="/returns-policy" className="font-semibold text-ink underline">Returns policy</Link></li>
      </ul>
      {showBar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 p-3 shadow-overlay backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-base font-extrabold text-brand-600 tabular-nums">{formatLkr(unit)}</p>
            <button type="button" className="btn-primary shrink-0" disabled={!purchasable || added} aria-label={added ? `${product.name} added to cart` : `Add ${product.name} to cart`} onClick={add}>
              {added ? "Added" : "Add to cart"}
            </button>
          </div>
        </div>
      ) : null}

      <div role="status" aria-live="polite" className="min-h-5 text-sm">
        {added && (
          <Link href="/cart" className="font-semibold text-brand-600 underline">
            View cart
          </Link>
        )}
      </div>
    </div>
  );
}
