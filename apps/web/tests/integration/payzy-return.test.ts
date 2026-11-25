/**
 * Payzy start + return handling against a REAL website database (PGlite + the real migration SQL).
 * The ERP release is spied on (syncOrder), so "processed once" is asserted on the call count.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { buildResponseSignString, hmacBase64 } from "@/lib/payments/payzy";
import { encryptSecret } from "@/lib/erp/connection";
import { getActivePayzy, invalidatePayzyConfig, isPayzyOffered } from "@/lib/payments/payzy-config";
import { applyPayzyReturn, listStalePayzyAttempts, settlePayzyAttemptManually, startPayzyPayment } from "@/lib/payments/payzy-service";

let pg: PGlite;
let db: PrismaClient;

vi.mock("@/lib/db", () => ({ getDb: () => (globalThis as unknown as { __testDb: unknown }).__testDb }));
const syncOrder = vi.fn(async () => ({ kind: "synced", order: null }));
vi.mock("@/lib/orders/web-orders", async (orig) => ({ ...(await orig<typeof import("@/lib/orders/web-orders")>()), syncOrder: (...a: unknown[]) => (syncOrder as (...x: unknown[]) => unknown)(...a) }));

const KEY = "$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
const REF = "VLK-261126-ABCDEFGHJK";
const ORDER_ID = `VOLTA-${REF}-1`;
const RETURN_URL = "https://shop.example/api/payments/payzy/return";

beforeAll(async () => {
  pg = new PGlite();
  const dir = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) await pg.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  (globalThis as unknown as { __testDb: unknown }).__testDb = db;
  Object.assign(process.env, { PAYZY_BASE_URL: "https://api.payzypay.test", PAYZY_SHOP_ID: "2", PAYZY_SECRET_KEY: KEY, PAYZY_TEST_MODE: "on", APP_URL: "https://shop.example" });
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
});

const payload = {
  externalRef: REF, paymentMethod: "ONLINE", currency: "LKR", total: 10, deliveryCharge: 0,
  customer: { name: "Nimal Perera", phone: "+94771234567", email: "n@example.com" },
  delivery: { addressLine1: "12 Temple Road", city: "Colombo", district: "Colombo", postalCode: "00700" },
};

beforeEach(async () => {
  syncOrder.mockClear();
  await db.payzyPayment.deleteMany();
  await db.webOrder.deleteMany();
  await db.webOrder.create({
    data: {
      externalRef: REF, paymentMethod: "PAYZY", awaitingPayment: true, paymentStatus: "PENDING", currency: "LKR",
      subtotal: "10.00", deliveryCharge: "0.00", total: "10.00", customerName: "Nimal Perera", customerPhone: "+94771234567", customerEmail: "n@example.com",
      payload, items: [{ itemId: "i1", variantKey: "", name: "Cable", quantity: 1, unitPrice: 10 }],
    },
  });
});

const jsonRes = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("startPayzyPayment", () => {
  it("builds the request from the DB order, stores the exact payload and returns the Payzy url", async () => {
    const f = jsonRes(200, { url: "https://pay.payzypay.test/s/1" });
    const r = await startPayzyPayment(db, REF, f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, redirectUrl: "https://pay.payzypay.test/s/1", payzyOrderId: ORDER_ID });

    const sent = JSON.parse(((f.mock.calls[0] as unknown as [string, RequestInit])[1]).body as string) as Record<string, string>;
    expect(sent).toMatchObject({ x_test_mode: "on", x_shopid: "2", x_amount: "10", x_order_id: ORDER_ID, x_response_url: RETURN_URL, x_first_name: "Nimal", x_last_name: "Perera", x_address: "12 Temple Road", x_city: "Colombo", x_state: "Colombo", x_zip: "00700", x_phone: "+94771234567", x_email: "n@example.com", x_ship_to_address: "12 Temple Road", x_freight: "0", x_platform: "custom", x_version: "1.0" });
    expect(typeof sent.signature).toBe("string");
    const attempt = await db.payzyPayment.findUniqueOrThrow({ where: { payzyOrderId: ORDER_ID } });
    expect(attempt.status).toBe("PENDING");
    expect(attempt.redirectUrl).toBe("https://pay.payzypay.test/s/1");
    const stored = Object.fromEntries(Object.entries(sent).filter(([k]) => k !== "signature"));
    expect(attempt.requestFields).toEqual(stored);
  });

  it("each start is a new attempt with a new x_order_id", async () => {
    const f = jsonRes(200, { url: "https://pay.payzypay.test/s/1" }) as unknown as typeof fetch;
    await startPayzyPayment(db, REF, f);
    const r = await startPayzyPayment(db, REF, f);
    expect(r).toMatchObject({ ok: true, payzyOrderId: `VOLTA-${REF}-2` });
  });

  it("Payzy error or missing url: attempt FAILED, friendly code, order untouched", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const f of [jsonRes(400, { message: "bad" }), jsonRes(200, {})]) {
      expect(await startPayzyPayment(db, REF, f as unknown as typeof fetch)).toEqual({ ok: false, code: "PAYZY_REJECTED" });
    }
    spy.mockRestore();
    expect((await db.payzyPayment.findMany()).every((a) => a.status === "FAILED")).toBe(true);
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PENDING");
  });

  it("refuses an already paid order and a non-Payzy order", async () => {
    await db.webOrder.update({ where: { externalRef: REF }, data: { paymentStatus: "PAID" } });
    expect(await startPayzyPayment(db, REF, jsonRes(200, {}) as unknown as typeof fetch)).toEqual({ ok: false, code: "ALREADY_PAID" });
    await db.webOrder.update({ where: { externalRef: REF }, data: { paymentStatus: "PENDING", paymentMethod: "COD" } });
    expect(await startPayzyPayment(db, REF, jsonRes(200, {}) as unknown as typeof fetch)).toEqual({ ok: false, code: "NOT_PAYABLE" });
  });
});

/** Starts an attempt and returns a correctly signed return for it. */
async function startAttempt() {
  await startPayzyPayment(db, REF, jsonRes(200, { url: "https://pay.payzypay.test/s/1" }) as unknown as typeof fetch);
  const attempt = await db.payzyPayment.findUniqueOrThrow({ where: { payzyOrderId: ORDER_ID } });
  const fields = attempt.requestFields as Record<string, string>;
  const sign = (code: string) => hmacBase64(buildResponseSignString(fields, code), KEY);
  return { attempt, sign };
}

