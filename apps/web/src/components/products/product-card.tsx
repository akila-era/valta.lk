import Link from "next/link";
import { Bell } from "lucide-react";
import { discountPercent, effectivePrice, isNewArrival } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";
import { Reveal } from "@/components/home/reveal";
import { AddToCartButton } from "./add-to-cart-button";
import { CatalogueImage } from "./catalogue-image";
import { KokoInstalment } from "./koko-instalment";
import { QuickViewButton } from "./quick-view-button";
import { WishlistButton } from "./wishlist-button";

export function ProductImage({ src, alt, sizes, priority, contain = true, padding, onError }: { src?: string; alt: string; sizes: string; priority?: boolean; contain?: boolean; padding?: string; onError?: () => void }) {
  return <CatalogueImage src={src} alt={alt} sizes={sizes} priority={priority} contain={contain} padding={padding} onError={onError} />;
}

/** The one product card used on every listing, row and rail. */
export function ProductCard({ product, priority }: { product: ErpProduct; priority?: boolean }) {
  const title = product.content?.displayTitle || product.name; // published display title; the cart and orders always use the ERP name
  const pct = discountPercent(product);
  const current = effectivePrice(product);
  const low = product.available && !product.hasVariants && product.purchasableQuantity > 0 && product.purchasableQuantity <= 5;
  const canAdd = product.available && !product.hasVariants;
  // At most one badge, in this order: Sale, New, Out of stock.
  const badge = pct ? { text: "Sale", cls: "bg-sale text-white" } : isNewArrival(product.publishedAt) && product.available ? { text: "New", cls: "bg-brand-500 text-on-brand" } : !product.available ? { text: "Out of stock", cls: "border border-border bg-white text-muted" } : null;
  const cartLine = { productId: product.id, variantKey: "", slug: product.slug, name: product.name, sku: product.sku, image: product.images[0], unitPrice: current };
  const action = !product.available ? (
    <button type="button" disabled aria-label={`Notify me when ${title} is back`} className="btn btn-secondary min-h-10 w-full px-3">
      <Bell className="h-4 w-4" aria-hidden /> Notify me
    </button>
  ) : canAdd ? (
    <AddToCartButton line={cartLine} compact />
  ) : (
    <QuickViewButton slug={product.slug} name={title} className="w-full min-h-10" />
  );

  return (
    <article className="group @container relative flex h-full flex-col">
      <div className="relative">
        <Link href={`/products/${product.slug}`} aria-label={title} className="media-square block rounded-2xl border border-border transition-colors duration-300 group-hover:border-ink/30 motion-reduce:transition-none">
          <span className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none">
            <ProductImage src={product.images[0]} alt={title} priority={priority} sizes="(min-width:1280px) 19vw, (min-width:768px) 30vw, 46vw" />
          </span>
        </Link>
        {badge && <span className={`pointer-events-none absolute left-2 top-2 rounded-md px-2 py-1 text-[13px] font-semibold leading-none ${badge.cls}`}>{badge.text}</span>}
        <WishlistButton className="absolute right-0 top-0" item={{ productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: current }} />
        {/* Desktop: slides up over the image on hover or keyboard focus. Touch screens keep it visible. */}
        <div className="show-on-touch pointer-events-none absolute inset-x-2 bottom-2 hidden translate-y-2 flex-col gap-1.5 opacity-0 transition-[transform,opacity] duration-200 focus-within:translate-y-0 focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 md:flex motion-reduce:transition-none [&>*]:pointer-events-auto">
          {product.available && canAdd && <QuickViewButton slug={product.slug} name={title} className="w-full" />}
          {action}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-start pt-3 text-left">
        <p className="min-h-4 w-full truncate text-[13px] uppercase tracking-[0.04em] text-muted">{product.brand ?? ""}</p>
        <h3 className="type-product mt-0.5 min-h-10 transition-colors group-hover:text-brand-600">
          <Link href={`/products/${product.slug}`}>{title}</Link>
        </h3>
        <div className="mt-auto w-full pt-2">
          <p className="flex flex-wrap items-baseline gap-x-2">
            {product.hasVariants ? <span className="text-[13px] text-muted">From</span> : null}
            <span className="type-price">{formatLkr(current)}</span>
            {current < product.price && (
              <>
                <s className="whitespace-nowrap text-[13px] text-muted"><span className="sr-only">Regular price </span>{formatLkr(product.price)}</s>
                {pct ? <span className="rounded-md bg-sale/10 px-1.5 py-0.5 text-[13px] font-semibold text-sale">-{pct}%</span> : null}
              </>
            )}
          </p>
          {product.available && <KokoInstalment price={current} />}
          <p className={`mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium ${!product.available ? "text-muted" : low ? "text-warn" : "text-success"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${!product.available ? "bg-muted" : low ? "bg-amber-500" : "bg-success"}`} aria-hidden />
            {!product.available ? "Out of stock" : low ? `Only ${product.purchasableQuantity} left` : "In stock"}
          </p>
        </div>
        {/* Phones: one small always-visible button. */}
        <div className="mt-2 w-full md:hidden [&_button]:min-h-9 [&_button]:text-[13px]">{action}</div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, columns = 4 }: { products: ErpProduct[]; columns?: 3 | 4 }) {
  return (
    <div className={`grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 md:grid-cols-3 ${columns === 4 ? "lg:grid-cols-4" : ""}`}>
      {products.map((p, i) => (
        <Reveal key={p.id} delay={(i % 4) * 70}>
          <ProductCard product={p} priority={i < 4} />
        </Reveal>
      ))}
    </div>
  );
}
