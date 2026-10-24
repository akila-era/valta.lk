import Link from "next/link";
import { discountPercent, effectivePrice, isNewArrival } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductImage } from "./product-card";
import { WishlistButton } from "./wishlist-button";

/**
 * The storefront product card: discount derived from real ERP prices, brand and stock state, name, price and an
 * always-visible cart action. Every row has a fixed height so cards in a grid line up whatever their content.
 * `panel` drops the border for cards that sit on the dark Hot Deals panel.
 */
export function CompactProductCard({ product, panel = false, priority }: { product: ErpProduct; panel?: boolean; priority?: boolean }) {
  const title = product.content?.displayTitle || product.name; // the cart and orders always use the ERP name
  const current = effectivePrice(product);
  const pct = discountPercent(product);
  const href = `/products/${product.slug}`;
  const fresh = product.available && isNewArrival(product.publishedAt);
  const low = product.available && !product.hasVariants && product.purchasableQuantity > 0 && product.purchasableQuantity <= 5;
  const pill = "rounded-full px-2 py-0.5 text-[11px] font-bold leading-4";
  return (
    <article
      className={`group/card relative flex h-full flex-col rounded-xl text-ink transition-transform duration-300 hover:-translate-y-1 motion-reduce:hover:translate-y-0 ${
        panel ? "bg-bg p-2" : "border border-border bg-bg p-2.5 transition-[border-color,box-shadow] duration-200 hover:border-brand-500/40 hover:shadow-lift"
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="flex gap-1">
          {pct ? <span className={`${pill} bg-brand-500 text-on-brand`}>-{pct}%</span> : null}
          {fresh ? <span className={`${pill} bg-ink text-bg`}>New</span> : null}
        </span>
        <WishlistButton className="h-7 w-7" item={{ productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: current }} />
      </div>
      <Link href={href} className="group flex flex-1 flex-col" aria-label={`${title}, ${formatLkr(current)}`}>
        <span className={`media-spot relative mt-1 block overflow-hidden rounded-lg ${panel ? "h-16 sm:h-[4.5rem]" : "h-24 sm:h-28"}`}>
          <span className="absolute inset-0 transition-transform duration-500 ease-out group-hover/card:scale-110">
            <ProductImage src={product.images[0]} alt="" sizes="200px" padding="p-1" priority={priority} />
          </span>
        </span>
        <span className="mt-1.5 flex h-4 items-center justify-between gap-2 text-[11px]">
          <span className="truncate font-semibold text-muted">{product.brand ?? ""}</span>
          {!product.available ? (
            <span className="shrink-0 font-semibold text-danger">Out of stock</span>
          ) : low ? (
            <span className="shrink-0 font-semibold text-warn">Only {product.purchasableQuantity} left</span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 text-success"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />In stock</span>
          )}
        </span>
        <h3 className="mt-0.5 line-clamp-1 font-sans text-xs font-medium sm:text-[13px] group-hover:text-brand-700">{title}</h3>
        <span className="mt-1 flex h-5 items-baseline gap-1.5 whitespace-nowrap">
          {product.hasVariants ? <span className="text-[11px] text-muted">From</span> : null}
          <span className="font-display text-[15px] font-bold tabular-nums text-brand-600">{formatLkr(current)}</span>
        </span>
        <span className="block h-4 text-[11px] text-muted">
          {current < product.price && (
            <>
              <span className="sr-only">Regular price</span>
              <s>{formatLkr(product.price)}</s>
            </>
          )}
        </span>
      </Link>
      <div className="mt-2 [&_.btn-primary]:min-h-9 [&_.btn-primary]:text-[13px]">
        {product.available && !product.hasVariants ? (
          <AddToCartButton
            compact
            line={{ productId: product.id, variantKey: "", slug: product.slug, name: product.name, sku: product.sku, image: product.images[0], unitPrice: current }}
          />
        ) : (
          <Link href={href} className="btn-outline min-h-9 w-full px-3 text-[13px]">
            {product.available ? "Choose options" : "View details"}
          </Link>
        )}
      </div>
    </article>
  );
}
