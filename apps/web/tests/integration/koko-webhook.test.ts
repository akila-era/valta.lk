/**
 * Koko webhook and payment lifecycle against a REAL website database (PGlite + the real migration SQL).
 * The ERP release is spied on (syncOrder), so "processed once" is asserted on the call count.
 */
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { signData } from "@/lib/payments/koko";

let pg: PGlite;
let db: PrismaClient;

vi.mock("@/lib/db", () => ({ getDb: () => (globalThis as unknown as { __testDb: unknown }).__testDb }));
const syncOrder = vi.fn(async () => ({ kind: "synced", order: null }));
vi.mock("@/lib/orders/web-orders", async (orig) => ({ ...(await orig<typeof import("@/lib/orders/web-orders")>()), syncOrder: (...a: unknown[]) => (syncOrder as (...x: unknown[]) => unknown)(...a) }));

const koko = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs1", format: "pem" } });
const merchant = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs1", format: "pem" } });

const REF = "VLK-261125-ABCDEFGHJK";
const ORDER_ID = `${REF}-1`;

beforeAll(async () => {
  pg = new PGlite();
  const dir = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) await pg.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  (globalThis as unknown as { __testDb: unknown }).__testDb = db;
  Object.assign(process.env, {
    KOKO_BASE_URL: "https://qaapi.paykoko.test",
    KOKO_MERCHANT_ID: "M1",
    KOKO_API_KEY: "KEY",
    KOKO_PLUGIN_NAME: "customapi",
    KOKO_PLUGIN_VERSION: "1",
    KOKO_MERCHANT_PRIVATE_KEY: merchant.privateKey.replace(/\n/g, "\\n"),
    KOKO_PUBLIC_KEY: koko.publicKey.replace(/\n/g, "\\n"),
    APP_URL: "https://shop.example",
  });
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  syncOrder.mockClear();
  await db.kokoPayment.deleteMany();
  await db.webOrder.deleteMany();
  await db.webOrder.create({
    data: {
      externalRef: REF, paymentMethod: "KOKO", awaitingPayment: true, paymentStatus: "PENDING", currency: "LKR",
      subtotal: "12000.00", deliveryCharge: "500.00", total: "12500.00", customerName: "Nimal Perera", customerPhone: "+94771234567", customerEmail: "n@example.com",
      payload: {}, items: [{ itemId: "i1", variantKey: "", name: "Phone", quantity: 2, unitPrice: 6000 }],
    },
  });
  await db.kokoPayment.create({ data: { kokoOrderId: ORDER_ID, orderRef: REF, attemptNo: 1, amount: "12500.00", currency: "LKR" } });
});

const post = async (fields: Record<string, string>) => {
  const { POST } = await import("@/app/api/payments/koko/webhook/route");
  return POST(new Request("https://shop.example/api/payments/koko/webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() }));
};
const signedCallback = (status = "SUCCESS", orderId = ORDER_ID, trnId = "TRN1") => ({ orderId, trnId, status, desc: "", signature: signData(orderId + trnId + status, koko.privateKey) });

describe("POST /api/payments/koko/webhook", () => {
  it("invalid signature: 400 and nothing changes", async () => {
    const res = await post({ ...signedCallback(), signature: signData("forged", merchant.privateKey) });
    expect(res.status).toBe(400);
    const order = await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } });
    expect(order.paymentStatus).toBe("PENDING");
    expect(order.awaitingPayment).toBe(true);
    expect((await db.kokoPayment.findUniqueOrThrow({ where: { kokoOrderId: ORDER_ID } })).status).toBe("PENDING");
    expect(syncOrder).not.toHaveBeenCalled();
  });

  it("a tampered status is rejected", async () => {
    const cb = signedCallback("FAILED");
    expect((await post({ ...cb, status: "SUCCESS" })).status).toBe(400);
    expect(syncOrder).not.toHaveBeenCalled();
  });

  it("valid SUCCESS: attempt succeeds, order paid and released to the ERP", async () => {
    const res = await post(signedCallback());
    expect(res.status).toBe(200);
    const order = await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } });
    expect(order.paymentStatus).toBe("PAID");
    expect(order.awaitingPayment).toBe(false);
    expect(order.paidAt).not.toBeNull();
    const attempt = await db.kokoPayment.findUniqueOrThrow({ where: { kokoOrderId: ORDER_ID } });
    expect(attempt.status).toBe("SUCCESS");
    expect(attempt.trnId).toBe("TRN1");
    expect(syncOrder).toHaveBeenCalledTimes(1);
  });

  it("the same callback twice is processed once", async () => {
    expect((await post(signedCallback())).status).toBe(200);
    expect((await post(signedCallback())).status).toBe(200);
    expect(syncOrder).toHaveBeenCalledTimes(1);
  });

  it("two concurrent identical callbacks are processed once", async () => {
    await Promise.all([post(signedCallback()), post(signedCallback())]);
    expect(syncOrder).toHaveBeenCalledTimes(1);
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PAID");
  });

  it("a signed FAILED callback fails the attempt but never pays the order", async () => {
    expect((await post(signedCallback("FAILED"))).status).toBe(200);
    expect((await db.kokoPayment.findUniqueOrThrow({ where: { kokoOrderId: ORDER_ID } })).status).toBe("FAILED");
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PENDING");
    expect(syncOrder).not.toHaveBeenCalled();
  });

  it("a verified callback for an unknown attempt changes nothing", async () => {
    expect((await post(signedCallback("SUCCESS", "VLK-261125-ZZZZZZZZZZ-1"))).status).toBe(200);
    expect(syncOrder).not.toHaveBeenCalled();
  });
});

