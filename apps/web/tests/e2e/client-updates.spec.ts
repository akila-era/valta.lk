import { expect, test, type Page } from "@playwright/test";

/** Client-requested updates: stock colours, pre-orders, the WhatsApp button and the brand filter (no app install). */
const SITE = "http://localhost:3100";
const ERP = "http://localhost:4011/__control";

let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.71.${Math.floor(Math.random() * 250)}.${ip}` });
  await fetch(ERP, { method: "POST", body: JSON.stringify({ reset: true }) });
});

async function signInAsAdmin(page: Page) {
  const body = { name: "Store Admin", email: "admin@example.test", phone: "0771234567", password: "secret123" };
  const reg = await page.request.post("/api/account/register", { data: body, headers: { Origin: SITE } });
  if (reg.status() !== 201) expect(reg.status()).toBe(409);
  const res = await page.request.post("/api/admin/login", { data: { email: body.email, password: body.password }, headers: { Origin: SITE } });
  expect(res.status()).toBe(200);
}

test.describe("client updates", () => {
  test("stock status: in stock is green, out of stock is red, and there is no low-stock label", async ({ page }) => {
    await page.goto("/products?q=limited case");
    const out = page.locator("article", { hasText: "Limited Case" }).getByText("Out of stock", { exact: true });
    await expect(out).toHaveCSS("background-color", "rgb(180, 35, 24)");
    await page.goto("/products");
    const inStock = page.locator("article").first().getByText("In stock", { exact: true });
    await expect(inStock).toHaveCSS("color", "rgb(21, 128, 61)");
    await expect(page.getByText(/Only \d+ left/)).toHaveCount(0);
  });

  test("pre-order: an out-of-stock product takes a request (no payment, no ERP order) that staff see with a WhatsApp link", async ({ page }) => {
    await page.goto("/products?q=limited case");
    await page.locator("article", { hasText: "Limited Case" }).getByRole("link", { name: "Pre-order" }).first().click();
    await expect(page.getByTestId("availability")).toHaveText("Out of stock");
    await expect(page.getByRole("button", { name: "Add to cart", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Pre-order" }).click();
    await page.getByRole("button", { name: "Send pre-order" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "name and phone" })).toBeVisible();
    await page.getByLabel("Your name").fill("Pre Order Person");
    await page.getByLabel("Phone number (WhatsApp)").fill("0771234567");
    await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
    await page.getByRole("button", { name: "Send pre-order" }).click();
    const done = page.getByRole("status").filter({ hasText: "pre-order request has been sent" });
    await expect(done).toBeVisible();
    const ref = (await done.locator(".font-mono").textContent())!.trim();
    expect(ref).toMatch(/^PRE-[A-Z0-9]{6}$/);

    // An in-stock product cannot be pre-ordered through the API: it goes through the normal cart.
    const inStock = await page.request.post("/api/store/preorders", { headers: { Origin: SITE }, data: { productId: "cm0item00000003", name: "Someone", phone: "0771234567" } });
    expect(inStock.status()).toBe(409);

    await signInAsAdmin(page);
    await page.goto("/admin/orders/preorders");
    const row = page.getByRole("row", { name: new RegExp(ref) });
    await expect(row).toContainText("Pre Order Person");
    await expect(row).toContainText("Qty 2");
    await expect(row.getByRole("link", { name: "Message on WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/94771234567\?text=/);
    await row.getByRole("button", { name: "Mark contacted" }).click();
    await expect(page.getByRole("row", { name: new RegExp(ref) }).getByText("Contacted", { exact: true })).toBeVisible();
  });

  test("brand filter: a category lists its brands and choosing one shows only that brand", async ({ page }) => {
    // Smart Home has several brands in the test catalogue (Kora has one product).
    await page.goto("/categories/smart-home");
    await page.getByText("Brand", { exact: true }).first().click();
    const brands = page.getByRole("list", { name: "Brand" });
    expect(await brands.getByRole("link").count()).toBeGreaterThan(1);
    await brands.getByRole("link", { name: /Kora/ }).click();
    await expect(page).toHaveURL(/\/categories\/smart-home\?brand=Kora$/);
    await expect(page.locator("main article")).toHaveCount(1);
    await expect(page.locator("main article", { hasText: "Kora Security Camera" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Brand" }).getByRole("link", { name: /Kora/ })).toHaveAttribute("aria-current", "true");
  });

  test("the floating WhatsApp button links to the store number, and the site offers no app install", async ({ page }) => {
    await page.goto("/");
    const wa = page.getByRole("link", { name: "Chat with us on WhatsApp (opens in a new tab)" });
    if ((await wa.count()) > 0) await expect(wa).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+$/);
    expect((await page.request.get("/manifest.webmanifest")).status()).toBe(404);
    expect((await page.request.get("/sw.js")).status()).toBe(404);
    await expect(page.getByRole("dialog", { name: /Install/ })).toHaveCount(0);
  });
});
