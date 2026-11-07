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
  await page.getByLabel("Email", { exact: true }).fill(email);
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
  test("sort, a brand page and the stock status links (as on ugreen.lk) work together and keep the chosen sort", async ({ page }) => {
    await page.goto("/products");
    await page.getByLabel("Sort products").selectOption("price-asc");
    await expect(page).toHaveURL(/sort=price-asc/);
    await expect(page.locator("main article").first()).toContainText("Glide Tempered Glass");

    // a brand's products (the brand pages and Shop by Brand link here), cheapest first
    await page.goto("/products?brand=Pulse&sort=price-asc");
    await expect(page.locator("main article")).toHaveCount(2);
    await expect(page.locator("main article").first()).toContainText("Pulse Wireless Earbuds");

    // Stock status: closed until opened; each choice is a link that applies at once and keeps the sort
    await page.goto("/products?sort=price-asc");
    await page.locator("summary", { hasText: "Stock status" }).click();
    const stock = page.getByRole("list", { name: "Stock status" });
    await stock.getByRole("link", { name: "In stock" }).click();
    await expect(page).toHaveURL(/stock=1/);
    await expect(page).toHaveURL(/sort=price-asc/);
    await expect(stock.getByRole("link", { name: "In stock" })).toHaveAttribute("aria-current", "true");
    await expect(page.locator("main article", { hasText: "Limited Case (sold out)" })).toHaveCount(0);
    // the same link switches it off again
    await stock.getByRole("link", { name: "In stock" }).click();
    await expect(page).not.toHaveURL(/stock=1/);
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
    await page.getByLabel("Sort products").selectOption("name");
    await expect(page).toHaveURL(/view=list/);
    await layout.getByRole("link", { name: "Grid view" }).click();
    await expect(page).not.toHaveURL(/view=list/);
    const grid = (await page.locator("main article").first().boundingBox())!;
    expect(grid.width).toBeLessThan(grid.height);
  });

  test("on phones the filter drawer opens, closes and its categories work", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/products");
    await page.getByRole("button", { name: "Filters" }).click();
    const close = page.getByRole("button", { name: "Close filters" }).last();
    await expect(close).toBeVisible();
    await close.click();
    await expect(page.getByRole("navigation", { name: "Filter by category" })).toBeHidden();
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByRole("navigation", { name: "Filter by category" }).getByRole("link", { name: "Audio", exact: true }).click();
    await expect(page).toHaveURL(/\/categories\/audio$/);
    await expect(page.locator("main article")).toHaveCount(4);
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
    await page.goto("/account/profile");
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
    await page.getByLabel("Email", { exact: true }).fill("nobody@example.com");
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
    // Cart opens the cart drawer on the same page; its "View full cart" leads to the cart page
    await bar.getByRole("link", { name: "Cart, 1 item" }).click();
    await expect(page.getByRole("dialog", { name: "Your Shopping Bag" })).toBeVisible();
    await expect(page).toHaveURL(/\/wishlist$/);
    await page.getByRole("dialog", { name: "Your Shopping Bag" }).getByRole("link", { name: "View full cart" }).click();
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
    await page.locator("footer").getByRole("link", { name: "Shop by brand" }).click(); // the header bar keeps only top categories (as on ugreen.lk)
    await expect(page).toHaveURL(/\/brands$/);
    await expect(page.getByRole("heading", { name: "Shop by Brand", level: 1 })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: /, \d+ products?$/ })).toHaveCount(12); // every brand in the ERP data
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
    // At the top the page's own search bar shows, so the header button appears only once that bar has scrolled away.
    await expect(page.locator(".splash-auto-out")).toHaveCount(0, { timeout: 10_000 }); // the opening splash has gone
    await expect(page.getByRole("button", { name: "Open search" })).toBeHidden();
    await expect(async () => {
      await page.evaluate(() => window.scrollTo(0, 2000));
      await expect(page.getByRole("button", { name: "Open search" })).toBeVisible({ timeout: 1000 });
    }).toPass();
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

