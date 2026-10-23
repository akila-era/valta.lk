"use client";

import { Heart } from "lucide-react";
import { useWishlist, wishlistActions, type WishItem } from "@/store/wishlist";

export function WishlistButton({ item, className = "" }: { item: WishItem; className?: string }) {
  const { has } = useWishlist();
  const saved = has(item.productId);
  return (
    <button
      type="button"
      onClick={() => wishlistActions.toggle(item)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${item.name} from wishlist` : `Save ${item.name} to wishlist`}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/90 backdrop-blur transition-colors hover:border-brand-500 hover:text-brand-600 ${saved ? "text-brand-600" : "text-ink"} ${className}`}
    >
      <Heart className={`h-4 w-4 ${saved ? "fill-current" : ""}`} aria-hidden />
    </button>
  );
}
