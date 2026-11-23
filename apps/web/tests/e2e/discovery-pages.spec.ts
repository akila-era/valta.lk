import { expect, test } from "@playwright/test";

// The first render of a freshly started server loads the whole catalogue from the ERP; do that once before timing assertions.
test.beforeAll(async ({ request }) => {
  await request.get("/");
});

test.describe("category pages", () => {
  test("introduction with real counts, sub-category chips and a photograph", async ({ page }) => {
    await page.goto("/categories/audio");
    await expect(page.getByRole("heading", { name: "Audio", level: 1 })).toBeVisible();
    await expect(page.getByText(/^\d+ products in this category\.$/)).toBeVisible();
    const chips = page.getByRole("navigation", { name: "Audio sub-categories" });
    await expect(chips.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "true");
    for (const name of ["Earbuds", "Headphones", "Speakers"]) await expect(chips.getByRole("link", { name: new RegExp(`^${name}\\s+\\d+$`) })).toBeVisible();
    await chips.getByRole("link", { name: /^Earbuds/ }).click();
    await expect(page).toHaveURL(/\/categories\/audio\?sub=earbuds/);
    await expect(chips.getByRole("link", { name: /^Earbuds/ })).toHaveAttribute("aria-current", "true");
    await expect(page.locator("main article", { hasText: "Pulse Wireless Earbuds" })).toBeVisible();
    await expect(page.locator("main article", { hasText: "Echo Bluetooth Speaker" })).toHaveCount(0); // the chip really filters
  });

  test("a category without sub-categories shows no chip row, and nothing overflows on a phone", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/categories/audio");
    await expect(page.getByRole("heading", { name: "Audio", level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.goto("/categories/wearables");
    await expect(page.getByRole("navigation", { name: "Wearables sub-categories" })).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("brand pages", () => {
  test("a brand filter opens a brand introduction with the catalogue's own count", async ({ page }) => {
    await page.goto("/products?brand=Volt");
    await expect(page.getByRole("heading", { name: "Volt", level: 1 })).toBeVisible();
    await expect(page.getByText("3 products from Volt in the catalogue.")).toBeVisible();
    await expect(page).toHaveTitle(/Volt products/);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Brands" })).toHaveAttribute("href", "/brands");
    await expect(page.locator("main article", { hasText: "Volt 20W Fast Charger" })).toBeVisible();
    await expect(page.locator("main article", { hasText: "Pulse Wireless Earbuds" })).toHaveCount(0);
    await page.getByRole("link", { name: "All brands" }).click();
    await expect(page).toHaveURL(/\/brands$/);
  });

  test("brand names match without regard to case; an unknown brand falls back to the plain list", async ({ page }) => {
    await page.goto("/products?brand=volt");
    await expect(page.getByRole("heading", { name: "Volt", level: 1 })).toBeVisible();
    await page.goto("/products?brand=NoSuchBrand");
    await expect(page.getByRole("heading", { name: "All products", level: 1 })).toBeVisible();
    await expect(page.getByText(/No products found/)).toBeVisible();
  });

  test("/brands is listed in the sitemap", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/brands</loc>");
  });
});

test.describe("recently viewed on product pages", () => {
  test("shows the other products you opened, never the one you are on", async ({ page }) => {
    const slugOf = async (q: string) => (await (await page.request.get(`/api/store/products?q=${encodeURIComponent(q)}`)).json()).items[0].slug as string;
    const a = await slugOf("Pulse Wireless Earbuds");
    const b = await slugOf("Volt 20W Fast Charger");
    await page.goto(`/products/${a}`);
    await expect(page.locator("section[aria-labelledby=recent]")).toHaveCount(0); // only this product so far: nothing else to show
    await page.goto(`/products/${b}`);
    const recent = page.locator("section[aria-labelledby=recent]");
    await expect(recent.getByRole("heading", { name: "Recently viewed" })).toBeVisible();
    await expect(recent.locator("article", { hasText: "Pulse Wireless Earbuds" })).toBeVisible();
    await expect(recent.locator("article", { hasText: "Volt 20W Fast Charger" })).toHaveCount(0);
  });
});

test.describe("search suggestions: brands and categories", () => {
  test("a matching brand is offered, with its real product count, and opens that brand's products", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("combobox", { name: "Search products" });
    await box.fill("pul");
    const list = page.getByRole("listbox", { name: "Search suggestions" });
    const brand = list.getByRole("group", { name: "Brands" }).getByRole("option", { name: /^Pulse/ });
    await expect(brand).toContainText(/\d+ products?/);
    await expect(brand).toHaveAttribute("href", "/products?brand=Pulse");
    await expect(list.getByRole("group", { name: "Products" }).getByRole("option", { name: /Pulse Wireless Earbuds/ })).toBeVisible();
    await box.press("ArrowDown"); // the first row is the brand
    await box.press("Enter");
    await expect(page).toHaveURL(/\/products\?brand=Pulse/);
    await expect(page.getByRole("heading", { name: "Pulse", level: 1 })).toBeVisible();
  });

  test("a matching category is offered and opens the category page", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("combobox", { name: "Search products" });
    await box.fill("audio");
    const list = page.getByRole("listbox", { name: "Search suggestions" });
    const category = list.getByRole("group", { name: "Categories" }).getByRole("option", { name: /^Audio/ });
    await expect(category).toHaveAttribute("href", "/categories/audio");
    await category.click();
    await expect(page).toHaveURL(/\/categories\/audio$/);
  });

  test("names the catalogue does not have are never suggested", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("combobox", { name: "Search products" });
    await box.fill("zzzzqq");
    const list = page.getByRole("listbox", { name: "Search suggestions" });
    await expect(list.getByText("No matching products")).toBeVisible();
    await expect(list.getByRole("group")).toHaveCount(0);
  });
});

test.describe("navigation and information pages", () => {
  test("the Brands link goes to the brand directory in the desktop header and on phones", async ({ page, browser }) => {
    await page.goto("/");
    const desktop = page.getByRole("navigation", { name: "Categories", exact: true }).getByRole("link", { name: "Brands" });
    await expect(desktop).toHaveAttribute("href", "/brands");
    await desktop.click();
    await expect(page).toHaveURL(/\/brands$/);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phone = await ctx.newPage();
    await phone.goto("/");
    const chip = phone.getByRole("navigation", { name: "Browse shortcuts" }).getByRole("link", { name: "Brands" });
    await expect(chip).toHaveAttribute("href", "/brands");
    await phone.goto("/#brands");
    await expect(phone.locator("section#brands")).toBeVisible();
    await ctx.close();
  });

  test("information pages have a header band, and a contact panel with only published details on large screens", async ({ page, browser }) => {
    await page.goto("/faq");
    await expect(page.getByRole("heading", { name: "Frequently asked questions", level: 1 })).toBeVisible();
    const panel = page.getByRole("complementary", { name: "Contact" });
    await expect(panel).toBeVisible(); // the test server publishes a phone number
    await expect(panel.getByRole("link", { name: /\+94 70 000 0000/ })).toHaveAttribute("href", "tel:+94700000000");
    await expect(panel.getByRole("link", { name: "Track your order" })).toHaveAttribute("href", "/track-order");
    await expect(panel.getByText(/@|WhatsApp/)).toHaveCount(0); // no email or WhatsApp is configured, so none is shown
    await page.goto("/contact");
    await expect(page.getByRole("complementary", { name: "Contact" })).toHaveCount(0); // the Contact page already lists the details in full
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phone = await ctx.newPage();
    await phone.goto("/faq");
    await expect(phone.getByRole("complementary", { name: "Contact" })).toBeHidden();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await ctx.close();
  });

  test("header tap targets: the logo and the Support link are at least 40px tall", async ({ browser }) => {
    const small = await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true });
    const p1 = await small.newPage();
    await p1.goto("/");
    const logo = await p1.getByRole("link", { name: "VALTA.LK home" }).first().boundingBox();
    expect(logo!.height).toBeGreaterThanOrEqual(40);
    await small.close();
    const wide = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await wide.newPage();
    await p2.goto("/");
    const support = await p2.locator("header").getByRole("link", { name: "Support" }).boundingBox();
    expect(support!.height).toBeGreaterThanOrEqual(40);
    await wide.close();
  });
});