describe("return and cancel", () => {
  it("return never marks anything paid, even with a forged SUCCESS", async () => {
    const { GET } = await import("@/app/api/payments/koko/return/route");
    const res = await GET(new Request(`https://shop.example/api/payments/koko/return?orderId=${ORDER_ID}&trnId=X&status=SUCCESS`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://shop.example/checkout/koko/result?orderId=${REF}`);
    expect((await db.webOrder.findUniqueOrThrow({ where: { externalRef: REF } })).paymentStatus).toBe("PENDING");
    expect(syncOrder).not.toHaveBeenCalled();
  });

  it("cancel marks the attempt CANCELED, accepts a form POST, and redirects to checkout", async () => {
    const { POST } = await import("@/app/api/payments/koko/cancel/route");
    const res = await POST(new Request("https://shop.example/api/payments/koko/cancel", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `orderId=${ORDER_ID}&status=CANCELED` }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://shop.example/checkout?payment=cancelled");
    expect((await db.kokoPayment.findUniqueOrThrow({ where: { kokoOrderId: ORDER_ID } })).status).toBe("CANCELED");
  });

  it("cancel never overrides a SUCCESS", async () => {
    await post(signedCallback());
    const { GET } = await import("@/app/api/payments/koko/cancel/route");
    await GET(new Request(`https://shop.example/api/payments/koko/cancel?orderId=${ORDER_ID}`));
    expect((await db.kokoPayment.findUniqueOrThrow({ where: { kokoOrderId: ORDER_ID } })).status).toBe("SUCCESS");
  });
});

describe("startKokoPayment", () => {
  it("each attempt gets a new unique Koko order id and amounts come from the stored order", async () => {
    const { startKokoPayment } = await import("@/lib/payments/koko-service");
    const a = await startKokoPayment(db, REF);
    const b = await startKokoPayment(db, REF);
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.kokoOrderId).toBe(`${REF}-2`); // attempt 1 already exists
    expect(b.kokoOrderId).toBe(`${REF}-3`);
    expect(a.form.fields._amount).toBe("12500.00");
    expect(a.form.fields._currency).toBe("LKR");
    expect(a.form.fields._email).toBe("n@example.com");
    expect(await db.kokoPayment.count({ where: { orderRef: REF } })).toBe(3);
  });

  it("refuses an order that is already paid or not a Koko order", async () => {
    const { startKokoPayment } = await import("@/lib/payments/koko-service");
    await post(signedCallback());
    expect(await startKokoPayment(db, REF)).toEqual({ ok: false, code: "ALREADY_PAID" });
    await db.webOrder.update({ where: { externalRef: REF }, data: { paymentMethod: "COD", paymentStatus: null } });
    expect(await startKokoPayment(db, REF)).toEqual({ ok: false, code: "NOT_PAYABLE" });
    expect(await startKokoPayment(db, "VLK-261125-ZZZZZZZZZZ")).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});
