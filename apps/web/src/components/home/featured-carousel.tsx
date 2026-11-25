import { ProductCard } from "@/components/products/product-card";
import type { ErpProduct } from "@/lib/erp/types";
import { ProductCarousel } from "./product-carousel";

/**
 * Featured products: a centred title and a swipeable carousel with arrows and page dots. These are the products staff marked
 * as Featured in the admin (the ERP holds no sales data, so nothing here claims to be "most popular").
 */
export function FeaturedCarousel({ products, title = "Featured Products" }: { products: ErpProduct[]; title?: string }) {
  const list = products.filter((p) => p.available);
  if (list.length < 4) return null;
  return (
    <section id="featured" aria-labelledby="featured-title" className="container-page mt-10 sm:mt-14">
      <h2 id="featured-title" className="mb-6 text-center text-2xl font-semibold tracking-tight text-ink sm:mb-8 sm:text-[2rem]">{title}</h2>
      <ProductCarousel label={title} align="start">
        {list.slice(0, 15).map((p, i) => (
          <li key={p.id} className="w-1/2 shrink-0 snap-start px-1.5 sm:px-2 md:w-1/3 lg:w-1/4 xl:w-1/5">
            <ProductCard product={p} priority={i < 2} />
          </li>
        ))}
      </ProductCarousel>
    </section>
  );
}
