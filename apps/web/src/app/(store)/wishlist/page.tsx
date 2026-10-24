import type { Metadata } from "next";
import { WishlistView } from "@/components/products/wishlist-view";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default function WishlistPage() {
  return (
    <>
      <PageIntro section="Saved" label="Wishlist" title="Wishlist" intro="Saved on this device only. Prices and availability are confirmed on the product page." />
      <WishlistView />
    </>
  );
}
