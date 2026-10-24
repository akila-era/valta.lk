import type { ErpProduct } from "@/lib/erp/types";
import { Reveal } from "@/components/home/reveal";
import { CatalogueImage } from "./catalogue-image";
import { CompactProductCard } from "./compact-product-card";

export function ProductImage({
  src,
  alt,
  sizes,
  priority,
  contain = true,
  padding,
  onError,
}: {
  src?: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  contain?: boolean;
  padding?: string;
  onError?: () => void;
}) {
  return (
    <CatalogueImage
      src={src}
      alt={alt}
      sizes={sizes}
      priority={priority}
      contain={contain}
      padding={padding}
      onError={onError}
    />
  );
}

/**
 * Dense, responsive Product Grid:
 * 5 columns per row on 2XL wide screens (1536px+), 4 columns on XL (1280px-1535px),
 * 3 columns on LG (1024px-1279px) and MD (768px-1023px), 2 columns on mobile.
 * Guarantees comfortable card widths (~225px-265px) and avoids narrow, stretched cards.
 */
export function ProductGrid({
  products,
  columns = 5,
}: {
  products: ErpProduct[];
  columns?: 3 | 4 | 5;
}) {
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
          <CompactProductCard product={p} priority={i < 5} />
        </Reveal>
      ))}
    </div>
  );
}
