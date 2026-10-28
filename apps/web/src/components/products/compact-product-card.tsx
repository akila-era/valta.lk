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
/**
 * Up to three key details for the card (as large brand stores print beside the product photo): the first
 * specifications staff entered for the product (Admin, product content, Specifications), otherwise the ERP's own
 * specifications. Brand and model are left out: the card already names the product.
 */
export function cardHighlights(product: ErpProduct): { value: string; name: string }[] {
  const fromContent = (product.content?.specs ?? []).map((s) => ({ value: `${s.value}${s.unit ? ` ${s.unit}` : ""}`, name: s.name }));
  const fromErp = Object.entries(product.specs ?? {}).map(([name, value]) => ({ value: String(value), name }));
  return (fromContent.length ? fromContent : fromErp)
    .filter((h) => h.value.trim() && !/^(brand|model|sku)$/i.test(h.name.trim()) && h.value.length <= 14)
    .slice(0, 3);
}

/**
 * The storefront product card, laid out like a large brand store's: a stock pill and badges over the photo, up to three
 * key details beside it, the centred title, and the price (the regular price struck through only for a real ERP
 * reduction). On mouse devices "Add to cart" is a bar over the bottom of the photo that appears on hover or keyboard
 * focus; on touch screens (and in the list layout) it is a button under the price. Variant products link to the
 * product page instead.
 */
export function CompactProductCard({ product, priority, row = false }: CompactProductCardProps) {
  const title = product.content?.displayTitle || product.name;
  const current = effectivePrice(product);
  const pct = discountPercent(product);
  const href = `/products/${product.slug}`;
  const fresh = product.available && isNewArrival(product.publishedAt);
  const low = product.available && !product.hasVariants && product.purchasableQuantity > 0 && product.purchasableQuantity <= 5;
  const label = product.brand || product.category?.name;
  const details = row ? [] : cardHighlights(product);
  const canAdd = product.available && !product.hasVariants;
  const line = { productId: product.id, variantKey: "", slug: product.slug, name: product.name, sku: product.sku, image: product.images[0], unitPrice: current };
  const otherLabel = product.available ? "Choose options" : "View details";

  return (
    <article className={`group/card relative flex h-full overflow-hidden rounded-card ${row ? "flex-row" : "flex-col"} border border-border bg-bg p-2.5 text-ink transition-[border-color,box-shadow] duration-200 hover:border-brand-500 hover:shadow-neon-lift sm:p-3`}>
      <div className="pointer-events-none absolute left-3.5 top-3.5 z-10 flex flex-col items-start gap-1 sm:left-4 sm:top-4">
        {!product.available ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-white">Sold out</span>
        ) : low ? (
          <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-bold text-on-brand">Only {product.purchasableQuantity} left</span>
        ) : (
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold text-white">In stock</span>
        )}
      </div>
      <div className="absolute right-3.5 top-3.5 z-10 sm:right-4 sm:top-4">
        <WishlistButton className="h-8 w-8 bg-bg" item={{ productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: current }} />
      </div>

      <div className={`relative aspect-square shrink-0 overflow-hidden rounded-control bg-bg ${row ? "w-32 sm:w-44" : "w-full"}`}>
        <Link href={href} tabIndex={-1} aria-hidden className="absolute inset-0 block">
          <span className={`absolute inset-y-0 left-0 transition-transform duration-500 ease-out group-hover/card:scale-[1.04] motion-reduce:transition-none ${details.length ? "right-[34%]" : "right-0"}`}>
            <ProductImage src={product.images[0]} alt={title} sizes="(min-width: 1280px) 260px, (min-width: 768px) 33vw, 50vw" priority={priority} contain padding="p-4 pt-10 sm:p-5 sm:pt-11" />
          </span>
        </Link>
        {details.length ? (
          // Key details beside the photo: the value in bold, what it is underneath.
          <ul className="pointer-events-none absolute inset-y-0 right-0 flex w-[36%] flex-col justify-center gap-2.5 pr-1 pt-6">
            {details.map((d) => (
              <li key={d.name} className="flex gap-1.5">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[11px] font-bold text-ink sm:text-xs">{d.value}</span>
                  <span className="block truncate text-[11px] text-muted">{d.name}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {pct || fresh ? (
          // One row at the bottom-left of the photo, so badges never pile up over the picture.
          <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 flex flex-wrap items-end gap-1 transition-opacity duration-200 group-hover/card:opacity-0 [@media(hover:none)]:group-hover/card:opacity-100">
            {pct ? <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-bold text-on-brand">-{pct}%</span> : null}
            {fresh ? <span className="rounded-full border border-ink bg-bg px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink">New</span> : null}
          </div>
        ) : null}
        {!row ? (
          // Mouse devices: the action is a bar over the bottom of the photo, shown on hover or keyboard focus.
          <div className="absolute inset-x-2 bottom-2 z-10 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:hidden">
            {canAdd ? (
              <AddToCartButton bar line={line} />
            ) : (
              <Link href={href} className="flex min-h-11 w-full items-center justify-center rounded-control bg-ink px-3 text-xs font-bold uppercase tracking-[0.08em] text-white hover:bg-brand-500 hover:text-on-brand">
                {otherLabel}
              </Link>
            )}
          </div>
        ) : null}
      </div>

      <div className={`flex min-w-0 flex-1 flex-col ${row ? "items-start pl-3 text-left sm:pl-4" : "items-center pt-3 text-center"}`}>
        {label ? <p className="mb-1 max-w-full truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p> : null}
        <h3 className="line-clamp-2 min-h-10 text-[13.5px] font-bold leading-5 text-ink sm:text-[15px]">
          <Link href={href} className="py-1 hover:underline">
            {title}
          </Link>
        </h3>
        <p className={`mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-2 ${row ? "" : "justify-center"}`}>
          {product.hasVariants && <span className="text-xs font-semibold text-muted">From:</span>}
          <span className="whitespace-nowrap font-display text-[17px] font-extrabold tabular-nums text-brand-500 min-[340px]:text-[19px]">{formatLkr(current)}</span>
          {current < product.price && (
            <span className="whitespace-nowrap text-xs text-muted">
              <span className="sr-only">Regular price</span>
              <s>{formatLkr(product.price)}</s>
            </span>
          )}
        </p>
        {/* Touch screens (and the list layout): the action is a button under the price. */}
        <div className={`mt-2.5 w-full ${row ? "sm:max-w-56" : "[@media(hover:hover)]:hidden"}`}>
          {canAdd ? (
            <AddToCartButton outline line={line} />
          ) : (
            <Link href={href} className="btn min-h-10 w-full border border-ink/20 px-3 text-[13px] text-ink hover:border-ink hover:bg-ink hover:text-white">
              {otherLabel}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
