import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { discountPercent, effectivePrice, isNewArrival } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductImage } from "./product-card";
import { WishlistButton } from "./wishlist-button";

/**
 * The storefront product card: discount derived from real ERP prices, brand and stock state, name, price and an
 * always-visible cart action. The product stands on a "stage" (a white spotlight disc over a floor shadow) and lifts
 * and tilts on hover; mix-blend-multiply lets white-background ERP photos sit on the stage without a box around them.
 * Every row has a fixed height so cards in a grid line up whatever their content.
 * `panel` is the shorter, borderless card used inside the Hot Deals panel.
 */
export function CompactProductCard({ product, panel = false, priority }: { product: ErpProduct; panel?: boolean; priority?: boolean }) {
  const title = product.content?.displayTitle || product.name; // the cart and orders always use the ERP name
  const current = effectivePrice(product);
  const pct = discountPercent(product);
  const href = `/products/${product.slug}`;
  const fresh = product.available && isNewArrival(product.publishedAt);
  const low = product.available && !product.hasVariants && product.purchasableQuantity > 0 && product.purchasableQuantity <= 5;
  const pill = "rounded-full px-2.5 py-1 text-label font-bold";
  return (
    <article
      className={`group/card relative flex h-full flex-col overflow-hidden rounded-[1.25rem] bg-bg text-ink transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 motion-reduce:hover:translate-y-0 ${
        panel ? "" : "border border-border shadow-soft hover:border-ink/15 hover:shadow-lift"
      }`}
    >
      <Link href={href} className="flex flex-1 flex-col" aria-label={`${title}, ${formatLkr(current)}`}>
        <span className={`relative block overflow-hidden bg-[linear-gradient(145deg,#f8f7f4,#eeece8)] ${panel ? "h-24 sm:h-28" : "h-40 sm:h-48 xl:h-52"}`}>
          {/* 2D: a dotted grid in the lower corner and an orange ring that turns on hover. */}
          <span aria-hidden className="absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.07)_1px,transparent_1.3px)] [background-size:12px_12px] [mask-image:linear-gradient(200deg,transparent_55%,#000)]" />
          <span aria-hidden className="absolute -right-8 -top-8 h-24 w-24 rounded-full border-[9px] border-brand-500/0 transition-[border-color,transform] duration-500 group-hover/card:scale-110 group-hover/card:border-brand-500/15" />
          {/* 3D: spotlight disc and a floor shadow that tightens as the product lifts. */}
          <span aria-hidden className="absolute left-1/2 top-[46%] aspect-square h-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_14px_36px_-12px_rgb(27_23_20/0.18),inset_0_-6px_14px_rgb(27_23_20/0.04)] transition-transform duration-500 group-hover/card:scale-105" />
          <span aria-hidden className="absolute bottom-[11%] left-1/2 h-3 w-[46%] -translate-x-1/2 rounded-[50%] bg-ink/25 blur-md transition-[width,opacity] duration-500 group-hover/card:w-[36%] group-hover/card:opacity-60" />
          <span className="absolute inset-0 mix-blend-multiply transition-transform duration-500 ease-out group-hover/card:-translate-y-2 group-hover/card:-rotate-2 group-hover/card:scale-[1.04] motion-reduce:transition-none">
            <ProductImage src={product.images[0]} alt="" sizes="(min-width:1280px) 260px, (min-width:768px) 30vw, 50vw" padding={panel ? "p-3" : "p-6 sm:p-7"} priority={priority} />
          </span>
        </span>
        <span className={`flex flex-1 flex-col ${panel ? "px-2.5 pb-2.5 pt-2" : "px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-3.5"}`}>
          {/* Right padding keeps the label clear of the cart button that straddles the stage edge. */}
          <span className="flex h-4 items-center gap-1.5 overflow-hidden pr-11 text-label font-semibold uppercase tracking-[0.1em] text-muted">
            {product.brand ? <span className="max-w-full shrink-0 truncate">{product.brand}</span> : null}
            {product.brand && product.category ? <span aria-hidden className="hidden h-1 w-1 shrink-0 rounded-full bg-brand-500 sm:block" /> : null}
            {product.category ? <span className={`truncate ${product.brand ? "hidden sm:inline" : ""}`}>{product.category.name}</span> : null}
          </span>
          <h3 className="mt-1.5 line-clamp-2 min-h-10 text-[13px] font-semibold leading-5 tracking-[-0.01em] transition-colors group-hover/card:text-brand-700 sm:text-sm">{title}</h3>
          <span className="mt-1.5 flex h-4 items-center text-xs">
            {!product.available ? (
              <span className="font-semibold text-danger">Out of stock</span>
            ) : low ? (
              <span className="font-semibold text-warn">Only {product.purchasableQuantity} left</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-medium text-success"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_0_3px_rgb(6_118_71/0.15)]" />In stock</span>
            )}
          </span>
          <span className="mt-auto flex items-baseline gap-1 whitespace-nowrap pt-2">
            {product.hasVariants ? <span className="text-xs text-muted">From</span> : null}
            <span className={`font-display font-extrabold tabular-nums tracking-[-0.03em] text-ink ${panel ? "text-[15px]" : "text-base sm:text-lg"}`}>{formatLkr(current)}</span>
          </span>
          <span className="block h-4 text-xs leading-4 text-muted">
            {current < product.price && (
              <>
                <span className="sr-only">Regular price</span>
                <s>{formatLkr(product.price)}</s>
              </>
            )}
          </span>
        </span>
      </Link>

      {/* The cart action straddles the bottom edge of the stage, outside the card link (no nested controls). */}
      <div
        className={`absolute right-3 z-10 ${
          panel ? "top-[calc(6rem-1.375rem)] sm:top-[calc(7rem-1.375rem)]" : "top-[calc(10rem-1.375rem)] sm:top-[calc(12rem-1.375rem)] xl:top-[calc(13rem-1.375rem)]"
        }`}
      >
        <span className="block rounded-full ring-4 ring-bg">
          {product.available && !product.hasVariants ? (
            <AddToCartButton
              round
              line={{ productId: product.id, variantKey: "", slug: product.slug, name: product.name, sku: product.sku, image: product.images[0], unitPrice: current }}
            />
          ) : (
            <Link
              href={href}
              aria-label={product.available ? "Choose options" : "View details"}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/15 bg-bg text-ink transition-colors duration-200 hover:border-ink hover:bg-ink hover:text-bg"
            >
              <ArrowUpRight className="h-5 w-5" aria-hidden />
            </Link>
          )}
        </span>
      </div>

      <span className="pointer-events-none absolute left-3 top-3 z-10 flex gap-1.5">
        {pct ? <span className={`${pill} bg-brand-500 text-on-brand shadow-[0_6px_14px_-6px_rgb(255_92_0/0.7)]`}>-{pct}%</span> : null}
        {fresh ? <span className={`${pill} bg-ink text-bg`}>New</span> : null}
      </span>
      <WishlistButton className="absolute right-3 top-3 z-10 shadow-soft" item={{ productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: current }} />
    </article>
  );
}
