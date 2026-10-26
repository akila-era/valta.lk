import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ERP = "http://localhost:4011/__control";
const control = async (body: unknown) =>
  (await (await fetch(ERP, { method: "POST", body: JSON.stringify(body) })).json()) as { orders: number };

// The first render of a freshly started server loads the whole catalogue from the ERP; do that once before timing assertions.
test.beforeAll(async ({ request }) => {
  await request.get("/");
});

test.beforeEach(async () => {
  await control({ reset: true });
});

test.describe("homepage", () => {
  test("structure, data-driven sections and a single h1", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("VOLTA.LK");
    const hero = page.locator("section[aria-labelledby=home-title]");
    await expect(hero.getByRole("link", { name: "Shop now" }).first()).toHaveAttribute("href", "/products");

    await expect(page.getByRole("heading", { name: "Shop by Category" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hot Deals" })).toBeVisible(); // the ERP has a real sale price
    await expect(page.getByRole("heading", { name: "New Arrivals" })).toBeVisible();
    // staff promo cards only appear once staff create banners in the admin
    await expect(page.getByRole("region", { name: "Offers" })).toHaveCount(0);
    const bar = page.getByRole("region", { name: "Shopping with VOLTA.LK" });
    await expect(bar.getByText("Delivery LKR 450")).toBeVisible(); // from ERP settings, not hardcoded
    await expect(bar.getByText("Cash on Delivery", { exact: true })).toBeVisible();

    // No dead links: every internal link on the page resolves
    const hrefs = await page.$$eval("a[href^='/']", (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
    for (const h of hrefs.filter((h) => !h.includes("#"))) {
      const res = await page.request.get(h);
      expect(res.status(), h).toBeLessThan(400);
    }
  });

  test("verified discount badge appears only for real sale prices", async ({ page }) => {
    await page.goto("/");
    // Orbit Pro: 219,900 -> 199,900 => 9% (floored); it is the only discounted product in the ERP data
    const cards = page.locator("#deals article");
    await expect(cards).toHaveCount(1);
    await expect(cards.first().getByText("-9%")).toBeVisible();
    await expect(cards.first().getByText("LKR 199,900")).toBeVisible();
    await expect(page.locator("#deals").getByRole("link", { name: "View all" })).toHaveAttribute("href", "/products?sale=1");
    await expect(page.locator("header").getByRole("link", { name: "Deals" })).toBeVisible();

    // products without a discount never show a badge
    await page.goto("/products?q=earbuds");
    await expect(page.locator("article", { hasText: "Pulse Wireless Earbuds" })).toBeVisible();
    await expect(page.locator("article").getByText(/^-\d+%$/)).toHaveCount(0);
  });

  test("add to cart from a card, with duplicate-click protection and live count", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("#new-arrivals article").filter({ has: page.getByRole("button", { name: /^Add to cart:/ }) }).first();
    const name = (await first.getByRole("heading").textContent())!;
    const card = page.locator("#new-arrivals article", { hasText: name }); // stable after the button label changes
    await card.getByRole("button", { name: /^Add to cart:/ }).dblclick(); // a double click must add once
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await expect(card.getByRole("button", { name: /added to cart/ })).toBeDisabled();
    // variant products send the shopper to the product page instead of guessing a variant
    await page.goto("/products?q=nova x1");
    await expect(page.locator("article", { hasText: "Nova X1 Smartphone" }).getByRole("link", { name: "Choose options" })).toBeVisible();
    await expect(page.locator("article", { hasText: "Nova X1 Smartphone" }).getByRole("button", { name: /add to cart/i })).toHaveCount(0);
  });

  test("sold-out products cannot be added from a card", async ({ page }) => {
    await page.goto("/products?q=limited case");
    const card = page.locator("article", { hasText: "Limited Case" });
    await expect(card.getByText("Out of stock")).toBeVisible();
    await expect(card.getByRole("button", { name: /add to cart/i })).toHaveCount(0);
  });

  test("search suggestions come from real products and are keyboard operable", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("combobox", { name: "Search products" });
    await box.fill("earb");
    const list = page.getByRole("listbox", { name: "Search suggestions" });
    await expect(list.getByRole("option", { name: /Pulse Wireless Earbuds/ })).toBeVisible();
    await box.press("ArrowDown");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/products\/pulse-wireless-earbuds-cm0item00000003/);

    await page.goto("/");
    await box.fill("zzzzqq");
    await expect(list.getByText("No matching products")).toBeVisible();
    await box.press("Escape");
    await expect(list).toHaveCount(0);
    await box.fill("zzzzqq");
    await box.press("Enter"); // plain form submit still works when no suggestion is highlighted
    await expect(page).toHaveURL(/\/search\?q=zzzzqq/);
  });

  test("category navigation highlights the active category", async ({ page }) => {
    await page.goto("/categories/audio");
    const nav = page.locator("header").getByRole("navigation", { name: "Categories" });
    await expect(nav.getByRole("link", { name: "Audio" })).toHaveAttribute("aria-current", "page");
  });

  test("All Categories dropdown: categories, sub-categories on hover, Escape and outside click", async ({ page }) => {
    await page.goto("/");
    const opener = page.locator("header").getByRole("button", { name: /All categories/i });
    await opener.click();
    await expect(opener).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("region", { name: "All categories" });
    await expect(menu.getByRole("link", { name: "Hot Deals" })).toHaveAttribute("href", "/products?sale=1");
    await expect(menu.getByRole("link", { name: "Audio" })).toHaveAttribute("href", "/categories/audio");
    // sub-categories appear for the hovered category only where the ERP has them
    await menu.getByRole("link", { name: "Audio" }).hover();
    await menu.getByRole("link", { name: "Speakers" }).click();
    await expect(page).toHaveURL(/\/categories\/audio\?sub=speakers/);
    await expect(menu).toHaveCount(0);
    await expect(page.locator("main article")).toHaveCount(2); // Echo Bluetooth Speaker + Echo Mini Speaker

    // Escape closes and returns focus to the button
    await opener.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(opener).toBeFocused();

    // a click outside closes it
    await opener.click();
    await page.mouse.click(5, 600);
    await expect(menu).toHaveCount(0);
  });

  test("phone menu drawer: search, tabs, sub-categories and focus handling", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/");
    const opener = page.locator("header").getByRole("button", { name: "Open menu" });
    await opener.click();
    const drawer = page.getByRole("dialog", { name: "Browse VOLTA.LK" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Close menu" })).toBeFocused();
    await expect(drawer.getByRole("tab", { name: "All categories" })).toHaveAttribute("aria-selected", "true");
    await expect(drawer.getByText(/islandwide/i)).toHaveCount(0); // no unverified claims

    // chevrons only where the ERP has sub-categories
    await expect(drawer.getByRole("button", { name: "Show Audio sub-categories" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Show Wearables sub-categories" })).toHaveCount(0);
    await drawer.getByRole("button", { name: "Show Audio sub-categories" }).click();
    await expect(drawer.getByRole("button", { name: "Hide Audio sub-categories" })).toHaveAttribute("aria-expanded", "true");
    await drawer.getByRole("link", { name: "Speakers" }).click();
    await expect(page).toHaveURL(/\/categories\/audio\?sub=speakers/);
    await expect(drawer).toHaveCount(0);

    // Menu tab, Escape closes and returns focus to the opener
    await opener.click();
    await drawer.getByRole("tab", { name: "Menu" }).click();
    await expect(drawer.getByRole("link", { name: "Track order" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(opener).toBeFocused();

    // drawer search goes to the search page
    await opener.click();
    await drawer.getByRole("searchbox", { name: "Search for products" }).fill("power bank");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=power%20bank/);
    await expect(page.locator("main article", { hasText: "Volt Power Bank 10000" })).toBeVisible();
    await ctx.close();
  });

});

async function scrollThrough(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe("hero", () => {
  test("banner slides: a store-wide opener, then one slide per real category, changed with the dots", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=home-title]");
    const banner = hero.getByRole("region", { name: "Featured" });
    await expect(banner.getByRole("button", { name: "Go to slide 5" })).toBeVisible(); // opener + phones, audio, wearables, accessories
    await expect(banner.getByRole("link", { name: "Shop now" })).toHaveAttribute("href", "/products");
    await banner.getByRole("button", { name: "Go to slide 2" }).click();
    await expect(banner.getByRole("link", { name: "Shop mobile phones" })).toHaveAttribute("href", "/categories/mobile-phones");
    await expect(banner.getByRole("img", { name: /Smartphone and wireless earbuds/ })).toBeVisible();
    // only the visible slide can be reached
    await expect(banner.getByRole("link", { name: "Shop now" })).toHaveCount(0);
    // the side tiles are real categories with their product counts
    await expect(hero.getByRole("link", { name: "Accessories, 5 products" })).toHaveAttribute("href", "/categories/accessories");
  });

  test("wishlist: heart on a card saves the product and the wishlist page lists it", async ({ page }) => {
    await page.goto("/products?q=pulse wireless");
    await page.getByRole("button", { name: "Save Pulse Wireless Earbuds to wishlist" }).click();
    await expect(page.getByTestId("wishlist-count")).toHaveText("1");
    await expect(page.getByRole("button", { name: "Remove Pulse Wireless Earbuds from wishlist" })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/wishlist");
    await expect(page.getByRole("link", { name: "Pulse Wireless Earbuds" })).toBeVisible();
    await page.getByRole("button", { name: "Remove Pulse Wireless Earbuds from wishlist" }).click();
    await expect(page.getByText("Your wishlist is empty")).toBeVisible();
    await expect(page.getByTestId("wishlist-count")).toHaveCount(0); // the badge is hidden when the wishlist is empty
  });

  test("uses the supplied photographs with real HTML text and only verifiable facts", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=home-title]");
    const img = hero.getByRole("img", { name: /studio stand/i });
    await expect(img).toBeVisible();
    // the photo really loaded (not a broken image)
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

    const bar = page.getByRole("region", { name: "Shopping with VOLTA.LK" });
    await expect(bar.getByText("Cash on Delivery", { exact: true })).toBeVisible();
    await expect(bar.getByText("Delivery LKR 450")).toBeVisible(); // live from ERP settings
    await expect(bar.getByText("Track Your Order")).toBeVisible();
    // no unverified service claims anywhere in the header, hero or service strip
    const text = await page.locator("header, section[aria-labelledby=home-title], [aria-label=\"Shopping with VOLTA.LK\"]").allInnerTexts();
    expect(text.join(" ")).not.toMatch(/islandwide|nationwide|secure payments|free|warranty|guarantee|genuine/i);
  });

  test("the call to action is reachable and leads to the catalogue", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=home-title]");
    await hero.getByRole("link", { name: "Shop now" }).first().click();
    await expect(page).toHaveURL(/\/products$/);
  });
});

test.describe("storefront sections", () => {
  test("shop by category: one link per real ERP category, with the name, count and the right link", async ({ page }) => {
    await page.goto("/");
    const cats = page.locator("section[aria-labelledby=cats]");
    await expect(cats.getByRole("heading", { name: "Shop by Category" })).toBeVisible();
    await expect(cats.getByRole("link", { name: "View all products" })).toHaveAttribute("href", "/products");
    await expect(cats.getByRole("link")).toHaveCount(6); // five categories + View all
    for (const name of ["Audio", "Tablets", "Accessories", "Mobile Phones", "Wearables"]) await expect(cats.getByText(name, { exact: true })).toBeVisible();
    const audio = cats.getByRole("link", { name: "Audio, 4 products" });
    await expect(audio).toHaveAttribute("href", "/categories/audio");
    await expect(cats.getByRole("link", { name: "Tablets, 1 product" })).toHaveAttribute("href", "/categories/tablets");
    await audio.click();
    await expect(page).toHaveURL(/\/categories\/audio$/);
    await expect(page.getByRole("heading", { name: "Audio", level: 1 })).toBeVisible();
  });

  test("category cards are keyboard operable with a visible focus ring", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("section[aria-labelledby=cats]").getByRole("link", { name: /^Accessories,/ });
    await first.focus();
    await expect(first).toBeFocused();
    expect(await first.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Tab");
    await expect(page.locator("section[aria-labelledby=cats]").getByRole("link", { name: /^Audio,/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/categories\/audio/);
  });

  test("category grid is centred, items are evenly sized and nothing overflows", async ({ browser }) => {
    for (const w of [1440, 820, 390]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto("/");
      await page.locator("section[aria-labelledby=cats] ul > li").first().waitFor();
      const items = await page.locator("section[aria-labelledby=cats] ul > li").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
      expect(items.length).toBeGreaterThanOrEqual(4);
      for (const iw of items.slice(1)) expect(Math.abs(iw - items[0])).toBeLessThan(2); // uniform
      const first = await page.locator("section[aria-labelledby=cats] ul > li").first().boundingBox();
      const last = await page.locator("section[aria-labelledby=cats] ul > li").last().boundingBox();
      if (w >= 1024 && first && last) expect(Math.abs(first.x - (w - (last.x + last.width)))).toBeLessThan(w * 0.05); // one centred row
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await ctx.close();
    }
  });

  test("collections: one section per larger category, with its real products and a link to the category", async ({ page }) => {
    await page.goto("/");
    const audio = page.locator("#c-audio");
    await expect(audio.getByRole("heading", { name: "Audio", level: 2 })).toBeVisible();
    await expect(audio.getByText("Audio collection")).toBeVisible();
    await expect(audio.locator("article")).toHaveCount(4);
    await expect(audio.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/categories/audio");
    for (const id of ["#c-accessories", "#c-mobile-phones"]) await expect(page.locator(id)).toHaveCount(1);
    // no unsupported claims about curation, ratings or sales
    await expect(page.getByText(/handpicked|best.?sellers?|top rated|customer reviews/i)).toHaveCount(0);
  });

  test("featured brands: one tile per catalogue brand, searching for that brand", async ({ page }) => {
    await page.goto("/");
    const brands = page.locator("section[aria-labelledby=brands]");
    await expect(brands.getByRole("heading", { name: "Featured Brands" })).toBeVisible();
    await expect(brands.getByRole("link", { name: /^Pulse, \d+ products?$/ })).toHaveAttribute("href", "/search?q=Pulse");
  });

  test("footer: real routes only, no invented contact or payment claims, and a working back-to-top", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    const links = await footer.getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const h of ["/track-order", "/contact", "/shipping-policy", "/returns-policy", "/#faq", "/about", "/privacy-policy", "/terms", "/products"]) expect(links).toContain(h);
    expect(links.filter((h) => h && !h.startsWith("/") && !h.startsWith("tel:") && !h.startsWith("mailto:") && !h.startsWith("https://"))).toEqual([]);
    for (const heading of ["Shop", "Support", "Company", "Contact"]) await expect(footer.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
    await expect(footer.getByText("Delivery LKR 450")).toBeVisible(); // the ERP's real charge
    await expect(footer.getByText("Cash on delivery").first()).toBeVisible();
    await expect(footer.getByText(/visa|mastercard|amex|koko|mintpay|genuine|warranty|islandwide/i)).toHaveCount(0); // nothing unverified
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await footer.getByRole("button", { name: "Back to top" }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeLessThan(5);
  });

  test("New badge appears only on recently published products", async ({ page }) => {
    await page.goto("/products?q=pulse wireless");
    await expect(page.locator("article", { hasText: "Pulse Wireless Earbuds" }).getByText("New", { exact: true })).toBeVisible();
    await page.goto("/products?q=usb-c cable");
    await expect(page.locator("article", { hasText: "Volt USB-C Cable" })).toBeVisible();
    await expect(page.locator("article", { hasText: "Volt USB-C Cable" }).getByText("New", { exact: true })).toHaveCount(0);
  });
});

test.describe("videos", () => {
  test("videos: configured videos only; no YouTube request until play is pressed", async ({ page }) => {
    const youtube: string[] = [];
    page.on("request", (r) => /youtube|ytimg|googlevideo/.test(r.url()) && youtube.push(r.url()));
    await page.route(/youtube-nocookie\.com/, (route) => route.fulfill({ contentType: "text/html", body: "<html><body>player</body></html>" }));
    await page.goto("/");
    const sec = page.locator("section[aria-labelledby=videos]");
    await sec.scrollIntoViewIfNeeded();
    await expect(sec.getByRole("heading", { name: "Watch our videos" })).toBeVisible();
    await expect(sec.getByText("Test video one")).toBeVisible();
    await expect(sec.getByText("Test channel")).toBeVisible();
    await expect(sec.locator("iframe")).toHaveCount(0);
    expect(youtube).toEqual([]);

    await sec.getByRole("button", { name: "Play video: Test video one" }).click();
    const frame = sec.locator("iframe");
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/AAAAAAAAAAA\?autoplay=1/);
    await expect(frame).toHaveAttribute("title", "Test video one");
    await expect(sec.getByRole("button", { name: "Play video: Test video two" })).toBeVisible(); // the other stays a thumbnail
  });

});

test.describe("more homepage sections", () => {
  test("FAQ is present, data-driven and published as structured data", async ({ page }) => {
    await page.goto("/");
    await scrollThrough(page);
    await expect(page.getByRole("heading", { name: "Questions, answered" })).toBeVisible();
    const ld = await page.$$eval("script[type='application/ld+json']", (els) => els.map((e) => e.textContent ?? ""));
    expect(ld.some((t) => t.includes('"FAQPage"') && t.includes("What about returns?"))).toBe(true);
  });

  test("the FAQ expands with the keyboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Questions, answered" })).toBeVisible(); // wait for the streamed page
    const q = page.getByText("What about returns?");
    await q.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("refunds are not automatic")).toBeVisible();
  });

  test("new arrivals: real data, balanced grid, correct links and a labelled Add to cart", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#new-arrivals");
    await expect(section.getByRole("heading", { name: "New Arrivals" })).toBeVisible();
    await expect(section.getByText("The latest products added to our catalogue.")).toBeVisible();
    await expect(section.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/products");

    const cards = section.locator("article");
    expect(await cards.count()).toBeGreaterThanOrEqual(8);
    // every card has the same width: a regular grid, not a ragged strip
    const widths = await cards.evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(new Set(widths).size).toBe(1);

    const card = cards.filter({ hasText: "Pulse Wireless Earbuds" }).first();
    await expect(card.getByText("Pulse", { exact: true })).toBeVisible(); // brand (shown uppercase by CSS)
    await expect(card.getByText("LKR 14,900")).toBeVisible();
    await expect(card.getByRole("button", { name: "Add to cart: Pulse Wireless Earbuds" })).toBeVisible();
    // the card title links to the real product page
    await expect(card.getByRole("link", { name: "Pulse Wireless Earbuds", exact: true })).toHaveAttribute("href", /\/products\/pulse-wireless-earbuds-/);
    // sale price only where the ERP has one
    const sale = cards.filter({ hasText: "Orbit Pro Smartphone" });
    if (await sale.count()) {
      await expect(sale.first().getByText("LKR 199,900")).toBeVisible();
      await expect(sale.first().locator("s")).toHaveText("LKR 219,900");
    }
    await expect(card.locator("s")).toHaveCount(0);
  });

  test("product card: add to cart and wishlist work from the card", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("#new-arrivals article", { hasText: "Pulse Wireless Earbuds" }).first();
    await card.getByRole("button", { name: "Save Pulse Wireless Earbuds to wishlist" }).click();
    await expect(card.getByRole("button", { name: "Remove Pulse Wireless Earbuds from wishlist" })).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("button", { name: /^Add to cart:/ }).click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await page.goto("/cart");
    await expect(page.getByRole("link", { name: "Pulse Wireless Earbuds", exact: true })).toBeVisible();
  });

  test("product card: left-aligned title, real price and an always-visible Add to cart", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("#new-arrivals article", { hasText: "Pulse Wireless Earbuds" }).first();
    expect(["left", "start"]).toContain(await card.locator("h3").evaluate((el) => getComputedStyle(el).textAlign)); // start = left in LTR
    await expect(card.getByText("LKR 14,900")).toBeVisible();
    const button = card.getByRole("button", { name: /^Add to cart:/ });
    await page.mouse.move(2, 2);
    await expect(button).toBeVisible(); // no hover needed
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    // variant products get "Choose options" instead of Add to cart
    const phone = page.locator("#new-arrivals article", { hasText: "Nova X1 Smartphone" }).first();
    await expect(phone.getByRole("link", { name: "Choose options" })).toHaveAttribute("href", /\/products\/nova-x1-smartphone-/);
    await expect(phone.getByText("From", { exact: true })).toBeVisible();
  });

  test("product card Add to cart works by tap on touch screens", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto("/");
    const card = page.locator("#new-arrivals article", { hasText: "Pulse Wireless Earbuds" }).first();
    await card.scrollIntoViewIfNeeded();
    const button = card.getByRole("button", { name: /^Add to cart:/ });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    await button.tap();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await ctx.close();
  });

  test("product sections: grid columns follow the breakpoint and never overflow", async ({ browser }) => {
    for (const [w, cols] of [[1700, 5], [1300, 5], [1100, 4], [820, 3], [390, 2]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto("/");
      await page.locator("#new-arrivals ul[aria-label$=products] > li").first().waitFor();
      const rows = await page.locator("#new-arrivals ul[aria-label$=products] > li").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => Math.round(e.getBoundingClientRect().y)));
      const firstRow = rows.filter((y) => Math.abs(y - rows[0]) < 3).length;
      expect(firstRow, `columns at ${w}px`).toBe(cols);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await ctx.close();
    }
  });
});

