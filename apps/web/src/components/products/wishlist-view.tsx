"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Plus, Smartphone, Trash2, X } from "lucide-react";
import { formatLkr } from "@/lib/utils/money";
import { useWishlist, wishlistActions } from "@/store/wishlist";
import { AddToCartButton } from "./add-to-cart-button";
import { SuggestedProducts } from "./suggested-products";

export function WishlistView() {
  const { items } = useWishlist();

  if (!items.length) {
    return (
      <>
        <div className="flex flex-col items-center justify-center rounded-3xl border border-border/80 bg-white px-6 py-16 text-center shadow-soft">
          <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-sm">
            <Heart className="h-8 w-8" strokeWidth={1.75} aria-hidden />
          </span>
          <h2 className="text-xl font-bold text-ink">Your wishlist is empty</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted">
            Tap the heart icon on any product in our store to save it here for later.
          </p>
          <Link href="/products" className="btn-primary mt-6 rounded-full px-6 py-2.5 font-bold shadow-glow">
            Explore Products
          </Link>
        </div>
        <div className="mt-12">
          <SuggestedProducts />
        </div>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {items.map((i) => (
          <li
            key={i.productId}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-white p-3 sm:p-3.5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
          >
            {/* Remove button at top right */}
            <button
              type="button"
              onClick={() => wishlistActions.remove(i.productId)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-muted shadow-xs transition-colors hover:bg-red-50 hover:text-danger"
              aria-label={`Remove ${i.name} from wishlist`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>

            {/* Thumbnail Stage */}
            <div className="relative mb-2.5 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-surface/50 p-2 sm:p-2.5">
              <span
                aria-hidden
                className="absolute inset-2 rounded-full bg-white shadow-inner"
              />
              <Link
                href={`/products/${i.slug}`}
                className="relative flex h-full w-full items-center justify-center transition-transform group-hover:scale-105"
              >
                {i.image ? (
                  <Image
                    src={i.image}
                    alt={i.name}
                    fill
                    sizes="(min-width: 1280px) 240px, (min-width: 768px) 30vw, 50vw"
                    className="object-contain p-2 filter drop-shadow-sm"
                  />
                ) : (
                  <Smartphone className="h-10 w-10 text-muted/60" aria-hidden />
                )}
              </Link>
            </div>

            {/* Title & Price */}
            <div className="flex flex-1 flex-col">
              <h3 className="line-clamp-2 min-h-10 text-[13.5px] font-bold leading-5 tracking-tight text-ink transition-colors group-hover:text-brand-600">
                <Link href={`/products/${i.slug}`}>{i.name}</Link>
              </h3>

              <div className="mt-auto pt-2">
                <p className="font-display text-base font-extrabold text-ink tabular-nums">
                  {formatLkr(i.price)}
                </p>
                <p className="text-[11px] text-muted">Price at save time</p>
              </div>

              {/* Action buttons */}
              <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-2.5">
                <Link
                  href={`/products/${i.slug}`}
                  className="btn-secondary w-full rounded-full py-1.5 text-xs font-semibold"
                >
                  View Details
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
