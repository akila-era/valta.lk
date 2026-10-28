"use client";

import { useSyncExternalStore } from "react";

/**
 * Browser-only list of the products this shopper last opened, newest first. Only references are kept (no prices),
 * so nothing stale is ever shown: the product page has the live price.
 */
export interface ViewedItem {
  productId: string;
  slug: string;
  name: string;
  image?: string;
}

const KEY = "volta.recent.v1";
const EMPTY: ViewedItem[] = [];
const MAX = 12;

let items: ViewedItem[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (Array.isArray(parsed)) {
      items = parsed.filter((i): i is ViewedItem => i && typeof i.productId === "string" && typeof i.slug === "string" && typeof i.name === "string").slice(0, MAX);
    }
  } catch {
    items = EMPTY;
  }
}

function commit(next: ViewedItem[]) {
  items = next.length ? next : EMPTY;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable: the list still works for this page view */
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

export const recentlyViewed = {
  /** Moves the product to the front (once), keeping the most recent 12. */
  record: (item: ViewedItem) => {
    const cur = getSnapshot();
    if (cur[0]?.productId === item.productId && cur[0].name === item.name && cur[0].image === item.image) return;
    commit([item, ...cur.filter((i) => i.productId !== item.productId)].slice(0, MAX));
  },
  clear: () => commit([]),
};

export function useRecentlyViewed() {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