const get = async (q: Record<string, string | undefined>) => {
  const { GET } = await import("@/app/api/payments/payzy/return/route");
  // Build the query the way Payzy does: the signature's "+" is NOT encoded, so it decodes to a space.
  const qs = Object.entries(q).filter((e): e is [string, string] => e[1] !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2B/g, "+")}`).join("&");
  return GET(new Request(`https://internal.host/api/payments/payzy/return?${qs}`));
};

describe("GET /api/payments/payzy/return", () => {
  it("valid 00: attempt SUCCESS, order paid, released to the ERP once, 303 to the result page", async () => {
    const { sign } = await startAttempt();
    const res = await get({ x_order_id: ORDER_ID, response_code: "00", signature: sign("00") });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://shop.example/checkout/payzy/result?orderId=${REF}`);
    const order = await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } });
    expect(order.paymentStatus).toBe("PAID");
    expect(order.awaitingPayment).toBe(false);
    expect(order.paidAt).not.toBeNull();
    const a = await db.payzyPayment.findUniqueOrThrow({ where: { payzyOrderId: ORDER_ID } });
    expect(a.status).toBe("SUCCESS");
    expect(a.responseCode).toBe("00");
    expect(syncOrder).toHaveBeenCalledTimes(1);
  });

  it("valid non-00 code: attempt FAILED with the code stored, order stays unpaid", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { sign } = await startAttempt();
    const res = await get({ x_order_id: ORDER_ID, response_code: "05", signature: sign("05") });
    expect(res.status).toBe(303);
    const a = await db.payzyPayment.findUniqueOrThrow({ where: { payzyOrderId: ORDER_ID } });
    expect(a).toMatchObject({ status: "FAILED", responseCode: "05" });
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PENDING");
    expect(syncOrder).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not successful"), "05", "for", ORDER_ID);
    warn.mockRestore();
  });

  it("tampered signature or code: nothing changes and a security warning is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { sign } = await startAttempt();
    for (const q of [
      { x_order_id: ORDER_ID, response_code: "00", signature: sign("00").slice(0, -2) + "xx" },
      { x_order_id: ORDER_ID, response_code: "00", signature: sign("05") }, // a failure signature replayed as success
      { x_order_id: ORDER_ID, response_code: "00", signature: "" },
      { x_order_id: ORDER_ID, response_code: "00" },
    ]) {
      const res = await get(q);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(`https://shop.example/checkout/payzy/result?orderId=${REF}`);
    }
    expect((await db.payzyPayment.findUniqueOrThrow({ where: { payzyOrderId: ORDER_ID } })).status).toBe("PENDING");
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PENDING");
    expect(syncOrder).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("SECURITY"), ORDER_ID);
    warn.mockRestore();
  });

  it("a signature whose '+' arrived as a space still verifies", async () => {
    // Look for an attempt whose signature contains '+' by varying the attempt (each has a different x_order_id).
    let found: { id: string; sig: string } | null = null;
    for (let i = 1; i <= 200 && !found; i++) {
      const id = `VOLTA-${REF}-${i}`;
      const fields = { x_test_mode: "on", x_shopid: "2", x_amount: "10", x_order_id: id, x_response_url: RETURN_URL, x_first_name: "Nimal", x_last_name: "Perera", x_company: "", x_address: "12 Temple Road", x_country: "Sri Lanka", x_state: "Colombo", x_city: "Colombo", x_zip: "00700", x_phone: "+94771234567", x_email: "n@example.com", x_ship_to_first_name: "Nimal", x_ship_to_last_name: "Perera", x_ship_to_company: "", x_ship_to_address: "12 Temple Road", x_ship_to_country: "Sri Lanka", x_ship_to_state: "Colombo", x_ship_to_city: "Colombo", x_ship_to_zip: "00700", x_freight: "0", x_platform: "custom", x_version: "1.0", signed_field_names: "" };
      const sig = hmacBase64(buildResponseSignString(fields, "00"), KEY);
      if (sig.includes("+")) {
        await db.payzyPayment.create({ data: { payzyOrderId: id, orderRef: REF, attemptNo: i, amount: "10.00", currency: "LKR", requestFields: fields } });
        found = { id, sig };
      }
    }
    expect(found).not.toBeNull();
    // The raw query keeps "+", which decodes to a space.
    const res = await get({ x_order_id: found!.id, response_code: "00", signature: found!.sig });
    expect(res.status).toBe(303);
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PAID");
  });

  it("the same return URL hit twice (or concurrently) is processed once", async () => {
    const { sign } = await startAttempt();
    const q = { x_order_id: ORDER_ID, response_code: "00", signature: sign("00") };
    await get(q);
    await get(q);
    await Promise.all([get(q), get(q)]);
    expect(syncOrder).toHaveBeenCalledTimes(1);
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PAID");
  });

  it("a later failure return for an attempt already paid does not undo the payment", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { sign } = await startAttempt();
    await get({ x_order_id: ORDER_ID, response_code: "00", signature: sign("00") });
    await get({ x_order_id: ORDER_ID, response_code: "05", signature: sign("05") });
    expect((await db.payzyPayment.findUniqueOrThrow({ where: { payzyOrderId: ORDER_ID } })).status).toBe("SUCCESS");
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PAID");
    warn.mockRestore();
  });

  it("unknown attempt or missing params go to checkout and change nothing; POST works too", async () => {
    const { POST } = await import("@/app/api/payments/payzy/return/route");
    const res = await get({ x_order_id: "VOLTA-NOPE-1", response_code: "00", signature: "x" });
    expect(res.headers.get("location")).toBe("https://shop.example/checkout?payment=error");
    expect((await get({})).headers.get("location")).toBe("https://shop.example/checkout?payment=error");

    const { sign } = await startAttempt();
    const post = await POST(new Request(RETURN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ x_order_id: ORDER_ID, response_code: "00", signature: sign("00") }).toString() }));
    expect(post.status).toBe(303);
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PAID");
  });
});

