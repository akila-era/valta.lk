"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, Package, X } from "lucide-react";
import type { ErpProduct } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";
import { useWishlist, wishlistActions } from "@/store/wishlist";
import { ProductCard } from "./product-card";
import { SuggestedProducts } from "./suggested-products";

/** slug -> live product; null = the catalogue no longer has it; undefined = still loading. */
type Live = Record<string, ErpProduct | null | undefined>;

export function WishlistView() {
  const { items } = useWishlist();
  const [live, setLive] = useState<Live>({});

  // Saved items only remember a name, image and the price last seen. Fetch the current product (price, stock, options)
  // through the same read-only catalogue API the quick view uses, so the cards show live information.
  const slugs = items.map((i) => i.slug).join("|");
  useEffect(() => {
    const ctl = new AbortController();
    for (const slug of slugs ? slugs.split("|") : []) {
      fetch(`/api/store/products?slug=${encodeURIComponent(slug)}`, { signal: ctl.signal })
        .then(async (r) => {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error();
          return ((await r.json()) as { product: ErpProduct }).product;
        })
        .then((product) => setLive((cur) => (slug in cur ? cur : { ...cur, [slug]: product })))
        .catch(() => undefined); // keep the saved snapshot if the live lookup fails
    }
    return () => ctl.abort();
  }, [slugs]);

  if (!items.length) {
    return (
      <>
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface px-6 py-16 text-center">
          <span className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-white text-ink">
            <Heart className="h-7 w-7" strokeWidth={1.5} aria-hidden />
          </span>
          <p className="text-xl font-semibold tracking-tight">Your wishlist is empty</p>
          <p className="max-w-sm text-sm leading-6 text-muted">Tap the heart on any product to save it here.</p>
          <Link href="/products" className="btn-dark mt-3">Browse products</Link>
        </div>
        <SuggestedProducts />
      </>
    );
  }

  return (
    <section aria-label="Saved products">
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-muted" aria-live="polite">{items.length} saved {items.length === 1 ? "product" : "products"}</p>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((i) => {
          const product = live[i.slug];
          return (
            <li key={i.productId}>
              {product ? (
                <ProductCard product={product} />
              ) : product === undefined ? (
                <SavedSnapshot item={i} loading />
              ) : (
                <SavedSnapshot item={i} gone />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Fallback while the live product loads, or when it can no longer be found: the saved name, image and last-seen price. */
function SavedSnapshot({ item, loading, gone }: { item: ReturnType<typeof useWishlist>["items"][number]; loading?: boolean; gone?: boolean }) {
  return (
    <article className="relative flex h-full flex-col" aria-busy={loading || undefined}>
      <div className="media-square rounded-2xl">
        {item.image ? <Image src={item.image} alt="" fill sizes="(min-width:1024px) 22vw, 46vw" className={`object-contain p-6 ${gone ? "opacity-50 grayscale" : ""}`} /> : <Package className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-muted" aria-hidden />}
        <button type="button" onClick={() => wishlistActions.remove(item.productId)} className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center text-ink" aria-label={`Remove ${item.name} from wishlist`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-card hover:bg-white"><X className="h-4 w-4" aria-hidden /></span>
        </button>
      </div>
      <div className="px-0.5 pt-3.5">
        {gone ? (
          <p className="text-sm font-semibold text-muted">{item.name}</p>
        ) : (
          <Link href={`/products/${item.slug}`} className="type-product hover:text-brand-600">{item.name}</Link>
        )}
        <p className="mt-1 text-sm text-muted">{gone ? "No longer available in the catalogue." : `Last seen at ${formatLkr(item.price)}`}</p>
      </div>
    </article>
  );
}
