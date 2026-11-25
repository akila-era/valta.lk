import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/products/product-card";
import type { ErpProduct } from "@/lib/erp/types";
import { TabsPanel } from "./tabs-panel";

const grid = "grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

/**
 * "New arrivals": a centred title, text tabs (All plus the biggest categories among the new products) and a product grid.
 * Tabs only appear for categories that really have at least two of the newest products.
 */
export function ArrivalsTabs({ products, title = "New Arrivals" }: { products: ErpProduct[]; title?: string }) {
  if (products.length < 3) return null;
  const all = products.slice(0, 10);
  const byCat = new Map<string, { name: string; slug: string; items: ErpProduct[] }>();
  for (const p of products) {
    if (!p.category) continue;
    const e = byCat.get(p.category.slug) ?? { name: p.category.name, slug: p.category.slug, items: [] };
    e.items.push(p);
    byCat.set(p.category.slug, e);
  }
  const tabs = [...byCat.values()].filter((c) => c.items.length >= 2).sort((a, b) => b.items.length - a.items.length).slice(0, 3);
  const labels = ["New Arrivals", ...tabs.map((t) => t.name)];
  const panels = [all, ...tabs.map((t) => t.items.slice(0, 10))].map((list, n) => (
    <ul key={n} className={grid}>
      {list.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={n === 0 && i < 2} />
        </li>
      ))}
    </ul>
  ));
  return (
    <section id="products" aria-labelledby="arrivals" className="container-page mt-10 scroll-mt-40 sm:mt-14">
      <h2 id="arrivals" className="mb-5 text-center text-2xl font-semibold tracking-tight text-ink sm:mb-6 sm:text-[2rem]">
        {title}
      </h2>
      <TabsPanel labels={labels} panels={panels} label="New arrivals categories" />
      <div className="mt-8 flex justify-center">
        <Link href="/products?sort=newest" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-6 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white">
          View all new arrivals <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
