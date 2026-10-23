import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Product content management: staff edit a DRAFT, preview it privately, publish it, and customers see only the published
 * copy. Name/SKU/price/stock stay owned by the ERP.
 */
const SITE = "http://localhost:3100";
const ERP = "http://localhost:4011/__control";
const ID = "cm0item00000007"; // Glide Tempered Glass, LKR 990, in the mock ERP
const SLUG = `glide-tempered-glass-${ID}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const control = (body: unknown) => fetch(ERP, { method: "POST", body: JSON.stringify(body) });

let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.50.${Math.floor(Math.random() * 250)}.${ip}` });
  await control({ reset: true });
});

async function signInAsAdmin(page: Page) {
  const body = { name: "Store Admin", email: "admin@example.test", phone: "0771234567", password: "secret123" };
  const reg = await page.request.post("/api/account/register", { data: body, headers: { Origin: SITE } });
  if (reg.status() !== 201) expect(reg.status()).toBe(409);
  expect((await page.request.post("/api/admin/login", { data: { email: body.email, password: body.password }, headers: { Origin: SITE } })).status()).toBe(200);
}

const visitor = (browser: Browser) => browser.newContext({ baseURL: SITE, extraHTTPHeaders: { "x-forwarded-for": `10.51.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });

async function currentVersion(page: Page): Promise<number> {
  await page.goto(`/admin/products/${ID}`);
  const text = await page.getByTestId("version").textContent().catch(() => null);
  const m = /Version (\d+)\./.exec(text ?? "");
  return m ? Number(m[1]) : 0;
}

const save = (page: Page, version: number, doc: unknown) => page.request.put(`/api/admin/products/${ID}/content`, { headers: { Origin: SITE }, data: { version, doc } });

test.describe("product content management", () => {
  test("edit a draft, preview it privately, publish it, and customers see exactly the published copy", async ({ page, browser }) => {
    await signInAsAdmin(page);
    await page.goto(`/admin/products/${ID}`);
    await expect(page.getByText("ERP Product Information")).toBeVisible();
    await expect(page.getByText(ID, { exact: true }).first()).toBeVisible();

    // Basics
    await page.getByLabel("Website display title").fill("Glide 9H Glass Protector");
    await page.getByLabel("Subtitle").fill("Edge-to-edge protection");
    await page.getByLabel("Short description").fill("Bubble-free fit for everyday use.");
    await page.getByLabel("New Arrival").check();

    // Images
    await page.getByRole("tab", { name: "Images" }).click();
    await page.locator("#img-file").setInputFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByTestId("image-list").getByRole("img")).toHaveCount(1);
    await page.getByPlaceholder("Alt text (describe the image)").fill("Glass protector on a phone");

    // Description (rich text)
    await page.getByRole("tab", { name: "Description" }).click();
    const rt = page.getByRole("textbox", { name: "Product description" });
    await rt.click();
    await page.getByRole("button", { name: "Heading", exact: true }).click();
    await page.keyboard.type("Why choose it");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Paragraph" }).click();
    await page.keyboard.type("Tough 9H surface.");

    // Features and specifications
    await page.getByRole("tab", { name: "Features" }).click();
    await page.getByRole("button", { name: "Add feature" }).click();
    await page.getByLabel("Feature 1 title").fill("9H hardness");
    await page.getByLabel("Feature 1 description").fill("Resists scratches from keys");
    await page.getByRole("tab", { name: "Specifications" }).click();
    await page.getByRole("button", { name: "Add specification" }).click();
    await page.getByLabel("Specification 1 group").fill("Dimensions");
    await page.getByLabel("Specification 1 name").fill("Thickness");
    await page.getByLabel("Specification 1 value").fill("0.33");
    await page.getByLabel("Specification 1 unit").fill("mm");

    // Delivery & warranty, SEO
    await page.getByRole("tab", { name: "Delivery & warranty" }).click();
    await page.getByLabel("Duration").fill("6 months");
    await page.getByLabel("Estimated delivery time").fill("2-4 working days");
    await page.getByRole("tab", { name: "SEO" }).click();
    await page.getByLabel("Meta description").fill("Tough tempered glass protector.");

    await expect(page.getByText("Unsaved edits")).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved. Customers will not see it until you publish.")).toBeVisible();
    await expect(page.getByText("Unsaved edits")).toHaveCount(0);

    // Customers see NOTHING yet
    const anon = await visitor(browser);
    const before = await anon.newPage();
    await before.goto(`/products/${SLUG}`);
    await expect(before.getByRole("heading", { level: 1 })).toHaveText("Glide Tempered Glass");
    await expect(before.getByText("Edge-to-edge protection")).toHaveCount(0);
    await expect(before.getByText("9H hardness")).toHaveCount(0);
    // ...and a visitor cannot use the preview link
    await before.goto(`/products/${SLUG}?preview=1`);
    await expect(before.getByText("Preview of unpublished changes")).toHaveCount(0);
    await expect(before.getByText("Edge-to-edge protection")).toHaveCount(0);

    // The admin's preview shows the draft in the real storefront page, with ERP price
    await page.goto(`/products/${SLUG}?preview=1`);
    await expect(page.getByText("Preview of unpublished changes")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Glide 9H Glass Protector");
    await expect(page.getByText("Edge-to-edge protection")).toBeVisible();
    await expect(page.getByText("LKR 990").first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    // Publish
    await page.goto(`/admin/products/${ID}`);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published. The product page now shows this content.")).toBeVisible();

    const after = await anon.newPage();
    await after.goto(`/products/${SLUG}`);
    await expect(after.getByRole("heading", { level: 1 })).toHaveText("Glide 9H Glass Protector");
    await expect(after.getByRole("list", { name: "Highlights" }).getByText("New Arrival")).toBeVisible();
    await expect(after.getByText("Edge-to-edge protection")).toBeVisible();
    await expect(after.getByText("Bubble-free fit for everyday use.")).toBeVisible();
    await expect(after.getByRole("heading", { name: "Why choose it" })).toBeVisible();
    await expect(after.getByText("Tough 9H surface.")).toBeVisible();
    await expect(after.getByText("9H hardness")).toBeVisible();
    await expect(after.getByText("Thickness")).toBeVisible();
    await expect(after.getByText("0.33 mm")).toBeVisible();
    await expect(after.getByText("6 months")).toBeVisible();
    await expect(after.getByText("2-4 working days")).toBeVisible();
    await expect(after.getByText("LKR 990").first()).toBeVisible();
    await expect(after.locator('img[alt="Glass protector on a phone"]').first()).toBeVisible();
    await expect(after.locator('meta[name="description"]')).toHaveAttribute("content", "Tough tempered glass protector.");
    await expect(after.locator('meta[name="robots"]')).toHaveCount(0);

    // The cart and order keep the ERP name, never the display title
    await after.getByRole("button", { name: /add to cart/i }).first().click();
    await after.goto("/cart");
    await expect(after.getByTestId("cart-line").getByText("Glide Tempered Glass", { exact: true })).toBeVisible();

    // Unpublish removes it again
    await page.goto(`/admin/products/${ID}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Unpublish" }).click();
    await expect(page.getByText("Unpublished. The product page shows the plain ERP details.")).toBeVisible();
    await after.goto(`/products/${SLUG}`);
    await expect(after.getByRole("heading", { level: 1 })).toHaveText("Glide Tempered Glass");
    await expect(after.getByText("Edge-to-edge protection")).toHaveCount(0);
    await anon.close();
  });

  test("the product list shows content and publication status and can filter by them", async ({ page }) => {
    await signInAsAdmin(page);
    expect((await save(page, await currentVersion(page), { shortDescription: "Listed" })).status()).toBe(200);
    await page.goto("/admin/products");
    await expect(page.getByRole("columnheader", { name: "ERP ID" })).toBeVisible();
    const search = page.getByLabel("Search products by name, SKU or brand");

    await search.fill(ID); // by ERP ID
    await page.getByLabel("Publication status").selectOption("draft");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/pub=draft/);
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(2); // header + the product found by its ERP ID
    await expect(page.getByRole("link", { name: "Edit content" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Preview" })).toBeVisible();

    await page.getByLabel("Publication status").selectOption("none");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("No products match.")).toBeVisible();
  });

  test("the API validates, refuses stale saves and strips unsafe HTML", async ({ page, browser }) => {
    await signInAsAdmin(page);
    const v = await currentVersion(page);

    const bad = await save(page, v, { features: [{ title: "", description: "x" }] });
    expect(bad.status()).toBe(422);
    expect(JSON.stringify(await bad.json())).toMatch(/feature/i);
    expect((await save(page, v, { related: [ID] })).status()).toBe(422);
    expect((await save(page, v, { gallery: [{ id: "doesnotexist12", alt: "", caption: "" }] })).status()).toBe(422);
    expect((await save(page, v, { badges: ["best-seller"] })).status()).toBe(422);

    const evil = '<h2 onclick="x()">Hi</h2><script>window.__pwned=1</script><a href="javascript:alert(1)">bad</a><p>ok</p>';
    const ok = await save(page, v, { descriptionHtml: evil, shortDescription: "Safe" });
    expect(ok.status()).toBe(200);
    const saved = (await ok.json()).draft.descriptionHtml as string;
    expect(saved).not.toMatch(/script|onclick|javascript:/i);
    expect(saved).toContain("<p>ok</p>");

    // a stale editor cannot overwrite the newer save
    const stale = await save(page, v, { shortDescription: "Stale" });
    expect(stale.status()).toBe(409);

    // publish, then check the storefront output is clean too
    const pub = await page.request.post(`/api/admin/products/${ID}/publish`, { headers: { Origin: SITE }, data: { action: "publish" } });
    expect(pub.status()).toBe(200);
    const anon = await visitor(browser);
    const p = await anon.newPage();
    await p.goto(`/products/${SLUG}`);
    expect(await p.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await p.locator(".rich script, .rich [onclick]").count()).toBe(0);
    await expect(p.getByText("Safe")).toBeVisible();
    // clean up so other tests see the plain ERP product
    await page.request.post(`/api/admin/products/${ID}/publish`, { headers: { Origin: SITE }, data: { action: "unpublish" } });
    await anon.close();
  });

  test("uploaded images are served publicly with safe headers; fake images, non-staff and bad origins are refused", async ({ page, browser }) => {
    await signInAsAdmin(page);
    const up = await page.request.post(`/api/admin/products/${ID}/images`, { headers: { Origin: SITE }, multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } } });
    expect(up.status()).toBe(201);
    const { url } = await up.json();
    const anon = await visitor(browser);
    const img = await anon.request.get(url);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toBe("image/png");
    expect(img.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await anon.request.get("/api/media/doesnotexist1234")).status()).toBe(404);

    const fake = await page.request.post(`/api/admin/products/${ID}/images`, { headers: { Origin: SITE }, multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") } } });
    expect(fake.status()).toBe(422);
    const png = { file: { name: "a.png", mimeType: "image/png", buffer: PNG } };
    expect((await anon.request.post(`/api/admin/products/${ID}/images`, { headers: { Origin: SITE }, multipart: png })).status()).toBe(401);
    expect((await page.request.post(`/api/admin/products/${ID}/images`, { headers: { Origin: "https://evil.example" }, multipart: png })).status()).toBe(403);
    expect((await page.request.post(`/api/admin/products/not-a-product/images`, { headers: { Origin: SITE }, multipart: png })).status()).toBe(404);

    // content and publish APIs are staff-only too
    expect((await anon.request.put(`/api/admin/products/${ID}/content`, { headers: { Origin: SITE }, data: { version: 0, doc: {} } })).status()).toBe(401);
    expect((await anon.request.post(`/api/admin/products/${ID}/publish`, { headers: { Origin: SITE }, data: { action: "publish" } })).status()).toBe(401);
    const shopper = await visitor(browser);
    await shopper.request.post("/api/account/register", { data: { name: "Shopper", email: `shopper${Date.now()}@example.com`, phone: "0771234567", password: "secret123" }, headers: { Origin: SITE } });
    expect((await shopper.request.put(`/api/admin/products/${ID}/content`, { headers: { Origin: SITE }, data: { version: 0, doc: {} } })).status()).toBe(403);
    expect((await shopper.request.get(`/api/admin/products/search?q=glide`)).status()).toBe(403);
    expect((await page.request.get(`/api/admin/products/search?q=glide`)).status()).toBe(200);
    await anon.close();
    await shopper.close();
  });

  test("related products chosen by staff replace the automatic ones, and only real products are accepted", async ({ page, browser }) => {
    await signInAsAdmin(page);
    const v = await currentVersion(page);
    const related = "cm0item00000001";
    expect((await save(page, v, { related: ["cm0item0000099x"] })).status()).toBe(200); // unknown ids are stored but never shown
    const r = await save(page, v + 1, { related: [related], shortDescription: "R" });
    expect(r.status()).toBe(200);
    await page.request.post(`/api/admin/products/${ID}/publish`, { headers: { Origin: SITE }, data: { action: "publish" } });
    const anon = await visitor(browser);
    const p = await anon.newPage();
    await p.goto(`/products/${SLUG}`);
    const section = p.locator("section[aria-labelledby=related]");
    await expect(section.getByText("Nova X1 Smartphone")).toBeVisible();
    await expect(section.getByText("Volt 20W Fast Charger")).toHaveCount(0);
    await page.request.post(`/api/admin/products/${ID}/publish`, { headers: { Origin: SITE }, data: { action: "unpublish" } });
    await anon.close();
  });
});
