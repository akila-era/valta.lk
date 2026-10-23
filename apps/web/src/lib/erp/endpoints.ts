/**
 * Endpoint map from docs/openapi.yaml (HEXALYTE ERP Store API, base path /api/v1/store-api).
 * Auth: `Authorization: Bearer hxs_<keyId>.<secret>`.
 */
export const endpoints = {
  ping: () => "/ping",
  settings: () => "/settings",
  catalogue: (p: { cursor?: string; limit: number; updatedSince?: string }) => {
    const q = new URLSearchParams({ limit: String(p.limit) });
    if (p.cursor) q.set("cursor", p.cursor);
    if (p.updatedSince) q.set("updatedSince", p.updatedSince);
    return `/catalogue/products?${q}`;
  },
  product: (id: string) => `/catalogue/products/${encodeURIComponent(id)}`,
  reservations: () => "/reservations",
  releaseReservation: (ref: string) => `/reservations/${encodeURIComponent(ref)}/release`,
  orders: () => "/orders",
  order: (ref: string) => `/orders/${encodeURIComponent(ref)}`,
  cancelOrder: (ref: string) => `/orders/${encodeURIComponent(ref)}/cancel`,
} as const;

export function authHeaders(credential: string): Record<string, string> {
  return { Authorization: `Bearer ${credential}` };
}
