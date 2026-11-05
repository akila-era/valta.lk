"use client";

/**
 * Small conveniences kept only in this browser (localStorage), never on a server:
 * - the delivery details from the last checkout, so the next one is pre-filled (the shopper can opt out or clear it);
 * - the references of orders placed here, so Track order can list them without typing.
 */
export interface SavedDetails {
  name: string;
  phone: string;
  email: string;
  district: string;
  address: string;
  city: string;
  postalCode: string;
}
export interface RecentOrder {
  ref: string;
  at: string;
  total: number;
}

const DETAILS_KEY = "volta.checkout.details.v1";
const ORDERS_KEY = "volta.recent-orders.v1";
const MAX_ORDERS = 10;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: nothing is remembered, everything still works */
  }
}

export function loadDetails(): SavedDetails | null {
  const d = read<Partial<SavedDetails>>(DETAILS_KEY);
  if (!d || typeof d.name !== "string") return null;
  const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 250) : "");
  return { name: s(d.name), phone: s(d.phone), email: s(d.email), district: s(d.district), address: s(d.address), city: s(d.city), postalCode: s(d.postalCode) };
}
export const saveDetails = (d: SavedDetails) => write(DETAILS_KEY, d);
export const clearDetails = () => write(DETAILS_KEY, null);

export function parseOrders(raw: string | null): RecentOrder[] {
  try {
    const list = raw ? (JSON.parse(raw) as RecentOrder[]) : [];
    return Array.isArray(list) ? list.filter((o) => o && typeof o.ref === "string" && /^VLK-[A-Z0-9-]{6,40}$/.test(o.ref)).slice(0, MAX_ORDERS) : [];
  } catch {
    return [];
  }
}
export const recentOrders = (): RecentOrder[] => parseOrders(rawOrders());

/** The stored list as text (a stable value for useSyncExternalStore); "" on the server or without storage. */
export function rawOrders(): string {
  try {
    return window.localStorage.getItem(ORDERS_KEY) ?? "";
  } catch {
    return "";
  }
}
export function subscribeOrders(cb: () => void) {
  const on = (e: StorageEvent) => {
    if (e.key === ORDERS_KEY) cb();
  };
  window.addEventListener("storage", on);
  return () => window.removeEventListener("storage", on);
}
export function rememberOrder(o: RecentOrder) {
  write(ORDERS_KEY, [o, ...recentOrders().filter((x) => x.ref !== o.ref)].slice(0, MAX_ORDERS));
}
