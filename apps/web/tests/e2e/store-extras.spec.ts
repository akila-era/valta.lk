import { expect, test, type Page } from "@playwright/test";

/** Features taken from ugreen.lk: compare, wholesale applications, the strip banner and category lines. */
const SITE = "http://localhost:3100";
const ERP = "http://localhost:4011/__control";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.70.${Math.floor(Math.random() * 250)}.${ip}` });
  await fetch(ERP, { method: "POST", body: JSON.stringify({ reset: true }) });
});

async function signInAsAdmin(page: Page) {
  const body = { name: "Store Admin", email: "admin@example.test", phone: "0771234567", password: "secret123" };
  const reg = await page.request.post("/api/account/register", { data: body, headers: { Origin: SITE } });
  if (reg.status() !== 201) expect(reg.status()).toBe(409);
  const res = await page.request.post("/api/admin/login", { data: { email: body.email, password: body.password }, headers: { Origin: SITE } });
  expect(res.status()).toBe(200);
}

test.describe("store extras", () => {
  test("compare: two products added from their pages show side by side, and one can be removed", async ({ page }) => {
    await page.goto("/products/pulse-wireless-earbuds-cm0item00000003");
    await page.getByRole("button", { name: "Compare" }).click();
    await expect(page.getByRole("button", { name: "Added to compare" })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/products/echo-mini-speaker-cm0item00000015");
    await page.getByRole("button", { name: "Compare" }).click();
    await page.getByRole("link", { name: "View compare (2/4)" }).click();
    await expect(page).toHaveURL(/\/compare\?p=pulse-wireless-earbuds-cm0item00000003,echo-mini-speaker-cm0item00000015$/);
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveCount(2);
    await expect(table.getByRole("link", { name: "Pulse Wireless Earbuds", exact: true })).toBeVisible();
    await expect(table.getByRole("row", { name: /^Price/ })).toContainText("LKR 14,900");

    await page.getByRole("button", { name: "Remove Pulse Wireless Earbuds from compare" }).click();
    await expect(page).toHaveURL(/\/compare\?p=echo-mini-speaker-cm0item00000015$/);
    await expect(page.getByRole("table").getByRole("columnheader")).toHaveCount(1);
  });

  test("wholesale: the header link opens the form, an application reaches the admin list and can be marked contacted", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Apply wholesale" }).click();
    await expect(page).toHaveURL(/\/wholesale$/);
    await page.getByRole("button", { name: "Send application" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "business name" })).toBeVisible();
    await page.getByLabel("Business name").fill("Audit Phone Shop");
    await page.getByLabel("Your name").fill("Audit Person");
    await page.getByLabel("Phone number").fill("0771234567");
    await page.getByLabel("What would you like to buy? (optional)").fill("20 chargers");
    await page.getByRole("button", { name: "Send application" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Thank you" })).toBeVisible();

    await signInAsAdmin(page);
    await page.goto("/admin/customers/wholesale");
    const row = page.getByRole("row", { name: /Audit Phone Shop/ });
    await expect(row).toContainText("20 chargers");
    await row.getByRole("button", { name: "Mark contacted" }).click();
    await expect(page.getByRole("row", { name: /Audit Phone Shop/ }).getByRole("button", { name: "Mark as new" })).toBeVisible();
  });

  test("checkout offers bank transfer once a bank account is set; the confirmation shows the account and reference", async ({ page }) => {
    await page.goto("/products/pulse-wireless-earbuds-cm0item00000003");
    await page.getByRole("button", { name: "Add to cart", exact: true }).click();
    await page.goto("/checkout");
    // no account yet: cash on delivery only, and the gateway methods are marked as coming soon
    await expect(page.getByRole("radio", { name: /Direct bank transfer/ })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "KOKO (coming soon)" })).toBeDisabled();

    await signInAsAdmin(page);
    const saved = await page.request.put("/api/admin/settings/store", {
      headers: { Origin: SITE },
      data: { phone: "+94 70 000 0000", bankName: "Test Bank", bankAccountName: "VOLTA Test", bankAccountNumber: "1234 5678 90" },
    });
    expect(saved.status()).toBe(200);

    await page.goto("/checkout");
    await page.getByLabel("Full name").fill("Kasun Perera");
    await page.getByLabel("Phone number").fill("0771234567");
    await page.getByLabel("Address", { exact: true }).fill("12 Galle Road");
    await page.getByLabel("City", { exact: true }).fill("Colombo");
    await page.getByLabel("District").selectOption("Colombo");
    await page.getByRole("radio", { name: /Direct bank transfer/ }).check();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page).toHaveURL(/order-confirmation\/VLK-/);
    await expect(page.getByTestId("payment-status")).toHaveText("Bank transfer (waiting for payment)");
    const details = page.getByTestId("bank-details");
    await expect(details).toContainText("1234 5678 90");
    await expect(details).toContainText((await page.getByTestId("order-ref").textContent())!.trim());
  });

  test("a strip banner and a category line set in the admin show on the homepage", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/marketing/banners");
    await page.getByRole("button", { name: "Add banner" }).click();
    await page.getByText("Strip banner (one full-width picture under Shop by Category)").click();
    await page.locator("#banner-file").setInputFiles({ name: "strip.png", mimeType: "image/png", buffer: PNG });
    await page.getByLabel("Description (read by screen readers)").fill("Audit strip banner");
    await page.getByLabel("Link when clicked (optional)").fill("/products?sale=1");
    await page.locator("form").getByRole("button", { name: "Add banner" }).click();
    await expect(page.getByText("Audit strip banner")).toBeVisible();

    await page.goto("/admin/categories");
    const line = page.getByLabel("Short line for Audio");
    await line.fill("Sound for every day");
    await page.getByRole("row", { name: /Audio/ }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("row", { name: /Audio/ }).getByRole("button", { name: "Save" })).toHaveCount(0);

    await page.goto("/");
    const strip = page.getByRole("region", { name: "Promotion" });
    await expect(strip.getByRole("img", { name: "Audit strip banner" })).toBeVisible();
    await expect(strip.getByRole("link")).toHaveAttribute("href", "/products?sale=1");
    await expect(page.getByRole("region", { name: "Featured ranges" }).getByText("Sound for every day")).toBeVisible();

    // clean up so other tests see the homepage as before
    await page.goto("/admin/marketing/banners");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByText("Audit strip banner")).toHaveCount(0);
    await page.goto("/admin/categories");
    await page.getByLabel("Short line for Audio").fill("");
    await page.getByRole("row", { name: /Audio/ }).getByRole("button", { name: "Save" }).click();
  });

  test("content from the admin: a page's text, a custom page, FAQs, popular searches; the built-in text comes back", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/content/pages");
    await page.getByRole("list", { name: "Pages" }).getByRole("button", { name: /About us/ }).click();
    await page.getByLabel("Title").fill("About our store");
    await page.getByLabel("Text", { exact: true }).fill("## Who we are\nA store for **phones**.\n\n- Cash on delivery\n\nRead the [FAQs](/faqs).");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.getByLabel("New page address").fill("audit-terms");
    await page.getByRole("button", { name: "Add page" }).click();
    await page.getByLabel("Title").fill("Audit terms");
    await page.getByLabel("Text", { exact: true }).fill("Open to everyone.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("About our store");
    await expect(page.getByRole("heading", { name: "Who we are" })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "FAQs" })).toHaveAttribute("href", "/faqs");
    await page.goto("/p/audit-terms");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Audit terms");
    await expect((await page.request.get("/p/no-such-page")).status()).toBe(404);

    const put = (key: string, value: unknown) => page.request.put(`/api/admin/content/${key}`, { headers: { Origin: SITE }, data: { value } });
    expect((await put("faq", { items: [{ q: "Audit question?", a: "Audit answer." }] })).status()).toBe(200);
    expect((await put("popular-searches", { items: [{ label: "audit search" }] })).status()).toBe(200);
    expect((await put("faq", { items: [{ q: "", a: "" }] })).status()).toBe(422); // checked like the form
    await page.goto("/faqs");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Frequently asked questions");
    await expect(page.getByText("Audit question?")).toBeVisible();
    await page.locator("header input[role=combobox]").first().click();
    await expect(page.locator("header").getByRole("link", { name: "audit search" }).first()).toHaveAttribute("href", "/search?q=audit%20search");

    // back to the built-in text so other tests see the site as before
    for (const key of ["faq", "popular-searches", "pages"]) expect((await put(key, null)).status()).toBe(200);
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("About VOLTA.LK");
  });

  test("new arrivals, warranty, FAQs and sitemap pages are linked from the footer and open", async ({ page }) => {
    await page.goto("/new-arrivals");
    await expect(page.getByRole("heading", { level: 1, name: "New Arrivals" })).toBeVisible();
    await expect(page.locator("main article", { hasText: "Pulse Wireless Earbuds" })).toBeVisible(); // published 3 days ago in the test data
    await expect(page.locator("main article", { hasText: "Zenith Smart Bulb" })).toHaveCount(0); // an older product
    for (const [link, heading] of [["Warranty & refund policy", "Warranty & refund policy"], ["Sitemap", "Sitemap"], ["Frequently asked questions", "Frequently asked questions"]]) {
      await page.goto("/");
      await page.locator("footer").getByRole("link", { name: link }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    }
  });
});

