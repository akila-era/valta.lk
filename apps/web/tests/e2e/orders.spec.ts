import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Cart, checkout and order flows against the MOCK ERP (provisional-contract mock) and a disposable in-memory website
 * database. Includes the ERP-outage path, order access rules and the admin orders area.
 */
const ERP = "http://localhost:4011/__control";
const SITE = "http://localhost:3100";
const SECRET = "e2e-sync-secret-0123456789";
const control = (body: unknown) => fetch(ERP, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json() as Promise<{ orders: number; orderPosts: number; orderRefs: string[] }>);
const unique = (prefix = "cust") => `${prefix}${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
const id = (n: number) => `cm0item${String(n).padStart(8, "0")}`;

let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ipCounter = (ipCounter % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.30.${Math.floor(Math.random() * 250)}.${ipCounter}` });
  await control({ reset: true });
});

async function register(page: Page, email: string, name = "Test Customer") {
  const res = await page.request.post("/api/account/register", { data: { name, email, phone: "0771234567", password: "secret123" }, headers: { Origin: SITE } });
  if (res.status() === 409) {
    const login = await page.request.post("/api/account/login", { data: { email, password: "secret123" }, headers: { Origin: SITE } });
    expect(login.status()).toBe(200);
    return;
  }
  expect(res.status()).toBe(201);
}

async function addEarbuds(page: Page, qty = 1) {
  await page.goto(`/products/pulse-wireless-earbuds-${id(3)}`);
  for (let i = 1; i < qty; i++) await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("link", { name: "View cart" })).toBeVisible();
}

async function placeOrder(page: Page, name = "Kasun Perera") {
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Phone number").fill("0771234567");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Address", { exact: true }).fill("12 Galle Road");
  await page.getByLabel("City", { exact: true }).fill("Colombo");
  await page.getByLabel("District").selectOption("Colombo");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/order-confirmation\/VLK-/);
  return page.url().split("/").pop()!;
}

async function newVisitor(browser: Browser) {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.31.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  return { ctx, page: await ctx.newPage() };
}

const runQueue = (secret = SECRET) => fetch(`${SITE}/api/internal/sync-orders`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });

