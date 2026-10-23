import Link from "next/link";
import { discountPercent, effectivePrice, isNewArrival } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";
import { Reveal } from "@/components/home/reveal";
import { AddToCartButton } from "./add-to-cart-button";
import { CatalogueImage } from "./catalogue-image";
import { WishlistButton } from "./wishlist-button";

export function ProductImage({ src, alt, sizes, priority, contain = true, padding, onError }: { src?: string; alt: string; sizes: string; priority?: boolean; contain?: boolean; padding?: string; onError?: () => void }) {
  return <CatalogueImage src={src} alt={alt} sizes={sizes} priority={priority} contain={contain} padding={padding} onError={onError} />;
}

export function ProductCard({ product, priority }: { product: ErpProduct; priority?: boolean }) {
  const title = product.content?.displayTitle || product.name; // published display title; the cart and orders always use the ERP name
  const pct = discountPercent(product);
  const current = effectivePrice(product);
  const low = product.available && !product.hasVariants && product.purchasableQuantity > 0 && product.purchasableQuantity <= 5;
  const single = !product.hasVariants;
  const fresh = isNewArrival(product.publishedAt);
  const pill = "rounded-md px-2 py-1 text-[11px] font-bold leading-none";
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-card transition-shadow duration-200 hover:shadow-lift focus-within:shadow-lift">
      <Link
        href={`/products/${product.slug}`}
        className="flex flex-1 flex-col after:absolute after:inset-0 after:content-[''] [&:focus-visible]:outline-offset-[-2px]"
        aria-label={`${title}, ${formatLkr(current)}`}
      >
        <div className="media-square">
          <div className="absolute inset-0 transition-transform duration-300 ease-out group-hover:scale-[1.04]">
            <ProductImage src={product.images[0]} alt="" priority={priority} sizes="(min-width:1280px) 19vw, (min-width:768px) 30vw, 46vw" />
          </div>
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {fresh && product.available && <span className={`${pill} bg-brand-500 text-ink`}>New</span>}
            {pct && <span className={`${pill} bg-ink text-white`}>-{pct}%</span>}
            {!product.available ? (
              <span className={`${pill} bg-ink text-white`}>Out of stock</span>
            ) : low ? (
              <span className={`${pill} bg-warn text-white`}>Only {product.purchasableQuantity} left</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-1 flex-col items-start px-4 pb-4 pt-3.5 text-left">
          <p className="flex min-h-4 w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            <span className="truncate">{product.brand ?? ""}</span>
            {product.available && !low && (
              <span className="inline-flex shrink-0 items-center gap-1 font-semibold normal-case tracking-normal text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                In stock
              </span>
            )}
          </p>
          <h3 className="type-product mt-1.5 transition-colors group-hover:text-brand-700">{title}</h3>
          {product.specs.Model && !title.toLowerCase().includes(product.specs.Model.toLowerCase()) ? (
            <p className="mt-0.5 truncate text-xs text-muted">{product.specs.Model}</p>
          ) : null}
          <div className="mt-auto w-full pt-3">
            <p className="flex flex-wrap items-baseline gap-x-2 border-t border-border/70 pt-3">
              {product.hasVariants ? <span className="text-[11px] font-medium text-muted">From</span> : null}
              <span className="type-price">{formatLkr(current)}</span>
              {current < product.price && (
                <span className="text-xs text-muted">
                  <span className="sr-only">Regular price</span>
                  <s className="whitespace-nowrap">{formatLkr(product.price)}</s>
                </span>
              )}
            </p>
          </div>
        </div>
      </Link>

      <WishlistButton
        className="absolute right-3 top-3 z-10 h-9 w-9"
        item={{ productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: current }}
      />

      {/* Action bar over the bottom of the image: slides up on hover or keyboard focus, and is always shown on touch screens. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 aspect-square overflow-hidden">
        <div className="show-on-touch pointer-events-auto absolute inset-x-0 bottom-0 translate-y-full opacity-0 transition-[transform,opacity] duration-200 ease-out focus-within:translate-y-0 focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          {product.available && single ? (
            <AddToCartButton
              bar
              line={{ productId: product.id, variantKey: "", slug: product.slug, name: product.name, sku: product.sku, image: product.images[0], unitPrice: current }}
            />
          ) : (
            <Link
              href={`/products/${product.slug}`}
              className="flex min-h-11 w-full items-center justify-center bg-ink px-3 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-black"
            >
              {product.available ? "Choose options" : "View details"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, columns = 4 }: { products: ErpProduct[]; columns?: 3 | 4 }) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 ${columns === 4 ? "lg:grid-cols-4" : ""}`}>
      {products.map((p, i) => (
        <Reveal key={p.id} delay={(i % 4) * 70}>
          <ProductCard product={p} priority={i < 4} />
        </Reveal>
      ))}
    </div>
  );
}
