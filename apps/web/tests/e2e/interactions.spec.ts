import { expect, test, type Page } from "@playwright/test";

// Buttons and controls not covered elsewhere: the product page, catalogue controls, hero controls, cart actions, the
// account page, password reset, the phone tab bar and the contact page.

const ERP = "http://localhost:4011/__control";
const control = (body: unknown) => fetch(ERP, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const PULSE = "/products/pulse-wireless-earbuds-cm0item00000003";

let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ipCounter = (ipCounter % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.30.${Math.floor(Math.random() * 250)}.${ipCounter}` });
  await control({ reset: true });
});

async function register(page: Page) {
  const email = `ui${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/account/register");
  await page.getByLabel("Full name").fill("Nimal Silva");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("secret123");
  await page.getByLabel("Confirm password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

test.describe("product page controls", () => {
  test("larger image opens and closes; quantity steps; Buy now takes the chosen quantity to checkout", async ({ page }) => {
    await page.goto(PULSE);
    await page.getByRole("button", { name: "View image larger" }).click();
    const zoom = page.getByRole("dialog");
    await expect(zoom).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(zoom).toHaveCount(0);
    await page.getByRole("button", { name: "View image larger" }).click();
    await zoom.getByRole("button", { name: "Close larger image" }).click();
    await expect(zoom).toHaveCount(0);

    const qty = page.getByTestId("qty");
    await expect(page.getByRole("button", { name: "Decrease quantity" })).toBeDisabled(); // never below 1
    await page.getByRole("button", { name: "Increase quantity" }).click();
    await expect(qty).toHaveText("2");
    await page.getByRole("button", { name: "Decrease quantity" }).click();
    await expect(qty).toHaveText("1");
    await page.getByRole("button", { name: "Increase quantity" }).click();
    await page.getByRole("button", { name: "Buy now" }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByText("Pulse Wireless Earbuds").first()).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveText("2");
  });

  test("on-this-page links jump to their sections", async ({ page }) => {
    await page.goto(PULSE);
    const jumps = page.getByRole("navigation", { name: "On this page" });
    await jumps.getByRole("link", { name: "Specifications" }).click();
    await expect(page).toHaveURL(/#specs$/);
    await expect(page.getByRole("heading", { name: "Specifications" })).toBeInViewport();
  });
});

test.describe("catalogue controls", () => {
  test("sort, brand and price filters, active-filter chips, and filters keep the chosen sort", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("navigation", { name: "Sort" }).getByRole("link", { name: "Price: low to high" }).click();
    await expect(page).toHaveURL(/sort=price-asc/);
    await expect(page.locator("main article").first()).toContainText("Glide Tempered Glass");

    await page.getByLabel("Brand").selectOption("Pulse");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/brand=Pulse/);
    await expect(page).toHaveURL(/sort=price-asc/); // applying filters keeps the sort
    await expect(page.locator("main article")).toHaveCount(2);
    // cheapest Pulse product first
    await expect(page.locator("main article").first()).toContainText("Pulse Wireless Earbuds");

    // the chip removes the brand filter
    await page.getByRole("link", { name: /^Pulse/ }).filter({ has: page.locator("svg") }).first().click();
    await expect(page).not.toHaveURL(/brand=/);
    await expect(page.locator("main article")).toHaveCount(15);

    await page.getByPlaceholder("Min").fill("10000");
    await page.getByPlaceholder("Max").fill("30000");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/min=10000/);
    const prices = await page.locator("main article").evaluateAll((els) =>
      els.map((e) => Number((e.textContent ?? "").match(/LKR ([\d,]+)/)?.[1].replace(/,/g, "") ?? 0)),
    );
    expect(prices.length).toBeGreaterThan(0);
    for (const p of prices) expect(p >= 10000 && p <= 30000, `price ${p}`).toBe(true);
  });

  test("grid and list layouts switch, are marked as current and survive sorting", async ({ page }) => {
    await page.goto("/products");
    const layout = page.getByRole("navigation", { name: "Layout" });
    await expect(layout.getByRole("link", { name: "Grid view" })).toHaveAttribute("aria-current", "true");
    await layout.getByRole("link", { name: "List view" }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(layout.getByRole("link", { name: "List view" })).toHaveAttribute("aria-current", "true");
    // one product per row: the card is much wider than it is tall
    const box = (await page.locator("main article").first().boundingBox())!;
    expect(box.width).toBeGreaterThan(box.height * 2);
    await page.getByRole("navigation", { name: "Sort" }).getByRole("link", { name: "Name" }).click();
    await expect(page).toHaveURL(/view=list/);
    await layout.getByRole("link", { name: "Grid view" }).click();
    await expect(page).not.toHaveURL(/view=list/);
    const grid = (await page.locator("main article").first().boundingBox())!;
    expect(grid.width).toBeLessThan(grid.height);
  });

  test("on phones the filter drawer opens, closes and applies", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/products");
    await page.getByRole("button", { name: "Filters" }).click();
    const close = page.getByRole("button", { name: "Close filters" }).last();
    await expect(close).toBeVisible();
    await close.click();
    await expect(page.getByLabel("Brand")).toBeHidden();
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByLabel("Brand").selectOption("Echo");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/brand=Echo/);
    await expect(page.locator("main article")).toHaveCount(2);
    await ctx.close();
  });
});

test.describe("homepage controls", () => {
  test("banner arrows change the slide and the pause button toggles", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("region", { name: "Featured" });
    await banner.getByRole("button", { name: "Next slide" }).click();
    await expect(banner.getByRole("button", { name: "Go to slide 2" })).toHaveAttribute("aria-current", "true");
    await banner.getByRole("button", { name: "Previous slide" }).click();
    await expect(banner.getByRole("button", { name: "Go to slide 1" })).toHaveAttribute("aria-current", "true");
    await banner.getByRole("button", { name: "Pause slideshow" }).click();
    await expect(banner.getByRole("button", { name: "Play slideshow" })).toBeVisible();
  });

  test("spotlight tiles and View all pills lead to the right pages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("region", { name: "Featured ranges" }).getByRole("link").first().click();
    await expect(page).toHaveURL(/\/categories\/accessories$/);
    await page.goto("/");
    await page.locator("section[aria-labelledby=cats]").getByRole("link", { name: "View all products" }).click();
    await expect(page).toHaveURL(/\/products$/);
  });
});

