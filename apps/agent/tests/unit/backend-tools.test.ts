import { describe, expect, it } from "vitest";
import { buildCards, comparisonRows } from "../../src/backend/cards";
import { plainText } from "../../src/backend/catalogue";
import { MAX_LINE_QTY } from "../../src/backend/mock-backend";
import { Card } from "../../src/contract/schemas";
import { itemId, FixtureErpTransport, MOCK_ORDER_REFS } from "../../src/mock/erp-fixture";
import { createMockStack } from "../../src/mock/stack";
import { runToolCalls, type ToolOutcome } from "../../src/tools/runner";
import { customerCtx, guestCtx } from "../fixtures/pipeline-helpers";

const NOVA_X1 = itemId(1);
const ORBIT = itemId(2);
const EARBUDS = itemId(3);
const WATCH = itemId(8);

function setup(opts: { ttl?: number; now?: () => number } = {}) {
  const transport = new FixtureErpTransport();
  return createMockStack({ transport, ...(opts.ttl !== undefined ? { catalogueTtlMs: opts.ttl } : {}), ...(opts.now ? { now: opts.now } : {}) });
}
const search = (s: ReturnType<typeof setup>, args: Record<string, unknown>, ctx = guestCtx()) => s.backend.search_products({ inStockOnly: true, limit: 5, ...args } as never, ctx);
const ids = (r: { items: { id: string }[] }) => r.items.map((p) => p.id);

