import { Reveal } from "@/components/home/reveal";
import type { ErpProduct } from "@/lib/erp/types";
import { instalmentLine } from "@/lib/instalments";
import { cardRatings } from "@/lib/reviews";
import { CompactProductCard } from "./compact-product-card";

/**
 * Dense, responsive Product Grid:
 * 5 columns per row on 2XL wide screens (1536px+), 4 columns on XL (1280px-1535px),
 * 3 columns on LG (1024px-1279px) and MD (768px-1023px), 2 columns on mobile.
 * Guarantees comfortable card widths (~225px-265px) and avoids narrow, stretched cards.
 */
export async function ProductGrid({
  products,
  columns = 5,
  layout = "grid",
}: {
  products: ErpProduct[];
  columns?: 3 | 4 | 5;
  /** "list": one product per row, photo on the left (the catalogue's List view). */
  layout?: "grid" | "list";
}) {
  const [instalments, ratings] = await Promise.all([instalmentLine(), cardRatings()]);
  if (layout === "list") {
    return (
      <div className="grid gap-3">
        {products.map((p, i) => (
          <CompactProductCard key={p.id} product={p} priority={i < 3} row instalments={instalments} rating={ratings.get(p.id)} />
        ))}
      </div>
    );
  }
  const colClasses =
    columns === 5
      ? "grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      : columns === 4
        ? "grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4"
        : "grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3";

  return (
    <div className={`grid ${colClasses}`}>
      {products.map((p, i) => (
        <Reveal key={p.id} delay={(i % 5) * 50}>
          <CompactProductCard product={p} priority={i < 5} instalments={instalments} rating={ratings.get(p.id)} />
        </Reveal>
      ))}
    </div>
  );
}
