"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Smartphone, X } from "lucide-react";
import { formatLkr } from "@/lib/utils/money";
import { useWishlist, wishlistActions } from "@/store/wishlist";
import { SuggestedProducts } from "./suggested-products";

export function WishlistView() {
  const { items } = useWishlist();
  if (!items.length) {
    return (
      <>
        <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Heart className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-lg font-semibold">Your wishlist is empty</p>
          <p className="max-w-sm text-sm text-muted">Tap the heart on any product to save it here.</p>
          <Link href="/products" className="btn-primary mt-3">Browse products</Link>
        </div>
        <SuggestedProducts />
      </>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <li key={i.productId} className="card flex items-center gap-4 p-3">
          <Link href={`/products/${i.slug}`} className="thumb-stage relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
            {i.image ? <Image src={i.image} alt="" fill sizes="80px" className="object-contain p-2" /> : <Smartphone className="m-auto h-full w-8 text-muted" aria-hidden />}
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/products/${i.slug}`} className="line-clamp-2 text-sm font-semibold hover:text-brand-600">{i.name}</Link>
            <p className="mt-1 text-xs text-muted">Last seen at {formatLkr(i.price)}</p>
          </div>
          <button type="button" onClick={() => wishlistActions.remove(i.productId)} className="btn-ghost h-9 w-9 px-0" aria-label={`Remove ${i.name} from wishlist`}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
