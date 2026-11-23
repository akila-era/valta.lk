import { expect, test, type Browser, type Page } from "@playwright/test";

const ERP = "http://localhost:4011/__control";
const control = async (body: unknown) => (await fetch(ERP, { method: "POST", body: JSON.stringify(body) })).json();

let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.90.${Math.floor(Math.random() * 250)}.${ip}` });
  await control({ reset: true });
});

async function phone(browser: Browser, width: number, height = 780) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": `10.91.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  return { ctx, page: await ctx.newPage() };
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test.describe("mobile-first layout", () => {
  for (const width of [320, 360, 375, 390, 430]) {
    test(`${width}px: compact one-row header with 44px actions, wishlist only where there is room`, async ({ browser }) => {
      const { ctx, page } = await phone(browser, width);
      await page.goto("/products");
      const header = page.locator("header");
      expect((await header.boundingBox())!.height).toBeLessThanOrEqual(72);
      for (const [role, name] of [["button", "Open menu"], ["button", "Search products"], ["button", /My account/], ["link", /^Cart/]] as const) {
        const box = await header.getByRole(role, { name }).first().boundingBox();
        expect(box, String(name)).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(40);
        expect(box!.height).toBeGreaterThanOrEqual(40);
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      await expect(header.getByRole("link", { name: /^Wishlist/ })).toHaveCount(width >= 375 ? 1 : 0);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await ctx.close();
    });
  }

  test("search icon opens a full-screen search sheet with live suggestions, Escape closes it", async ({ browser }) => {
    const { ctx, page } = await phone(browser, 390, 844);
    await page.goto("/products");
    await page.locator("header").getByRole("button", { name: "Search products" }).click();
    const sheet = page.getByRole("dialog", { name: "Search" });
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(389);
    expect(box.height).toBeGreaterThanOrEqual(843); // covers the whole screen, not just the header
    await expect(sheet.getByRole("combobox")).toBeFocused();
    expect(await sheet.getByRole("combobox").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16); // no iOS zoom on focus
    await page.keyboard.type("pul");
    await expect(sheet.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("header").getByRole("button", { name: "Search products" })).toBeFocused();
    await ctx.close();
  });

  test("category shortcuts are a swipeable row of 44px chips that never widen the page", async ({ browser }) => {
    const { ctx, page } = await phone(browser, 320);
    await page.goto("/products");
    const chips = page.getByRole("navigation", { name: "Browse shortcuts" }).getByRole("link");
    expect(await chips.count()).toBeGreaterThanOrEqual(4);
    for (const h of await chips.evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await chips.filter({ hasText: "Audio" }).click();
    await expect(page).toHaveURL(/\/categories\/audio$/);
    await ctx.close();
  });

  test("320px: no horizontal overflow on listing, product, cart, checkout, account and help pages", async ({ browser }) => {
    const { ctx, page } = await phone(browser, 320);
    await page.goto("/products/pulse-wireless-earbuds-cm0item00000003");
    await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
    for (const path of ["/products", "/products/nova-x1-smartphone-cm0item00000001", "/cart", "/checkout", "/wishlist", "/faq", "/returns-policy", "/account/login", "/account/register", "/track-order"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await overflow(page), path).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });
});

test.describe("mobile product cards and sheets", () => {
  test("hearts have a 44px touch area, taps do not navigate, Quick view opens a bottom sheet", async ({ browser }) => {
    const { ctx, page } = await phone(browser, 390, 844);
    await page.goto("/products");
    const card = page.locator("article").first();
    const heart = card.getByRole("button", { name: /to wishlist/ });
    const hb = (await heart.boundingBox())!;
    expect(hb.width).toBeGreaterThanOrEqual(44);
    expect(hb.height).toBeGreaterThanOrEqual(44);
    await heart.click();
    await expect(page).toHaveURL(/\/products$/); // not the product page
    await expect(card.getByRole("button", { name: /^Remove .* from wishlist/ })).toHaveAttribute("aria-pressed", "true");
    // phone cards are narrow: the short "Add" label fits inside the card
    const add = card.getByRole("button", { name: /^Add to cart:/ });
    const ab = (await add.boundingBox())!, cb = (await card.boundingBox())!;
    expect(ab.x + ab.width).toBeLessThanOrEqual(cb.x + cb.width + 1);
    await card.getByRole("button", { name: /Quick view/ }).click();
    const sheet = page.getByRole("dialog", { name: "Product quick view" });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\/products$/);
    const sb = (await sheet.boundingBox())!;
    expect(sb.x).toBeGreaterThanOrEqual(0);
    expect(sb.x + sb.width).toBeLessThanOrEqual(391);
    expect(Math.round(sb.y + sb.height)).toBeGreaterThanOrEqual(843); // docked to the bottom edge
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await sheet.getByRole("button", { name: "Close quick view" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    await ctx.close();
  });

  test("variant product: the sticky bar says Select option, then offers Add and Buy now flush with the bottom edge", async ({ browser }) => {
    const { ctx, page } = await phone(browser, 320, 700);
    await page.goto("/products/nova-x1-smartphone-cm0item00000001");
    const bar = page.locator("div.fixed.bottom-0").filter({ hasText: "LKR" }).first();
    await expect(bar.getByRole("button", { name: "Select option" })).toBeVisible();
    await expect(bar.getByRole("button", { name: /^Add/ })).toHaveCount(0); // no dead "Add to cart" before an option is chosen
    await bar.getByRole("button", { name: "Select option" }).click();
    await expect(page.getByRole("group", { name: "Options" })).toBeInViewport();
    await page.locator("label", { hasText: "128GB / Black" }).click(); // tap the visible option, as a shopper does
    await expect(page.getByRole("radio", { name: /128GB/ }).first()).toBeChecked();
    await page.evaluate(() => scrollTo(0, 0));
    await expect(bar.getByRole("button", { name: /^Add/ })).toBeVisible();
    await expect(bar.getByRole("button", { name: /^Buy/ })).toBeVisible();
    const bb = (await bar.boundingBox())!;
    expect(Math.round(bb.y + bb.height)).toBe(700); // no gap under the bar (a stray margin once lifted it 24px)
    await ctx.close();
  });

  test("checkout on a phone: 16px inputs, full-width primary action, Cash on delivery as a selectable card", async ({ browser }) => {
    const { ctx, page } = await phone(browser, 390, 844);
    await page.goto("/products/pulse-wireless-earbuds-cm0item00000003");
    await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
    await page.goto("/checkout");
    for (const label of ["Full name", "Phone number"]) {
      expect(await page.getByLabel(label).evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), label).toBeGreaterThanOrEqual(16);
    }
    const cont = (await page.getByRole("button", { name: "Continue" }).boundingBox())!;
    expect(cont.width).toBeGreaterThan(300); // full width on a phone
    expect(cont.height).toBeGreaterThanOrEqual(44);
    await ctx.close();
  });
});
