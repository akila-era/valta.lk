import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";

export const metadata: Metadata = { title: "Shopping cart", robots: { index: false } };

export default function CartPage() {
  return (
    <>
      <StoreHeroBanner
        breadcrumbs={[{ href: "/", label: "Home" }, { label: "Shopping cart" }]}
        title="Shopping Cart"
        intro="Review selected items, update quantities and proceed to secure checkout."
      />
      {/* Filled in the browser (saved on this device): reserve the space so the footer does not jump down. */}
      <div className="min-h-[55svh]">
        <CartView />
      </div>
    </>
  );
}
