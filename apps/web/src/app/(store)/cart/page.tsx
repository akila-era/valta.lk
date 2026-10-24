import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Shopping cart", robots: { index: false } };

export default function CartPage() {
  return (
    <>
      <PageIntro section="Your bag" label="Cart" title="Shopping cart" />
      <CartView />
    </>
  );
}
