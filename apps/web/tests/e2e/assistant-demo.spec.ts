import { expect, test } from "@playwright/test";

/**
 * The local assistant demo (mock data only, no Agent connection). Runs in a real browser: confirms that a cart proposal changes
 * nothing until Confirm is pressed, that Cancel leaves the demo cart unchanged, and that the real storefront cart is never touched.
 */
test.describe("assistant demo (local, mock data)", () => {
  test("labels itself as demo and shows search, details, stock, accessories and a 4-product comparison", async ({ page }) => {
    await page.goto("/assistant-demo");
    const demo = page.getByTestId("assistant-demo");
    await expect(page.getByRole("note")).toContainText("not");
    await expect(page.getByRole("note")).toContainText("Local demo");

    await page.getByLabel("Category").selectOption("Mobile Phones");
    await demo.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByTestId("product-card").first()).toBeVisible();
    await expect(page.getByText("Demo data").first()).toBeVisible();

    await demo.getByLabel(/^Product/).selectOption({ label: "Zen Book 14 Laptop" });
    await page.getByRole("button", { name: "Details" }).click();
    await expect(page.getByText("Rs. 289,900.00").first()).toBeVisible();
    await page.getByRole("button", { name: "Stock" }).click();
    await expect(page.getByTestId("stock-card").first()).toContainText("In stock (demo)");
    await page.getByRole("button", { name: "Fits" }).click();
    await expect(page.getByTestId("accessory-card")).toHaveCount(3);

    for (const name of ["Atlas Smartwatch", "Orbit Tablet 11 Plus"]) await page.getByRole("checkbox", { name }).check();
    await page.getByRole("checkbox", { name: "Zen Book 14 Laptop" }).check();
    await page.getByRole("button", { name: "Compare 5" }).click();
    await expect(page.getByTestId("assistant-error")).toBeVisible(); // 5 products is refused
    await page.getByRole("checkbox", { name: "Orbit Pro Smartphone" }).uncheck();
    await page.getByRole("button", { name: "Compare 4" }).click();
    const table = page.getByTestId("comparison-card").first();
    await expect(table.getByRole("columnheader")).toHaveCount(4);
    await expect(table.getByText("Not available").first()).toBeVisible();
  });

  test("a cart proposal waits for Confirm; Cancel changes nothing; the real cart is untouched", async ({ page }) => {
    await page.goto("/assistant-demo");
    const demoCart = page.getByTestId("demo-cart");
    await expect(demoCart).toContainText("Empty");

    await page.getByLabel(/Quantity/).fill("2");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const confirm = page.getByTestId("cart-confirm");
    await expect(confirm).toContainText("Nothing changes in your cart until you confirm.");
    await expect(demoCart).toContainText("Empty"); // proposed, not applied

    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("demo-notice")).toHaveText("Cancelled. Your cart was not changed.");
    await expect(demoCart).toContainText("Empty");

    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByTestId("cart-confirm").getByRole("button", { name: "Confirm" }).click();
    await expect(demoCart).toContainText("Nova X1 Smartphone × 2");
    await expect(demoCart).toContainText("Rs. 259,800.00");

    const realCart = await page.evaluate(() => window.localStorage.getItem("valta.cart.v1"));
    expect(realCart).toBeNull();
  });

  test("refuses an invalid quantity", async ({ page }) => {
    await page.goto("/assistant-demo");
    await page.getByLabel(/Quantity/).fill("11");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByTestId("cart-confirm")).toHaveCount(0);
    await expect(page.getByTestId("assistant-error")).toBeVisible();
  });
});
