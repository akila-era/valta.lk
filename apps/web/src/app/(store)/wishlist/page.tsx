import type { Metadata } from "next";
import { WishlistView } from "@/components/products/wishlist-view";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default function WishlistPage() {
  return (
    <>
      <h1 className="page-title mb-2">Wishlist</h1>
      <p className="mb-8 max-w-xl text-sm text-muted sm:text-base">Saved on this device only. Prices and availability shown here are live and are checked again at checkout.</p>
      <WishlistView />
    </>
  );
}