describe("applyPayzyReturn without configuration", () => {
  it("never pays when the key is not available", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { sign } = await startAttempt();
    const out = await applyPayzyReturn(db, { x_order_id: ORDER_ID, response_code: "00", signature: sign("00") }, null);
    expect(out.kind).toBe("invalid_signature");
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PENDING");
    warn.mockRestore();
  });
});

describe("stale attempts for manual reconciliation", () => {
  it("lists attempts PENDING for over 30 minutes on unpaid orders only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await startAttempt();
    expect(await listStalePayzyAttempts(db)).toHaveLength(0);
    await db.payzyPayment.update({ where: { payzyOrderId: ORDER_ID }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    expect((await listStalePayzyAttempts(db)).map((a) => a.payzyOrderId)).toEqual([ORDER_ID]);
    await db.webOrder.update({ where: { externalRef: REF }, data: { paymentStatus: "PAID" } });
    expect(await listStalePayzyAttempts(db)).toHaveLength(0);
    warn.mockRestore();
  });
});

describe("admin manual reconciliation", () => {
  it("mark paid: order paid and released once; a second click does nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await startAttempt();
    expect(await settlePayzyAttemptManually(db, ORDER_ID, "PAID", "admin@example.com")).toBe("paid");
    expect(await settlePayzyAttemptManually(db, ORDER_ID, "PAID", "admin@example.com")).toBe("not_pending");
    expect(syncOrder).toHaveBeenCalledTimes(1);
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PAID");
    expect((await db.payzyPayment.findUniqueOrThrow({ where: { payzyOrderId: ORDER_ID } })).responseCode).toBe("manual");
    warn.mockRestore();
  });

  it("mark failed: attempt FAILED, order stays unpaid; unknown attempt is reported", async () => {
    await startAttempt();
    expect(await settlePayzyAttemptManually(db, ORDER_ID, "FAILED", "admin@example.com")).toBe("failed");
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PENDING");
    expect(syncOrder).not.toHaveBeenCalled();
    expect(await settlePayzyAttemptManually(db, "VOLTA-NOPE-1", "PAID", "a@b.c")).toBe("unknown_attempt");
  });
});

