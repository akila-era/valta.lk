"use client";

import { useEffect, useState } from "react";
import type { ErpProduct } from "@/lib/erp/types";
import { SectionHeader } from "@/components/ui/chrome";
import { CompactProductCard } from "./compact-product-card";

/**
 * Newest available products from the live catalogue, for empty pages (cart, wishlist). Renders nothing until
 * real products arrive, and nothing at all if the catalogue cannot be reached.
 */
export function SuggestedProducts({ title = "New arrivals", exclude = [] }: { title?: string; exclude?: string[] }) {
  const [items, setItems] = useState<ErpProduct[]>([]);
  const skip = exclude.join(",");

  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/store/products?pageSize=8&sort=newest", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { items: ErpProduct[] }) => {
        const hidden = new Set(skip ? skip.split(",") : []);
        setItems(d.items.filter((p) => p.available && !hidden.has(p.id)).slice(0, 4));
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [skip]);

  if (!items.length) return null;
  return (
    <section aria-labelledby="suggested" className="section-space">
      <SectionHeader id="suggested" title={title} action={{ href: "/products", label: "View all" }} />
      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4 xl:grid-cols-6">
        {items.map((p) => (
          <li key={p.id}>
            <CompactProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}
