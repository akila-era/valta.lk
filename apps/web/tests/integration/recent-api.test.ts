/** GET /api/store/recent: read-only, bounded, validated, rate limited, and limited to public fields. Runs against the MOCK ERP. */
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `cm0item${String(n).padStart(8, "0")}`;

const PORT = 4023;
const CRED = "hxs_test.testsecret";
let proc: ChildProcess;

const control = (body: unknown) => fetch(`http://localhost:${PORT}/__control`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());

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
  const g = globalThis as unknown as { __valtaRate?: Map<string, unknown> };
  g.__valtaRate?.clear();
  (await import("@/lib/erp/catalogue")).resetCatalogueCache();
});

const get = (ids?: string) => new Request(`http://shop.test/api/store/recent${ids === undefined ? "" : `?ids=${encodeURIComponent(ids)}`}`);
const call = async (ids?: string) => {
  const { GET } = await import("@/app/api/store/recent/route");
  return GET(get(ids));
};

const ALLOWED = new Set(["id", "slug", "name", "displayTitle", "brand", "model", "sku", "image", "price", "salePrice", "available", "hasVariants", "purchasableQuantity", "publishedAt"]);
const FORBIDDEN = ["description", "variants", "specs", "category", "subCategory", "barcode", "images", "updatedAt", "content", "cost", "supplier"];

describe("GET /api/store/recent", () => {
  it("returns the products asked for, in the order asked, with live prices", async () => {
    const res = await call(`${id(5)},${id(2)},${id(3)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { products } = (await res.json()) as { products: { id: string; name: string; price: number; salePrice: number | null; available: boolean }[] };
    expect(products.map((p) => p.id)).toEqual([id(5), id(2), id(3)]);
    expect(products[0]).toMatchObject({ name: "Volt 20W Fast Charger", price: 3900, salePrice: null, available: true });
    expect(products[1]).toMatchObject({ name: "Orbit Pro Smartphone", price: 219900, salePrice: 199900 }); // a real sale price
  });

  it("exposes only whitelisted public fields: no description, variants, specs, barcode, category, timestamps or cost data", async () => {
    const { products } = (await (await call(`${id(1)},${id(3)}`)).json()) as { products: Record<string, unknown>[] };
    expect(products).toHaveLength(2);
    for (const p of products) {
      for (const key of Object.keys(p)) expect(ALLOWED.has(key), `unexpected field "${key}"`).toBe(true);
      for (const key of FORBIDDEN) expect(p, key).not.toHaveProperty(key);
      expect(typeof p.image === "string" || p.image === undefined).toBe(true); // one photo URL, never a list
    }
    expect(products[0]).toMatchObject({ hasVariants: true }); // the variant product says it has options without listing them
  });

  it("leaves out unknown or removed IDs and collapses duplicates", async () => {
    const { products } = (await (await call(`${id(3)},cm0item99999999,${id(3)}`)).json()) as { products: { id: string }[] };
    expect(products.map((p) => p.id)).toEqual([id(3)]);
    expect(((await (await call("no-such-product")).json()) as { products: unknown[] }).products).toEqual([]);
  });

  it("rejects missing, malformed and oversized lists with 400", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => id(i + 1)).join(",");
    const thirteen = `${twelve},${id(13)}`;
    expect((await call(twelve)).status).toBe(200); // the limit itself is fine
    for (const bad of [undefined, "", " ", thirteen, "../../etc/passwd", "a b", "a;b", "a'b", `${id(1)},`, ",", "x".repeat(65), "y".repeat(2000)]) {
      const res = await call(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(JSON.stringify(await res.json())).not.toMatch(/stack|at \w+ \(/);
    }
  });

  it("is read-only: no handler other than GET exists", async () => {
    const mod = (await import("@/app/api/store/recent/route")) as Record<string, unknown>;
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect(mod[method], method).toBeUndefined();
  });

  it("takes no tenant or ERP address from the request and makes no per-product ERP call", async () => {
    const before = ((await control({})) as { requests: string[] }).requests.length;
    const req = new Request(`http://shop.test/api/store/recent?ids=${id(3)}&tenant=other&HX_API_BASE=http://evil.test&base=http://evil.test`, { headers: { "x-tenant": "other", host: "shop.test" } });
    const { GET } = await import("@/app/api/store/recent/route");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { products: { id: string }[] }).products.map((p) => p.id)).toEqual([id(3)]);
    const requests = ((await control({})) as { requests: string[] }).requests.slice(before);
    expect(requests.every((r) => /catalogue/.test(r)), requests.join(", ")).toBe(true); // only the shared catalogue sync, never evil.test or an item endpoint
  });

  it("rate limits repeated requests", async () => {
    const { GET } = await import("@/app/api/store/recent/route");
    for (let i = 0; i < 60; i++) expect((await GET(get(id(3)))).status).toBe(200);
    const limited = await GET(get(id(3)));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});
