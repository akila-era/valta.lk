import type { Metadata } from "next";
import { WishlistView } from "@/components/products/wishlist-view";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default function WishlistPage() {
  return (
    <>
      <StoreHeroBanner
        breadcrumbs={[{ href: "/", label: "Home" }, { label: "Wishlist" }]}
        section="SAVED"
        label="WISHLIST"
        title="Your Wishlist"
        intro="Items saved on this device. Prices and availability are confirmed live on the product page."
        categoryName="accessories"
        tagline="Personal Favourites"
      />
      {/* Filled in the browser (saved on this device): reserve the space so the footer does not jump down. */}
      <div className="min-h-[55svh]">
        <WishlistView />
      </div>
    </>
  );
}
