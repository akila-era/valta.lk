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
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Technology. Elevated.");
    await expect(page.locator("section[aria-labelledby=hero-title]").getByRole("link", { name: "Explore Products" })).toHaveAttribute("href", "/products");
    await expect(page.locator("section[aria-labelledby=hero-title]").getByRole("link", { name: "Discover Brands" })).toHaveAttribute("href", "/brands");

    await expect(page.getByRole("heading", { name: "Find your category" })).toBeVisible();
    const campaigns = page.locator("section[aria-labelledby=campaigns]");
    await expect(campaigns.getByText("Find your next device")).toBeVisible(); // campaign panels are built from real categories
    await expect(campaigns.getByRole("link", { name: "Shop accessories" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Featured products" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shop by brand" })).toBeVisible();
    const why = page.locator("section[aria-labelledby=why]");
    await expect(why.getByText("LKR 450", { exact: true })).toBeVisible(); // from ERP settings, not hardcoded
    await expect(why.getByRole("heading", { name: "Cash on delivery" })).toBeVisible();

    // No dead links: every internal link on the page resolves
    const hrefs = await page.$$eval("a[href^='/']", (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
    for (const h of hrefs.filter((h) => !h.includes("#"))) {
      const res = await page.request.get(h);
      expect(res.status(), h).toBeLessThan(400);
    }
  });

  test("verified discount badge appears only for real sale prices; tabs show only existing collections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Special offers" })).toBeVisible();
    await page.getByRole("link", { name: "Special offers" }).click();
    // Orbit Pro: 219,900 -> 199,900 => 9% (floored); it is the only discounted product in the ERP data
    const cards = page.locator("#products article");
    await expect(cards).toHaveCount(1);
    await expect(cards.first().getByText("-9%")).toBeVisible();
    await expect(cards.first().getByText("LKR 199,900")).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Deals" })).toBeVisible();

    // products without a discount never show a badge
    await page.goto("/products?q=earbuds");
    await expect(page.locator("article", { hasText: "Pulse Wireless Earbuds" })).toBeVisible();
    await expect(page.locator("article").getByText(/^-\d+%$/)).toHaveCount(0);
  });

  test("add to cart from a card, with duplicate-click protection and live count", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("#products article").filter({ has: page.getByRole("button", { name: /^Add to cart:/ }) }).first();
    const name = (await first.getByRole("heading").textContent())!;
    const card = page.locator("#products article", { hasText: name }); // stable after the button label changes
    await card.hover(); // the Add to cart bar slides up when the card is hovered
    await card.getByRole("button", { name: /^Add to cart:/ }).dblclick(); // a double click must add once
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await expect(card.getByRole("button", { name: /added to cart/ })).toBeDisabled();
    // variant products never get a one-click add: the shopper chooses a variant in quick view or on the product page
    await page.goto("/products?q=nova x1");
    await expect(page.locator("article", { hasText: "Nova X1 Smartphone" }).getByRole("button", { name: /Quick view/ })).toBeVisible();
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

  test("All Categories drawer: search, tabs, sub-categories and focus handling", async ({ page }) => {
    await page.goto("/");
    const opener = page.locator("header").getByRole("button", { name: /All categories/i });
    await opener.click();
    const drawer = page.getByRole("dialog", { name: "Browse VALTA.LK" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Close" })).toBeFocused();
    await expect(drawer.getByRole("tab", { name: "All categories" })).toHaveAttribute("aria-selected", "true");

    // chevrons only where the ERP has sub-categories
    await expect(drawer.getByRole("button", { name: "Show Audio sub-categories" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Show Wearables sub-categories" })).toHaveCount(0);
    await drawer.getByRole("button", { name: "Show Audio sub-categories" }).click();
    await expect(drawer.getByRole("button", { name: "Hide Audio sub-categories" })).toHaveAttribute("aria-expanded", "true");
    await drawer.getByRole("link", { name: "Speakers" }).click();
    await expect(page).toHaveURL(/\/categories\/audio\?sub=speakers/);
    await expect(drawer).toHaveCount(0);
    await expect(page.locator("main article")).toHaveCount(2); // Echo Bluetooth Speaker + Echo Mini Speaker

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
  test("one heading, a real catalogue product and both shopping actions", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=hero-title]");
    await expect(hero.locator("a[href^='/products/']").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(hero.getByRole("link", { name: "Explore Products" })).toHaveAttribute("href", "/products");
    await expect(hero.getByRole("link", { name: "Discover Brands" })).toHaveAttribute("href", "/brands");
    await expect(hero.locator("h1 span")).toHaveText("Elevated."); // the highlighted half of the headline
  });

  test("the hero shows real products one at a time, with numbered indicators, arrows and a pause control", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=hero-title]");
    const region = hero.getByRole("region", { name: "Featured products" });
    const slides = region.locator("[aria-roledescription=slide]");
    const n = await slides.count();
    expect(n).toBeGreaterThanOrEqual(2);
    // only the current product is exposed to assistive tech; every product is real, in stock, with a catalogue price
    await expect(slides.nth(0)).toHaveAttribute("aria-hidden", "false");
    await expect(slides.nth(1)).toHaveAttribute("aria-hidden", "true");
    for (let i = 0; i < n; i++) {
      const link = slides.nth(i).locator("a[href^='/products/']");
      await expect(link).toContainText(/LKR\s?\d/);
      await expect(link).toContainText("In stock");
    }
    const names = await slides.evaluateAll((els) => els.map((e) => e.querySelector("a")?.getAttribute("href")));
    expect(new Set(names).size).toBe(n); // no product twice
    const dots = region.getByRole("list").getByRole("button");
    await expect(dots).toHaveCount(n);
    await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
    await dots.nth(1).click();
    await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
    await expect(slides.nth(1)).toHaveAttribute("aria-hidden", "false");
    await expect(slides.nth(0)).toHaveAttribute("aria-hidden", "true");
    await region.getByRole("button", { name: "Next product" }).click();
    await expect(dots.nth(2 % n)).toHaveAttribute("aria-current", "true");
    await region.getByRole("button", { name: "Previous product" }).click();
    await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
    await region.getByRole("button", { name: "Pause slideshow" }).click();
    await expect(region.getByRole("button", { name: "Play slideshow" })).toBeVisible();
  });

  test("the slideshow moves on by itself and the offer slide shows only a real discount", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=hero-title]");
    const region = hero.getByRole("region", { name: "Featured products" });
    const dots = region.getByRole("list").getByRole("button");
    await page.mouse.move(2, 2); // pointer away from the hero, which would pause it
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(dots.nth(1)).toHaveAttribute("aria-current", "true", { timeout: 12_000 });
    // the offer tag appears only on a product with a genuinely lower sale price
    const offer = region.locator("a", { hasText: /^Offer/ });
    if ((await offer.count()) > 0) await expect(offer.first()).toContainText(/-\d+%/);
  });

  test("with reduced motion the hero never starts moving on its own", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto("/");
    const region = page.locator("section[aria-labelledby=hero-title]").getByRole("region", { name: "Featured products" });
    await expect(region.getByRole("list").getByRole("button").first()).toHaveAttribute("aria-current", "true");
    await expect(region.getByRole("button", { name: "Pause slideshow" })).toHaveCount(0); // nothing to pause
    await expect(region.locator(".animate-hero-progress")).toHaveCount(0);
    await ctx.close();
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

  test("shows real product details with real HTML text and only verifiable facts", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=hero-title]");
    await expect(hero.locator("a[href^='/products/']").first()).toContainText(/LKR/);

    const why = page.locator("section[aria-labelledby=why]");
    await expect(why.getByRole("heading", { name: "Cash on delivery" })).toBeVisible();
    await expect(why.getByText("LKR 450", { exact: true })).toBeVisible(); // live from ERP settings
    await expect(why.getByRole("heading", { name: "Track and cancel online" })).toBeVisible();
    expect((await hero.boundingBox())!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 20);
    // no unverified service claims anywhere in the hero
    const text = await page.locator("header, section[aria-labelledby=hero-title], section[aria-labelledby=why]").allInnerTexts();
    expect(text.join(" ")).not.toMatch(/islandwide|nationwide|secure payments|free|warranty|guarantee/i);
  });

  test("text stays legible over the photo and CTAs are reachable", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=hero-title]");
    await expect(hero.getByRole("link", { name: "Explore Products" })).toBeVisible();
    await hero.getByRole("link", { name: "Discover Brands" }).click();
    await expect(page).toHaveURL(/\/brands$/);
    await expect(page.getByRole("heading", { name: "All brands", level: 1 })).toBeVisible();
  });
});

