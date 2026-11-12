import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Catalogue } from "../../src/backend/catalogue";
import { MockToolBackend } from "../../src/backend/mock-backend";
import { ErpUnavailableError, HttpErpTransport } from "../../src/backend/transport";
import type { ToolContext } from "../../src/tools/registry";
import { createMockSiteData } from "../../src/mock/site-data";
import { itemId, FixtureErpTransport } from "../../src/mock/erp-fixture";

/**
 * Contract test against the REAL mock ERP server of the web app (apps/web/tests/mock-erp/server.ts), over HTTP. It proves the wire
 * mapping (decimal-string money, availability strings, variants, envelope, auth) works on what that server actually sends, and that
 * the in-memory fixture serves the same facts. The mock ERP runs on a loopback port with its test credential; no real ERP is involved.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, "../../../web");
const PORT = 4033;
const BASE = `http://127.0.0.1:${PORT}/api/v1/store-api`;
const CRED = "hxs_test.testsecret";
let proc: ChildProcess;

const control = (body: unknown) => fetch(`http://127.0.0.1:${PORT}/__control`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json() as Promise<{ orderRefs: string[] }>);

beforeAll(async () => {
  proc = spawn(process.execPath, [path.join(webDir, "node_modules/tsx/dist/cli.mjs"), "tests/mock-erp/server.ts"], { cwd: webDir, env: { ...process.env, MOCK_ERP_PORT: String(PORT), MOCK_ERP_CATALOGUE: "extended" }, stdio: "ignore" });
  for (let i = 0; i < 80; i++) {
    try {
      await control({});
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("mock ERP did not start");
}, 20_000);
afterAll(() => proc?.kill());
beforeEach(async () => {
  await control({ reset: true });
});

const guest: ToolContext = { actor: { kind: "guest" }, requestId: "r", signal: new AbortController().signal };

function stack() {
  const transport = new HttpErpTransport({ baseUrl: BASE, credential: CRED });
  const site = createMockSiteData();
  const catalogue = new Catalogue({ transport, site, ttlMs: 0 });
  return { transport, site, catalogue, backend: new MockToolBackend({ catalogue, transport, site }) };
}

describe("HttpErpTransport against the real mock ERP", () => {
  it("lists the catalogue, one product, and the settings in the documented wire format", async () => {
    const { transport } = stack();
    const all = await transport.listProducts();
    expect(all).toHaveLength(25);
    expect(all.find((p) => p.id === itemId(1))).toMatchObject({ name: "Nova X1 Smartphone", brand: "Nova", category: "Mobile Phones" });
    expect((await transport.getProduct(itemId(2)))?.discountActive).toBe(true);
    expect(await transport.getProduct("does-not-exist")).toBeNull();
    expect(await transport.getSettings()).toMatchObject({ currency: "LKR", ordersEnabled: true, deliveryCharge: "450.00" });
  });

  it("rejects a wrong credential, and refuses any non-loopback address or odd credential at construction", async () => {
    const bad = new HttpErpTransport({ baseUrl: BASE, credential: "hxs_wrong.credential" });
    await expect(bad.listProducts()).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
    expect(() => new HttpErpTransport({ baseUrl: "https://erp.example.com/api/v1/store-api", credential: CRED })).toThrow(/loopback/);
    expect(() => new HttpErpTransport({ baseUrl: "http://10.0.0.5:4010/api/v1/store-api", credential: CRED })).toThrow(/loopback/);
    expect(() => new HttpErpTransport({ baseUrl: BASE, credential: "not-a-credential" })).toThrow(/format/);
  });

  it("reports an unreachable ERP as a typed error", async () => {
    const t = new HttpErpTransport({ baseUrl: "http://127.0.0.1:1/api/v1/store-api", credential: CRED, timeoutMs: 500 });
    await expect(t.getSettings()).rejects.toBeInstanceOf(ErpUnavailableError);
  });

  it("sends only GET requests with a Bearer token", async () => {
    const seen: { method?: string; auth?: string }[] = [];
    const t = new HttpErpTransport({
      baseUrl: BASE,
      credential: CRED,
      fetchImpl: async (url, init) => {
        seen.push({ method: init?.method, auth: (init?.headers as Record<string, string>)?.Authorization });
        return fetch(url, init);
      },
    });
    await t.listProducts();
    await t.getProduct(itemId(1));
    await t.getSettings();
    await t.getOrder("VLK-261012-ABCDEFGHJK");
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(seen.every((s) => s.method === "GET" && s.auth === `Bearer ${CRED}`)).toBe(true);
  });
});

describe("all 25 products through every tool, over HTTP against the mock ERP server", () => {
  const ALL = Array.from({ length: 25 }, (_, i) => itemId(i + 1));
  it("details, search, stock, comparison and accessories work for each product, and every accessory link points at a served product", async () => {
    const { backend, site, transport } = stack();
    const served = new Set((await transport.listProducts()).map((p) => p.id));
    expect([...served].sort()).toEqual(ALL);
    for (const l of site.links) {
      expect(served.has(l.sourceItemId), l.sourceItemId).toBe(true);
      expect(served.has(l.accessoryItemId), l.accessoryItemId).toBe(true);
    }
    for (const id of ALL) {
      const d = (await backend.get_product_details({ productId: id }, guest)) as { kind: string; product: { name: string } };
      expect(d.kind, id).toBe("details");
      const found = (await backend.search_products({ query: d.product.name, inStockOnly: false, limit: 8 } as never, guest)) as { items: { id: string }[] };
      expect(found.items.map((x) => x.id), d.product.name).toContain(id);
      expect(await backend.check_stock({ productId: id, quantity: 1 } as never, guest), id).toMatchObject({ kind: "stock", productId: id });
      const other = id === ALL[0] ? ALL[1]! : ALL[0]!;
      expect(await backend.compare_products({ productIds: [id, other] }, guest), id).toMatchObject({ kind: "compare" });
      expect(await backend.get_accessories({ productId: id } as never, guest), id).toMatchObject({ kind: "accessories" });
    }
  });

  it("serves the warranty the ERP holds, and none for products without one", async () => {
    const { backend } = stack();
    const specs = async (id: string) => ((await backend.get_product_details({ productId: id }, guest)) as { product: { specs: { name: string; value: string }[] } }).product.specs;
    expect(await specs(itemId(16))).toContainEqual({ name: "Warranty", value: "24 months (Mock warranty record)" });
    expect((await specs(itemId(8))).map((x) => x.name)).not.toContain("Warranty");
  });
});

describe("the backend produces the same facts from the real mock ERP and from the in-memory fixture", () => {
  it("returns identical product views for every product", async () => {
    const http = stack();
    const fx = new Catalogue({ transport: new FixtureErpTransport(), site: createMockSiteData(), ttlMs: 0 });
    const a = await http.catalogue.listing("guest");
    const b = await fx.listing("guest");
    expect(a).toHaveLength(25);
    const strip = (v: (typeof a)[number]) => ({ ...v, imageUrl: undefined, publishedAt: undefined, updatedAt: undefined });
    expect(a.map(strip)).toEqual(b.map(strip));
  });

  it("follows live changes in the mock ERP: a new price and stock level appear without any model or cache involved", async () => {
    const { backend } = stack();
    const before = await backend.get_product_details({ productId: itemId(3) }, guest);
    expect(before).toMatchObject({ kind: "details", product: { priceCents: 1_490_000, available: true } });
    await control({ setPrice: { id: itemId(3), price: 15900 }, setStock: { id: itemId(3), stock: 0 } });
    const after = await backend.get_product_details({ productId: itemId(3) }, guest);
    expect(after).toMatchObject({ product: { priceCents: 1_590_000, available: false } });
    const stock = await backend.check_stock({ productId: itemId(3), quantity: 1 }, guest);
    expect(stock).toMatchObject({ kind: "stock", available: false, canFulfil: false });
  });

  it("reads the delivery charge from the ERP settings and stops stating it when orders are disabled", async () => {
    const { backend } = stack();
    expect(await backend.get_cart({}, guest)).toMatchObject({ kind: "cart", deliveryCents: 45_000 });
    await control({ settings: { deliveryCharge: "600.00" } });
    expect(await backend.get_cart({}, guest)).toMatchObject({ deliveryCents: 60_000 });
    await control({ settings: { ordersEnabled: false } });
    const off = await backend.get_cart({}, guest);
    expect("deliveryCents" in off).toBe(false);
  });

  it("reads a real order from the mock ERP for the customer it is linked to, and nobody else", async () => {
    const { backend, site } = stack();
    const ref = "VLK-261111-ABCDEFGHJK";
    const res = await fetch(`${BASE}/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRED}`, "Content-Type": "application/json", "Idempotency-Key": "test-idempotency-key-0001" },
      body: JSON.stringify({ externalRef: ref, currency: "LKR", paymentMethod: "COD", lines: [{ itemId: itemId(3), quantity: 1, unitPrice: "14900.00" }], deliveryCharge: "450.00", total: "15350.00", customer: { name: "Test Buyer", phone: "0771234567" }, delivery: { addressLine1: "1 Test Road", city: "Colombo" } }),
    });
    expect(res.status).toBe(201); // test-side seed of the MOCK ERP only; the assistant has no code that creates orders
    site.customerOrders.set("cust_9", [ref]);
    const mine = await backend.get_order_status({ ref }, { ...guest, actor: { kind: "customer", customerId: "cust_9" } });
    expect(mine).toMatchObject({ kind: "orders", orders: [{ ref, status: "PLACED", totalCents: 1_535_000, lines: [{ name: "Pulse Wireless Earbuds", quantity: 1, unitCents: 1_490_000 }] }] });
    // The same reference asked by another customer is "not found", and the result never carries personal details.
    await expect(backend.get_order_status({ ref }, { ...guest, actor: { kind: "customer", customerId: "cust_1" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(JSON.stringify(mine)).not.toMatch(/Test Buyer|0771234567|Test Road|Colombo/);
  });
});