test.describe("cart actions", () => {
  test("Clear cart empties it; Continue shopping and Proceed to checkout go to the right pages", async ({ page }) => {
    await page.goto(PULSE);
    await page.getByRole("button", { name: /^Add to cart/ }).first().click();
    await page.goto("/cart");
    await page.getByRole("link", { name: "Continue Shopping" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await page.goto("/cart");
    await page.getByRole("link", { name: "Proceed to Checkout" }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await page.goto("/cart");
    // Clear cart asks first: Cancel keeps the items, confirming removes them
    await page.getByRole("button", { name: "Clear cart" }).click();
    const confirm = page.getByRole("dialog", { name: "Remove all items?" });
    await confirm.getByRole("button", { name: "Keep my cart" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Pulse Wireless Earbuds", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear cart" }).click();
    await confirm.getByRole("button", { name: "Remove all" }).click();
    await expect(page.getByText("Your cart is empty")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveCount(0);
  });
});

test.describe("account page actions", () => {
  test("profile details save, the header follows, and Sign out on the account page signs out", async ({ page }) => {
    await register(page);
    await page.getByLabel("Full name").fill("Nimal Fernando");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your details are saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Nimal Fernando");
    await expect(page.locator("header").getByRole("button", { name: /signed in as Nimal Fernando/ })).toBeVisible();
    await page.locator("main").getByRole("button", { name: "Sign out" }).click();
    await expect(page.locator("header").getByRole("button", { name: "My account, sign in or register" })).toBeVisible();
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/login/);
  });

  test("forgot password answers the same for any email, and an invalid reset link is refused", async ({ page }) => {
    await page.goto("/account/forgot-password");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByRole("button", { name: /send|reset/i }).click();
    await expect(page.getByText(/reset link/i)).toBeVisible();
    await page.goto("/account/reset-password?token=not-a-real-token");
    await page.getByLabel("New password").fill("newsecret123");
    await page.getByLabel("Confirm password").fill("newsecret123");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/reset-password/);
  });
});

test.describe("phone tab bar and contact", () => {
  test("every tab opens its page, marks itself current and shows live counts", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: "Quick links" });
    await bar.getByRole("link", { name: "Shop" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(bar.getByRole("link", { name: "Shop" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Add to cart: Pulse Wireless Earbuds" }).tap();
    await expect(bar.getByRole("link", { name: "Cart, 1 item" })).toBeVisible();
    await bar.getByRole("link", { name: "Wishlist" }).click();
    await expect(page).toHaveURL(/\/wishlist$/);
    await bar.getByRole("link", { name: "Cart, 1 item" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await bar.getByRole("link", { name: "My account" }).click();
    await expect(page).toHaveURL(/\/account\/login/); // signed out: the account tab leads to sign in
    await ctx.close();
  });

  test("contact page support number is a working phone link", async ({ page }) => {
    await page.goto("/contact");
    const tel = page.locator("main a[href^='tel:']").first();
    await expect(tel).toHaveAttribute("href", "tel:+94700000000");
  });
});

test.describe("shop by brand", () => {
  test("the Brands page lists every brand; a brand opens its own shop page with only its products", async ({ page }) => {
    await page.goto("/");
    await page.locator("header").getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Brands" }).click();
    await expect(page).toHaveURL(/\/brands$/);
    await expect(page.getByRole("heading", { name: "Shop by Brand", level: 1 })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: /, \d+ products?$/ })).toHaveCount(7); // every brand in the ERP data
    await page.getByRole("link", { name: /^Echo, / }).click();
    await expect(page).toHaveURL(/\/products\?brand=Echo$/);
    await expect(page.getByRole("heading", { name: "Echo", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumbs" }).getByRole("link", { name: "Brands" })).toHaveAttribute("href", "/brands");
    await expect(page.locator("main article")).toHaveCount(2);
    for (const t of await page.locator("main article").allInnerTexts()) expect(t).toMatch(/ECHO|Echo/);
    // the homepage section links to the full list
    await page.goto("/");
    await page.locator("section[aria-labelledby=brands]").getByRole("link", { name: "View all brands" }).click();
    await expect(page).toHaveURL(/\/brands$/);
  });
});

test.describe("phone header", () => {
  test("the sticky header is one slim row; the search button opens search anywhere on the page", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/");
    expect((await page.locator("header").boundingBox())!.height).toBeLessThan(80);
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.getByRole("button", { name: "Open search" }).click();
    const box = page.locator("header").getByRole("combobox", { name: "Search products" });
    await expect(box).toBeFocused();
    await box.fill("earb");
    await expect(page.getByRole("option", { name: /Pulse Wireless Earbuds/ })).toBeVisible();
    await page.keyboard.press("Escape"); // first Escape: suggestions close, the search stays open
    await expect(page.getByRole("listbox", { name: "Search suggestions" })).toHaveCount(0);
    await expect(box).toBeVisible();
    await page.keyboard.press("Escape"); // second Escape closes it
    await expect(box).toHaveCount(0);
    await page.getByRole("button", { name: "Open search" }).click();
    await page.getByRole("button", { name: "Close search" }).click();
    await expect(box).toHaveCount(0);
    await ctx.close();
  });
});
