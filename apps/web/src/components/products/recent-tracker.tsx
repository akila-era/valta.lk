"use client";

import { useEffect } from "react";
import { recordView } from "@/store/recent";

/** Renders nothing; remembers on this device that the shopper opened this product (for "Recently viewed"). */
export function RecentTracker({ productId }: { productId: string }) {
  useEffect(() => {
    recordView(productId);
  }, [productId]);
  return null;
}
