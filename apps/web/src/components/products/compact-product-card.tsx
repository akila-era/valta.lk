import Link from "next/link";
import { discountPercent, effectivePrice, isNewArrival } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductImage } from "./product-card";
import { WishlistButton } from "./wishlist-button";

interface CompactProductCardProps {
  product: ErpProduct;
  priority?: boolean;
  /** List layout: photo on the left, details and actions on the right. */
  row?: boolean;
}

/**
 * The storefront product card: a white tile with the photo, brand, title, stock, price (with the regular price struck
 * through only when the ERP has a real reduction) and an always-visible Add to cart. Variant products link to the
 * product page instead of guessing a variant. Only facts from the ERP are shown: no invented feature badges.
 */
export function CompactProductCard({ product, priority, row = false }: CompactProductCardProps) {
  const title = product.content?.displayTitle || product.name;
  const current = effectivePrice(product);
  const pct = discountPercent(product);
  const href = `/products/${product.slug}`;
  const fresh = product.available && isNewArrival(product.publishedAt);
  const low = product.available && !product.hasVariants && product.purchasableQuantity > 0 && product.purchasableQuantity <= 5;
  const label = product.brand || product.category?.name;

  return (
    <article className={`group/card relative flex h-full overflow-hidden rounded-card ${row ? "flex-row" : "flex-col"} border border-border bg-bg text-ink transition-[border-color,box-shadow] duration-200 hover:border-brand-500 hover:shadow-neon-lift`}>
      <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex flex-col items-start gap-1">
        {pct ? <span className="rounded-sm bg-brand-500 px-1.5 py-0.5 text-[11px] font-bold text-on-brand">-{pct}%</span> : null}
        {fresh ? <span className="rounded-sm bg-ink px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white">New</span> : null}
      </div>
      <div className="absolute right-2.5 top-2.5 z-10">
        <WishlistButton
          className="h-8 w-8 bg-bg"
          item={{ productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: current }}
        />
      </div>

      <Link href={href} tabIndex={-1} aria-hidden className={`relative block aspect-square shrink-0 overflow-hidden bg-bg ${row ? "w-32 sm:w-44" : "w-full"}`}>
        <span className="absolute inset-0 transition-transform duration-500 ease-out group-hover/card:scale-[1.04] motion-reduce:transition-none">
          <ProductImage src={product.images[0]} alt={title} sizes="(min-width: 1280px) 260px, (min-width: 768px) 33vw, 50vw" priority={priority} contain padding="p-5 sm:p-6" />
        </span>
      </Link>

      <div className={`flex min-w-0 flex-1 flex-col p-3 sm:p-4 ${row ? "border-l border-border/70" : "border-t border-border/70"}`}>
        {label ? <p className="mb-1 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p> : null}
        <h3 className="line-clamp-2 min-h-10 text-[13.5px] font-semibold leading-5 text-ink sm:text-sm">
          <Link href={href} className="py-1 hover:text-brand-600">
            {title}
          </Link>
        </h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
          {!product.available ? (
            <><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-danger" /><span className="text-danger">Out of stock</span></>
          ) : low ? (
            <><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" /><span className="text-warn">Only {product.purchasableQuantity} left</span></>
          ) : (
            <><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" /><span className="text-success">In stock</span></>
          )}
        </p>
        <p className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2.5">
          {product.hasVariants && <span className="text-xs font-medium text-muted">From</span>}
          <span className="font-display text-base font-bold tabular-nums text-brand-600 sm:text-[17px]">{formatLkr(current)}</span>
          {current < product.price && (
            <span className="text-xs text-muted">
              <span className="sr-only">Regular price</span>
              <s>{formatLkr(product.price)}</s>
            </span>
          )}
        </p>
        <div className={row ? "mt-3 sm:max-w-56" : "mt-3"}>
          {product.available && !product.hasVariants ? (
            <AddToCartButton
              outline
              line={{ productId: product.id, variantKey: "", slug: product.slug, name: product.name, sku: product.sku, image: product.images[0], unitPrice: current }}
            />
          ) : (
            <Link href={href} className="btn min-h-10 w-full border border-border-strong/50 px-3 text-[13px] text-ink hover:border-ink">
              {product.available ? "Choose options" : "View details"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
