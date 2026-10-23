/**
 * Website orders and their synchronisation with the ERP: a REAL website database (PGlite + the real migration SQL) and the
 * MOCK ERP (provisional-contract mock built from the ERP docs). Proves the website-side logic (persist first, retry,
 * exactly-once, failure handling); it is not a test of a live ERP.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

const PORT = 4021;
let pg: PGlite;
let db: PrismaClient;
let proc: ChildProcess;

// placeOrder() reads the website database through getDb(); hand it the in-memory one.
vi.mock("@/lib/db", () => ({ getDb: () => (globalThis as unknown as { __testDb: unknown }).__testDb }));

const control = (body: unknown) =>
  fetch(`http://localhost:${PORT}/__control`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json() as Promise<{ orderPosts: number; orders: number; orderRefs: string[] }>);

beforeAll(async () => {
  pg = new PGlite();
  const dir = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) {
    await pg.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  (globalThis as unknown as { __testDb: unknown }).__testDb = db;

  process.env.HX_API_BASE = `http://localhost:${PORT}/api/v1/store-api`;
  process.env.HX_STORE_CREDENTIAL = "hxs_test.testsecret";
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
}, 60_000);

afterAll(async () => {
  proc?.kill();
  await db?.$disconnect();
  await pg?.close();
});

beforeEach(async () => {
  await control({ reset: true });
  await pg.exec(`TRUNCATE "WebOrder", "CustomerOrder", "Session", "Customer" CASCADE`);
  const { resetCatalogueCache } = await import("@/lib/erp/catalogue");
  resetCatalogueCache();
  process.env.HX_API_BASE = `http://localhost:${PORT}/api/v1/store-api`;
  process.env.HX_STORE_CREDENTIAL = "hxs_test.testsecret";
});

const REF = "VLK-261020-ABCDEFGHJK";
const input = (ref = REF, opts: { phone?: string } = {}) => ({
  externalRef: ref,
  lines: [{ productId: "cm0item00000003", variantKey: "", quantity: 2 }], // Pulse Wireless Earbuds, LKR 14,900
  customer: { name: "Kasun Perera", phone: opts.phone ?? "+94771234567", email: "" },
  delivery: { address: "12 Galle Road", city: "Colombo", district: "Colombo" as const, postalCode: "", notes: "" },
  expectedTotal: 14900 * 2 + 450,
  acceptTerms: true as const,
});
const ctx = (token = "tok-1") => ({ accessToken: token, customerId: null });
const row = (ref = REF) => db.webOrder.findUniqueOrThrow({ where: { externalRef: ref } });
const makeDue = (ref = REF) => db.webOrder.update({ where: { externalRef: ref }, data: { nextAttemptAt: new Date(Date.now() - 1000), lockedUntil: null } });

describe("persist first, then the ERP", () => {
  it("ERP up: order is saved, sent once and marked SYNCED with source Online Store", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const r = await placeOrder(input(), ctx());
    expect(r.state).toBe("created");
    expect(r.order).toMatchObject({ ref: REF, status: "PLACED", total: 30250, codCollected: false });
    const o = await row();
    expect(o).toMatchObject({ syncStatus: "SYNCED", source: "ONLINE_STORE", paymentMethod: "COD", syncAttempts: 1, erpStatus: "PLACED" });
    expect(Number(o.total)).toBe(30250);
    expect((await control({})).orders).toBe(1);
  });

  it("totals are computed by the server from ERP prices, never taken from the browser", async () => {
    const { placeOrder, CheckoutConflict } = await import("@/lib/checkout/place-order");
    await expect(placeOrder({ ...input(), expectedTotal: 1 }, ctx())).rejects.toBeInstanceOf(CheckoutConflict);
    expect(await db.webOrder.count()).toBe(0); // nothing was stored or sent
    expect((await control({})).orders).toBe(0);
  });

  it("ERP DOWN at order time: the order is NOT lost, it is stored as PENDING and reported as accepted", async () => {
    await control({ orderOutage: true });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const r = await placeOrder(input(), ctx());
    expect(r.state).toBe("accepted");
    expect(r.order).toMatchObject({ ref: REF, status: "RECEIVED", syncState: "pending", total: 30250, cancellable: false });
    const o = await row();
    expect(o.syncStatus).toBe("PENDING");
    expect(o.syncAttempts).toBe(1);
    expect(o.lastErrorCode).toMatch(/UNREACHABLE|TIMEOUT/);
    expect(o.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000); // backoff scheduled
    expect((await control({})).orders).toBe(0);
  });

  it("recovers when the ERP is back: the scheduled sync sends it exactly once", async () => {
    await control({ orderOutage: true });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { syncDueOrders } = await import("@/lib/orders/web-orders");
    await placeOrder(input(), ctx());

    // not due yet: the queue does not call the ERP at all
    const before = (await control({})).orderPosts;
    expect(await syncDueOrders(db)).toMatchObject({ due: 0 });
    expect((await control({})).orderPosts).toBe(before);

    await control({ orderOutage: false });
    await makeDue();
    expect(await syncDueOrders(db)).toMatchObject({ due: 1, synced: 1, failed: 0 });
    expect((await row()).syncStatus).toBe("SYNCED");
    expect((await control({})).orders).toBe(1);

    // running it again changes nothing
    const posts = (await control({})).orderPosts;
    expect(await syncDueOrders(db)).toMatchObject({ due: 0 });
    expect((await control({})).orderPosts).toBe(posts);
  });

  it("keeps backing off while the ERP stays down, then marks the order for attention after 24 hours", async () => {
    await control({ orderOutage: true });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { syncDueOrders } = await import("@/lib/orders/web-orders");
    await placeOrder(input(), ctx());
    await makeDue();
    await syncDueOrders(db);
    expect((await row()).syncAttempts).toBe(2);
    const gap1 = (await row()).nextAttemptAt.getTime() - Date.now();
    expect(gap1).toBeGreaterThan(4 * 60_000); // 5 minute step

    await db.webOrder.update({ where: { externalRef: REF }, data: { createdAt: new Date(Date.now() - 25 * 3600_000), nextAttemptAt: new Date(Date.now() - 1000) } });
    await syncDueOrders(db);
    expect(await row()).toMatchObject({ syncStatus: "FAILED", lastErrorCode: "RETRIES_EXHAUSTED" });
  });
});

describe("exactly once", () => {
  it("two senders at the same time produce one ERP order (lease)", async () => {
    await control({ orderOutage: true });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { syncOrder } = await import("@/lib/orders/web-orders");
    await placeOrder(input(), ctx());
    await control({ orderOutage: false });
    await makeDue();
    const postsBefore = (await control({})).orderPosts;
    const results = await Promise.all([syncOrder(db, REF), syncOrder(db, REF), syncOrder(db, REF)]);
    expect(results.filter((r) => r.kind === "synced").length).toBe(1);
    expect(results.filter((r) => r.kind === "busy").length).toBe(2);
    const after = await control({});
    expect(after.orders).toBe(1);
    expect(after.orderPosts - postsBefore).toBe(1); // only the sender holding the lease called the ERP
  });

  it("lost response after the ERP created the order: the retry replays, no duplicate", async () => {
    await control({ failNextOrder: "timeout-after-create" });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { syncDueOrders } = await import("@/lib/orders/web-orders");
    const first = await placeOrder(input(), ctx());
    // either the ERP client's own retry already got the replayed order, or it is queued: both are correct
    expect(["created", "accepted"]).toContain(first.state);
    await makeDue();
    await syncDueOrders(db);
    expect((await control({})).orders).toBe(1);
    expect((await row()).syncStatus).toBe("SYNCED");
  });

  it("the same reference submitted twice creates one website order and one ERP order", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const [a, b] = await Promise.all([placeOrder(input(), ctx("a")), placeOrder(input(), ctx("b"))]);
    expect(a.order.ref).toBe(b.order.ref);
    expect(await db.webOrder.count()).toBe(1);
    expect((await control({})).orders).toBe(1);
    // and sequentially
    const c = await placeOrder(input(), ctx("c"));
    expect(c.state).toBe("created");
    expect(await db.webOrder.count()).toBe(1);
    expect((await control({})).orders).toBe(1);
  });

  it("the same reference with DIFFERENT contents is refused", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    await placeOrder(input(), ctx());
    await expect(placeOrder(input(REF, { phone: "+94779999999" }), ctx())).rejects.toMatchObject({ kind: "REFERENCE_REUSED" });
    expect(await db.webOrder.count()).toBe(1);
  });
});

describe("failures", () => {
  it("a definitive ERP rejection during checkout is shown to the customer and nothing is kept", async () => {
    await control({ rejectOrders: [{ status: 409, code: "PRICE_CHANGED" }] });
    const { placeOrder, CheckoutConflict } = await import("@/lib/checkout/place-order");
    const err = await placeOrder(input(), ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(CheckoutConflict);
    expect(err.code).toBe("PRICE_CHANGED");
    expect(await db.webOrder.count()).toBe(0);
  });

  it("a rejection on a later retry marks the order FAILED with a readable error; an admin retry can send it once fixed", async () => {
    await control({ orderOutage: true });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { syncDueOrders, retryOrderNow } = await import("@/lib/orders/web-orders");
    await placeOrder(input(), ctx());
    await control({ orderOutage: false, rejectOrders: [{ status: 409, code: "INSUFFICIENT_STOCK" }] });
    await makeDue();
    expect(await syncDueOrders(db)).toMatchObject({ failed: 1 });
    const failed = await row();
    expect(failed).toMatchObject({ syncStatus: "FAILED", lastErrorCode: "INSUFFICIENT_STOCK" });
    expect(failed.lastError).toBe("Not enough stock when the order reached the ERP.");
    expect(JSON.stringify(failed)).not.toMatch(/hxs_|secret|Bearer/); // no credentials anywhere in the record

    // FAILED orders are not retried automatically
    await makeDue();
    expect(await syncDueOrders(db)).toMatchObject({ due: 0 });

    // admin retry after the cause is fixed
    const r = await retryOrderNow(db, REF);
    expect(r.kind).toBe("synced");
    expect(await row()).toMatchObject({ syncStatus: "SYNCED", lastError: null });
    expect((await control({})).orders).toBe(1);
  });

  it("admin retry is safe to repeat and refuses unknown orders", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { retryOrderNow } = await import("@/lib/orders/web-orders");
    await placeOrder(input(), ctx());
    expect((await retryOrderNow(db, REF)).kind).toBe("synced");
    expect((await retryOrderNow(db, REF)).kind).toBe("synced");
    expect((await retryOrderNow(db, "VLK-261020-ZZZZZZZZZZ")).kind).toBe("missing");
    expect((await control({})).orders).toBe(1);
  });
});

describe("what customers can see", () => {
  it("a pending order is shown from the website record; the ERP's answer wins once it has the order", async () => {
    await control({ orderOutage: true });
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { loadOrderView } = await import("@/lib/orders/public");
    await placeOrder(input(), ctx());
    const pending = await loadOrderView(db, REF);
    expect(pending.order).toMatchObject({ status: "RECEIVED", syncState: "pending", paymentMethod: "COD", codCollected: false });
    expect(pending.order.lines[0]).toMatchObject({ name: "Pulse Wireless Earbuds", quantity: 2 });

    await control({ orderOutage: false });
    await makeDue();
    const synced = await loadOrderView(db, REF);
    expect(synced.order).toMatchObject({ status: "PLACED", syncState: "synced" });
  });

  it("an order unknown everywhere is a plain not-found", async () => {
    const { loadOrderView } = await import("@/lib/orders/public");
    await expect(loadOrderView(db, "VLK-261020-ZZZZZZZZZZ")).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("delivery details are only for the owner: matching browser token, the customer account, or staff", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { canSeeOrderDetails } = await import("@/lib/orders/public");
    const customer = await db.customer.create({ data: { email: "a@example.test", name: "A", passwordHash: "x" } });
    const other = await db.customer.create({ data: { email: "b@example.test", name: "B", passwordHash: "x" } });
    await placeOrder(input(), { accessToken: "right-token", customerId: customer.id });
    const o = await row();
    expect(canSeeOrderDetails(o, { tokens: ["right-token"] })).toBe(true);
    expect(canSeeOrderDetails(o, { tokens: ["wrong-token", "another"] })).toBe(false);
    expect(canSeeOrderDetails(o, { tokens: [] })).toBe(false);
    expect(canSeeOrderDetails(o, { customerId: customer.id })).toBe(true);
    expect(canSeeOrderDetails(o, { customerId: other.id })).toBe(false); // another customer's order
    expect(canSeeOrderDetails(o, { isAdmin: true })).toBe(true);
    expect(canSeeOrderDetails(null, { isAdmin: true })).toBe(false);
    expect(o.accessHash).toMatch(/^[0-9a-f]{64}$/);
    expect(o.accessHash).not.toContain("right-token"); // only the hash is stored
  });

  it("a resubmission from the same customer hands the new browser access (the first response may have been lost)", async () => {
    const { placeOrder } = await import("@/lib/checkout/place-order");
    const { canSeeOrderDetails } = await import("@/lib/orders/public");
    await placeOrder(input(), ctx("first"));
    await placeOrder(input(), ctx("second"));
    expect(canSeeOrderDetails(await row(), { tokens: ["second"] })).toBe(true);
  });
});
