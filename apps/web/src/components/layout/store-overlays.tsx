"use client";

import dynamic from "next/dynamic";
import { useUi } from "@/store/ui";

// Loaded on first use only, so no page pays for the drawer or quick-view code until a shopper opens one.
const CartDrawer = dynamic(() => import("@/components/cart/cart-drawer").then((m) => m.CartDrawer));
const QuickViewHost = dynamic(() => import("@/components/products/quick-view").then((m) => m.QuickViewHost));

export function StoreOverlays() {
  const { cartOpen, quickView } = useUi();
  return (
    <>
      {cartOpen ? <CartDrawer /> : null}
      {quickView ? <QuickViewHost /> : null}
    </>
  );
}
