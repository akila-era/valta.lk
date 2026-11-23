"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { discountPercent } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { uiActions, useUi } from "@/store/ui";
import { Gallery } from "./gallery";
import { PurchasePanel } from "./purchase-panel";
import { VariantChoice } from "./variant-choice";

type State = { slug: string; status: "loading" } | { slug: string; status: "error" } | { slug: string; status: "ready"; product: ErpProduct };

/** Reusable quick-view modal. Loads the product from the existing products API and reuses PurchasePanel for variant, stock and quantity rules. */
export function QuickViewHost() {
  const { quickView } = useUi();
  return (
    <Modal open={Boolean(quickView)} label="Product quick view" onClose={uiActions.closeQuickView}>
      {quickView ? <QuickViewBody key={quickView} slug={quickView} /> : null}
    </Modal>
  );
}

function QuickViewBody({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ slug, status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/store/products?slug=${encodeURIComponent(slug)}`, { signal: ctl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = (await r.json()) as { product: ErpProduct };
        setState({ slug, status: "ready", product: data.product });
      })
      .catch((e) => e?.name !== "AbortError" && setState({ slug, status: "error" }));
    return () => ctl.abort();
  }, [slug, attempt]);

  return (
    <div>
      <button type="button" className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-bg/90 text-ink shadow-card hover:bg-surface" aria-label="Close quick view" onClick={uiActions.closeQuickView}>
        <X className="h-5 w-5" aria-hidden />
      </button>
      {state.status === "loading" && (
        <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-8" role="status" aria-label="Loading product">
          <div className="aspect-square animate-pulse rounded-2xl bg-surface" />
          <div className="space-y-4">
            <div className="h-4 w-24 animate-pulse rounded bg-surface" />
            <div className="h-8 w-3/4 animate-pulse rounded bg-surface" />
            <div className="h-10 w-1/2 animate-pulse rounded bg-surface" />
            <div className="h-12 animate-pulse rounded-lg bg-surface" />
          </div>
        </div>
      )}
      {state.status === "error" && (
        <div className="p-10 text-center" role="alert">
          <p className="font-semibold">We could not load this product.</p>
          <div className="mt-4 flex justify-center gap-3">
            <button type="button" className="btn-secondary" onClick={() => { setState({ slug, status: "loading" }); setAttempt((n) => n + 1); }}>Try again</button>
            <Link href={`/products/${slug}`} onClick={uiActions.closeQuickView} className="btn-primary">Open product page</Link>
          </div>
        </div>
      )}
      {state.status === "ready" && <QuickViewProduct product={state.product} />}
    </div>
  );
}

function QuickViewProduct({ product }: { product: ErpProduct }) {
  const title = product.content?.displayTitle || product.name;
  const pct = discountPercent(product);
  const only = product.variants.length === 1 ? product.variants[0].key : "";
  return (
    <div className="grid gap-6 p-5 sm:grid-cols-2 sm:gap-8 sm:p-8">
      <div className="relative">
        <Gallery images={product.images} alt={title} />
        {pct ? <span className="absolute left-3 top-3 rounded-md bg-ink px-2 py-1 text-[11px] font-bold leading-none text-white">-{pct}%</span> : null}
      </div>
      <div className="flex min-w-0 flex-col">
        {product.brand ? <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{product.brand}</p> : null}
        <h2 className="mt-1 text-2xl font-bold leading-tight tracking-tight">{title}</h2>
        <div className="mt-5">
          <VariantChoice initial={only}>
            <PurchasePanel
              compact
              onAdded={uiActions.openCart}
              product={{
                id: product.id,
                slug: product.slug,
                name: product.name, // the ERP name goes to the cart and the order, never the display title
                sku: product.sku,
                image: product.images[0],
                price: product.price,
                salePrice: product.salePrice,
                available: product.available,
                purchasableQuantity: product.purchasableQuantity,
                variants: product.variants,
              }}
            />
          </VariantChoice>
        </div>
        <Link href={`/products/${product.slug}`} onClick={uiActions.closeQuickView} className="mt-5 text-sm font-semibold text-brand-600 underline underline-offset-4 hover:text-brand-700">
          View full product details
        </Link>
      </div>
    </div>
  );
}
