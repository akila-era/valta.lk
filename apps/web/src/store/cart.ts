"use client";

import { useSyncExternalStore } from "react";
import { addLine, itemCount, removeLine, setQuantity, subtotal, type CartLine } from "@/lib/utils/cart-math";

/**
 * Browser cart. Stores only product references and last-seen display prices.
 * It never holds customer details or any ERP credential.
 */
const KEY = "valta.cart.v1";
const EMPTY: CartLine[] = [];

let lines: CartLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      lines = parsed.filter(
        (l): l is CartLine =>
          l && typeof l.productId === "string" && typeof l.variantKey === "string" && Number.isInteger(l.quantity) && typeof l.unitPrice === "number",
      );
    }
  } catch {
    lines = EMPTY;
  }
}

function commit(next: CartLine[]) {
  lines = next.length ? next : EMPTY;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable: cart still works for this page view */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      loaded = false;
      load();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = () => {
  load();
  return lines;
};

export const cartActions = {
  add: (line: CartLine) => commit(addLine(getSnapshot(), line)),
  setQuantity: (key: string, qty: number) => commit(setQuantity(getSnapshot(), key, qty)),
  remove: (key: string) => commit(removeLine(getSnapshot(), key)),
  clear: () => commit([]),
  /** Applies authoritative prices from the server; drops nothing silently. */
  applyPrices: (updates: { productId: string; variantKey: string; unitPrice: number }[]) =>
    commit(
      getSnapshot().map((l) => {
        const u = updates.find((x) => x.productId === l.productId && x.variantKey === l.variantKey);
        return u ? { ...l, unitPrice: u.unitPrice } : l;
      }),
    ),
};

export function useCart() {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  return { lines: current, count: itemCount(current), subtotal: subtotal(current) };
}
