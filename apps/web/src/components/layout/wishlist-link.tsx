"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useWishlist } from "@/store/wishlist";

export function WishlistLink() {
  const { count } = useWishlist();
  return (
    <Link href="/wishlist" className="hidden min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-full px-2.5 text-sm font-medium transition-colors hover:bg-surface min-[375px]:inline-flex md:px-3.5" aria-label={`Wishlist, ${count} item${count === 1 ? "" : "s"}`}>
      <span className="relative">
        <Heart className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        {count > 0 && (
          <span key={count} className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] animate-pop items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-bold text-on-brand" data-testid="wishlist-count">{count}</span>
        )}
      </span>
      <span className="hidden lg:inline">Wishlist</span>
    </Link>
  );
}