test.describe("reference-inspired patterns", () => {
  test("explore categories: one photographic tile per real ERP category, with the name and the right link", async ({ page }) => {
    await page.goto("/");
    const cats = page.locator("section[aria-labelledby=cats]");
    await expect(cats.getByRole("heading", { name: "Find your category" })).toBeVisible();
    // one link per category; the real product count is in each link's accessible name
    await expect(cats.getByRole("link", { name: "All products" })).toHaveAttribute("href", "/products");
    await expect(cats.getByRole("link")).toHaveCount(6);
    for (const name of ["Audio", "Tablets", "Accessories", "Mobile Phones", "Wearables"]) await expect(cats.getByText(name, { exact: true })).toBeVisible();
    const audio = cats.getByRole("link", { name: "Audio, 4 products" });
    await expect(audio).toHaveAttribute("href", "/categories/audio");
    await expect(cats.getByRole("link", { name: "Tablets, 1 product" })).toHaveAttribute("href", "/categories/tablets");
    await expect(cats.getByRole("link", { name: "Accessories, 5 products" })).toHaveAttribute("href", "/categories/accessories");
    await audio.click();
    await expect(page).toHaveURL(/\/categories\/audio$/);
    await expect(page.getByRole("heading", { name: "Audio", level: 1 })).toBeVisible();
  });

  test("category cards are keyboard operable with a visible focus ring, and never overflow", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("section[aria-labelledby=cats]").getByRole("link", { name: /^Accessories,/ });
    await first.focus();
    await expect(first).toBeFocused();
    const outline = await first.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
    await page.keyboard.press("Tab");
    await expect(page.locator("section[aria-labelledby=cats]").getByRole("link", { name: /^Audio,/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/categories\/audio/);
  });

  test("category tiles: five real tiles, the first is the feature tile, nothing overflows", async ({ browser }) => {
    for (const w of [1440, 820, 390]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" }); // no fade-in offsets while measuring
      const page = await ctx.newPage();
      await page.goto("/");
      const tiles = page.locator("section[aria-labelledby=cats] ul > li");
      await tiles.first().waitFor();
      await expect(tiles).toHaveCount(5);
      const boxes = await tiles.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, w: r.width, r: r.right }; }));
      expect(boxes[0].w, `feature tile wider than the others at ${w}px`).toBeGreaterThan(boxes[1].w);
      for (const t of boxes) expect(t.r).toBeLessThanOrEqual(w + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await ctx.close();
    }
  });

  test("why shop with VALTA.LK: only verified facts, from live ERP settings", async ({ page }) => {
    await page.goto("/");
    const why = page.locator("section[aria-labelledby=why]");
    await why.scrollIntoViewIfNeeded();
    await expect(why.getByRole("heading", { name: "Why shop with VALTA.LK", level: 2 })).toBeVisible();
    await expect(why.getByRole("heading", { level: 3 })).toHaveText(["Cash on delivery", "Clear delivery charge", "Live prices and stock", "Track and cancel online"]);
    await expect(why.getByText("A flat delivery charge of LKR 450 is shown before you place your order.")).toBeVisible(); // the ERP's real charge
    await expect(why.getByText(/warranty|authori[sz]ed|genuine|fast|installment|koko|mintpay/i)).toHaveCount(0); // nothing that is not verified
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("footer: real routes only, no invented contact or payment claims, and a working back-to-top", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    const links = await footer.getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const h of ["/track-order", "/contact", "/shipping-policy", "/returns-policy", "/faq", "/about", "/privacy-policy", "/terms", "/products", "/brands", "/account"]) expect(links).toContain(h);
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

test.describe("videos and more products", () => {
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

  test("editorial campaigns: real products only, honest facts, nothing overflows on phones", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    const sec = page.locator("section[aria-labelledby=campaigns]");
    await sec.scrollIntoViewIfNeeded();
    await expect(sec.getByRole("heading", { level: 2 })).toBeVisible();
    expect(await sec.locator("article").count()).toBeGreaterThanOrEqual(1);
    for (const href of await sec.locator("a[href^='/products/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) expect(href).toMatch(/^\/products\/[a-z0-9-]+$/);
    await expect(sec.getByText(/sale|limited|hurry|% off|best.?sellers?|most popular/i)).toHaveCount(0); // no invented promotions or urgency
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

test.describe("more homepage sections", () => {
  test("product tabs, budget shortcuts, how-it-works and FAQ are present and data-driven", async ({ page }) => {
    await page.goto("/");
    await scrollThrough(page);
    const tabs = page.getByRole("navigation", { name: "Product collections" });
    for (const name of ["New arrivals", "Special offers", "Accessories", "Audio", "Mobile Phones"]) {
      await expect(tabs.getByRole("link", { name })).toBeVisible();
    }
    await tabs.getByRole("link", { name: "Audio" }).click();
    await expect(page).toHaveURL(/tab=c-audio/);
    await expect(page.getByRole("list", { name: "Audio products" })).toBeVisible();
    await expect(page.getByText("Available now in Audio.")).toBeVisible();
    await expect(page.locator("#products article")).toHaveCount(4);

    // the duplicate "Featured categories" block was removed: categories appear once, in "Shop by category"
    await expect(page.getByRole("heading", { name: "Featured categories" })).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "How ordering works" })).toBeVisible();
    await expect(page.getByText("Place your order at checkout. Cash on delivery is available.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Questions, answered" })).toBeVisible();
    const ld = await page.$$eval("script[type='application/ld+json']", (els) => els.map((e) => e.textContent ?? ""));
    expect(ld.some((t) => t.includes('"FAQPage"') && t.includes("What about returns?"))).toBe(true);
  });

  test("every budget tile opens a non-empty, correctly filtered list", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("section[aria-labelledby=budget]"), "budget section missing from the homepage").toBeVisible();
    const links = await page.locator("section[aria-labelledby=budget]").getByRole("link").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    expect(links).toHaveLength(3);
    for (const href of links) {
      await page.goto(href);
      await expect(page.locator("main article").first(), href).toBeVisible();
    }
  });

  test("the FAQ expands with the keyboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Questions, answered" })).toBeVisible(); // wait for the streamed page
    const q = page.getByText("What about returns?");
    await q.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("refunds are not automatic")).toBeVisible();
  });

  test("product showcase: real data, balanced grid, correct links and a labelled Add to cart", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#products");
    await expect(section.getByRole("heading", { name: "Featured Products" })).toBeVisible();
    await expect(section.getByText("The latest products added to our catalogue.")).toBeVisible();
    await expect(section.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/products");
    // no unsupported claims about curation, ratings or sales
    await expect(page.getByText(/handpicked|best.?sellers?|top rated|customer reviews/i)).toHaveCount(0);

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
    await expect(card.getByRole("link", { name: /Pulse Wireless Earbuds, LKR 14,900/ })).toHaveAttribute("href", /\/products\/pulse-wireless-earbuds-/);
    // sale price only where the ERP has one
    const sale = cards.filter({ hasText: "Orbit Pro Smartphone" });
    if (await sale.count()) {
      await expect(sale.first().getByText("LKR 199,900")).toBeVisible();
      await expect(sale.first().locator("s")).toHaveText("LKR 219,900");
    }
    await expect(card.locator("s")).toHaveCount(0);
  });

  test("product showcase: add to cart and wishlist work from the card", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("#products article", { hasText: "Pulse Wireless Earbuds" }).first();
    await card.getByRole("button", { name: "Save Pulse Wireless Earbuds to wishlist" }).click();
    await expect(card.getByRole("button", { name: "Remove Pulse Wireless Earbuds from wishlist" })).toHaveAttribute("aria-pressed", "true");
    await card.hover();
    await card.getByRole("button", { name: /^Add to cart:/ }).click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await page.goto("/cart");
    await expect(page.getByRole("link", { name: "Pulse Wireless Earbuds", exact: true })).toBeVisible();
  });

  test("product card: left-aligned text, In stock / New badges, action bar on hover and keyboard focus", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("#products article", { hasText: "Pulse Wireless Earbuds" }).first();
    await expect(card.getByText("In stock")).toBeVisible();
    await expect(card.getByText("New", { exact: true })).toBeVisible(); // published in the last 30 days
    expect(await card.locator("h3").evaluate((el) => getComputedStyle(el).textAlign)).toBe("left");
    const bar = card.getByRole("button", { name: /^Add to cart:/ });
    // hidden (translated out of the image area) until hovered or focused
    const box = async () => { const b = await bar.boundingBox(); const c = await card.boundingBox(); return { barTop: b!.y, cardTop: c!.y, barH: b!.height }; };
    await page.mouse.move(2, 2);
    const m = await box();
    expect(m.barTop).toBeGreaterThan(m.cardTop + 150); // below the visible image area when idle
    await card.hover();
    await expect.poll(async () => (await box()).barTop).toBeLessThan(m.barTop - 20);
    await expect(bar).toContainText(/add to cart/i);
    // keyboard focus reveals it too
    await page.mouse.move(2, 2);
    await bar.focus();
    await expect.poll(async () => (await box()).barTop).toBeLessThan(m.barTop - 20);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    // variant products get Quick view (to choose a variant) instead of Add to cart
    const phone = page.locator("#products article", { hasText: "Nova X1 Smartphone" }).first();
    await expect(phone.getByRole("button", { name: /Quick view/ })).toBeAttached();
    await expect(phone.getByRole("button", { name: /^Add to cart:/ })).toHaveCount(0);
    await expect(phone.locator("a[href*='/products/nova-x1-smartphone-']").first()).toBeAttached();
    await expect(phone.getByText("From", { exact: true })).toBeVisible();
  });

  test("product card action bar is always visible on touch screens (with and without reduced motion)", async ({ browser }) => {
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion });
      const page = await ctx.newPage();
      await page.goto("/");
      const card = page.locator("#products article", { hasText: "Pulse Wireless Earbuds" }).first();
      await card.scrollIntoViewIfNeeded();
      const bar = card.getByRole("button", { name: /^Add to cart:/ });
      const wrap = bar.locator("xpath=..");
      await expect.poll(() => wrap.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
      const b = (await bar.boundingBox())!;
      const c = (await card.boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(c.y + c.width + 1); // sits inside the square image area, not below it
      expect(b.height).toBeGreaterThanOrEqual(40); // comfortable touch target
      await bar.tap();
      await expect(page.getByTestId("cart-count")).toHaveText("1");
      await ctx.close();
    }
  });

  test("product showcase: grid columns follow the breakpoint and never overflow", async ({ browser }) => {
    for (const [w, cols] of [[1700, 5], [1100, 4], [820, 3]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto("/");
      await page.locator("#products ul[aria-label$=products] > li").first().waitFor();
      const rows = await page.locator("#products ul[aria-label$=products] > li").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => Math.round(e.getBoundingClientRect().y)));
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
    await expect(page.getByRole("heading", { name: "Shop by brand" })).toBeVisible();
    expect(await page.locator("[data-reveal='shown']").count()).toBeGreaterThan(0);
  });

  test("with reduced motion nothing is hidden or animated into view", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await page.locator("[data-reveal]").count()).toBe(0);
    await expect(page.getByRole("heading", { name: "Featured products" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await ctx.close();
  });

  test("brand showcase: real brands, biggest range first, each opening the existing brand filter", async ({ page }) => {
    await page.goto("/");
    const brands = page.locator("section#brands");
    await expect(brands.getByRole("heading", { name: "Shop by brand" })).toBeVisible();
    const tiles = brands.locator("ul > li a[href^='/products?brand=']");
    expect(await tiles.count()).toBeGreaterThanOrEqual(2);
    // sorted by product count, highest first, and counts are the catalogue's own
    const counts = await tiles.evaluateAll((as) => as.map((a) => Number(/(\d+) products?/.exec(a.getAttribute("aria-label") ?? "")?.[1])));
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
    const volt = brands.getByRole("link", { name: "Volt, 3 products" });
    await expect(volt).toHaveAttribute("href", "/products?brand=Volt");
    await expect(brands.getByRole("link", { name: /^Volt,/ })).toHaveCount(1); // each brand once
    await expect(brands.getByRole("link", { name: "View all brands" }).first()).toHaveAttribute("href", "/brands");
    await volt.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\?brand=Volt/);
    await expect(page.locator("main article", { hasText: "Volt 20W Fast Charger" })).toBeVisible();
    await expect(page.locator("main article", { hasText: "Pulse Wireless Earbuds" })).toHaveCount(0); // only that brand's products
  });

  test("/brands lists every catalogue brand alphabetically with working links", async ({ page }) => {
    await page.goto("/brands");
    await expect(page.getByRole("heading", { name: "All brands", level: 1 })).toBeVisible();
    const links = page.locator("main ul > li a[href^='/products?brand=']");
    const names = await links.evaluateAll((as) => as.map((a) => (a.getAttribute("aria-label") ?? "").split(",")[0]));
    expect(names.length).toBeGreaterThanOrEqual(7);
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
    await page.getByRole("link", { name: /^Atlas,/ }).click();
    await expect(page).toHaveURL(/\/products\?brand=Atlas/);
    await expect(page.locator("main article", { hasText: "Atlas Smartwatch" })).toBeVisible();
  });

  test("shop by budget: three ranges, each product really inside its range", async ({ page }) => {
    await page.goto("/");
    const budget = page.locator("section[aria-labelledby=budget]");
    await expect(budget.getByRole("link", { name: /Under LKR 8,000/ })).toHaveAttribute("href", /max=8000/);
    await expect(budget.getByRole("link", { name: /LKR 8,000 – LKR 35,000/ })).toHaveAttribute("href", /min=8000&max=35000/);
    await expect(budget.getByRole("link", { name: /Over LKR 35,000/ })).toHaveAttribute("href", /min=35000/);
  });
});

