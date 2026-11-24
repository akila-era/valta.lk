/** Route-handler level tests (validation, origin/CSRF, rate limiting, redaction, retry policy) against the MOCK ERP. */
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateOrderRef } from "@/lib/utils/order-ref";

const id = (n: number) => `cm0item${String(n).padStart(8, "0")}`;

const PORT = 4021;
const CRED = "hxs_test.testsecret";
let proc: ChildProcess;

const control = (body: unknown) =>
  fetch(`http://localhost:${PORT}/__control`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json() as Promise<{ orders: number; orderPosts: number; requests: string[] }>);

beforeAll(async () => {
  proc = spawn(process.execPath, ["--import", "tsx", "tests/mock-erp/server.ts"], { env: { ...process.env, MOCK_ERP_PORT: String(PORT) }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      await control({});
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("mock ERP did not start");
});
afterAll(() => proc?.kill());

beforeEach(async () => {
  process.env.HX_API_BASE = `http://localhost:${PORT}/api/v1/store-api`;
  process.env.HX_STORE_CREDENTIAL = CRED;
  await control({ reset: true });
  const g = globalThis as unknown as { __voltaRate?: Map<string, unknown> };
  g.__voltaRate?.clear();
  (await import("@/lib/erp/catalogue")).resetCatalogueCache();
});

const post = (url: string, body: unknown, headers: Record<string, string> = { origin: "http://shop.test", host: "shop.test" }) =>
  new Request(`http://shop.test${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const validOrder = (ref = generateOrderRef(), total = 30250) => ({
  externalRef: ref,
  lines: [{ productId: id(3), variantKey: "", quantity: 2 }],
  customer: { name: "Kasun Perera", phone: "0771234567", email: "" },
  delivery: { address: "12 Galle Road", city: "Colombo", district: "Colombo", postalCode: "" },
  expectedTotal: total,
  acceptTerms: true,
});

describe("POST /api/store/orders", () => {
  it("blocks cross-site and origin-less requests", async () => {
    const { POST } = await import("@/app/api/store/orders/route");
    expect((await POST(post("/api/store/orders", validOrder(), { host: "shop.test" }))).status).toBe(403);
    expect((await POST(post("/api/store/orders", validOrder(), { origin: "http://evil.test", host: "shop.test" }))).status).toBe(403);
    expect((await control({})).orderPosts).toBe(0);
  });

  it("returns field-level 422 for invalid input and never contacts the ERP order endpoint", async () => {
    const { POST } = await import("@/app/api/store/orders/route");
    const bad = { ...validOrder(), customer: { name: "K", phone: "123", email: "nope" }, acceptTerms: false };
    const res = await POST(post("/api/store/orders", bad));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(Object.keys(body.error.fields)).toEqual(expect.arrayContaining(["customer.name", "customer.phone", "acceptTerms"]));
    expect((await control({})).orderPosts).toBe(0);
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    const { POST } = await import("@/app/api/store/orders/route");
    const raw = (b: string) => new Request("http://shop.test/api/store/orders", { method: "POST", headers: { origin: "http://shop.test", host: "shop.test" }, body: b });
    expect((await POST(raw("{not json"))).status).toBe(400);
    expect((await POST(raw(JSON.stringify({ x: "a".repeat(30_000) })))).status).toBe(400);
  });

  it("ignores browser-supplied prices: extra price fields are stripped, totals come from the ERP", async () => {
    const { POST } = await import("@/app/api/store/orders/route");
    const sneaky = { ...validOrder(), lines: [{ productId: id(3), variantKey: "", quantity: 2, unitPrice: 1 }], deliveryCharge: 0, total: 1 };
    const res = await POST(post("/api/store/orders", sneaky));
    expect(res.status).toBe(201);
    expect((await res.json()).order.total).toBe(30250);
  });

  it("returns 409 PRICE_CHANGED with refreshed prices and creates nothing", async () => {
    await control({ setPrice: { id: id(3), price: 20000 } });
    const { POST } = await import("@/app/api/store/orders/route");
    const res = await POST(post("/api/store/orders", validOrder()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "PRICE_CHANGED", newTotal: 40450 });
    expect((await control({})).orders).toBe(0);
  });

  it("rate limits repeated submissions", async () => {
    const { POST } = await import("@/app/api/store/orders/route");
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await POST(post("/api/store/orders", { bad: true }))).status);
    expect(statuses.slice(0, 10).every((s) => s === 422)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("never leaks the credential or upstream details when the ERP rejects it", async () => {
    process.env.HX_STORE_CREDENTIAL = "hxs_bad.wrongsecret";
    const { POST } = await import("@/app/api/store/orders/route");
    const res = await POST(post("/api/store/orders", validOrder()));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toMatch(/wrongsecret|testsecret|hxs_|Bearer|localhost|4021/);
  });

  it("reports service unavailable when the ERP is not configured", async () => {
    delete process.env.HX_STORE_CREDENTIAL;
    const { POST } = await import("@/app/api/store/orders/route");
    const res = await POST(post("/api/store/orders", validOrder()));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("STORE_UNAVAILABLE");
  });
});

describe("order lookup + cancel routes", () => {
  const ctx = (ref: string) => ({ params: Promise.resolve({ ref }) });
  it("404s malformed references without calling the ERP", async () => {
    const { GET } = await import("@/app/api/store/orders/[ref]/route");
    const res = await GET(new Request("http://shop.test/x", { headers: { host: "shop.test" } }), ctx("../../etc/passwd"));
    expect(res.status).toBe(404);
    expect((await control({})).requests.filter((r) => r.includes("/orders/"))).toHaveLength(0);
  });
  it("cancel requires same-origin, works before dispatch, refuses after", async () => {
    const { POST } = await import("@/app/api/store/orders/route");
    const { DELETE, GET } = await import("@/app/api/store/orders/[ref]/route");
    const ref = generateOrderRef();
    await POST(post("/api/store/orders", validOrder(ref)));
    const del = (origin?: string) => new Request("http://shop.test/x", { method: "DELETE", headers: { host: "shop.test", ...(origin ? { origin } : {}) } });
    expect((await DELETE(del(), ctx(ref))).status).toBe(403);
    const ok = await DELETE(del("http://shop.test"), ctx(ref));
    expect(ok.status).toBe(200);
    expect((await ok.json()).order.status).toBe("CANCELLED");

    const ref2 = generateOrderRef();
    await POST(post("/api/store/orders", validOrder(ref2)));
    await control({ setOrderStatus: { ref: ref2, status: "DISPATCHED" } });
    expect((await DELETE(del("http://shop.test"), ctx(ref2))).status).toBe(409);
    const got = await (await GET(new Request("http://shop.test/x", { headers: { host: "shop.test" } }), ctx(ref2))).json();
    expect(got.order).not.toHaveProperty("customer");
  });
});

describe("client reliability policy", () => {
  it("times out slow ERP responses", async () => {
    await control({ delayMs: 800 });
    const { erpRequest } = await import("@/lib/erp/client");
    const { z } = await import("zod");
    await expect(erpRequest("/settings", z.unknown(), { timeoutMs: 200, maxAttempts: 1 })).rejects.toMatchObject({ kind: "TIMEOUT" });
  });
  it("does not retry 4xx responses", async () => {
    process.env.HX_STORE_CREDENTIAL = "hxs_bad.wrong";
    const { getSettings } = await import("@/lib/erp/settings");
    await expect(getSettings({ fresh: true })).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
    expect((await control({})).requests.filter((r) => r === "GET /settings")).toHaveLength(1);
  });
  it("rejects malformed ERP payloads instead of trusting them", async () => {
    const { erpRequest } = await import("@/lib/erp/client");
    const { erpSettingsSchema } = await import("@/lib/erp/types");
    await expect(erpRequest("/ping", erpSettingsSchema, { maxAttempts: 1 })).rejects.toMatchObject({ kind: "BAD_RESPONSE" });
  });
  it("public settings route exposes only COD availability and charge", async () => {
    const { GET } = await import("@/app/api/store/settings/route");
    const res = await GET(new Request("http://shop.test/api/store/settings", { headers: { host: "shop.test" } }));
    expect(await res.json()).toEqual({ enabled: true, reason: null, currency: "LKR", deliveryCharge: 450, paymentMethods: ["COD"] });
  });
});
