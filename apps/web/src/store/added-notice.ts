"use client";

import { useSyncExternalStore } from "react";
import type { CartLine } from "@/lib/utils/cart-math";

export type AddedItem = Pick<CartLine, "name" | "image" | "variantLabel" | "unitPrice" | "quantity">;

/**
 * The "Added to cart" notice: the last thing added, with a counter so adding the same product twice shows the notice
 * again. Set by every Add to cart button; read by <AddedNotice /> in the store shell.
 */
let current: { item: AddedItem; n: number } | null = null;
let n = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const addedNotice = {
  show: (item: AddedItem) => {
    current = { item, n: ++n };
    emit();
  },
  hide: () => {
    current = null;
    emit();
  },
};

export function useAddedNotice() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}