test.describe("cart drawer", () => {
  test("the header cart opens the bag on the same page: empty state, quantities, remove, totals and checkout", async ({ page }) => {
    await page.goto("/products");
    const cart = page.locator("header").getByRole("link", { name: /^Cart/ });
    await cart.click();
    const bag = page.getByRole("dialog", { name: "Your Shopping Bag" });
    await expect(bag).toBeVisible();
    await expect(page).toHaveURL(/\/products$/); // no new page
    await expect(bag.getByText("Your bag is empty")).toBeVisible();
    await bag.getByRole("button", { name: "Close cart" }).first().click();
    await expect(bag).toHaveCount(0);

    await page.getByRole("button", { name: "Add to cart: Pulse Wireless Earbuds" }).click();
    await page.getByRole("button", { name: "Add to cart: Atlas Smartwatch" }).click();
    await cart.click();
    await expect(bag.getByText("2 items selected")).toBeVisible();
    await expect(bag.getByText("Delivery LKR 450 · Cash on delivery")).toBeVisible(); // live ERP settings
    await bag.getByRole("button", { name: "Increase quantity of Pulse Wireless Earbuds" }).click();
    await expect(bag.getByText("3 items selected")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveText("3");
    // 2 x 14,900 + 34,900 + 450 delivery
    await expect(bag.getByText("LKR 65,150")).toBeVisible();
    await bag.getByRole("button", { name: "Remove Atlas Smartwatch" }).click();
    await expect(bag.getByRole("listitem")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(bag).toHaveCount(0);
    await expect(cart).toBeFocused(); // focus returns to the cart

    await cart.click();
    await bag.getByRole("link", { name: "Checkout" }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(bag).toHaveCount(0);
  });
});

test.describe("store features", () => {
  test("a category without sub-categories shows its brands as tiles, and a brand tile filters it", async ({ page }) => {
    await page.goto("/categories/mobile-phones");
    const brands = page.getByRole("navigation", { name: "Mobile Phones brands" });
    await expect(brands.getByRole("link", { name: /^All Mobile Phones/ })).toHaveAttribute("aria-current", "page");
    await expect(brands.getByRole("link", { name: /Orbit/ })).toBeVisible();
    await brands.getByRole("link", { name: /Nova/ }).click();
    await expect(page).toHaveURL(/\/categories\/mobile-phones\?brand=Nova/);
    await expect(page.locator("main article")).toHaveCount(2); // Nova X1 + Nova Lite
    await expect(brands.getByRole("link", { name: /Nova/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Breadcrumbs" }).getByText("Nova")).toBeVisible();
  });

  test("category pages: sub-category tiles, On sale filter, result range and products per page", async ({ page }) => {
    await page.goto("/categories/audio");
    const subs = page.getByRole("navigation", { name: "Audio sub-categories" });
    await expect(subs.getByRole("link", { name: /^All Audio/ })).toHaveAttribute("aria-current", "page");
    await subs.getByRole("link", { name: /^Speakers/ }).click();
    await expect(page).toHaveURL(/sub=speakers/);
    await expect(page.locator("main article")).toHaveCount(2);
    await expect(page.getByRole("status").filter({ hasText: "Showing 1–2 of 2 results" })).toBeVisible();

    await page.goto("/products");
    await page.locator("summary", { hasText: "Stock status" }).click(); // closed until used, as on ugreen.lk
    await page.getByRole("list", { name: "Stock status" }).getByRole("link", { name: "On sale" }).click();
    await expect(page).toHaveURL(/sale=1/);
    await expect(page.locator("main article")).toHaveCount(1); // Orbit Pro is the only reduced product

    await page.goto("/products");
    const per = page.getByRole("navigation", { name: "Products per page" });
    await expect(per.getByRole("link", { name: "Show 12 per page" })).toHaveAttribute("aria-current", "true");
    await per.getByRole("link", { name: "Show 24 per page" }).click();
    await expect(page).toHaveURL(/per=24/);
    await expect(per.getByRole("link", { name: "Show 24 per page" })).toHaveAttribute("aria-current", "true");
  });

  test("recently viewed lists the products opened in this browser and can be cleared", async ({ page }) => {
    await page.goto("/products/orbit-pro-smartphone-cm0item00000002");
    await page.waitForLoadState("networkidle"); // the view is recorded once the page is interactive
    await page.goto(PULSE);
    const recent = page.locator("section[aria-labelledby=recent]");
    await expect(recent.getByRole("link", { name: "Orbit Pro Smartphone" })).toBeVisible();
    await expect(recent.getByRole("link", { name: "Pulse Wireless Earbuds" })).toHaveCount(0); // not the current product
    await page.goto("/products");
    await expect(page.locator("section[aria-labelledby=recent]").getByRole("link")).toHaveCount(2);
    await page.locator("section[aria-labelledby=recent]").getByRole("button", { name: "Clear" }).click();
    await expect(page.locator("section[aria-labelledby=recent]")).toHaveCount(0);
  });

  test("product page share links and the search box's quick links", async ({ page }) => {
    await page.goto(PULSE);
    await expect(page.getByRole("link", { name: "Share on WhatsApp (opens in a new tab)" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*pulse-wireless-earbuds/);
    await expect(page.getByRole("link", { name: "Share on Facebook (opens in a new tab)" })).toHaveAttribute("href", /facebook\.com\/sharer/);
    await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();

    await page.goto("/");
    await page.locator("header").getByRole("combobox", { name: "Search products" }).focus();
    await expect(page.getByText("Top brands & categories")).toBeVisible();
    await page.locator("header").getByRole("link", { name: "Volt", exact: true }).click();
    await expect(page).toHaveURL(/\/products\?brand=Volt$/);
  });
});

test.describe("most popular", () => {
  test("Most Popular appears once four different products have been ordered, most ordered first", async ({ page }) => {
    // Other tests in the run also place orders (in the same test database), so this one orders larger quantities of
    // other products and checks their relative order.
    const settings = await (await page.request.get("/api/store/settings")).json();
    const delivery = Number(settings.deliveryCharge ?? 0);
    const list = await (await page.request.get("/api/store/products?pageSize=15")).json();
    const picks = (list.items as { id: string; name: string; price: number; salePrice?: number | null; available: boolean; hasVariants: boolean }[])
      .filter((p) => p.available && !p.hasVariants && !/sold out|earbuds/i.test(p.name))
      .slice(0, 4);
    expect(picks.length).toBe(4);
    const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
    for (const [i, p] of picks.entries()) {
      const qty = 10 - i; // 10, 9, 8, 7
      const unit = p.salePrice ?? p.price;
      const ref = `VLK-261027-${Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")}`;
      const res = await page.request.post("/api/store/orders", {
        headers: { Origin: "http://localhost:3100" },
        data: {
          externalRef: ref,
          lines: [{ productId: p.id, variantKey: "", quantity: qty }],
          customer: { name: "Kasun Perera", phone: "0771234567", email: "" },
          delivery: { address: "12 Galle Road", city: "Colombo", district: "Colombo", postalCode: "", notes: "" },
          expectedTotal: Math.round((unit * qty + delivery) * 100) / 100,
          acceptTerms: true,
        },
      });
      expect(res.status(), await res.text()).toBeLessThan(300);
    }

    await page.goto("/");
    const popular = page.locator("#popular");
    await expect(popular.getByRole("heading", { name: "Most Popular" })).toBeVisible();
    const titles = await popular.locator("article h3").allInnerTexts();
    expect(titles.filter((t) => picks.some((p) => p.name === t))).toEqual(picks.map((p) => p.name));
  });
});
