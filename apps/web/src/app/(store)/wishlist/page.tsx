import type { Metadata } from "next";
import { WishlistView } from "@/components/products/wishlist-view";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default function WishlistPage() {
  return (
    <>
      <h1 className="page-title mb-2">Wishlist</h1>
      <p className="mb-6 text-sm text-muted">Saved on this device only. Prices and availability are confirmed on the product page.</p>
      <WishlistView />
    </>
  );
}
