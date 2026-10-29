import { expect, test, type Page } from "@playwright/test";
import { NAV } from "../../src/lib/admin/nav";

/** The admin console: every sidebar entry opens a real page, the drawer works on phones, and non-staff are kept out. */
const SITE = "http://localhost:3100";
const ERP = "http://localhost:4011/__control";

let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.40.${Math.floor(Math.random() * 250)}.${ip}` });
  await fetch(ERP, { method: "POST", body: JSON.stringify({ reset: true }) });
});

async function signInAsAdmin(page: Page) {
  const body = { name: "Store Admin", email: "admin@example.test", phone: "0771234567", password: "secret123" };
  const reg = await page.request.post("/api/account/register", { data: body, headers: { Origin: SITE } });
  if (reg.status() !== 201) {
    expect(reg.status()).toBe(409);
  }
  const res = await page.request.post("/api/admin/login", { data: { email: body.email, password: body.password }, headers: { Origin: SITE } });
  expect(res.status()).toBe(200);
}

test.describe("admin console", () => {
  test("every sidebar entry opens a working page inside the admin layout", async ({ page }) => {
    await signInAsAdmin(page);
    const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs.length).toBeGreaterThanOrEqual(25);
    for (const href of hrefs) {
      const res = await page.goto(href);
      expect(res?.status(), href).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }), href).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Admin" }), href).toBeVisible();
      await expect(page.getByText("Something went wrong"), href).toHaveCount(0);
    }
  });

  test("the sidebar highlights the current page and groups expand and collapse", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/orders?status=DISPATCHED");
    const nav = page.getByRole("navigation", { name: "Admin" });
    await expect(nav.getByRole("link", { name: "Dispatched" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "All Orders" })).not.toHaveAttribute("aria-current", "page");
    const catalog = nav.getByRole("button", { name: /Catalog/ });
    await expect(catalog).toHaveAttribute("aria-expanded", "false");
    await catalog.click();
    await expect(nav.getByRole("link", { name: "Brands" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  });

  test("dashboard shows real data only: empty states, ERP status from a live check", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible(); // mock ERP answers the ping
    await expect(page.getByText("Aug 21, 2024")).toHaveCount(0); // none of the reference mock-up data
    await expect(page.getByText("Kasun Perera 1,248")).toHaveCount(0);
  });

  test("products page: stat cards, filters, pagination size, edit link and CSV export", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Add Product" })).toBeVisible();
    await expect(page.getByText("Total products")).toBeVisible();
    const all = await page.getByRole("status").first().textContent();
    expect(all).toMatch(/\d+ products/);
    await page.getByRole("link", { name: "Low Stock", exact: true }).click();
    await expect(page).toHaveURL(/stock=low/);
    await expect(page.getByRole("status").first()).toContainText("match");
    await page.getByRole("link", { name: "Reset" }).click();
    await page.getByLabel("Search products by name, SKU or brand").fill("pulse");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(3); // header + 2 Pulse products
    await page.getByRole("link", { name: "Edit" }).first().click();
    await expect(page).toHaveURL(/\/admin\/products\/cm0item/);

    const csv = await page.request.get("/api/admin/products/export?q=pulse");
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const text = await csv.text();
    expect(text).toContain('"Pulse Wireless Earbuds"');
    expect(text).not.toContain("Nova X1");
  });

  test("customers and non-staff accounts cannot open any admin page", async ({ page }) => {
    await page.request.post("/api/account/register", { data: { name: "Shopper", email: `shopper${Date.now()}@example.com`, phone: "0771234567", password: "secret123" }, headers: { Origin: SITE } });
    for (const href of ["/admin", "/admin/products", "/admin/customers", "/admin/settings"]) {
      await page.goto(href);
      await expect(page.getByRole("alert").filter({ hasText: "No access" }), href).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
    }
  });

  test("@mobile the menu opens as a drawer, navigates and closes", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin");
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0); // hidden until opened
    await page.getByRole("button", { name: "Open menu" }).click();
    const nav = page.getByRole("dialog", { name: "Admin menu" }).getByRole("navigation", { name: "Admin" });
    await expect(nav).toBeVisible();
    await nav.getByRole("button", { name: "Customers" }).click();
    await nav.getByRole("link", { name: "All Customers" }).click();
    await expect(page).toHaveURL(/\/admin\/customers/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("instalment line (Payments)", () => {
  test("staff switch the KOKO / Mintpay line on and off; shoppers cannot change it", async ({ page, browser }) => {
    const anon = await browser.newContext();
    expect((await anon.request.put(`${SITE}/api/admin/settings/instalments`, { data: { enabled: true, providers: ["koko"], parts: 3 }, headers: { Origin: SITE } })).status()).toBe(401);
    await anon.close();

    await signInAsAdmin(page);
    // on with no provider is refused
    expect((await page.request.put("/api/admin/settings/instalments", { data: { enabled: true, providers: [], parts: 3 }, headers: { Origin: SITE } })).status()).toBe(422);

    await page.goto("/admin/payments");
    await page.getByLabel("Show the instalment line on product cards").check();
    await page.getByLabel("KOKO").check();
    await page.getByLabel("Mintpay").check();
    await page.getByLabel("Number of parts").selectOption("3");
    await expect(page.getByText("or 3 × LKR 4,967 with KOKO | Mintpay")).toBeVisible(); // preview
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    await page.goto("/products");
    const earbuds = page.locator("main article", { hasText: "Pulse Wireless Earbuds" });
    await expect(earbuds.getByText(/or 3 × LKR 4,967 with KOKO/)).toBeVisible(); // 14,900 ÷ 3, rounded up
    await expect(page.locator("main article", { hasText: "Limited Case (sold out)" }).getByText(/with KOKO/)).toHaveCount(0);

    await page.goto("/admin/payments");
    await page.getByLabel("Show the instalment line on product cards").uncheck();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.goto("/products");
    await expect(page.locator("main article").getByText(/with KOKO/)).toHaveCount(0);
  });
});

test.describe("ERP connection form", () => {
  test("tests and saves a connection from the admin, never shows the credential, refuses bad ones, and can be removed", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/settings/erp");
    const main = page.locator("#admin-main");
    await expect(main.getByText("the server environment settings")).toBeVisible();

    // wrong credential and unreachable address are reported clearly
    await main.getByLabel("ERP address (IP or host)").fill("localhost:4011");
    await main.getByLabel("API credential").fill("hxs_test.wrongsecret");
    await main.getByRole("button", { name: "Test connection" }).click();
    await expect(main.getByRole("alert")).toContainText(/rejected this credential/i);
    await main.getByLabel("ERP address (IP or host)").fill("127.0.0.1:9");
    await main.getByLabel("API credential").fill("hxs_test.testsecret");
    await main.getByRole("button", { name: "Test connection" }).click();
    await expect(main.getByRole("alert")).toContainText(/could not reach the ERP/i);
    await main.getByLabel("API credential").fill("not-a-credential");
    await main.getByRole("button", { name: "Test connection" }).click();
    await expect(main.getByRole("alert")).toContainText("hxs_");

    // good one
    await main.getByLabel("ERP address (IP or host)").fill("localhost:4011");
    await main.getByLabel("API credential").fill("hxs_test.testsecret");
    await main.getByRole("button", { name: "Test connection" }).click();
    await expect(main.getByRole("status")).toContainText("Connected.");
    await main.getByRole("button", { name: "Test & save" }).click();
    await expect(main.getByRole("status")).toContainText("Saved.");
    await expect(main.getByText("the connection saved here")).toBeVisible();
    await expect(main.getByText("hxs_test…ret")).toBeVisible();
    expect(await page.content()).not.toContain("testsecret"); // the secret never comes back to the browser
    await page.reload();
    await expect(main.getByLabel("API credential")).toHaveValue("");

    // the site still works with it, then remove falls back to the environment
    await page.goto("/admin/products");
    await expect(page.getByRole("table").getByText("Nova X1 Smartphone")).toBeVisible();
    await page.goto("/admin/settings/erp");
    page.once("dialog", (d) => d.accept());
    await main.getByRole("button", { name: "Remove saved connection" }).click();
    await expect(main.getByText("the server environment settings")).toBeVisible();

    // staff only
    const anon = await page.context().browser()!.newContext({ baseURL: SITE });
    const r = await anon.request.post("/api/admin/erp-connection", { headers: { Origin: SITE }, data: { address: "x", credential: "y", action: "test" } });
    expect(r.status()).toBe(401);
    await anon.close();
  });
});
