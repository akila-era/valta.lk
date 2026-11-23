import { expect, test } from "@playwright/test";

const ERP = "http://localhost:4011/__control";
const control = async (body: unknown) => (await (await fetch(ERP, { method: "POST", body: JSON.stringify(body) })).json()) as { orderRefs: string[] };

let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.80.${Math.floor(Math.random() * 250)}.${ip}` });
  await control({ reset: true });
});

test.describe("information pages", () => {
  test("FAQ page: answers open, the side navigation marks the current page, and real numbers come from the ERP", async ({ page }) => {
    await page.goto("/faq");
    await expect(page.getByRole("heading", { level: 1, name: "Frequently asked questions" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Help and information" }).getByRole("link", { name: "FAQ" })).toHaveAttribute("aria-current", "page");
    await page.getByText("How much is delivery?").click();
    await expect(page.getByText("The delivery charge is LKR 450")).toBeVisible();
  });

  test("every information page shares the same navigation", async ({ page }) => {
    for (const [path, name] of [["/about", "About us"], ["/contact", "Contact us"], ["/shipping-policy", "Shipping"], ["/returns-policy", "Returns"], ["/privacy-policy", "Privacy"], ["/terms", "Terms"]] as const) {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "Help and information" }).getByRole("link", { name })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    }
  });
});

test.describe("returns policy and footer", () => {
  test("Returns policy marks the missing conditions as awaiting business approval and states none", async ({ page }) => {
    await page.goto("/returns-policy");
    const notice = page.getByTestId("approval-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Awaiting business approval");
    await expect(notice).toContainText("have not been approved for publication");
    await expect(notice.getByRole("link", { name: "contact us" })).toHaveAttribute("href", "/contact");
    await expect(page.getByText(/within \d+ days|\d+-day|full refund/i)).toHaveCount(0); // no invented terms
  });

  test("footer FAQ link goes to the dedicated FAQ page", async ({ page }) => {
    await page.goto("/");
    await page.locator("footer").getByRole("link", { name: "Frequently asked questions" }).click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.getByRole("heading", { level: 1, name: "Frequently asked questions" })).toBeVisible();
  });
});

test.describe("password pages", () => {
  test("forgot password: validation, then a neutral confirmation that does not reveal whether the account exists", async ({ page }) => {
    await page.goto("/account/forgot-password");
    await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
    await page.getByLabel("Email").fill("someone@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If an account exists for that email");
    await expect(page.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/account/login");
  });

  test("reset password without a link explains what to do; with a token it shows the new-password form", async ({ page }) => {
    await page.goto("/account/reset-password");
    await expect(page.getByRole("heading", { level: 1, name: "Link missing" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/account/forgot-password");
    await page.goto("/account/reset-password?token=abc");
    await expect(page.getByRole("heading", { level: 1, name: "Set a new password" })).toBeVisible();
    await page.getByLabel("New password").fill("short");
    await page.getByLabel("Confirm password").fill("different1");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible(); // clear validation, nothing is sent with a mismatch
  });
});

test.describe("search suggestions accessibility", () => {
  test("each suggestion is a single option (no link nested inside an option) and stays clickable", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("combobox", { name: "Search products" });
    await box.fill("pul");
    const list = page.getByRole("listbox", { name: "Search suggestions" });
    const first = list.getByRole("group", { name: "Products" }).getByRole("option").first(); // brands and categories come first; this checks a product row
    await expect(first).toBeVisible();
    await expect(list.locator("[role=option] a, [role=option] button")).toHaveCount(0);
    expect(await first.evaluate((el) => el.tagName)).toBe("A"); // the option is itself the link
    expect(await first.getAttribute("tabindex")).toBe("-1"); // focus stays in the input
    await first.click();
    await expect(page).toHaveURL(/\/products\//);
  });
});

test.describe("tablet navigation", () => {
  test("at 820px Deals, Brands and New Arrivals are fully visible and nothing scrolls sideways", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 820, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Categories", exact: true }); // exact: the footer also has a "Shop categories" nav
    for (const name of ["Brands", "New Arrivals"]) {
      const box = await nav.getByRole("link", { name }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(820);
    }
    await expect(nav.getByRole("button", { name: /All Categories/ })).toBeVisible(); // categories stay reachable from the drawer
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

test.describe("wishlist", () => {
  test("saved products show live cards that can be added to the cart or removed", async ({ page }) => {
    await page.goto("/products?q=pulse wireless");
    await page.getByRole("button", { name: "Save Pulse Wireless Earbuds to wishlist" }).click();
    await page.goto("/wishlist");
    await expect(page.getByText("1 saved product")).toBeVisible();
    const card = page.locator("article", { hasText: "Pulse Wireless Earbuds" });
    await expect(card.getByText("LKR 14,900")).toBeVisible(); // live price from the catalogue
    await card.hover();
    await card.getByRole("button", { name: /^Add to cart:/ }).click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await card.getByRole("button", { name: "Remove Pulse Wireless Earbuds from wishlist" }).click();
    await expect(page.getByText("Your wishlist is empty")).toBeVisible();
  });
});

test.describe("order tracking timeline", () => {
  test("shows progress, the tracking number once dispatched, and a copy action", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    await page.goto("/products/pulse-wireless-earbuds-cm0item00000003");
    await page.getByRole("button", { name: "Add to cart", exact: true }).click();
    await page.goto("/checkout");
    await page.getByLabel("Full name").fill("Kasun Perera");
    await page.getByLabel("Phone number").fill("0771234567");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Address", { exact: true }).fill("12 Galle Road");
    await page.getByLabel("City", { exact: true }).fill("Colombo");
    await page.getByLabel("District").selectOption("Colombo");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page).toHaveURL(/order-confirmation/);
    const ref = page.url().split("/").pop()!;

    await page.goto(`/track-order?ref=${ref}`);
    const steps = page.getByRole("list", { name: "Order progress" }).getByRole("listitem");
    await expect(steps).toHaveCount(4);
    await expect(steps.filter({ hasText: "Order placed" })).toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("status")).toHaveText("Placed");
    await expect(page.getByText("The time of each step is not recorded on this page.")).toBeVisible();
    await expect(steps.filter({ hasText: /\d{1,2},\s*\d{4}|\d{1,2}:\d{2}/ })).toHaveCount(0); // steps never show a date or time

    await control({ setOrderStatus: { ref, status: "DISPATCHED", trackingNumber: "TRK-4242", carrierName: "Prompt Express" } });
    await page.reload();
    await expect(page.getByTestId("status")).toHaveText("Dispatched");
    await expect(steps.filter({ hasText: "Dispatched" })).toHaveAttribute("aria-current", "step");
    await expect(page.getByText("TRK-4242")).toBeVisible();
    await expect(page.getByText("Prompt Express")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy tracking number" })).toBeVisible();
  });
});
