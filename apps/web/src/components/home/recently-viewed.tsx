"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/products/product-card";
import { Skeleton } from "@/components/ui/states";
import type { ErpProduct } from "@/lib/erp/types";
import type { RecentProduct } from "@/lib/recent-products";
import { clearRecent, useRecentIds } from "@/store/recent";
import { SectionIntro } from "./home-sections";

const SHOWN = 4;

/** Turns the endpoint's public fields back into the shape the product card draws. Fields the card never reads stay empty. */
function toCardProduct(r: RecentProduct): ErpProduct {
  return {
    id: r.id,
    slug: r.slug,
    sku: r.sku,
    name: r.name,
    description: "",
    brand: r.brand,
    images: r.image ? [r.image] : [],
    price: r.price,
    salePrice: r.salePrice,
    specs: r.model ? { Model: r.model } : {},
    variants: [],
    hasVariants: r.hasVariants,
    available: r.available,
    purchasableQuantity: r.purchasableQuantity,
    publishedAt: r.publishedAt,
    updatedAt: "",
    // The card only reads the published display title from content.
    content: r.displayTitle ? ({ displayTitle: r.displayTitle } as ErpProduct["content"]) : undefined,
  };
}

/**
 * Products this shopper opened before, read from their own browser and re-fetched live (current price and stock) from a
 * read-only endpoint that returns public fields only. It renders nothing until there is real history, so a first-time
 * visitor never sees an empty or invented shelf. Pass `exclude` (a product ID) on a product page to leave that product out.
 */
export function RecentlyViewed({ exclude }: { exclude?: string } = {}) {
  const all = useRecentIds();
  const ids = useMemo(() => (exclude ? all.filter((s) => s !== exclude) : all), [all, exclude]);
  const key = ids.join(",");
  const [loaded, setLoaded] = useState<{ key: string; products: RecentProduct[] } | null>(null);

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    fetch(`/api/store/recent?ids=${encodeURIComponent(key)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { products?: RecentProduct[] }) => setLoaded({ key, products: d.products ?? [] }))
      .catch((e) => {
        if (e?.name !== "AbortError") setLoaded({ key, products: [] }); // fails quietly: the section simply stays hidden
      });
    return () => ctrl.abort();
  }, [key]);

  if (!key) return null;
  const ready = loaded?.key === key;
  if (ready && loaded.products.length === 0) return null;
  const products = ready ? loaded.products.slice(0, SHOWN) : [];

  return (
    <section aria-labelledby="recent" className="mt-16 sm:mt-24">
      <SectionIntro id="recent" eyebrow="Pick up where you left off" title="Recently viewed">
        Products you opened on this device.{" "}
        <button type="button" onClick={clearRecent} className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 font-semibold text-ink underline underline-offset-4 hover:text-brand-600">
          Clear
        </button>
      </SectionIntro>
      <ul
        aria-label="Recently viewed products"
        aria-busy={!ready}
        className="-mx-4 flex scroll-px-4 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:pb-0"
      >
        {ready
          ? products.map((p) => (
              <li key={p.id} className="w-[46%] shrink-0 snap-start min-[430px]:w-[42%] sm:w-[30%] lg:w-auto">
                <ProductCard product={toCardProduct(p)} />
              </li>
            ))
          : Array.from({ length: Math.min(ids.length, SHOWN) }, (_, i) => (
              <li key={i} className="w-[46%] shrink-0 min-[430px]:w-[42%] sm:w-[30%] lg:w-auto">
                <Skeleton className="aspect-square w-full rounded-2xl" />
                <Skeleton className="mt-3 h-4 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </li>
            ))}
      </ul>
    </section>
  );
}
