import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = { title: "Shopping cart", robots: { index: false } };

export default function CartPage() {
  return (
    <>
      <h1 className="page-title mb-6">Shopping cart</h1>
      <CartView />
    </>
  );
}