test.describe("cart", () => {
  test("lines show image area, name, SKU, variant, unit price; quantity and remove work; totals use the ERP delivery charge", async ({ page }) => {
    await page.goto(`/products/nova-x1-smartphone-${id(1)}`);
    await page.getByText("256GB / Black").click();
    await page.getByRole("button", { name: "Add to cart", exact: true }).click();
    await addEarbuds(page, 2);
    await page.goto("/cart");
    const line = page.getByTestId("cart-line").filter({ hasText: "Pulse Wireless Earbuds" });
    await expect(line).toContainText("LKR 14,900 each");
    await expect(line.getByTestId("line-sku")).toHaveText("SKU-3");
    const phone = page.getByTestId("cart-line").filter({ hasText: "Nova X1" });
    await expect(phone).toContainText("256GB / Black");
    await expect(phone.getByTestId("line-sku")).toHaveText("NX1-256-BK"); // the variant's own SKU

    await expect(page.getByTestId("subtotal")).toHaveText("LKR 179,700"); // 149,900 + 2 x 14,900
    await expect(page.getByTestId("delivery")).toHaveText("LKR 450"); // from ERP settings
    await expect(page.getByTestId("total")).toHaveText("LKR 180,150");

    await line.getByRole("button", { name: "Decrease quantity of Pulse Wireless Earbuds" }).click();
    await expect(page.getByTestId("subtotal")).toHaveText("LKR 164,800");
    await line.getByRole("button", { name: "Remove Pulse Wireless Earbuds" }).click();
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await phone.getByRole("button", { name: /Remove Nova X1/ }).click();
    await expect(page.getByText("Your cart is empty")).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue shopping" }).first()).toHaveAttribute("href", "/products");
  });

  test("a price change in the ERP is shown clearly and the cart uses the new price", async ({ page }) => {
    await addEarbuds(page);
    await control({ setPrice: { id: id(3), price: 16000 } });
    await page.goto("/cart");
    await expect(page.getByTestId("price-note")).toContainText("Price updated from LKR 14,900 to LKR 16,000");
    await expect(page.getByTestId("subtotal")).toHaveText("LKR 16,000");
    await expect(page.getByTestId("total")).toHaveText("LKR 16,450");
  });

  test("stock changes: limited stock offers the available quantity, sold-out items must be removed, checkout is blocked meanwhile", async ({ page }) => {
    await addEarbuds(page, 3);
    await control({ setStock: { id: id(3), stock: 2 } });
    await page.goto("/cart");
    await expect(page.getByTestId("stock-note")).toContainText("Only 2 available");
    await expect(page.getByRole("link", { name: "Proceed to checkout" })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Change to 2" }).click();
    await expect(page.getByTestId("line-qty")).toHaveText("2");
    await expect(page.getByTestId("stock-note")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Proceed to checkout" })).toHaveAttribute("aria-disabled", "false");

    await control({ setStock: { id: id(3), stock: 0 } });
    await page.reload();
    await expect(page.getByTestId("stock-note")).toContainText("Out of stock");
    await page.getByTestId("stock-note").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Your cart is empty")).toBeVisible();
  });

  test("the browser can never set prices: a tampered cart total is rejected by the server", async ({ request, page }) => {
    await addEarbuds(page);
    const res = await request.post("/api/store/orders", {
      headers: { Origin: SITE },
      data: {
        externalRef: "VLK-261020-ABCDEFGHJK",
        lines: [{ productId: id(3), variantKey: "", quantity: 1 }],
        customer: { name: "Kasun Perera", phone: "0771234567", email: "" },
        delivery: { address: "12 Galle Road", city: "Colombo", district: "Colombo", postalCode: "", notes: "" },
        expectedTotal: 100, // a cheap total the browser "decided"
        acceptTerms: true,
      },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("PRICE_CHANGED");
    expect((await control({})).orders).toBe(0);
  });
});

test.describe("order resilience: ERP outage", () => {
  test("an order placed while the ERP is down is saved, shown as received, and reaches the ERP exactly once when it recovers", async ({ page, browser }) => {
    await addEarbuds(page);
    await control({ orderOutage: true });
    const ref = await placeOrder(page);

    // the customer sees a calm, accurate confirmation (not an error)
    await expect(page.getByRole("heading", { level: 1 })).toContainText("we have your order");
    await expect(page.getByTestId("pending-note")).toContainText("being confirmed");
    await expect(page.getByTestId("order-status")).toHaveText("Received");
    await expect(page.getByTestId("payment-status")).toContainText("Pending");
    await expect(page.getByRole("main")).toContainText("Cash on delivery");
    await expect(page.getByText("LKR 15,350").first()).toBeVisible(); // 14,900 + 450
    await expect(page.getByTestId("delivery-details")).toContainText("12 Galle Road, Colombo, Colombo"); // the placing browser may see it
    expect((await control({})).orders).toBe(0);

    // the tracking page works too, and offers no cancel button for an order the ERP does not have yet
    await page.goto(`/track-order?ref=${ref}`);
    await expect(page.getByTestId("received-note")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);

    // another visitor who only knows the reference sees the summary but NOT the delivery details
    const other = await newVisitor(browser);
    await other.page.goto(`/order-confirmation/${ref}`);
    await expect(other.page.getByTestId("order-ref")).toHaveText(ref);
    await expect(other.page.getByText("LKR 15,350").first()).toBeVisible();
    await expect(other.page.getByTestId("delivery-details")).toHaveCount(0);
    await expect(other.page.getByText("12 Galle Road")).toHaveCount(0);
    await other.ctx.close();

    // the ERP comes back: the scheduled queue sends the order once
    await control({ orderOutage: false });
    await page.waitForTimeout(1800); // past the (test) retry delay
    const r = await runQueue();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ synced: 1, failed: 0 });
    const after = await control({});
    expect(after.orders).toBe(1);
    expect(after.orderRefs).toEqual([ref]);
    expect(await (await runQueue()).json()).toMatchObject({ due: 0 }); // nothing left, nothing re-sent

    await page.goto(`/order-confirmation/${ref}`);
    await expect(page.getByTestId("order-status")).toHaveText("Placed");
    await expect(page.getByTestId("pending-note")).toHaveCount(0);
  });

  test("the scheduled endpoint is closed to anyone without the secret", async ({ request }) => {
    expect((await request.post("/api/internal/sync-orders")).status()).toBe(401);
    expect((await request.post("/api/internal/sync-orders", { headers: { Authorization: "Bearer wrong-secret-wrong-secret" } })).status()).toBe(401);
    expect((await request.get("/api/internal/sync-orders")).status()).toBe(405);
  });
});

test.describe("order access", () => {
  test("a signed-in customer's delivery details are visible to them and to nobody else", async ({ page, browser }) => {
    await register(page, unique());
    await addEarbuds(page);
    const ref = await placeOrder(page);
    await expect(page.getByTestId("delivery-details")).toContainText("Kasun Perera");

    // the same customer on another device (no order cookie) is recognised by their account
    // (simulated by a fresh context signed in as the same account)
    const another = await newVisitor(browser);
    await register(another.page, unique("other"), "Someone Else");
    await another.page.goto(`/order-confirmation/${ref}`);
    await expect(another.page.getByTestId("order-ref")).toHaveText(ref); // the reference works as a tracking token
    await expect(another.page.getByTestId("delivery-details")).toHaveCount(0); // but a different customer sees no personal data
    await expect(another.page.getByText("12 Galle Road")).toHaveCount(0);
    await another.ctx.close();

    // My orders only lists the signed-in customer's own orders
    await page.goto("/account");
    await expect(page.getByText(ref)).toBeVisible();
  });
});

test.describe("admin orders", () => {
  test("only listed staff can open it: signed-out users are sent to sign in, other customers get no access", async ({ page }) => {
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/admin\/login\?next=(%2F|\/)admin(%2F|\/)orders/);
    await register(page, unique());
    await page.goto("/admin/orders");
    await expect(page.getByRole("alert").filter({ hasText: "No access" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    expect((await page.request.post("/api/admin/orders/VLK-261020-ABCDEFGHJK/retry", { headers: { Origin: SITE } })).status()).toBe(403);
  });

  test("admin has its own sign-in: staff get in, other accounts are refused", async ({ page }) => {
    const other = unique();
    await register(page, other);
    await page.context().clearCookies();
    await register(page, "admin@example.test", "Store Admin");
    await page.context().clearCookies();
    const bad = await page.request.post("/api/admin/login", { data: { email: other, password: "secret123" }, headers: { Origin: SITE } });
    expect(bad.status()).toBe(401);
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("admin@example.test");
    await page.getByLabel("Password", { exact: true }).fill("secret123");
    await page.getByRole("button", { name: "Sign in to admin" }).click();
    await expect(page).toHaveURL(/\/admin\/orders/);
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  });

  test("staff see orders, filter them, see sync errors and can retry a stuck order", async ({ page }) => {
    // a customer order while the ERP is down
    const customer = await newCustomerContext(page);
    await customer.addEarbuds();
    await control({ orderOutage: true });
    const ref = await customer.place();

    // staff view
    await page.context().clearCookies();
    await register(page, "admin@example.test", "Store Admin");
    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
    const row = page.getByTestId("admin-order-row").filter({ hasText: ref });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Kasun Perera");
    await expect(row).toContainText("LKR 15,350");
    await expect(row).toContainText("COD: pending (not yet in ERP)");
    await expect(row).toContainText("Waiting for ERP");
    await expect(page.getByTestId("count-pending")).not.toHaveText("0"); // the database is shared across tests, so only check it is counted

    // filters: status and search
    await page.goto(`/admin/orders?status=pending&q=${ref}`);
    await expect(page.getByTestId("admin-order-row")).toHaveCount(1);
    await page.getByLabel("Status").selectOption("synced");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/status=synced/);
    await page.goto(`/admin/orders?status=synced&q=${ref}`);
    await expect(page.getByText("No orders match these filters.")).toBeVisible();
    await page.goto(`/admin/orders?q=${ref.slice(-6)}`);
    await expect(page.getByTestId("admin-order-row")).toHaveCount(1);
    await page.goto("/admin/orders?from=2999-01-01");
    await expect(page.getByText("No orders match these filters.")).toBeVisible();

    // detail page: customer, items, payment, sync status and the last error
    await page.goto(`/admin/orders/${ref}`);
    await expect(page.getByRole("heading", { name: ref })).toBeVisible();
    await expect(page.getByText("Source: Online Store")).toBeVisible();
    await expect(page.getByText("12 Galle Road, Colombo, Colombo")).toBeVisible();
    await expect(page.getByText("Pulse Wireless Earbuds × 1")).toBeVisible();
    await expect(page.getByTestId("last-error")).toContainText("ERP");
    await expect(page.getByText("Waiting for ERP").first()).toBeVisible();

    // retry while the ERP is still down: honest failure, no duplicate
    await page.getByRole("button", { name: "Retry sync to ERP" }).click();
    await expect(page.getByRole("status")).toContainText("Still not sent");
    expect((await control({})).orders).toBe(0);

    // ERP recovers: retry sends it exactly once, repeated retries are harmless
    await control({ orderOutage: false });
    await page.getByRole("button", { name: "Retry sync to ERP" }).click();
    await expect(page.getByText("In ERP").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry sync to ERP" })).toHaveCount(0);
    const state = await control({});
    expect(state.orders).toBe(1);
    expect(state.orderRefs).toEqual([ref]);
    await page.goto("/admin/orders");
    await expect(page.getByTestId("count-synced")).not.toHaveText("0");
    await expect(page.getByTestId("admin-order-row").filter({ hasText: ref })).toContainText("Placed");
  });

  test("an order the ERP rejects later is flagged 'Needs attention' with a readable reason, and is not retried automatically", async ({ page }) => {
    const customer = await newCustomerContext(page);
    await customer.addEarbuds();
    await control({ orderOutage: true });
    const ref = await customer.place();
    await control({ orderOutage: false, rejectOrders: Array.from({ length: 6 }, () => ({ status: 409, code: "INSUFFICIENT_STOCK" })) }); // generous: orders left by earlier tests may be due too
    await page.waitForTimeout(1800);
    expect((await (await runQueue()).json()).failed).toBeGreaterThanOrEqual(1);
    expect(await (await runQueue()).json()).toMatchObject({ due: 0 }); // FAILED orders wait for a person

    await page.context().clearCookies();
    await register(page, "admin@example.test", "Store Admin");
    await page.goto(`/admin/orders/${ref}`);
    await expect(page.getByText("Needs attention").first()).toBeVisible();
    await expect(page.getByTestId("last-error")).toContainText("Not enough stock when the order reached the ERP.");
    await control({ rejectOrders: [] });
    await page.getByRole("button", { name: "Retry sync to ERP" }).click(); // stock is fine again
    await expect(page.getByText("In ERP").first()).toBeVisible();
    expect((await control({})).orderRefs).toContain(ref);
  });
});

/** A throw-away customer in its own browser context, so staff and customer sessions never mix. */
async function newCustomerContext(adminPage: Page) {
  const browser = adminPage.context().browser()!;
  const v = await newVisitor(browser);
  return {
    addEarbuds: () => addEarbuds(v.page),
    place: async () => {
      const ref = await placeOrder(v.page);
      await v.ctx.close();
      return ref;
    },
  };
}
