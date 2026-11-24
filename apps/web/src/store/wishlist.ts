"use client";

import { useSyncExternalStore } from "react";

/** Browser-only wishlist: product references for later. No account or server storage is involved. */
export interface WishItem {
  productId: string;
  slug: string;
  name: string;
  image?: string;
  price: number;
}

const KEY = "volta.wishlist.v1";
const EMPTY: WishItem[] = [];
const MAX = 100;

let items: WishItem[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (Array.isArray(parsed)) {
      items = parsed.filter((i): i is WishItem => i && typeof i.productId === "string" && typeof i.slug === "string" && typeof i.name === "string" && typeof i.price === "number").slice(0, MAX);
    }
  } catch {
    items = EMPTY;
  }
}

function commit(next: WishItem[]) {
  items = next.length ? next : EMPTY;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable: wishlist still works for this page view */
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
  return items;
};

export const wishlistActions = {
  toggle: (item: WishItem) => {
    const cur = getSnapshot();
    commit(cur.some((i) => i.productId === item.productId) ? cur.filter((i) => i.productId !== item.productId) : [item, ...cur].slice(0, MAX));
  },
  remove: (productId: string) => commit(getSnapshot().filter((i) => i.productId !== productId)),
};

export function useWishlist() {
  const list = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  return { items: list, count: list.length, has: (id: string) => list.some((i) => i.productId === id) };
}
