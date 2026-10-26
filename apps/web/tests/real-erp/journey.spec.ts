import { expect, test, type Page } from "@playwright/test";

/** Runs against the REAL local HEXALYTE ERP (tools/erp-local). Orders land in the disposable local ERP database. */

const erpBase = () => process.env.HX_API_BASE ?? "http://127.0.0.1:3101/api/v1/store-api";

async function fillCheckout(page: Page) {
  await page.getByLabel("Full name").fill("Real ERP Tester");
  await page.getByLabel("Phone number").fill("0771234567");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Address", { exact: true }).fill("12 Galle Road");
  await page.getByLabel("City", { exact: true }).fill("Colombo");
  await page.getByLabel("District").selectOption("Colombo");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox").check();
}

test("catalogue, variants and sale price come from the real ERP", async ({ page, request }) => {
  const s = await (await request.get("/api/store/settings")).json();
  expect(s).toMatchObject({ enabled: true, currency: "LKR", paymentMethods: ["COD"] });

  await page.goto("/products?q=nova x1");
  await page.locator("article", { hasText: "Nova X1" }).getByRole("link", { name: "Choose options" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Nova X1");
  await expect(page.getByText("LKR 129,900")).toBeVisible();
  await page.getByText("256GB / Black").click();
  await expect(page.getByText("LKR 149,900")).toBeVisible();
  await expect(page.getByRole("radio", { name: /256GB \/ Blue/ })).toBeDisabled(); // out of stock in the ERP

  await page.goto("/products?q=orbit pro");
  const card = page.locator("article", { hasText: "Orbit Pro Smartphone" });
  await expect(card.getByText("LKR 199,900")).toBeVisible();
  await expect(card.getByText(/^-\d+%$/)).toBeVisible(); // discount derived from the ERP's real sale price
});

test("a variant COD order reaches the real ERP and can be tracked and cancelled", async ({ page, request }) => {
  await page.goto("/products?q=nova x1");
  await page.locator("article", { hasText: "Nova X1" }).getByRole("link", { name: "Choose options" }).click();
  await page.getByText("256GB / Black").click();
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("link", { name: "View cart" })).toBeVisible();
  await page.goto("/checkout");
  await expect(page.locator("main").getByText(/LKR 450/).first()).toBeVisible(); // delivery charge from ERP settings
  await fillCheckout(page);
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/order-confirmation\/VLK-/);
  const ref = page.url().split("/").pop()!;
  await expect(page.getByText(/LKR 150,350/).first()).toBeVisible(); // 149,900 + 450 delivery
  await expect(page.locator("main").getByText(/cash on delivery/i).first()).toBeVisible();

  // The order really exists in the ERP, as COD / unpaid, using the website reference
  const order = await (await request.get(`/api/store/orders/${ref}`)).json();
  expect(order.order).toMatchObject({ ref, status: "PLACED", paymentMethod: "COD", codCollected: false, total: 150350 });
  expect(order.order.lines[0]).toMatchObject({ quantity: 1 });
  expect(erpBase()).toContain("/store-api");

  // Tracking page + cancellation before dispatch
  await page.goto(`/track-order?ref=${ref}`);
  await expect(page.getByText("PLACED", { exact: false }).first()).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByText("This order has been cancelled")).toBeVisible();
});

test("re-submitting the same order reference creates no second ERP order", async ({ request }) => {
  const body = (externalRef: string) => ({
    externalRef,
    lines: [{ productId: "", variantKey: "", quantity: 1 }],
    customer: { name: "Retry Tester", phone: "0771234567", email: "" },
    delivery: { address: "12 Galle Road", city: "Colombo", district: "Colombo", postalCode: "", notes: "" },
    expectedTotal: 0,
    acceptTerms: true,
  });
  const products = await (await request.get("/api/store/products?q=volt%20usb")).json();
  const item = products.items[0];
  const total = item.price + 450;
  const payload = { ...body("VLK-261020-ABCDEFGHJK"), lines: [{ productId: item.id, variantKey: "", quantity: 1 }], expectedTotal: total };
  const origin = { headers: { Origin: new URL(process.env.VOLTA_URL ?? "http://localhost:3000").origin } };
  const a = await request.post("/api/store/orders", { data: payload, ...origin });
  const b = await request.post("/api/store/orders", { data: payload, ...origin });
  expect([a.status(), b.status()]).toEqual([201, 201]);
  expect((await a.json()).order.ref).toBe((await b.json()).order.ref);
});