describe("admin-saved connection", () => {
  it("wins over the environment, key stays encrypted, and the switch controls checkout", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = "x".repeat(40);
    await db.payzyConnectionConfig.deleteMany();
    await db.payzyConnectionConfig.create({ data: { id: "default", enabled: false, baseUrl: "https://api.payzy.lk", shopId: "77", secretKeyEnc: encryptSecret(KEY), secretKeyHint: "…hWy", testMode: "off", appUrl: "https://live.example" } });
    invalidatePayzyConfig();
    const row = await db.payzyConnectionConfig.findUniqueOrThrow({ where: { id: "default" } });
    expect(row.secretKeyEnc).not.toContain(KEY);
    const a = await getActivePayzy();
    expect(a.cfg).toMatchObject({ baseUrl: "https://api.payzy.lk", shopId: "77", testMode: "off", secretKey: KEY });
    expect(await isPayzyOffered()).toBe(false);
    await db.payzyConnectionConfig.update({ where: { id: "default" }, data: { enabled: true } });
    invalidatePayzyConfig();
    expect(await isPayzyOffered()).toBe(true);
    await db.payzyConnectionConfig.deleteMany();
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    invalidatePayzyConfig();
    expect((await getActivePayzy()).cfg?.shopId).toBe("2"); // back to the environment
  });
});
