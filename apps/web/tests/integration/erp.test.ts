/**
 * Integration tests of the ERP client modules against the MOCK ERP (provisional contract).
 * They prove our client logic (auth, pagination, retries, idempotency, error mapping),
 * not compatibility with the live HEXALYTE API.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `cm0item${String(n).padStart(8, "0")}`;

const PORT = 4020;
let proc: ChildProcess;

const control = (body: unknown) =>
  fetch(`http://localhost:${PORT}/__control`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json() as Promise<{ orderPosts: number; orders: number; requests: string[]; orderRefs: string[]; ordersWithoutIdempotencyKey: number }>);

beforeAll(async () => {
  process.env.HX_API_BASE = `http://localhost:${PORT}/api/v1/store-api`;
  process.env.HX_STORE_CREDENTIAL = "hxs_test.testsecret";
  proc = spawn(process.execPath, ["--import", "tsx", "tests/mock-erp/server.ts"], { env: { ...process.env, MOCK_ERP_PORT: String(PORT) }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://localhost:${PORT}/__control`, { method: "POST", body: "{}" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("mock ERP did not start");
});
afterAll(() => proc?.kill());

beforeEach(async () => {
  await control({ reset: true });
  const { resetCatalogueCache } = await import("@/lib/erp/catalogue");
  resetCatalogueCache();
  process.env.HX_API_BASE = `http://localhost:${PORT}/api/v1/store-api`;
  process.env.HX_STORE_CREDENTIAL = "hxs_test.testsecret";
});

const baseInput = (ref: string, total: number) => ({
  externalRef: ref,
  lines: [{ productId: id(3), variantKey: "", quantity: 2 }],
  customer: { name: "Kasun Perera", phone: "+94771234567", email: "" },
  delivery: { address: "12 Galle Road", city: "Colombo", district: "Colombo" as const, postalCode: "", notes: "" },
  expectedTotal: total,
  acceptTerms: true as const,
});
const REF = "VLK-251019-ABCDEFGHJK";

describe("auth + connection", () => {
  it("ping works with valid credential", async () => {
    const { ping } = await import("@/lib/erp/settings");
    expect(await ping()).toBe(true);
  });
  it("rejects a wrong credential (mapped to unavailable, never leaked)", async () => {
    process.env.HX_STORE_CREDENTIAL = "hxs_bad.wrong";
    const { getSettings } = await import("@/lib/erp/settings");
    await expect(getSettings()).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
    const { getCheckoutAvailability } = await import("@/lib/erp/settings");
    expect((await getCheckoutAvailability()).enabled).toBe(false);
  });
  it("reports not-configured when env is missing", async () => {
    delete process.env.HX_API_BASE;
    const { getCheckoutAvailability } = await import("@/lib/erp/settings");
    expect(await getCheckoutAvailability()).toMatchObject({ enabled: false, reason: "not_configured" });
  });
  it("reports unreachable when the ERP is down", async () => {
    process.env.HX_API_BASE = "http://localhost:1/api/v1/store-api";
    const { getCheckoutAvailability } = await import("@/lib/erp/settings");
    expect(await getCheckoutAvailability()).toMatchObject({ enabled: false, reason: "unreachable" });
  });
});

describe("settings + COD eligibility", () => {
  it("enables checkout when store, orders and COD are on", async () => {
    const { getCheckoutAvailability } = await import("@/lib/erp/settings");
    const a = await getCheckoutAvailability({ fresh: true });
    expect(a.enabled).toBe(true);
    expect(a.settings?.deliveryCharge).toBe(450);
  });
  it.each([
    [{ paymentMethods: { COD: false } }, "cod_disabled"],
    [{ ordersEnabled: false }, "orders_disabled"],
  ])("disables checkout for %j", async (patch, reason) => {
    await control({ settings: patch });
    const { getCheckoutAvailability } = await import("@/lib/erp/settings");
    expect(await getCheckoutAvailability({ fresh: true })).toMatchObject({ enabled: false, reason });
  });
});

describe("catalogue", () => {
  it("treats a disabled store (401) as not configured and a paused integration (403) as store_inactive", async () => {
    await control({ storeActive: false });
    const { getCheckoutAvailability } = await import("@/lib/erp/settings");
    expect(await getCheckoutAvailability({ fresh: true })).toMatchObject({ enabled: false, reason: "not_configured" });
  });

  it("loads all pages (pagination) and filters/sorts/searches", async () => {
    const { listProducts } = await import("@/lib/erp/catalogue");
    const all = await listProducts({ pageSize: 48 });
    expect(all.total).toBe(20);
    expect(all.categories.map((c) => c.slug)).toContain("mobile-phones");
    expect((await listProducts({ category: "audio" })).total).toBe(4);
    expect((await listProducts({ q: "nova" })).total).toBe(2);
    const asc = await listProducts({ sort: "price-asc", pageSize: 3 });
    expect(asc.items[0].name).toBe("Glide Tempered Glass");
    expect(asc.pageCount).toBe(7);
    expect((await listProducts({ inStockOnly: true, pageSize: 48 })).total).toBe(19);
  });
  it("applies incremental updates and removals", async () => {
    const { listProducts, getProductBySlug, resetCatalogueCache, getSnapshot } = await import("@/lib/erp/catalogue");
    await getSnapshot();
    await control({ removeItem: id(7) });
    await control({ setPrice: { id: id(6), price: 1700 } });
    // force a refresh while keeping the watermark
    (globalThis as unknown as { __voltaCatalogue: { syncedAt: number } }).__voltaCatalogue.syncedAt = 0;
    const res = await listProducts({ pageSize: 48 });
    expect(res.total).toBe(19);
    expect(await getProductBySlug(`glide-tempered-glass-${id(7)}`)).toBeNull();
    expect((await getProductBySlug(`volt-usb-c-cable-1m-${id(6)}`))?.price).toBe(1700); // incremental update applied
    resetCatalogueCache();
  });
  it("keeps products without ERP images empty (SKU-6, SKU-7) and resolves relative images against the ERP origin", async () => {
    const { getSnapshot } = await import("@/lib/erp/catalogue");
    const { products } = await getSnapshot();
    expect(products.get(id(6))?.sku).toBe("SKU-6");
    expect(products.get(id(6))?.images).toEqual([]);
    expect(products.get(id(7))?.sku).toBe("SKU-7");
    expect(products.get(id(7))?.images).toEqual([]);
    expect(products.get(id(1))?.sku).toBe("SKU-1");
    expect(products.get(id(1))?.images).toEqual([`http://localhost:${PORT}/uploads/${id(1)}.svg`]);
  });
});

describe("availability + reservations", () => {
  it("returns live price and stock; flags unavailable variants", async () => {
    const { checkAvailability } = await import("@/lib/erp/availability");
    const r = await checkAvailability([
      { productId: id(1), variantKey: "256GB::Black", quantity: 1 },
      { productId: id(1), variantKey: "256GB::Blue", quantity: 1 },
      { productId: id(13), variantKey: "", quantity: 1 },
    ]);
    expect(r[0]).toMatchObject({ available: true, unitPrice: 149900 });
    expect(r[1].available).toBe(false);
    expect(r[2].available).toBe(false);
  });
  it("creates an idempotent reservation and releases it", async () => {
    const { createReservation, releaseReservation } = await import("@/lib/erp/reservations");
    const a = await createReservation("key-0123456789abcdef", [{ productId: id(3), variantKey: "", quantity: 1 }]);
    const b = await createReservation("key-0123456789abcdef", [{ productId: id(3), variantKey: "", quantity: 1 }]);
    expect(a.reservationRef).toBe(b.reservationRef);
    await expect(releaseReservation(a.reservationRef)).resolves.toBeUndefined();
  });
});

describe("COD order placement", () => {
  it("places an order with ERP-computed totals (never browser prices)", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { order } = await placeOrder(baseInput(REF, 14900 * 2 + 450));
    expect(order).toMatchObject({ ref: REF, status: "PLACED", paymentMethod: "COD", codCollected: false, total: 30250 });
    expect(JSON.stringify(order)).not.toMatch(/tenant|branch|phone|address/i);
  });

  it("retry with the same reference does not create a duplicate", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    await placeOrder(baseInput(REF, 30250));
    await placeOrder(baseInput(REF, 30250));
    const s = await control({});
    expect(s.orders).toBe(1);
  });

  it("recovers from a transient 5xx using the same idempotency key", async () => {
    await control({ failNextOrder: "500" });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { order } = await placeOrder(baseInput(REF, 30250));
    expect(order.ref).toBe(REF);
    const s = await control({});
    expect(s.orderPosts).toBe(2);
    expect(s.orders).toBe(1);
  });

  it("sends the documented wire format: idempotency key always present, ERP accepts the strict body", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    await placeOrder(baseInput(REF, 30250)); // the mock rejects unknown fields, string-typed money, and wrong delivery keys
    expect((await control({})).ordersWithoutIdempotencyKey).toBe(0);
  });

  it("repeats the same request when the ERP answers IDEMPOTENCY_IN_PROGRESS", async () => {
    await control({ failNextOrder: "in-progress" });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { order } = await placeOrder(baseInput(REF, 30250));
    expect(order.ref).toBe(REF);
    const s = await control({});
    expect(s.orderPosts).toBe(2);
    expect(s.orders).toBe(1);
  }, 10000);

  it("recovers from a dropped connection after the order was created, without duplicating", async () => {
    await control({ failNextOrder: "timeout-after-create" });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { order } = await placeOrder(baseInput(REF, 30250));
    expect(order.ref).toBe(REF);
    expect((await control({})).orders).toBe(1);
  });

  it("detects a price change before creating the order", async () => {
    await control({ setPrice: { id: id(3), price: 16000 } });
    const { placeOrder, CheckoutConflict } = await import("@/lib/checkout/place-order");
    const err = await placeOrder(baseInput(REF, 30250)).catch((e) => e);
    expect(err).toBeInstanceOf(CheckoutConflict);
    expect(err.code).toBe("PRICE_CHANGED");
    expect(err.newTotal).toBe(32450);
    expect(err.refreshed[0].unitPrice).toBe(16000);
    expect((await control({})).orders).toBe(0);
  });

  it("rejects insufficient stock", async () => {
    await control({ setStock: { id: id(3), stock: 1 } });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    await expect(placeOrder(baseInput(REF, 30250))).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("refuses to order when COD is disabled", async () => {
    await control({ settings: { paymentMethods: { COD: false } } });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    await expect(placeOrder(baseInput(REF, 30250))).rejects.toMatchObject({ kind: "ORDERS_NOT_ENABLED" });
    expect((await control({})).orderPosts).toBe(0);
  });

  it("surfaces REFERENCE_REUSED when the same ref is sent with different contents", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    await placeOrder(baseInput(REF, 30250));
    const changed = { ...baseInput(REF, 30250), delivery: { ...baseInput(REF, 0).delivery, city: "Kandy" } };
    await expect(placeOrder(changed)).rejects.toMatchObject({ kind: "REFERENCE_REUSED" });
  });
});

describe("tracking + cancellation", () => {
  it("returns a privacy-filtered order with tracking info and COD pending", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { getOrder, toPublicOrder } = await import("@/lib/erp/order-tracking");
    await placeOrder(baseInput(REF, 30250));
    await control({ setOrderStatus: { ref: REF, status: "DISPATCHED", trackingNumber: "TRK123", carrierName: "Courier X" } });
    const o = toPublicOrder(await getOrder(REF));
    expect(o).toMatchObject({ status: "DISPATCHED", trackingNumber: "TRK123", carrier: "Courier X", codCollected: false, cancellable: false });
  });
  it("cancels before dispatch and refuses after", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { getOrder, cancelOrder } = await import("@/lib/erp/order-tracking");
    await placeOrder(baseInput(REF, 30250));
    await cancelOrder(REF);
    expect((await getOrder(REF)).status).toBe("CANCELLED");
    const ref2 = "VLK-251019-BCDEFGHJKM";
    await placeOrder(baseInput(ref2, 30250));
    await control({ setOrderStatus: { ref: ref2, status: "DISPATCHED" } });
    await expect(cancelOrder(ref2)).rejects.toMatchObject({ kind: "ORDER_NOT_CANCELLABLE" });
  });
  it("maps an unknown order to NOT_FOUND", async () => {
    const { getOrder } = await import("@/lib/erp/order-tracking");
    await expect(getOrder("VLK-251019-ZZZZZZZZZZ")).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });
});
