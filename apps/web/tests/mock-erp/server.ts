import { renderProductSvg } from "./product-art";
/**
 * Mock HEXALYTE store-api for local development and automated tests ONLY.
 * Behaviour follows docs/API_INTEGRATION_GUIDE.md, docs/openapi.yaml, docs/STORE_ORDER_API.md and
 * docs/WEBSITE_QUICKSTART.md of the ERP repo (envelope, decimal strings, strict request bodies, idempotent replay).
 * Passing tests against this server is NOT proof of compatibility with a running ERP.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_ERP_PORT ?? 4010);
const BASE = "/api/v1/store-api";
const CREDENTIAL = "hxs_test.testsecret";
const itemId = (n: number) => `cm0item${String(n).padStart(8, "0")}`;

interface Variant { key: string; storage: string; color: string; sku: string; price: string; stock: number }
interface Item {
  subCategory?: string;
  id: string; sku: string; name: string; brand: string; category: string; price: string; salePrice: string | null;
  discountActive: boolean; stock: number; updatedAt: string; variants: Variant[]; model?: string;
}

const mk = (n: number, name: string, category: string, brand: string, price: number, extra: Partial<Item> = {}): Item => ({
  id: itemId(n), sku: `SKU-${n}`, name, brand, category, price: price.toFixed(2), salePrice: null, discountActive: false,
  stock: 20, updatedAt: `2026-10-${String(10 + (n % 9)).padStart(2, "0")}T08:00:00.000Z`, variants: [], ...extra,
});

const initialItems = (): Item[] => [
  mk(1, "Nova X1 Smartphone", "Mobile Phones", "Nova", 129900, {
    model: "X1",
    variants: [
      { key: "128GB::Black", storage: "128GB", color: "Black", sku: "NX1-128-BK", price: "129900.00", stock: 5 },
      { key: "256GB::Black", storage: "256GB", color: "Black", sku: "NX1-256-BK", price: "149900.00", stock: 5 },
      { key: "256GB::Blue", storage: "256GB", color: "Blue", sku: "NX1-256-BL", price: "149900.00", stock: 0 },
    ],
  }),
  mk(2, "Orbit Pro Smartphone", "Mobile Phones", "Orbit", 219900, { salePrice: "199900.00", discountActive: true }),
  mk(3, "Pulse Wireless Earbuds", "Audio", "Pulse", 14900, { subCategory: "Earbuds" }),
  mk(4, "Pulse Over-Ear Headphones", "Audio", "Pulse", 24900, { subCategory: "Headphones" }),
  mk(5, "Volt 20W Fast Charger", "Accessories", "Volt", 3900, { subCategory: "Chargers" }),
  mk(6, "Volt USB-C Cable 1m", "Accessories", "Volt", 1500, { subCategory: "Cables" }),
  mk(7, "Glide Tempered Glass", "Accessories", "Glide", 990),
  mk(8, "Atlas Smartwatch", "Wearables", "Atlas", 34900),
  mk(9, "Atlas Fitness Band", "Wearables", "Atlas", 8900),
  mk(10, "Echo Bluetooth Speaker", "Audio", "Echo", 11900, { subCategory: "Speakers" }),
  mk(11, "Nova Lite Smartphone", "Mobile Phones", "Nova", 64900),
  mk(12, "Orbit Tablet 10", "Tablets", "Orbit", 89900),
  mk(13, "Limited Case (sold out)", "Accessories", "Glide", 2500, { stock: 0 }),
  mk(14, "Volt Power Bank 10000", "Accessories", "Volt", 7900, { subCategory: "Power Banks" }),
  mk(15, "Echo Mini Speaker", "Audio", "Echo", 5900, { subCategory: "Speakers" }),
];

const defaultSettings = () => ({
  currency: "LKR", reservationsEnabled: true, ordersEnabled: true, paymentMethods: { COD: true, ONLINE: false },
  deliveryCharge: "450.00",
  limits: { reservationTtlSeconds: { min: 60, default: 900, max: 86400 }, maxReservationLines: 20, maxOrderLines: 20, maxQuantityPerLine: 100 },
});

type OrderRecord = Record<string, unknown> & { externalRef: string; status: string; _body: string };

const state = {
  items: initialItems(),
  removed: [] as string[],
  settings: defaultSettings() as ReturnType<typeof defaultSettings> & Record<string, unknown>,
  storeActive: true,
  orders: new Map<string, OrderRecord>(),
  reservations: new Map<string, { expiresAt: string; status: string; body: string }>(),
  delayMs: 0,
  failNextOrder: null as null | "500" | "timeout-after-create" | "in-progress",
  /** While true, every order POST answers 503 (an ERP outage). */
  orderOutage: false,
  /** Queue of definitive rejections, consumed one per order POST. */
  rejectOrders: [] as { status: number; code: string }[],
  orderPosts: 0,
  ordersWithoutIdempotencyKey: 0,
  requests: [] as string[],
};

