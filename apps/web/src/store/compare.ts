"use client";

import { useSyncExternalStore } from "react";

/** Browser-only compare list (up to MAX products), like the wishlist: product references only, nothing on a server. */
export interface CompareItem {
  productId: string;
  slug: string;
  name: string;
}

export const MAX_COMPARE = 4;
const KEY = "volta.compare.v1";
const EMPTY: CompareItem[] = [];

let items: CompareItem[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (Array.isArray(parsed)) {
      items = parsed.filter((i): i is CompareItem => i && typeof i.productId === "string" && typeof i.slug === "string" && typeof i.name === "string").slice(0, MAX_COMPARE);
    }
  } catch {
    items = EMPTY;
  }
}

function commit(next: CompareItem[]) {
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

export const compareActions = {
  /** Adds the product (the oldest one drops off when the list is full) or removes it when it is already there. */
  toggle: (item: CompareItem) => {
    const cur = getSnapshot();
    commit(cur.some((i) => i.productId === item.productId) ? cur.filter((i) => i.productId !== item.productId) : [...cur, item].slice(-MAX_COMPARE));
  },
  remove: (productId: string) => commit(getSnapshot().filter((i) => i.productId !== productId)),
  clear: () => commit([]),
};

/** The compare page for these products (the page reads the list from its address, so it can be shared). */
export const compareHref = (list: CompareItem[]) => (list.length ? `/compare?p=${list.map((i) => encodeURIComponent(i.slug)).join(",")}` : "/compare");

export function useCompare() {
  const list = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  return { items: list, count: list.length, has: (id: string) => list.some((i) => i.productId === id) };
}
