import Link from "next/link";
import { ArrowUpRight, Battery, Cable, Check, Cpu, HardDrive, Plus, Shield, Sparkles, Zap } from "lucide-react";
import { discountPercent, effectivePrice, isNewArrival } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductImage } from "./product-card";
import { WishlistButton } from "./wishlist-button";

interface CompactProductCardProps {
  product: ErpProduct;
  panel?: boolean;
  priority?: boolean;
}

/** Extracts up to 3 prominent spec pills or smart category features for the bottom row. */
function getProductBadges(product: ErpProduct): { icon: typeof Zap; label: string }[] {
  const specs = product.specs ?? {};
  const badges: { icon: typeof Zap; label: string }[] = [];

  // 1. From real product specs if present
  for (const [key, val] of Object.entries(specs)) {
    if (badges.length >= 3) break;
    const k = key.toLowerCase();
    const v = String(val).trim();
    if (!v || v === "null" || v === "undefined") continue;

    if (k.includes("watt") || k.includes("power") || v.includes("W") || v.includes("mAh")) {
      badges.push({ icon: Zap, label: v });
    } else if (k.includes("interface") || k.includes("port") || k.includes("type") || v.includes("USB")) {
      badges.push({ icon: Cable, label: v });
    } else if (k.includes("storage") || k.includes("capacity") || k.includes("rom") || v.includes("GB") || v.includes("TB")) {
      badges.push({ icon: HardDrive, label: v });
    } else if (k.includes("battery") || k.includes("mah")) {
      badges.push({ icon: Battery, label: v });
    } else if (k.includes("ram") || k.includes("chip") || k.includes("processor")) {
      badges.push({ icon: Cpu, label: v });
    } else if (k.includes("warranty")) {
      badges.push({ icon: Shield, label: v });
    } else if (badges.length < 2 && v.length <= 16) {
      badges.push({ icon: Sparkles, label: v });
    }
  }

  // 2. Fallbacks if no specs were present on the product
  if (badges.length === 0) {
    const cat = product.category?.name?.toLowerCase() ?? "";
    if (cat.includes("accessor")) {
      badges.push({ icon: Zap, label: "Fast Charge" });
      badges.push({ icon: Cable, label: "High Durability" });
      badges.push({ icon: Shield, label: "Authentic" });
    } else if (cat.includes("audio")) {
      badges.push({ icon: Sparkles, label: "HD Sound" });
      badges.push({ icon: Battery, label: "Long Battery" });
      badges.push({ icon: Shield, label: "Verified" });
    } else if (cat.includes("phone")) {
      badges.push({ icon: Cpu, label: "Brand Warranty" });
      badges.push({ icon: Zap, label: "Fast Delivery" });
      badges.push({ icon: Shield, label: "COD Ready" });
    } else {
      badges.push({ icon: Shield, label: "Genuine Tech" });
      badges.push({ icon: Zap, label: "Islandwide" });
      badges.push({ icon: Sparkles, label: "COD Available" });
    }
  }

  return badges.slice(0, 3);
}