test.describe("motion", () => {
  test("scroll reveals show every section once scrolled into view", async ({ page }) => {
    await page.goto("/");
    await scrollThrough(page);
    const hidden = await page.$$eval("[data-reveal='hidden']", (els) => els.length);
    expect(hidden).toBe(0);
    await expect(page.getByRole("heading", { name: "New Arrivals" })).toBeVisible();
    expect(await page.locator("[data-reveal='shown']").count()).toBeGreaterThan(0);
  });

  test("with reduced motion nothing is hidden or animated into view", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await page.locator("[data-reveal]").count()).toBe(0);
    await expect(page.getByRole("heading", { name: "New Arrivals" })).toBeVisible();
    await ctx.close();
  });

});

const WIDTHS = [1440, 1280, 768, 390, 360];
for (const width of WIDTHS) {
  test(`layout at ${width}px: no horizontal overflow, no console errors`, async ({ browser }, info) => {
    const ctx = await browser.newContext({ viewport: { width, height: width >= 1024 ? 900 : 800 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    const failed: string[] = [];
    page.on("response", (r) => r.status() >= 400 && !r.url().includes("favicon") && failed.push(`${r.status()} ${r.url()}`));

    for (const route of ["/", "/products", "/categories/audio"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      if (route === "/") await scrollThrough(page);
      if (route === "/" && process.env.VISUAL_OUT) {
        fs.mkdirSync(process.env.VISUAL_OUT, { recursive: true });
        await page.screenshot({ path: path.join(process.env.VISUAL_OUT, `home-${width}.png`), fullPage: true });
      }
    }
    expect(errors, errors.join("\n")).toEqual([]);
    expect(failed, failed.join("\n")).toEqual([]);
    void info;
    await ctx.close();
  });
}