describe("1. product search", () => {
  it("filters by category, brand, price bounds and stock, like the storefront", async () => {
    const s = setup();
    const phones = (await search(s, { category: "mobile-phones" })) as { items: { id: string }[]; total: number };
    expect(ids(phones).sort()).toEqual([NOVA_X1, ORBIT, itemId(11)].sort());
    expect(ids((await search(s, { brand: "nova" })) as never).sort()).toEqual([NOVA_X1, itemId(11)].sort());
    expect(ids((await search(s, { maxPriceLkr: 20000 })) as never)).not.toContain(WATCH); // 34,900 is above the ceiling
    expect(ids((await search(s, { minPriceLkr: 100000, maxPriceLkr: 150000 })) as never).sort()).toEqual([NOVA_X1, itemId(18)].sort());
    const noStockFilter = (await search(s, { inStockOnly: false, query: "limited" })) as { items: { id: string }[] };
    expect(ids(noStockFilter)).toEqual([itemId(13)]); // the sold-out case appears only when stock is not required
    expect(ids((await search(s, { query: "limited" })) as never)).toEqual([]);
  });

  it("uses the SALE price for price bounds and sorting, and onSale finds only real ERP discounts", async () => {
    const s = setup();
    expect(ids((await search(s, { onSale: true })) as never)).toEqual([ORBIT]);
    expect(ids((await search(s, { maxPriceLkr: 200000, category: "mobile-phones" })) as never)).toContain(ORBIT); // 199,900 sale price fits, 219,900 list price would not
    const asc = (await search(s, { sort: "price-asc", category: "mobile-phones" })) as { items: { id: string; saleCents: number | null; priceCents: number }[] };
    const eff = asc.items.map((p) => p.saleCents ?? p.priceCents);
    expect([...eff].sort((a, b) => a - b)).toEqual(eff);
    const desc = (await search(s, { sort: "price-desc" })) as { items: { id: string }[] };
    expect(desc.items[0]!.id).toBe(itemId(17)); // the dearest item in the extended catalogue
  });

  it("matches words in the name, brand, category and variant labels only (AND), case-insensitively", async () => {
    const s = setup();
    expect(ids((await search(s, { query: "NOVA smartphone" })) as never).sort()).toEqual([NOVA_X1, itemId(11)].sort());
    expect(ids((await search(s, { query: "256GB" })) as never)).toEqual([NOVA_X1]);
    expect(ids((await search(s, { query: "nova nonexistentword" })) as never)).toEqual([]);
  });

  it("limits the result and reports the full count", async () => {
    const r = (await search(setup(), { limit: 2, inStockOnly: false })) as { items: unknown[]; total: number };
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(25);
  });

  it("reuses a listing for the TTL and then refreshes; keeps the stale copy if a refresh fails after a success", async () => {
    let t = 0;
    const s = setup({ ttl: 1000, now: () => t });
    await search(s, {});
    await search(s, {});
    expect(s.transport.calls.list).toBe(1);
    s.transport.setPrice(NOVA_X1, "1.00");
    await search(s, {});
    expect(s.transport.calls.list).toBe(1); // still the cached listing
    t = 1500;
    await search(s, {});
    expect(s.transport.calls.list).toBe(2);
    s.transport.setDown(true);
    t = 3000;
    expect(await search(s, {})).toMatchObject({ kind: "search" }); // stale copy, ERP is down
  });

  it("says the store is unavailable when the ERP is down and nothing is cached", async () => {
    const s = setup();
    s.transport.setDown(true);
    await expect(search(s, {})).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("names an offer only for a real sale, and shows a customer-only offer only to customers", async () => {
    const s = setup();
    const guest = (await search(s, { onSale: true }, guestCtx())) as { items: { offerName?: string }[] };
    const cust = (await search(s, { onSale: true }, customerCtx())) as { items: { offerName?: string }[] };
    expect(guest.items[0]!.offerName).toBe("Launch offer");
    // The first matching active offer is the public one; the members-only offer is never shown to a guest.
    expect(JSON.stringify(guest)).not.toContain("Members only");
    expect(["Launch offer", "Members only deal"]).toContain(cust.items[0]!.offerName);
    const earbuds = (await s.backend.get_product_details({ productId: EARBUDS }, guestCtx())) as { product: { offerName?: string } };
    expect(earbuds.product.offerName).toBeUndefined(); // an inactive offer, and the product is not on sale
  });
});

describe("2. product details", () => {
  it("returns only ERP and website-content facts, with exact integer-cent prices", async () => {
    const s = setup();
    const r = (await s.backend.get_product_details({ productId: ORBIT }, guestCtx())) as unknown as { product: Record<string, unknown> };
    expect(r.product).toMatchObject({ id: ORBIT, name: "Orbit Pro Smartphone", brand: "Orbit", priceCents: 21_990_000, saleCents: 19_990_000, available: true });
    expect((r.product.specs as { name: string; value: string }[]).map((x) => x.name)).toEqual(["Brand", "Display", "Battery"]);
  });

  it("shows warranty ONLY when the ERP provides it, never a default", async () => {
    const s = setup();
    const none = (await s.backend.get_product_details({ productId: NOVA_X1 }, guestCtx())) as { product: { specs: { name: string }[] } };
    expect(none.product.specs.map((x) => x.name)).not.toContain("Warranty");
    s.transport.setWarranty(NOVA_X1, 12, "Official warranty");
    const some = (await s.backend.get_product_details({ productId: NOVA_X1 }, guestCtx())) as { product: { specs: { name: string; value: string }[] } };
    expect(some.product.specs).toContainEqual({ name: "Warranty", value: "12 months (Official warranty)" });
  });

  it("returns every variant with its own price and availability", async () => {
    const r = (await setup().backend.get_product_details({ productId: NOVA_X1 }, guestCtx())) as { product: { variants: { key: string; priceCents: number; available: boolean }[] } };
    expect(r.product.variants).toEqual([
      expect.objectContaining({ key: "128GB::Black", priceCents: 12_990_000, available: true }),
      expect.objectContaining({ key: "256GB::Black", priceCents: 14_990_000, available: true }),
      expect.objectContaining({ key: "256GB::Blue", priceCents: 14_990_000, available: false }),
    ]);
  });

  it("is NOT_FOUND for an unknown id, and a product the ERP removes disappears at once", async () => {
    const s = setup();
    await expect(s.backend.get_product_details({ productId: "nope" }, guestCtx())).rejects.toMatchObject({ code: "NOT_FOUND" });
    s.transport.removeItem(WATCH);
    await expect(s.backend.get_product_details({ productId: WATCH }, guestCtx())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("strips markup and control characters from descriptions and caps their length", () => {
    expect(plainText("<b>Fast</b> &amp; <script>alert(1)</script>phone\u0000\n\nok")).toBe("Fast alert(1) phone ok");
    expect(plainText("x".repeat(1000))!.length).toBe(300);
    expect(plainText("   ")).toBeUndefined();
    expect(plainText(null)).toBeUndefined();
  });
});

describe("3. comparison", () => {
  it("builds rows from the data and computes 'differs' in code", async () => {
    const s = setup();
    const r = (await s.backend.compare_products({ productIds: [NOVA_X1, ORBIT] }, guestCtx())) as unknown as { products: never[] };
    const rows = comparisonRows(r.products);
    const by = Object.fromEntries(rows.map((x) => [x.label, x]));
    expect(by.Brand).toMatchObject({ values: ["Nova", "Orbit"], differs: true });
    expect(by.Category).toMatchObject({ values: ["Mobile Phones", "Mobile Phones"], differs: false });
    expect(by.Price).toMatchObject({ values: ["Rs. 129,900.00", "Rs. 199,900.00"], differs: true });
    expect(by.Availability).toMatchObject({ values: ["In stock", "In stock"], differs: false });
    expect(by.Display).toMatchObject({ values: ["6.7-inch AMOLED", "6.8-inch AMOLED"], differs: true });
  });

  it("uses null (not a guess) for a spec one product lacks, and counts that as a difference", async () => {
    const s = setup();
    const r = (await s.backend.compare_products({ productIds: [NOVA_X1, itemId(11)] }, guestCtx())) as unknown as { products: never[] };
    const display = comparisonRows(r.products).find((x) => x.label === "Display")!;
    expect(display).toMatchObject({ values: ["6.7-inch AMOLED", null], differs: true });
  });

  it("reports the price spread and rejects an unknown product", async () => {
    const s = setup();
    const out = await runToolCalls(s.registry, [{ name: "compare_products", arguments: { productIds: [NOVA_X1, ORBIT, EARBUDS] } }], guestCtx());
    const card = buildCards(out).cards[0] as { type: string; priceDelta: { text: string }; products: unknown[] };
    expect(card).toMatchObject({ type: "comparison", priceDelta: { text: "Rs. 185,000.00" } }); // 199,900 minus 14,900
    expect(card.products).toHaveLength(3);
    await expect(s.backend.compare_products({ productIds: [NOVA_X1, "nope"] }, guestCtx())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("4. stock availability", () => {
  it("answers available / not available and whether a quantity can be met, without exposing stock levels", async () => {
    const s = setup();
    expect(await s.backend.check_stock({ productId: EARBUDS, quantity: 5 }, guestCtx())).toEqual({ kind: "stock", productId: EARBUDS, available: true, requestedQuantity: 5, canFulfil: true });
    s.transport.setStock(EARBUDS, 3);
    expect(await s.backend.check_stock({ productId: EARBUDS, quantity: 5 }, guestCtx())).toMatchObject({ available: true, canFulfil: false });
    s.transport.setStock(EARBUDS, 0);
    expect(await s.backend.check_stock({ productId: EARBUDS }, guestCtx())).toEqual({ kind: "stock", productId: EARBUDS, available: false });
    const json = JSON.stringify(await s.backend.check_stock({ productId: NOVA_X1 }, guestCtx()));
    expect(json).not.toMatch(/purchasableQuantity|maxQuantity|stock":/); // no stock count leaves the backend
  });

  it("checks one variant on its own", async () => {
    const s = setup();
    expect(await s.backend.check_stock({ productId: NOVA_X1, variantKey: "256GB::Blue" }, guestCtx())).toMatchObject({ available: false, variantKey: "256GB::Blue" });
    expect(await s.backend.check_stock({ productId: NOVA_X1, variantKey: "128GB::Black", quantity: 5 }, guestCtx())).toMatchObject({ available: true, canFulfil: true });
    await expect(s.backend.check_stock({ productId: NOVA_X1, variantKey: "512GB::Pink" }, guestCtx())).rejects.toMatchObject({ code: "VARIANT_NOT_FOUND" });
  });
});

describe("5. accessory recommendations (explicit links only)", () => {
  it("returns only accessories staff linked, in stock, and skips a sold-out one", async () => {
    const s = setup();
    const r = (await s.backend.get_accessories({ productId: NOVA_X1 }, guestCtx())) as { items: { kind: string; product: { id: string } }[] };
    expect(r.items.map((i) => [i.kind, i.product.id])).toEqual([["CHARGER", itemId(5)], ["CABLE", itemId(6)]]);
    expect(JSON.stringify(r)).not.toContain(itemId(13)); // the linked back cover is sold out
  });

  it("honours a variant-specific link", async () => {
    const s = setup();
    const black = (await s.backend.get_accessories({ productId: NOVA_X1, variantKey: "256GB::Black" }, guestCtx())) as { items: { kind: string }[] };
    expect(black.items.map((i) => i.kind)).toEqual(["CHARGER", "CABLE", "SCREEN_PROTECTOR"]);
    const other = (await s.backend.get_accessories({ productId: NOVA_X1, variantKey: "128GB::Black" }, guestCtx())) as { items: { kind: string }[] };
    expect(other.items.map((i) => i.kind)).not.toContain("SCREEN_PROTECTOR");
  });

  it("never infers compatibility: a product with no links gets none, even though accessories exist in the catalogue", async () => {
    const s = setup();
    for (const id of [WATCH, EARBUDS, itemId(12)]) expect(await s.backend.get_accessories({ productId: id }, guestCtx())).toMatchObject({ kind: "accessories", items: [] });
  });
});

describe("6. cart proposals (browser-side, confirmed by the shopper)", () => {
  it("proposes adding a product, always asking for confirmation", async () => {
    const s = setup();
    const r = (await s.backend.add_to_cart({ productId: ORBIT, variantKey: "", quantity: 2 }, guestCtx())) as { clientAction: Record<string, unknown> };
    expect(r.clientAction).toMatchObject({ type: "cart.add", productId: ORBIT, variantKey: "", quantity: 2, confirm: "ask" });
    expect(String(r.clientAction.actionId)).toMatch(/^act_[a-f0-9]{20}$/);
  });

  it("requires a variant when there are several, implies it when there is one, and rejects an unknown one", async () => {
    const s = setup();
    await expect(s.backend.add_to_cart({ productId: NOVA_X1, variantKey: "", quantity: 1 }, guestCtx())).rejects.toMatchObject({ code: "VARIANT_REQUIRED" });
    await expect(s.backend.add_to_cart({ productId: NOVA_X1, variantKey: "512GB::Pink", quantity: 1 }, guestCtx())).rejects.toMatchObject({ code: "VARIANT_NOT_FOUND" });
    const ok = (await s.backend.add_to_cart({ productId: NOVA_X1, variantKey: "256GB::Black", quantity: 1 }, guestCtx())) as { clientAction: { variantKey: string } };
    expect(ok.clientAction.variantKey).toBe("256GB::Black");
  });

  it("refuses an unavailable item, an unavailable quantity and a quantity over the limit", async () => {
    const s = setup();
    await expect(s.backend.add_to_cart({ productId: NOVA_X1, variantKey: "256GB::Blue", quantity: 1 }, guestCtx())).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    await expect(s.backend.add_to_cart({ productId: NOVA_X1, variantKey: "128GB::Black", quantity: 6 }, guestCtx())).rejects.toMatchObject({ code: "QUANTITY_UNAVAILABLE" });
    await expect(s.backend.add_to_cart({ productId: EARBUDS, variantKey: "", quantity: MAX_LINE_QTY + 1 }, guestCtx())).rejects.toMatchObject({ code: "LIMIT" });
    await expect(s.backend.add_to_cart({ productId: "nope", variantKey: "", quantity: 1 }, guestCtx())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("turns 'add more' of a line already in the cart into a new total, within the limit", async () => {
    const s = setup();
    const cart = [{ productId: EARBUDS, variantKey: "", quantity: 3 }];
    const r = (await s.backend.add_to_cart({ productId: EARBUDS, variantKey: "", quantity: 2 }, guestCtx(cart))) as { clientAction: Record<string, unknown> };
    expect(r.clientAction).toMatchObject({ type: "cart.setQuantity", quantity: 5, confirm: "ask" });
    await expect(s.backend.add_to_cart({ productId: EARBUDS, variantKey: "", quantity: 8 }, guestCtx(cart))).rejects.toMatchObject({ code: "LIMIT" });
  });

  it("refuses a 21st cart line", async () => {
    const s = setup();
    const cart = Array.from({ length: 20 }, (_, i) => ({ productId: `x${i}`, variantKey: "", quantity: 1 }));
    await expect(s.backend.add_to_cart({ productId: EARBUDS, variantKey: "", quantity: 1 }, guestCtx(cart))).rejects.toMatchObject({ code: "LIMIT" });
  });

  it("updates and removes only lines that are in the cart", async () => {
    const s = setup();
    const cart = [{ productId: WATCH, variantKey: "", quantity: 1 }];
    expect(await s.backend.update_cart_quantity({ productId: WATCH, variantKey: "", quantity: 3 }, guestCtx(cart))).toMatchObject({ clientAction: { type: "cart.setQuantity", quantity: 3, confirm: "ask" } });
    expect(await s.backend.remove_from_cart({ productId: WATCH, variantKey: "" }, guestCtx(cart))).toMatchObject({ clientAction: { type: "cart.remove", confirm: "ask" } });
    await expect(s.backend.update_cart_quantity({ productId: EARBUDS, variantKey: "", quantity: 1 }, guestCtx(cart))).rejects.toMatchObject({ code: "NOT_IN_CART" });
    await expect(s.backend.remove_from_cart({ productId: EARBUDS, variantKey: "" }, guestCtx(cart))).rejects.toMatchObject({ code: "NOT_IN_CART" });
    await expect(s.backend.update_cart_quantity({ productId: WATCH, variantKey: "", quantity: 11 }, guestCtx(cart))).rejects.toMatchObject({ code: "LIMIT" });
  });

  it("quotes the cart from live prices; an unavailable line is not totalled and an unknown product is dropped", async () => {
    const s = setup();
    const cart = [
      { productId: EARBUDS, variantKey: "", quantity: 2 },
      { productId: NOVA_X1, variantKey: "256GB::Blue", quantity: 1 },
      { productId: "gone", variantKey: "", quantity: 1 },
    ];
    const q = (await s.backend.get_cart({}, guestCtx(cart))) as { lines: { productId: string; unitCents: number; lineCents: number; available: boolean }[]; subtotalCents: number; deliveryCents: number; dropped: number };
    expect(q.lines.map((l) => [l.productId, l.unitCents, l.lineCents, l.available])).toEqual([[EARBUDS, 1_490_000, 2_980_000, true], [NOVA_X1, 14_990_000, 14_990_000, false]]);
    expect(q.subtotalCents).toBe(2_980_000);
    expect(q.dropped).toBe(1);
    expect(q.deliveryCents).toBe(45_000);
    s.transport.setPrice(EARBUDS, "10000.00");
    const again = (await s.backend.get_cart({}, guestCtx(cart))) as { subtotalCents: number };
    expect(again.subtotalCents).toBe(2_000_000); // prices come from the ERP every time, not from the browser
  });

  it("has no write path at all: the ERP transport is read-only and the backend has no order, payment or discount method", () => {
    const names = [...Object.getOwnPropertyNames(FixtureErpTransport.prototype), ...Object.getOwnPropertyNames(Object.getPrototypeOf(setup().backend))];
    expect(names.filter((n) => /order$|place|create|submit|pay|checkout|discount|coupon|post|write|cancel|refund/i.test(n) && n !== "get_order_status" && n !== "getOrder" && n !== "setOrderStatus")).toEqual([]);
  });
});

describe("7. mock order status (customer's own orders only)", () => {
  it("lists the signed-in customer's own orders, newest first, with privacy-filtered details", async () => {
    const s = setup();
    const r = (await s.backend.get_order_status({}, customerCtx("cust_1"))) as { orders: { ref: string; status: string; cancellable: boolean; trackingNumber?: string; carrier?: string; lines: { name: string }[] }[] };
    expect(r.orders.map((o) => o.ref)).toEqual([MOCK_ORDER_REFS.cust1Placed, MOCK_ORDER_REFS.cust1Dispatched]);
    expect(r.orders[0]).toMatchObject({ status: "PLACED", cancellable: true, lines: [{ name: "Pulse Wireless Earbuds" }] });
    expect(r.orders[1]).toMatchObject({ status: "DISPATCHED", cancellable: false, trackingNumber: "TRK-0001", carrier: "Mock Courier" });
    expect(JSON.stringify(r)).not.toMatch(/"(phone|address|email|customer\w*|delivery\w*)"\s*:/i);
  });

  it("is generic 'not found' for a reference that belongs to someone else, and identical to one that does not exist", async () => {
    const s = setup();
    const others = await s.backend.get_order_status({ ref: MOCK_ORDER_REFS.cust2Placed }, customerCtx("cust_1")).catch((e) => e);
    const missing = await s.backend.get_order_status({ ref: "VLK-999999-ABCDEFGHJK" }, customerCtx("cust_1")).catch((e) => e);
    expect(others.code).toBe("NOT_FOUND");
    expect(others.message).toBe(missing.message);
    expect(s.transport.calls.order).toBe(0); // the ERP was never even asked about someone else's order
  });

  it("is forbidden for a guest at the backend as well as in the registry", async () => {
    const s = setup();
    await expect(s.backend.get_order_status({}, guestCtx())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [o] = await runToolCalls(s.registry, [{ name: "get_order_status", arguments: {} }], guestCtx());
    expect(o).toMatchObject({ status: "forbidden" });
    expect(s.transport.calls.order).toBe(0);
  });

  it("returns no orders for a customer with none, and says the store is unavailable when the ERP is down", async () => {
    const s = setup();
    expect(await s.backend.get_order_status({}, customerCtx("cust_nobody"))).toEqual({ kind: "orders", orders: [] });
    s.transport.setDown(true);
    await expect(s.backend.get_order_status({}, customerCtx("cust_1"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});

describe("cards are valid contract objects built from backend results", () => {
  it("builds a valid card for every tool result kind", async () => {
    const s = setup();
    const cart = [{ productId: EARBUDS, variantKey: "", quantity: 1 }];
    const calls = [
      { name: "search_products", arguments: { category: "mobile-phones" } },
      { name: "get_product_details", arguments: { productId: NOVA_X1 } },
      { name: "compare_products", arguments: { productIds: [NOVA_X1, ORBIT] } },
      { name: "check_stock", arguments: { productId: EARBUDS } },
      { name: "get_accessories", arguments: { productId: NOVA_X1 } },
      { name: "get_cart", arguments: {} },
    ];
    const out: ToolOutcome[] = [];
    for (const c of calls) out.push(...(await runToolCalls(s.registry, [c], guestCtx(cart))));
    out.push(...(await runToolCalls(s.registry, [{ name: "get_order_status", arguments: {} }], customerCtx())));
    expect(out.every((o) => o.status === "ok")).toBe(true);
    const { cards } = buildCards(out);
    expect(cards.length).toBe(8); // capped at the contract limit
    for (const card of cards) expect(Card.safeParse(card).success, JSON.stringify(card).slice(0, 80)).toBe(true);
    expect(new Set(cards.map((c) => c.type))).toContain("product");
  });

  it("the details card carries specs and each product card links to /products/<slug> and a priced variant list", async () => {
    const s = setup();
    const out = await runToolCalls(s.registry, [{ name: "get_product_details", arguments: { productId: NOVA_X1 } }], guestCtx());
    const card = buildCards(out).cards[0] as { type: string; url: string; specs: unknown[]; variants: { price: { text: string } }[]; price: { text: string } };
    expect(card).toMatchObject({ type: "product", url: "/products/nova-x1-smartphone-cm0item00000001", price: { text: "Rs. 129,900.00" } });
    expect(card.specs.length).toBeGreaterThan(0);
    expect(card.variants.map((v) => v.price.text)).toEqual(["Rs. 129,900.00", "Rs. 149,900.00", "Rs. 149,900.00"]);
  });

  it("shows the list price next to the sale price, and nothing else invented", async () => {
    const s = setup();
    const out = await runToolCalls(s.registry, [{ name: "get_product_details", arguments: { productId: ORBIT } }], guestCtx());
    expect(buildCards(out).cards[0]).toMatchObject({ price: { text: "Rs. 199,900.00" }, listPrice: { text: "Rs. 219,900.00" }, offerName: "Launch offer" });
  });
});
