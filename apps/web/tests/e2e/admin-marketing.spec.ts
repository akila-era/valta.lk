import { expect, test, type Page } from "@playwright/test";

/** Admin marketing controls that feed the homepage: wide banners (the banner slider) and brand logos (Shop by Brand). */
const SITE = "http://localhost:3100";
const ERP = "http://localhost:4011/__control";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.50.${Math.floor(Math.random() * 250)}.${ip}` });
  await fetch(ERP, { method: "POST", body: JSON.stringify({ reset: true }) });
});

async function signInAsAdmin(page: Page) {
  const body = { name: "Store Admin", email: "admin@example.test", phone: "0771234567", password: "secret123" };
  const reg = await page.request.post("/api/account/register", { data: body, headers: { Origin: SITE } });
  if (reg.status() !== 201) expect(reg.status()).toBe(409);
  const res = await page.request.post("/api/admin/login", { data: { email: body.email, password: body.password }, headers: { Origin: SITE } });
  expect(res.status()).toBe(200);
}

test.describe("admin marketing", () => {
  test("a wide banner added in the admin opens the homepage slider with its link, and deleting it removes it", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/marketing/banners");
    await page.getByRole("button", { name: "Add banner" }).click();
    await page.getByText("Wide banner (full-width picture, slides)").click();
    await page.locator("#banner-file").setInputFiles({ name: "wide.png", mimeType: "image/png", buffer: PNG });
    await page.getByLabel("Description (read by screen readers)").fill("Audit wide banner");
    await page.getByLabel("Link when clicked (optional)").fill("/products?sale=1");
    await page.locator("form").getByRole("button", { name: "Add banner" }).click();
    await expect(page.getByText("Audit wide banner")).toBeVisible();

    await page.goto("/");
    const banner = page.getByRole("region", { name: "Featured" });
    await expect(banner.getByRole("button", { name: "Go to slide 6" })).toBeVisible(); // the staff banner + five photographs
    const first = banner.getByRole("group", { name: "1 of 6" });
    await expect(first.getByRole("img", { name: "Audit wide banner" })).toBeVisible();
    await expect(first.getByRole("link")).toHaveAttribute("href", "/products?sale=1");

    await page.goto("/admin/marketing/banners");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByText("Audit wide banner")).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Featured" }).getByRole("button", { name: "Go to slide 6" })).toHaveCount(0);
  });

  test("a brand logo uploaded in the admin shows in Shop by Brand, and removing it brings back the monogram", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/brands");
    await page.getByLabel("Upload logo for Pulse").setInputFiles({ name: "pulse.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("button", { name: "Remove logo for Pulse" })).toBeVisible();

    await page.goto("/");
    const pulse = page.locator("section[aria-labelledby=brands]").getByRole("link", { name: /^Pulse, / });
    await expect(pulse.locator("img")).toHaveCount(1);
    await expect(pulse.getByText("P", { exact: true })).toHaveCount(0); // no monogram once a logo exists
    await expect(pulse.getByText("Pulse", { exact: true })).toBeVisible(); // the name stays under the logo

    await page.goto("/admin/brands");
    await page.getByRole("button", { name: "Remove logo for Pulse" }).click();
    await expect(page.getByRole("button", { name: "Remove logo for Pulse" })).toHaveCount(0);
    await page.goto("/");
    const again = page.locator("section[aria-labelledby=brands]").getByRole("link", { name: /^Pulse, / });
    await expect(again.locator("img")).toHaveCount(0);
    await expect(again.getByText("P", { exact: true })).toBeVisible(); // the orange monogram is back
  });
});
