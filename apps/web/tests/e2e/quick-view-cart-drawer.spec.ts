import { expect, test } from "@playwright/test";

const ERP = "http://localhost:4011/__control";
const control = async (body: unknown) => (await fetch(ERP, { method: "POST", body: JSON.stringify(body) })).json();

let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.70.${Math.floor(Math.random() * 250)}.${ip}` });
  await control({ reset: true });
});

test.describe("quick view and cart drawer", () => {
  test("quick view adds a single product and opens the cart drawer with correct totals", async ({ page }) => {
    await page.goto("/products?q=pulse wireless");
    const card = page.locator("article", { hasText: "Pulse Wireless Earbuds" }).first();
    await card.getByRole("button", { name: /Quick view/ }).click({ force: true });
    const qv = page.getByRole("dialog", { name: "Product quick view" });
    await expect(qv.getByRole("heading", { name: "Pulse Wireless Earbuds" })).toBeVisible();
    await expect(qv.getByRole("link", { name: /full product details/i })).toHaveAttribute("href", /\/products\/pulse-wireless-earbuds-/);
    await qv.getByRole("button", { name: "Increase quantity" }).click();
    await qv.getByRole("button", { name: "Add to cart", exact: true }).click();

    const drawer = page.getByRole("dialog", { name: "Shopping cart" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("drawer-line")).toHaveCount(1);
    await expect(drawer.getByTestId("drawer-subtotal")).toHaveText("LKR 29,800");
    await expect(page.getByTestId("cart-count")).toHaveText("2");
    // the cart page agrees with the drawer: same single source of cart state
    await drawer.getByRole("link", { name: "View cart" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId("subtotal")).toHaveText("LKR 29,800");
  });

  test("variant products require an option before they can be added", async ({ page }) => {
    await page.goto("/products?q=nova x1");
    await page.locator("article", { hasText: "Nova X1 Smartphone" }).first().getByRole("button", { name: /Quick view/ }).click({ force: true });
    const qv = page.getByRole("dialog", { name: "Product quick view" });
    await expect(qv.getByText("Select an option to continue")).toBeVisible();
    await expect(qv.getByRole("button", { name: "Add to cart", exact: true })).toBeDisabled();
    await qv.getByRole("radio").first().check({ force: true });
    await expect(qv.getByRole("button", { name: "Add to cart", exact: true })).toBeEnabled();
  });

  test("Escape closes the dialog, and the header cart link opens the drawer, edits quantity and removes", async ({ page }) => {
    await page.goto("/products?q=pulse wireless");
    await page.locator("article", { hasText: "Pulse Wireless Earbuds" }).first().getByRole("button", { name: /Quick view/ }).click({ force: true });
    // The modal loads on first use. Wait until it is ready (focus has moved into it, which is when Escape handling is attached), as a person would.
    const modal = page.getByRole("dialog", { name: "Product quick view" });
    await expect(modal.getByRole("button", { name: "Close quick view" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/products/pulse-wireless-earbuds-cm0item00000003");
    await page.getByRole("button", { name: "Add to cart", exact: true }).click();
    await page.getByRole("link", { name: /^Cart/ }).click();
    const drawer = page.getByRole("dialog", { name: "Shopping cart" });
    await expect(drawer).toBeVisible();
    await expect(page).toHaveURL(/\/products\//); // opened as a drawer, no navigation
    await drawer.getByRole("button", { name: /Increase quantity of Pulse/ }).click();
    await expect(drawer.getByTestId("drawer-subtotal")).toHaveText("LKR 29,800");
    await drawer.getByRole("button", { name: /Remove Pulse/ }).click();
    await expect(drawer.getByText("Your cart is empty")).toBeVisible();
    await drawer.getByRole("button", { name: "Close cart" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("an item that sells out is flagged in the drawer and checkout is blocked", async ({ page }) => {
    await page.goto("/products/pulse-wireless-earbuds-cm0item00000003");
    await page.getByRole("button", { name: "Add to cart", exact: true }).click();
    await control({ setStock: { id: "cm0item00000003", stock: 0 } });
    await page.getByRole("link", { name: /^Cart/ }).click();
    const drawer = page.getByRole("dialog", { name: "Shopping cart" });
    await expect(drawer.getByText(/Out of stock|available/)).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Checkout" })).toHaveAttribute("aria-disabled", "true");
  });
});
