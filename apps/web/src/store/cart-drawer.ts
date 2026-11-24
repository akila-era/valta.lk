"use client";

import { useSyncExternalStore, type MouseEvent } from "react";

/**
 * Open state of the cart drawer, shared by everything that opens it (header cart, phone tab bar). It remembers the
 * path it was opened on, so navigating to another page closes it without an effect.
 */
let openOn: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const cartDrawer = {
  open: (pathname: string) => {
    openOn = pathname;
    emit();
  },
  close: () => {
    openOn = null;
    emit();
  },
};

export function useCartDrawerPath() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => openOn,
    () => null,
  );
}

/** Opens the drawer for a plain click; modified clicks (new tab, new window) keep following the link to /cart. */
export function openCartFromClick(e: MouseEvent<HTMLAnchorElement>, pathname: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  cartDrawer.open(pathname);
}
