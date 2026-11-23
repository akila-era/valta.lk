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
      className={`group/heart flex h-11 w-11 items-center justify-center ${className}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/90 backdrop-blur transition-colors group-hover/heart:border-brand-500 group-hover/heart:text-brand-600 ${saved ? "text-brand-600" : "text-ink"}`}>
        <Heart className={`h-4 w-4 ${saved ? "fill-current" : ""}`} aria-hidden />
      </span>
    </button>
  );
}