export function CompactProductCard({ product, panel = false, priority }: CompactProductCardProps) {
  const title = product.content?.displayTitle || product.name;
  const current = effectivePrice(product);
  const pct = discountPercent(product);
  const href = `/products/${product.slug}`;
  const fresh = product.available && isNewArrival(product.publishedAt);
  const low = product.available && !product.hasVariants && product.purchasableQuantity > 0 && product.purchasableQuantity <= 5;
  const badges = getProductBadges(product);

  const brandText = product.brand?.toUpperCase();
  const catText = product.category?.name?.toUpperCase();
  const brandAndCategory = [brandText, catText].filter(Boolean).join(" • ");

  return (
    <article
      className={`group/card relative flex h-full flex-col overflow-hidden rounded-2xl bg-white text-ink transition-all duration-300 hover:-translate-y-1 hover:shadow-lift motion-reduce:hover:translate-y-0 ${
        panel ? "border border-border/70 p-2.5" : "border border-border/85 p-3.5 shadow-soft hover:border-brand-500/40"
      }`}
    >
      {/* Top badges (Discount / New) */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-1.5">
        {pct ? (
          <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-on-brand shadow-[0_4px_12px_rgb(255_92_0/0.4)]">
            -{pct}%
          </span>
        ) : null}
        {fresh ? (
          <span className="rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white">
            New
          </span>
        ) : null}
      </div>

      {/* Wishlist Button in Top Right */}
      <div className="absolute right-3 top-3 z-10">
        <WishlistButton
          className="h-8.5 w-8.5 rounded-full bg-white/90 shadow-sm backdrop-blur-xs transition-transform hover:scale-110"
          item={{ productId: product.id, slug: product.slug, name: product.name, image: product.images[0], price: current }}
        />
      </div>

      {/* Product Image Area: aspect-[4/3] prevents excessively tall cards while keeping a generous contain area */}
      <div className="relative mb-2.5 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-white p-2 sm:p-2.5">
        {/* Subtle white spotlight disc behind the product */}
        <span
          aria-hidden
          className="absolute inset-1 rounded-full bg-[radial-gradient(circle_at_50%_50%,#ffffff_0%,#fbf9f6_85%)] shadow-inner transition-transform duration-500 group-hover/card:scale-105"
        />

        <Link
          href={href}
          tabIndex={-1}
          aria-hidden
          className="relative flex h-full w-full items-center justify-center transition-transform duration-500 ease-out group-hover/card:scale-105 motion-reduce:transition-none"
        >
          <ProductImage
            src={product.images[0]}
            alt={title}
            sizes="(min-width: 1280px) 260px, (min-width: 768px) 33vw, 50vw"
            priority={priority}
            contain
            padding="p-1 sm:p-1.5"
          />
        </Link>

        {/* Floating Round Orange Plus (Add to Cart) Button */}
        <div className="absolute bottom-1.5 right-1.5 z-10">
          <span className="block rounded-full ring-4 ring-white">
            {product.available && !product.hasVariants ? (
              <AddToCartButton
                round
                line={{
                  productId: product.id,
                  variantKey: "",
                  slug: product.slug,
                  name: product.name,
                  sku: product.sku,
                  image: product.images[0],
                  unitPrice: current,
                }}
              />
            ) : (
              <Link
                href={href}
                aria-label={product.available ? "Choose options" : "View details"}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-on-brand shadow-[0_8px_18px_-6px_rgb(255_92_0/0.6)] transition-all hover:bg-brand-600 hover:scale-105 active:scale-95"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              </Link>
            )}
          </span>
        </div>
      </div>

      {/* Product Details Section */}
      <div className="flex flex-1 flex-col">
        {/* Brand • Category row */}
        {brandAndCategory && (
          <p className="mb-1 truncate font-mono text-[11px] font-bold tracking-[0.1em] text-muted">
            {brandAndCategory}
          </p>
        )}

        {/* Product Title */}
        <h3 className="line-clamp-2 min-h-10 text-[13.5px] font-bold leading-5 tracking-tight text-ink transition-colors group-hover/card:text-brand-600 sm:text-[14.5px]">
          <Link href={href} className="py-1 hover:underline">
            {title}
          </Link>
        </h3>

        {/* Stock Status Indicator */}
        <div className="mt-1 flex items-center text-xs">
          {!product.available ? (
            <span className="flex items-center gap-1.5 font-bold text-danger">
              <span className="h-2 w-2 rounded-full bg-danger shadow-[0_0_0_2px_rgba(180,35,24,0.2)]" />
              Out of stock
            </span>
          ) : low ? (
            <span className="flex items-center gap-1.5 font-bold text-warn">
              <span className="h-2 w-2 rounded-full bg-warn" />
              Only {product.purchasableQuantity} left
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-semibold text-success">
              <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_0_2px_rgba(6,118,71,0.2)]" />
              In stock
            </span>
          )}
        </div>

        {/* Price Row */}
        <div className="mt-auto flex items-baseline gap-2 pt-2.5">
          {product.hasVariants && <span className="text-xs font-medium text-muted">From</span>}
          <span className="font-display text-base font-extrabold tracking-tight text-ink tabular-nums sm:text-lg">
            {formatLkr(current)}
          </span>
          {current < product.price && (
            <span className="text-xs text-muted line-through">
              {formatLkr(product.price)}
            </span>
          )}
        </div>

        {/* Feature / Specs Badges Row (Bottom of card, like in the reference screenshot) */}
        {!panel && badges.length > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2 text-[11px] text-muted">
            {badges.map((b, i) => {
              const Icon = b.icon;
              return (
                <div key={i} className="flex items-center gap-1">
                  <Icon className="h-3 w-3 text-muted/70" strokeWidth={1.75} aria-hidden />
                  <span className="truncate font-medium">{b.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}
