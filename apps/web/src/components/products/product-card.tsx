import type { ErpProduct } from "@/lib/erp/types";
import { Reveal } from "@/components/home/reveal";
import { CatalogueImage } from "./catalogue-image";
import { CompactProductCard } from "./compact-product-card";

export function ProductImage({ src, alt, sizes, priority, contain = true, padding, onError }: { src?: string; alt: string; sizes: string; priority?: boolean; contain?: boolean; padding?: string; onError?: () => void }) {
  return <CatalogueImage src={src} alt={alt} sizes={sizes} priority={priority} contain={contain} padding={padding} onError={onError} />;
}

/** Product grid for listing, search, category and related products; every page uses the same card as the homepage. */
export function ProductGrid({ products, columns = 4 }: { products: ErpProduct[]; columns?: 3 | 4 }) {
  return (
    <div className={`grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 ${columns === 4 ? "lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" : ""}`}>
      {products.map((p, i) => (
        <Reveal key={p.id} delay={(i % 4) * 70}>
          <CompactProductCard product={p} priority={i < 4} />
        </Reveal>
      ))}
    </div>
  );
}
