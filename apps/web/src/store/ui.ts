"use client";

import { useSyncExternalStore } from "react";

/** Open/closed state of the cart drawer and the quick-view product. UI state only; the cart itself lives in store/cart. */
interface UiState {
  cartOpen: boolean;
  quickView: string | null;
}

let state: UiState = { cartOpen: false, quickView: null };
const listeners = new Set<() => void>();
const SERVER: UiState = state;

function set(next: Partial<UiState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export const uiActions = {
  openCart: () => set({ cartOpen: true, quickView: null }),
  closeCart: () => set({ cartOpen: false }),
  openQuickView: (slug: string) => set({ quickView: slug, cartOpen: false }),
  closeQuickView: () => set({ quickView: null }),
};

export function useUi(): UiState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => state,
    () => SERVER,
  );
}
