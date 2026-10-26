import { expect, test, type Page } from "@playwright/test";

const ERP = "http://localhost:4011/__control";
const id = (n: number) => `cm0item${String(n).padStart(8, "0")}`;
const control = async (body: unknown) =>
  (await (await fetch(ERP, { method: "POST", body: JSON.stringify(body) })).json()) as { orderPosts: number; orders: number; orderRefs: string[] };

// Every test gets its own client IP (the site's rate limiter keys on x-forwarded-for), so the many test orders and
// sign-ups in one run never trip the per-IP limits that protect the real site.
let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ipCounter = (ipCounter % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.20.${Math.floor(Math.random() * 250)}.${ipCounter}` });
  await control({ reset: true });
});

async function addEarbuds(page: Page, qty = 1) {
  await page.goto(`/products/pulse-wireless-earbuds-${id(3)}`);
  for (let i = 1; i < qty; i++) await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("link", { name: "View cart" })).toBeVisible();
}

/** Walks the 3-step checkout up to the review step (the Place order button is then ready). */
async function fillCheckout(page: Page) {
  await page.getByLabel("Full name").fill("Kasun Perera");
  await page.getByLabel("Phone number").fill("0771234567");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Address", { exact: true }).fill("12 Galle Road");
  await page.getByLabel("City", { exact: true }).fill("Colombo");
  await page.getByLabel("District").selectOption("Colombo");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox").check();
}

test.describe("browse", () => {
  test("homepage, search, category and product pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("VOLTA.LK");
    await expect(page.getByRole("heading", { name: "New Arrivals" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hot Deals" })).toBeVisible(); // Orbit Pro has a real sale price

    await page.getByRole("combobox", { name: "Search products" }).fill("earbuds");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=earbuds/);
    await expect(page.getByRole("link", { name: /Pulse Wireless Earbuds/ })).toBeVisible();

    await page.goto("/search?q=zzzznothing");
    await expect(page.getByText("No products found")).toBeVisible();

    await page.goto("/categories/audio");
    await expect(page.getByRole("heading", { name: "Audio", level: 1 })).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveCount(0);

    await page.goto("/categories/does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("catalogue sorting and pagination", async ({ page }) => {
    await page.goto("/products?sort=price-asc");
    await expect(page.locator("article").first()).toContainText("Glide Tempered Glass");
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
  });

  test("variants and unavailable products", async ({ page }) => {
    await page.goto(`/products/nova-x1-smartphone-${id(1)}`);
    await expect(page.getByText("LKR 129,900")).toBeVisible();
    await page.getByText("256GB / Black").click();
    await expect(page.getByText("LKR 149,900")).toBeVisible();
    await expect(page.getByRole("radio", { name: /256GB \/ Blue/ })).toBeDisabled();

    await page.goto(`/products/limited-case-sold-out-${id(13)}`);
    await expect(page.getByTestId("availability")).toHaveText("Out of stock");
    await expect(page.getByRole("button", { name: "Add to cart", exact: true })).toBeDisabled();
  });
});

test.describe("cart + checkout + tracking", () => {
  test("complete COD journey", async ({ page }) => {
    await addEarbuds(page);
    await page.goto("/cart");
    await expect(page.getByTestId("subtotal")).toHaveText("LKR 14,900");
    await page.getByRole("button", { name: /Increase quantity of Pulse/ }).click();
    await expect(page.getByTestId("subtotal")).toHaveText("LKR 29,800");

    await page.getByRole("link", { name: "Proceed to checkout" }).click();
    await expect(page.getByTestId("delivery")).toHaveText("LKR 450");
    await expect(page.getByTestId("total")).toHaveText("LKR 30,250");
    await fillCheckout(page);
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page).toHaveURL(/order-confirmation\/VLK-/);
    const ref = (await page.getByTestId("order-ref").textContent())!;
    await expect(page.getByText(/payment is pending/)).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveCount(0);
    expect((await control({})).orders).toBe(1);

    await page.locator("#main").getByRole("link", { name: "Track your order" }).click();
    await expect(page.getByTestId("status")).toHaveText("Placed");

    await control({ setOrderStatus: { ref, status: "DISPATCHED", trackingNumber: "TRK-777", carrierName: "Test Courier" } });
    await page.goto(`/track-order?ref=${ref}`);
    await expect(page.getByTestId("status")).toHaveText("Dispatched");
    await expect(page.getByText("TRK-777")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);

    await control({ setOrderStatus: { ref, status: "DELIVERED", paymentStatus: "COD_COLLECTED" } });
    await page.goto(`/track-order?ref=${ref}`);
    await expect(page.getByText("This order has been delivered.")).toBeVisible();
    await expect(page.getByText("payment has been collected")).toBeVisible();
  });

  test("customer can cancel before dispatch; cancelled state is explained", async ({ page }) => {
    await addEarbuds(page);
    await page.goto("/checkout");
    await fillCheckout(page);
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page).toHaveURL(/order-confirmation/);
    await page.locator("#main").getByRole("link", { name: "Track your order" }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Cancel order" }).click();
    await expect(page.getByText("This order has been cancelled")).toBeVisible();
  });

  test("track-order rejects malformed and unknown references", async ({ page }) => {
    await page.goto("/track-order");
    await page.getByLabel("Order reference").fill("hello");
    await page.getByRole("button", { name: "Track order" }).click();
    await expect(page.locator("#ref-err")).toContainText("valid order reference");
    await page.getByLabel("Order reference").fill("VLK-251019-ZZZZZZZZZZ");
    await page.getByRole("button", { name: "Track order" }).click();
    await expect(page.locator("#ref-err")).toContainText("could not find");
  });

  test("checkout validation shows helpful messages step by step and sends nothing", async ({ page }) => {
    await addEarbuds(page);
    await page.goto("/checkout");
    // step 1: details
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please enter your full name")).toBeVisible();
    await expect(page.getByText("Enter a valid Sri Lankan phone number")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible(); // did not advance
    await page.getByLabel("Full name").fill("Kasun Perera");
    await page.getByLabel("Phone number").fill("12345");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Enter a valid Sri Lankan phone number")).toBeVisible();
    await page.getByLabel("Phone number").fill("0771234567");
    await page.getByRole("button", { name: "Continue" }).click();
    // step 2: delivery
    await expect(page.getByRole("heading", { name: "Delivery address" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please select a district")).toBeVisible();
    await expect(page.getByText("Please enter your delivery address")).toBeVisible();
    await page.getByLabel("Address", { exact: true }).fill("12 Galle Road");
    await page.getByLabel("City", { exact: true }).fill("Colombo");
    await page.getByLabel("District").selectOption("Colombo");
    await page.getByRole("button", { name: "Continue" }).click();
    // step 3: review, terms are required
    await expect(page.getByRole("heading", { name: "Review and place your order" })).toBeVisible();
    await expect(page.getByTestId("recap")).toContainText("Kasun Perera");
    await expect(page.getByTestId("recap")).toContainText("12 Galle Road, Colombo, Colombo");
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByText("Please accept the terms to continue")).toBeVisible();
    expect((await control({})).orderPosts).toBe(0);

    // going back keeps what was typed, and the review shows the change
    await page.getByRole("button", { name: /Change contact details/ }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Kasun Perera");
    await page.getByLabel("Full name").fill("Nimal Silva");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByTestId("recap")).toContainText("Nimal Silva");
  });

  test("price change is surfaced and no order is created", async ({ page }) => {
    await addEarbuds(page);
    await page.goto("/checkout");
    await control({ setPrice: { id: id(3), price: 16000 } });
    await fillCheckout(page);
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "prices changed" })).toBeVisible();
    await expect(page.getByTestId("total")).toHaveText("LKR 16,450");
    expect((await control({})).orders).toBe(0);
    // accepting the new total succeeds
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page).toHaveURL(/order-confirmation/);
  });

  test("stock running out is reported and no order is created", async ({ page }) => {
    await addEarbuds(page, 3);
    await page.goto("/checkout");
    await control({ setStock: { id: id(3), stock: 1 } });
    await fillCheckout(page);
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "no longer available" })).toBeVisible();
    expect((await control({})).orders).toBe(0);
  });

  test("a dropped response does not create a duplicate order on retry", async ({ page }) => {
    await addEarbuds(page);
    await page.goto("/checkout");
    await fillCheckout(page);
    let dropped = false;
    await page.route("**/api/store/orders", async (route) => {
      if (route.request().method() === "POST" && !dropped) {
        dropped = true;
        await route.fetch(); // the server really processes and creates the order...
        await route.abort("connectionreset"); // ...but the browser never sees the response
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "will not be duplicated" })).toBeVisible();
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page).toHaveURL(/order-confirmation/);
    const s = await control({});
    expect(s.orders).toBe(1);
  });

  test("checkout is unavailable when the ERP disables COD", async ({ page }) => {
    await addEarbuds(page);
    await control({ settings: { paymentMethods: { COD: false } } });
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Checkout is unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Place order" })).toHaveCount(0);
  });
});

test.describe("responsive @mobile", () => {
  test("mobile menu opens, navigates and closes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Browse VOLTA.LK" });
    await expect(menu).toBeVisible();
    await menu.getByRole("link", { name: "Audio" }).click();
    await expect(page).toHaveURL(/categories\/audio/);
    await expect(page.getByRole("dialog", { name: "Browse VOLTA.LK" })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