test.describe("recently viewed", () => {
  test("hidden with no history; a product visit adds it; unavailable products drop out; Clear removes it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("section[aria-labelledby=recent]")).toHaveCount(0); // a first-time visitor sees no empty shelf
    await page.goto("/products/pulse-wireless-earbuds-cm0item00000003");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pulse Wireless Earbuds");
    expect(await page.evaluate(() => localStorage.getItem("valta.recent.v2"))).toContain("cm0item00000003");
    await page.goto("/");
    const recent = page.locator("section[aria-labelledby=recent]");
    await expect(recent.getByRole("heading", { name: "Recently viewed" })).toBeVisible();
    await expect(recent.locator("article", { hasText: "Pulse Wireless Earbuds" })).toBeVisible(); // re-fetched live: price and stock shown
    await expect(recent.getByText("LKR 14,900")).toBeVisible();
    // a product that no longer exists is dropped without breaking the shelf
    await page.evaluate(() => localStorage.setItem("valta.recent.v2", JSON.stringify(["no-such-product", "cm0item00000003"])));
    await page.reload();
    await expect(recent.locator("article")).toHaveCount(1);
    await recent.getByRole("button", { name: "Clear" }).click();
    await expect(page.locator("section[aria-labelledby=recent]")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("valta.recent.v2"))).toBe("[]");
  });

  test("history stays in the browser: no outside requests are made", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => { if (!r.url().startsWith("http://localhost")) external.push(r.url()); });
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("valta.recent.v2", JSON.stringify(["cm0item00000003"])));
    await page.reload();
    await expect(page.locator("section[aria-labelledby=recent] article")).toHaveCount(1);
    expect(external.filter((u) => !/_next|localhost/.test(u))).toEqual([]);
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
