/**
 * DEV ONLY: creates a Rs 10 Payzy test order in the LOCAL website database and prints the Payzy sandbox payment URL.
 * Payzy asked for Rs 10 for every sandbox test. Real product prices are not touched.
 *
 *   npm run payzy:test-order
 *
 * The order is stored as already "synced" (source PAYZY_SANDBOX_TEST), so a successful sandbox payment marks it paid
 * but NEVER sends it to the ERP. Refuses to run in production or when PAYZY_TEST_MODE is not "on".
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true);

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production.");
  if (process.env.PAYZY_TEST_MODE !== "on") throw new Error('Refusing to run: PAYZY_TEST_MODE must be "on" (sandbox).');
  const { getDb } = await import("../src/lib/db");
  const { startPayzyPayment } = await import("../src/lib/payments/payzy-service");
  const { generateOrderRef } = await import("../src/lib/utils/order-ref");
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is not set (use the local dev database).");

  const ref = generateOrderRef();
  await db.webOrder.create({
    data: {
      externalRef: ref, source: "PAYZY_SANDBOX_TEST", paymentMethod: "PAYZY", awaitingPayment: true, paymentStatus: "PENDING",
      syncStatus: "SYNCED", currency: "LKR", subtotal: "10.00", deliveryCharge: "0.00", total: "10.00",
      customerName: "Sandbox Tester", customerPhone: "+94771234567", customerEmail: "sandbox@example.com",
      payload: { externalRef: ref, paymentMethod: "ONLINE", currency: "LKR", total: 10, deliveryCharge: 0, customer: { name: "Sandbox Tester", phone: "+94771234567", email: "sandbox@example.com" }, delivery: { addressLine1: "1 Test Road", city: "Colombo", district: "Colombo", postalCode: "00100" } },
      items: [{ itemId: "sandbox", variantKey: "", name: "Payzy sandbox test (Rs 10)", quantity: 1, unitPrice: 10 }],
    },
  });
  const r = await startPayzyPayment(db, ref);
  if (!r.ok) throw new Error(`Could not start the Payzy payment: ${r.code}`);
  console.log(`Order ${ref} (Rs 10), attempt ${r.payzyOrderId}\nOpen in a browser:\n${r.redirectUrl}\nResult page afterwards: ${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/checkout/payzy/result?orderId=${ref}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
