/**
 * Admin-managed Hot Deals: the admin API route handlers and the storefront loader against a REAL website database
 * (PGlite + the real migration SQL). The admin session and the ERP snapshot are stubbed; prices come only from it.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import type { ErpProduct } from "@/lib/erp/types";

type Access = { kind: "ok"; admin: { email: string } } | { kind: "signed-out" } | { kind: "forbidden" };
const state = vi.hoisted(() => ({
  db: null as unknown,
  access: { kind: "ok", admin: { email: "admin@x.test" } } as Access,
  products: null as Map<string, unknown> | null,
}));

vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: async () => state.access }));
vi.mock("@/lib/erp/catalogue", () => ({
  getErpSnapshot: async () => {
    if (!state.products) throw new Error("ERP down");
    return { products: state.products, syncedAt: Date.now() };
  },
}));

import { GET, POST } from "@/app/api/admin/hot-deals/route";
import { DELETE, PATCH } from "@/app/api/admin/hot-deals/[id]/route";
import { POST as REORDER } from "@/app/api/admin/hot-deals/reorder/route";
import { configuredHotDeals } from "@/lib/hot-deals-store";

let pg: PGlite;
let db: PrismaClient;
let ip = 0;

const product = (id: string, over: Partial<ErpProduct> = {}): ErpProduct => ({
  id, slug: id, name: `Product ${id}`, description: "", images: [], price: 10_000, salePrice: null, specs: {}, variants: [], hasVariants: false,
  available: true, purchasableQuantity: 4, publishedAt: null, updatedAt: "2026-01-01", ...over,
});
const catalogue = () =>
  new Map<string, ErpProduct>([
    ["phone1", product("phone1", { price: 219_900, salePrice: 199_900 })],
    ["buds1", product("buds1", { price: 14_900 })],
    ["case1", product("case1", { available: false, purchasableQuantity: 0 })],
  ]);

// Every request gets its own client address so the per-IP rate limit never interferes between tests.
const req = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://shop.test${url}`, {
    method,
    headers: { host: "shop.test", origin: "http://shop.test", "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip % 250}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const add = (body: unknown) => POST(req("/api/admin/hot-deals", "POST", body));

beforeAll(async () => {
  pg = new PGlite();
  const dir = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) {
    await pg.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  await pg?.close();
});

beforeEach(async () => {
  await pg.exec(`TRUNCATE "HotDeal"`);
  state.db = db;
  state.access = { kind: "ok", admin: { email: "admin@x.test" } };
  state.products = catalogue();
});

describe("admin authorisation", () => {
  it("refuses signed-out and non-admin users on every endpoint", async () => {
    for (const access of [{ kind: "signed-out" } as const, { kind: "forbidden" } as const]) {
      state.access = access;
      const expected = access.kind === "signed-out" ? 401 : 403;
      expect((await GET(req("/api/admin/hot-deals", "GET"))).status).toBe(expected);
      expect((await add({ erpItemId: "buds1" })).status).toBe(expected);
      expect((await PATCH(req("/x", "PATCH", { startsAt: "2026-10-01T00:00:00Z", endsAt: null, active: true }), ctx("abcdefgh12"))).status).toBe(expected);
      expect((await DELETE(req("/x", "DELETE"), ctx("abcdefgh12"))).status).toBe(expected);
      expect((await REORDER(req("/x", "POST", { ids: ["abcdefgh12"] }))).status).toBe(expected);
    }
    expect(await db.hotDeal.count()).toBe(0);
  });

  it("blocks cross-site writes (origin check)", async () => {
    const res = await POST(req("/api/admin/hot-deals", "POST", { erpItemId: "buds1" }, { origin: "http://evil.test" }));
    expect(res.status).toBe(403);
    expect(await db.hotDeal.count()).toBe(0);
  });

  it("answers 503 when the website database is not configured", async () => {
    state.db = null;
    expect((await GET(req("/api/admin/hot-deals", "GET"))).status).toBe(503);
    expect((await add({ erpItemId: "buds1" })).status).toBe(503);
  });
});

describe("create, update, reorder, delete", () => {
  it("adds products in order, records who did it, and lists them with live ERP facts", async () => {
    expect((await add({ erpItemId: "buds1" })).status).toBe(201);
    expect((await add({ erpItemId: "phone1" })).status).toBe(201);
    const list = (await (await GET(req("/api/admin/hot-deals", "GET"))).json()) as { deals: { erpItemId: string; sortOrder: number; status: string; updatedBy: string; product: { price: number; salePrice: number | null } }[] };
    expect(list.deals.map((d) => [d.erpItemId, d.sortOrder])).toEqual([["buds1", 0], ["phone1", 1]]);
    expect(list.deals[0].updatedBy).toBe("admin@x.test");
    expect(list.deals[1].status).toBe("live");
    expect(list.deals[1].product).toMatchObject({ price: 219_900, salePrice: 199_900 });
  });

  it("prevents adding the same product twice", async () => {
    expect((await add({ erpItemId: "buds1" })).status).toBe(201);
    const again = await add({ erpItemId: "buds1" });
    expect(again.status).toBe(409);
    expect(await db.hotDeal.count()).toBe(1);
  });

  it("refuses products that are not in the ERP catalogue, and pauses adding when the ERP is unreachable", async () => {
    expect((await add({ erpItemId: "ghost" })).status).toBe(422);
    state.products = null;
    expect((await add({ erpItemId: "buds1" })).status).toBe(503);
    expect(await db.hotDeal.count()).toBe(0);
  });

  it("validates ids and date ranges on the server", async () => {
    expect((await add({ erpItemId: "bad id!" })).status).toBe(422);
    expect((await add({ erpItemId: "buds1", startsAt: "2026-10-31T00:00:00Z", endsAt: "2026-10-01T00:00:00Z" })).status).toBe(422);
    expect(await db.hotDeal.count()).toBe(0);
  });

  it("never stores a price: client-sent prices and discounts are ignored", async () => {
    await add({ erpItemId: "buds1", price: 1, salePrice: 1, discount: 99 });
    const row = await db.hotDeal.findFirstOrThrow();
    expect(Object.keys(row).sort()).toEqual(["active", "createdAt", "endsAt", "erpItemId", "id", "sortOrder", "startsAt", "updatedAt", "updatedBy"]);
  });

  it("updates the schedule and activation, and rejects a backwards range", async () => {
    await add({ erpItemId: "buds1" });
    const { id } = await db.hotDeal.findFirstOrThrow();
    const ok = await PATCH(req("/x", "PATCH", { startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-11-30T00:00:00Z", active: false }), ctx(id));
    expect(ok.status).toBe(200);
    const row = await db.hotDeal.findUniqueOrThrow({ where: { id } });
    expect(row.active).toBe(false);
    expect(row.startsAt.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    const bad = await PATCH(req("/x", "PATCH", { startsAt: "2026-11-30T00:00:00Z", endsAt: "2026-11-01T00:00:00Z", active: true }), ctx(id));
    expect(bad.status).toBe(422);
    expect((await PATCH(req("/x", "PATCH", { startsAt: "2026-11-01T00:00:00Z", endsAt: null, active: true }), ctx("nosuchdeal1"))).status).toBe(404);
  });

  it("reorders only with the complete, current list", async () => {
    await add({ erpItemId: "buds1" });
    await add({ erpItemId: "phone1" });
    const [a, b] = await db.hotDeal.findMany({ orderBy: { sortOrder: "asc" } });
    expect((await REORDER(req("/x", "POST", { ids: [b.id, a.id] }))).status).toBe(200);
    expect((await db.hotDeal.findMany({ orderBy: { sortOrder: "asc" } })).map((d) => d.erpItemId)).toEqual(["phone1", "buds1"]);
    expect((await REORDER(req("/x", "POST", { ids: [a.id] }))).status).toBe(409); // stale: one is missing
    expect((await REORDER(req("/x", "POST", { ids: [a.id, a.id] }))).status).toBe(409); // duplicates
  });

  it("deletes a deal", async () => {
    await add({ erpItemId: "buds1" });
    const { id } = await db.hotDeal.findFirstOrThrow();
    expect((await DELETE(req("/x", "DELETE"), ctx(id))).status).toBe(200);
    expect(await db.hotDeal.count()).toBe(0);
  });
});

describe("storefront loader", () => {
  const now = new Date();
  const past = new Date(now.getTime() - 86_400_000);
  const future = new Date(now.getTime() + 86_400_000);

  it("returns live, buyable deals in staff order with the ERP prices untouched", async () => {
    await db.hotDeal.createMany({
      data: [
        { erpItemId: "buds1", sortOrder: 1, startsAt: past },
        { erpItemId: "phone1", sortOrder: 0, startsAt: past },
        { erpItemId: "case1", sortOrder: 2, startsAt: past }, // out of stock
        { erpItemId: "ghost", sortOrder: 3, startsAt: past }, // no longer in the ERP
        { erpItemId: "later", sortOrder: 4, startsAt: future },
      ],
    });
    const products = catalogue();
    const out = await configuredHotDeals(products);
    expect(out?.map((p) => p.id)).toEqual(["phone1", "buds1"]);
    expect(out?.[0]).toBe(products.get("phone1"));
    expect(out?.[0]).toMatchObject({ price: 219_900, salePrice: 199_900 });
  });

  it("falls back (null) when nothing is configured, nothing is live, or the database or catalogue is unavailable", async () => {
    expect(await configuredHotDeals(catalogue())).toBeNull();
    await db.hotDeal.create({ data: { erpItemId: "buds1", startsAt: future } });
    expect(await configuredHotDeals(catalogue())).toBeNull();
    await db.hotDeal.create({ data: { erpItemId: "phone1", active: false, startsAt: past } });
    expect(await configuredHotDeals(catalogue())).toBeNull();
    await db.hotDeal.create({ data: { erpItemId: "case1", startsAt: past } });
    expect(await configuredHotDeals(catalogue())).toBeNull(); // only an out-of-stock product is live
    expect(await configuredHotDeals(null)).toBeNull();
    state.db = null;
    expect(await configuredHotDeals(catalogue())).toBeNull();
  });

  it("never throws when the table cannot be read", async () => {
    state.db = { hotDeal: { findMany: () => Promise.reject(new Error("relation does not exist")) } };
    await expect(configuredHotDeals(catalogue())).resolves.toBeNull();
  });
});