const send = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};
const ok = (res: http.ServerResponse, data: unknown, status = 200) => send(res, status, { success: true, data });
const err = (res: http.ServerResponse, status: number, code: string, extra: Record<string, unknown> = {}) =>
  send(res, status, { success: false, message: code, code, ...extra });

const avail = (stock: number) => (stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK");
const qty = (stock: number) => Math.min(stock, 20);

const wireItem = (i: Item) => ({
  id: i.id, externalId: null, sku: i.sku, name: i.name, description: `${i.name} by ${i.brand}.`, brand: i.brand,
  category: i.category, subCategory: i.subCategory ?? null, model: i.model ?? null, condition: null, warrantyMonths: null, warrantyNote: null,
  images: i.sku === "SKU-6" || i.sku === "SKU-7" ? [] : [{ url: `/uploads/${i.id}.svg`, relative: true }], currency: "LKR", price: i.variants.length ? i.variants.map((v) => Number(v.price)).sort((a, b) => a - b)[0].toFixed(2) : i.price,
  salePrice: i.salePrice, discountActive: i.discountActive, discountEndsAt: null, hasVariants: i.variants.length > 0,
  variants: i.variants.map((v) => ({ key: v.key, sku: v.sku, storage: v.storage, color: v.color, colorHex: null, price: v.price, salePrice: null, discountActive: false, availability: avail(v.stock), purchasableQuantity: qty(v.stock) })),
  availability: i.variants.length ? avail(i.variants.reduce((a, v) => a + v.stock, 0)) : avail(i.stock),
  purchasableQuantity: i.variants.length ? qty(i.variants.reduce((a, v) => a + v.stock, 0)) : qty(i.stock),
  publishedAt: i.sku === "SKU-3" || i.sku === "SKU-8" ? new Date(Date.now() - 3 * 86400_000).toISOString() : new Date(Date.now() - (60 + Number(i.id.slice(-8))) * 86400_000).toISOString(), updatedAt: i.updatedAt,
});

const unitPriceOf = (it: Item, variantKey?: string | null) => {
  if (it.variants.length) return it.variants.find((v) => v.key === variantKey)?.price;
  return it.discountActive && it.salePrice ? it.salePrice : it.price;
};
const stockOf = (it: Item, variantKey?: string | null) => (it.variants.length ? (it.variants.find((v) => v.key === variantKey)?.stock ?? 0) : it.stock);

const exactKeys = (obj: Record<string, unknown>, required: string[], optional: string[]) => {
  const keys = Object.keys(obj);
  return required.every((k) => k in obj) && keys.every((k) => required.includes(k) || optional.includes(k));
};

const wireOrder = (o: OrderRecord) => {
  const { _body, ...rest } = o;
  void _body;
  return rest;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString();
  let body: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return err(res, 400, "VALIDATION_ERROR");
  }

  // ---- test control plane (not part of the ERP contract) ----
  if (url.pathname === "/__control") {
    if (body.reset) {
      // A reset is a change in the ERP too: bump timestamps so the website's incremental catalogue sync picks it up.
      state.items = initialItems().map((i) => ({ ...i, updatedAt: new Date().toISOString() })); state.removed = []; state.orders.clear(); state.reservations.clear();
      state.failNextOrder = null; state.orderOutage = false; state.rejectOrders = []; state.orderPosts = 0; state.ordersWithoutIdempotencyKey = 0; state.requests = [];
      state.delayMs = 0; state.storeActive = true; state.settings = defaultSettings();
    }
    if (body.settings) Object.assign(state.settings, body.settings);
    if (body.storeActive !== undefined) state.storeActive = body.storeActive;
    if (body.setPrice) { const it = state.items.find((i) => i.id === body.setPrice.id); if (it) { it.price = Number(body.setPrice.price).toFixed(2); it.updatedAt = new Date().toISOString(); } }
    if (body.setStock) { const it = state.items.find((i) => i.id === body.setStock.id); if (it) { it.stock = body.setStock.stock; it.updatedAt = new Date().toISOString(); } }
    if (body.removeItem) { state.items = state.items.filter((i) => i.id !== body.removeItem); state.removed.push(body.removeItem); }
    if (body.delayMs !== undefined) state.delayMs = body.delayMs;
    if (body.failNextOrder !== undefined) state.failNextOrder = body.failNextOrder;
    if (body.orderOutage !== undefined) state.orderOutage = body.orderOutage;
    if (body.rejectOrders !== undefined) state.rejectOrders = body.rejectOrders;
    if (body.setOrderStatus) {
      const o = state.orders.get(body.setOrderStatus.ref);
      if (o) {
        o.status = body.setOrderStatus.status;
        if (body.setOrderStatus.trackingNumber !== undefined) { o.trackingNumber = body.setOrderStatus.trackingNumber; o.carrierName = body.setOrderStatus.carrierName ?? null; }
        if (body.setOrderStatus.paymentStatus) o.paymentStatus = body.setOrderStatus.paymentStatus;
      }
    }
    return send(res, 200, { orderPosts: state.orderPosts, orders: state.orders.size, requests: state.requests, orderRefs: [...state.orders.keys()], ordersWithoutIdempotencyKey: state.ordersWithoutIdempotencyKey });
  }

  const img = url.pathname.match(/^\/uploads\/([A-Za-z0-9]+)\.svg$/);
  if (img) {
    const it = state.items.find((i) => i.id === img[1]);
    const svg = renderProductSvg(it);
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=60" });
    return res.end(svg);
  }

  if (!url.pathname.startsWith(BASE)) return err(res, 404, "NOT_FOUND");
  const path = url.pathname.slice(BASE.length);
  state.requests.push(`${req.method} ${path}`);
  if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
  if (!state.storeActive || req.headers.authorization !== `Bearer ${CREDENTIAL}`) return err(res, 401, "INVALID_CREDENTIALS");

  if (req.method === "GET" && path === "/ping") return ok(res, { connection: { id: "c1", displayName: "VALTA.LK", status: "ACTIVE" }, serverTime: new Date().toISOString() });
  if (req.method === "GET" && path === "/settings") return ok(res, { ...state.settings, generatedAt: new Date().toISOString() });

  if (req.method === "GET" && path === "/catalogue/products") {
    const limit = Number(url.searchParams.get("limit") ?? 50);
    if (!(limit >= 1 && limit <= 100)) return err(res, 400, "VALIDATION_ERROR");
    const cursor = url.searchParams.get("cursor");
    const offset = cursor ? Number(cursor.replace(/^cur/, "")) : 0;
    const since = url.searchParams.get("updatedSince");
    const list = since ? state.items.filter((i) => i.updatedAt > since) : state.items;
    const slice = list.slice(offset, offset + limit);
    return ok(res, {
      currency: "LKR", items: slice.map(wireItem),
      ...(since ? { removed: state.removed.map((id) => ({ id, externalId: null })), removedTruncated: false } : {}),
      nextCursor: offset + limit < list.length ? `cur${String(offset + limit).padStart(7, "0")}` : null,
      generatedAt: new Date().toISOString(),
    });
  }
  const pm = path.match(/^\/catalogue\/products\/([^/]+)$/);
  if (req.method === "GET" && pm) {
    const it = state.items.find((i) => i.id === decodeURIComponent(pm[1]));
    return it ? ok(res, wireItem(it)) : err(res, 404, "NOT_FOUND");
  }

  if (req.method === "POST" && path === "/reservations") {
    if (!state.settings.reservationsEnabled) return err(res, 403, "RESERVATIONS_NOT_ENABLED");
    if (!exactKeys(body, ["externalRef", "lines"], ["ttlSeconds"])) return err(res, 422, "VALIDATION_ERROR");
    const existing = state.reservations.get(body.externalRef);
    if (existing) return existing.body === raw ? ok(res, { externalRef: body.externalRef, status: existing.status, expiresAt: existing.expiresAt, replay: true }) : err(res, 409, "REFERENCE_REUSED");
    const rec = { expiresAt: new Date(Date.now() + (body.ttlSeconds ?? 900) * 1000).toISOString(), status: "ACTIVE", body: raw };
    state.reservations.set(body.externalRef, rec);
    return ok(res, { externalRef: body.externalRef, status: "ACTIVE", expiresAt: rec.expiresAt, replay: false }, 201);
  }
  const rm = path.match(/^\/reservations\/([^/]+)\/release$/);
  if (req.method === "POST" && rm) {
    const r = state.reservations.get(decodeURIComponent(rm[1]));
    if (!r) return err(res, 404, "NOT_FOUND");
    r.status = "RELEASED";
    return ok(res, { externalRef: decodeURIComponent(rm[1]), status: "RELEASED", expiresAt: r.expiresAt, result: "released" });
  }

  if (req.method === "POST" && path === "/orders") {
    state.orderPosts++;
    const key = String(req.headers["idempotency-key"] ?? "");
    if (!key) state.ordersWithoutIdempotencyKey++;
    if (!state.settings.ordersEnabled) return err(res, 403, "ORDERS_NOT_ENABLED");
    if (state.orderOutage) return send(res, 503, { success: false, message: "temporarily unavailable" });
    if (state.rejectOrders.length) { const r = state.rejectOrders.shift()!; return err(res, r.status, r.code); }
    if (state.failNextOrder === "500") { state.failNextOrder = null; return send(res, 503, { success: false, message: "temporarily unavailable" }); }
    if (state.failNextOrder === "in-progress") { state.failNextOrder = null; return err(res, 409, "IDEMPOTENCY_IN_PROGRESS"); }

    // strict body validation: unknown fields are rejected (422)
    const customer = body.customer ?? {}, delivery = body.delivery ?? {};
    if (
      !exactKeys(body, ["externalRef", "currency", "paymentMethod", "lines", "total", "customer", "delivery"], ["reservationRef", "deliveryCharge"]) ||
      !exactKeys(customer, ["name", "phone"], ["email"]) ||
      !exactKeys(delivery, ["addressLine1", "city"], ["addressLine2", "district", "postalCode", "notes"]) ||
      !Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 20 ||
      !body.lines.every((l: Record<string, unknown>) => exactKeys(l, ["itemId", "quantity", "unitPrice"], ["variantKey"]) && typeof l.unitPrice === "string") ||
      typeof body.total !== "string" || (body.deliveryCharge !== undefined && typeof body.deliveryCharge !== "string") ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(String(body.externalRef)) || String(customer.name).length < 2 || !/^\+?\d{7,15}$/.test(String(customer.phone)) ||
      String(delivery.addressLine1).length < 3
    ) return err(res, 422, "VALIDATION_ERROR");

    const existing = state.orders.get(body.externalRef);
    if (existing) return existing._body === raw ? ok(res, { ...wireOrder(existing), replay: true }) : err(res, 409, "REFERENCE_REUSED");

    if (body.currency !== state.settings.currency) return err(res, 422, "CURRENCY_MISMATCH", { expectedCurrency: state.settings.currency });
    if (body.paymentMethod !== "COD" || !state.settings.paymentMethods.COD) return err(res, 422, "PAYMENT_METHOD_NOT_ENABLED");

    let sub = 0;
    const currentPrices: unknown[] = [];
    let priceChanged = false;
    for (const l of body.lines) {
      const it = state.items.find((i) => i.id === l.itemId);
      const price = it ? unitPriceOf(it, l.variantKey) : undefined;
      if (!it || price === undefined) return err(res, 422, "ITEM_NOT_AVAILABLE");
      if (stockOf(it, l.variantKey) < l.quantity) return err(res, 409, "INSUFFICIENT_STOCK", { shortfalls: [{ itemId: l.itemId, requested: l.quantity, availableQuantity: qty(stockOf(it, l.variantKey)) }] });
      currentPrices.push({ itemId: l.itemId, variantKey: l.variantKey ?? null, unitPrice: price });
      if (price !== l.unitPrice) priceChanged = true;
      sub += Number(price) * 100 * l.quantity;
    }
    const delivery$ = Math.round(Number(state.settings.deliveryCharge) * 100);
    if (priceChanged || (body.deliveryCharge !== undefined && Math.round(Number(body.deliveryCharge) * 100) !== delivery$)) {
      return err(res, 409, "PRICE_CHANGED", { currentPrices, deliveryCharge: state.settings.deliveryCharge });
    }
    const expectedTotal = ((sub + delivery$) / 100).toFixed(2);
    if (body.total !== expectedTotal) return err(res, 409, "TOTAL_MISMATCH", { expectedTotal });

    // reserve stock (held, not deducted physically in the real ERP; the mock simply keeps counts unchanged)
    const order: OrderRecord = {
      externalRef: body.externalRef, status: "PLACED", paymentMethod: "COD", paymentStatus: "COD_PENDING", currency: "LKR",
      subtotal: (sub / 100).toFixed(2), deliveryCharge: state.settings.deliveryCharge, total: expectedTotal,
      lines: body.lines.map((l: Record<string, any>) => ({ itemId: l.itemId, variantKey: l.variantKey ?? null, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: ((Number(l.unitPrice) * 100 * l.quantity) / 100).toFixed(2) })), // eslint-disable-line @typescript-eslint/no-explicit-any
      placedAt: new Date().toISOString(), holdUntil: new Date(Date.now() + 86400_000).toISOString(),
      confirmedAt: null, dispatchedAt: null, deliveredAt: null, cancelledAt: null, cancelReason: null, refundRequired: false,
      invoiceNumber: null, trackingNumber: null, carrierName: null, _body: raw,
    };
    state.orders.set(order.externalRef, order);
    if (state.failNextOrder === "timeout-after-create") {
      state.failNextOrder = null;
      await new Promise((r) => setTimeout(r, 300));
      req.socket.destroy(); // order exists, the client never sees the response
      return;
    }
    return ok(res, { ...wireOrder(order), replay: false }, 201);
  }

  const om = path.match(/^\/orders\/([^/]+)(\/cancel)?$/);
  if (om) {
    const o = state.orders.get(decodeURIComponent(om[1]));
    if (!o) return err(res, 404, "NOT_FOUND");
    if (req.method === "GET" && !om[2]) return ok(res, wireOrder(o));
    if (req.method === "POST" && om[2]) {
      if (o.status === "CANCELLED") return ok(res, { ...wireOrder(o), result: "already_cancelled" });
      if (!["PLACED", "CONFIRMED"].includes(o.status)) return err(res, 409, "ORDER_NOT_CANCELLABLE");
      o.status = "CANCELLED"; o.cancelledAt = new Date().toISOString(); o.cancelReason = body.reason ?? null;
      return ok(res, { ...wireOrder(o), result: "cancelled" });
    }
  }
  return err(res, 404, "NOT_FOUND");
});

server.listen(PORT, () => console.log(`mock ERP listening on :${PORT}`));
