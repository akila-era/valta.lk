"use client";

import { useSyncExternalStore } from "react";

/**
 * Browser-only "recently viewed": the product IDs this shopper opened, newest first. It is the shopper's own history on this
 * device, so it is genuine data; nothing is stored on the server and no recommendation is implied.
 */
const KEY = "valta.recent.v2";
const LEGACY_KEY = "valta.recent.v1"; // earlier builds stored slugs; that list is discarded
const MAX = 12;
const EMPTY: string[] = [];
const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/;

let ids: string[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    window.localStorage.removeItem(LEGACY_KEY);
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (Array.isArray(parsed)) ids = parsed.filter((s): s is string => typeof s === "string" && VALID_ID.test(s)).slice(0, MAX);
  } catch {
    ids = EMPTY;
  }
}

function commit(next: string[]) {
  ids = next.length ? next : EMPTY;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable: the list still works for this page view */
  }
  listeners.forEach((l) => l());
}

export function recordView(productId: string) {
  load();
  if (!VALID_ID.test(productId) || ids[0] === productId) return;
  commit([productId, ...ids.filter((s) => s !== productId)].slice(0, MAX));
}

export function clearRecent() {
  load();
  commit([]);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRecentIds(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return ids;
    },
    () => EMPTY,
  );
}
