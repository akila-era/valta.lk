import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * End-to-end QA of the product content editor, driven through the real UI wherever a person would use it:
 * every tab, save/reload persistence, draft/preview/publish/unpublish/discard, stale edits, images, rich text,
 * ERP ownership and invalid references.
 */
const SITE = "http://localhost:3100";
const ERP = "http://localhost:4011/__control";
const ID = "cm0item00000007"; // Glide Tempered Glass, LKR 990
const SLUG = `glide-tempered-glass-${ID}`;
const O = { Origin: SITE };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");
const control = (body: unknown) => fetch(ERP, { method: "POST", body: JSON.stringify(body) });

let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.60.${Math.floor(Math.random() * 250)}.${ip}` });
  await control({ reset: true });
});

async function signInAsAdmin(page: Page) {
  const body = { name: "Store Admin", email: "admin@example.test", phone: "0771234567", password: "secret123" };
  const reg = await page.request.post("/api/account/register", { data: body, headers: O });
  if (reg.status() !== 201) expect(reg.status()).toBe(409);
  expect((await page.request.post("/api/admin/login", { data: { email: body.email, password: body.password }, headers: O })).status()).toBe(200);
}

const visitor = (browser: Browser) => browser.newContext({ baseURL: SITE, extraHTTPHeaders: { "x-forwarded-for": `10.61.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });

async function version(page: Page): Promise<number> {
  await page.goto(`/admin/products/${ID}`);
  return Number(((await page.getByTestId("version").textContent()) ?? "").match(/\d+/)?.[0] ?? 0);
}
const save = (page: Page, v: number, doc: unknown) => page.request.put(`/api/admin/products/${ID}/content`, { headers: O, data: { version: v, doc } });
const publishAction = (page: Page, action: string, id = ID) => page.request.post(`/api/admin/products/${id}/publish`, { headers: O, data: { action } });

/** Back to "no website content": unpublished and an empty draft. */
async function resetContent(page: Page) {
  await publishAction(page, "unpublish");
  expect((await save(page, await version(page), {})).status()).toBe(200);
}

test.describe("editor: every tab, save and reload", () => {
  test("all eight tabs accept input, save as a draft, and every value is still there after a reload", async ({ page }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    await page.goto(`/admin/products/${ID}`);
    const tabs = ["Basics", "Images", "Description", "Features", "Specifications", "Delivery & warranty", "SEO", "Related"];
    for (const t of tabs) {
      await page.getByRole("tab", { name: t }).click();
      await expect(page.getByRole("tab", { name: t })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toBeVisible();
    }

    // Basics
    await page.getByRole("tab", { name: "Basics" }).click();
    await page.getByLabel("Website display title").fill("Glide Pro Glass");
    await page.getByLabel("Subtitle").fill("9H protection");
    await page.getByLabel("Short description").fill("Bubble-free fit.");
    await page.getByLabel("Featured").check();
    await page.getByLabel("Promotional label").fill("Launch week");

    // Images: JPEG + PNG + WebP together, then main/order/alt/caption/remove
    await page.getByRole("tab", { name: "Images" }).click();
    await page.locator("#img-file").setInputFiles([
      { name: "one.jpg", mimeType: "image/jpeg", buffer: JPEG },
      { name: "two.png", mimeType: "image/png", buffer: PNG },
      { name: "three.webp", mimeType: "image/webp", buffer: WEBP },
    ]);
    const list = page.getByTestId("image-list");
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await page.getByLabel("Alt text for image 1").fill("JPEG front");
    await page.getByLabel("Alt text for image 2").fill("PNG side");
    await page.getByLabel("Caption for image 2").fill("Side caption");
    await page.getByLabel("Alt text for image 3").fill("WebP back");
    await list.getByRole("listitem").nth(1).getByRole("button", { name: "Make main" }).click(); // PNG becomes the main image
    await expect(list.getByRole("listitem").first().getByLabel("Alt text for image 1")).toHaveValue("PNG side");
    await page.getByRole("button", { name: "Move image 2 later" }).click(); // JPEG <-> WebP
    await expect(page.getByLabel("Alt text for image 3")).toHaveValue("JPEG front");

    // Description (rich text through the toolbar)
    await page.getByRole("tab", { name: "Description" }).click();
    const rt = page.getByRole("textbox", { name: "Product description" });
    await rt.click();
    await page.getByRole("button", { name: "Heading", exact: true }).click();
    await page.keyboard.type("Why it wins");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Paragraph" }).click();
    await page.getByRole("button", { name: "Bold" }).click();
    await page.keyboard.type("Strong");
    await page.getByRole("button", { name: "Bold" }).click();
    await page.keyboard.type(" and ");
    await page.getByRole("button", { name: "Italic" }).click();
    await page.keyboard.type("soft");
    await page.getByRole("button", { name: "Italic" }).click();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Bulleted list" }).click();
    await page.keyboard.type("First point");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second point");

    // Features (add two, reorder, icon)
    await page.getByRole("tab", { name: "Features" }).click();
    await page.getByRole("button", { name: "Add feature" }).click();
    await page.getByLabel("Feature 1 title").fill("Second on page");
    await page.getByRole("button", { name: "Add feature" }).click();
    await page.getByLabel("Feature 2 title").fill("First on page");
    await page.getByLabel("Feature 2 description").fill("Why it matters");
    await page.getByLabel("Feature 2 icon").selectOption("shield");
    await page.getByRole("button", { name: "Move feature 2 up" }).click();
    await expect(page.getByLabel("Feature 1 title")).toHaveValue("First on page");

    // Specifications (grouped)
    await page.getByRole("tab", { name: "Specifications" }).click();
    await page.getByRole("button", { name: "Add specification" }).click();
    await page.getByLabel("Specification 1 group").fill("Dimensions");
    await page.getByLabel("Specification 1 name").fill("Thickness");
    await page.getByLabel("Specification 1 value").fill("0.33");
    await page.getByLabel("Specification 1 unit").fill("mm");
    await page.getByRole("button", { name: "Add specification" }).click();
    await page.getByLabel("Specification 2 name").fill("Hardness");
    await page.getByLabel("Specification 2 value").fill("9H");

    // Delivery & warranty
    await page.getByRole("tab", { name: "Delivery & warranty" }).click();
    await page.getByLabel("Duration").fill("6 months");
    await page.getByLabel("Warranty provider").fill("Glide Lanka");
    await page.getByLabel("Description", { exact: true }).fill("Covers peeling");
    await page.getByLabel("Terms").fill("Keep your receipt.");
    await page.getByLabel("Additional notes").fill("Not for cracks");
    await page.getByLabel("Estimated delivery time").fill("2-4 working days");
    await page.getByLabel("Delivery notes").fill("Colombo same day");
    await page.getByLabel("Store pickup instructions").fill("Collect at Colombo 03");

    // SEO
    await page.getByRole("tab", { name: "SEO" }).click();
    await page.getByLabel("SEO title").fill("Glide Pro Glass Protector");
    await page.getByLabel("Meta description").fill("Tough tempered glass.");
    await page.getByLabel("Social sharing image").selectOption({ index: 1 });
    await page.getByLabel("Hide from search engines").check();

    // Related
    await page.getByRole("tab", { name: "Related" }).click();
    await page.getByLabel("Add a product").fill("nova");
    await page.getByRole("button", { name: /Nova X1 Smartphone/ }).click();
    await expect(page.getByText("Nova X1 Smartphone")).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved. Customers will not see it until you publish.")).toBeVisible();

    // --- reload: everything persisted ---
    await page.reload();
    await expect(page.locator("#admin-main").getByText("Draft", { exact: true }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Basics" }).click();
    await expect(page.getByLabel("Website display title")).toHaveValue("Glide Pro Glass");
    await expect(page.getByLabel("Subtitle")).toHaveValue("9H protection");
    await expect(page.getByLabel("Short description")).toHaveValue("Bubble-free fit.");
    await expect(page.getByLabel("Featured")).toBeChecked();
    await expect(page.getByLabel("New Arrival")).not.toBeChecked();
    await expect(page.getByLabel("Promotional label")).toHaveValue("Launch week");

    await page.getByRole("tab", { name: "Images" }).click();
    await expect(page.getByTestId("image-list").getByRole("listitem")).toHaveCount(3);
    await expect(page.getByLabel("Alt text for image 1")).toHaveValue("PNG side");
    await expect(page.getByLabel("Caption for image 1")).toHaveValue("Side caption");
    await expect(page.getByLabel("Alt text for image 2")).toHaveValue("WebP back");
    await expect(page.getByLabel("Alt text for image 3")).toHaveValue("JPEG front");
    for (const img of await page.getByTestId("image-list").getByRole("img").all()) {
      expect(await img.evaluate((el: HTMLImageElement) => el.complete)).toBe(true);
    }

    await page.getByRole("tab", { name: "Description" }).click();
    const rt2 = page.getByRole("textbox", { name: "Product description" });
    await expect(rt2.getByRole("heading", { name: "Why it wins" })).toBeVisible();
    await expect(rt2.locator("strong")).toHaveText("Strong");
    await expect(rt2.locator("em")).toHaveText("soft");
    await expect(rt2.locator("li")).toHaveText(["First point", "Second point"]);

    await page.getByRole("tab", { name: "Features" }).click();
    await expect(page.getByLabel("Feature 1 title")).toHaveValue("First on page");
    await expect(page.getByLabel("Feature 1 description")).toHaveValue("Why it matters");
    await expect(page.getByLabel("Feature 1 icon")).toHaveValue("shield");
    await expect(page.getByLabel("Feature 2 title")).toHaveValue("Second on page");

    await page.getByRole("tab", { name: "Specifications" }).click();
    await expect(page.getByLabel("Specification 1 group")).toHaveValue("Dimensions");
    await expect(page.getByLabel("Specification 1 unit")).toHaveValue("mm");
    await expect(page.getByLabel("Specification 2 value")).toHaveValue("9H");

    await page.getByRole("tab", { name: "Delivery & warranty" }).click();
    await expect(page.getByLabel("Duration")).toHaveValue("6 months");
    await expect(page.getByLabel("Warranty provider")).toHaveValue("Glide Lanka");
    await expect(page.getByLabel("Terms")).toHaveValue("Keep your receipt.");
    await expect(page.getByLabel("Estimated delivery time")).toHaveValue("2-4 working days");
    await expect(page.getByLabel("Store pickup instructions")).toHaveValue("Collect at Colombo 03");

    await page.getByRole("tab", { name: "SEO" }).click();
    await expect(page.getByLabel("SEO title")).toHaveValue("Glide Pro Glass Protector");
    await expect(page.getByLabel("Hide from search engines")).toBeChecked();
    await expect(page.getByLabel("Social sharing image")).not.toHaveValue("");

    await page.getByRole("tab", { name: "Related" }).click();
    await expect(page.getByText("Nova X1 Smartphone")).toBeVisible();
    await resetContent(page);
  });

  test("the editor tells the person about unsaved edits and validation problems", async ({ page }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    await page.goto(`/admin/products/${ID}`);
    await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await page.getByLabel("Subtitle").fill("Changed");
    await expect(page.getByText("Unsaved edits")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();

    // a feature without a title is refused with a readable message and nothing is saved
    await page.getByRole("tab", { name: "Features" }).click();
    await page.getByRole("button", { name: "Add feature" }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    const alert = page.locator("#admin-main").getByRole("alert");
    await expect(alert).toContainText("Some fields need attention");
    await expect(alert).toContainText(/feature/i);
    await expect(page.getByText("Unsaved edits")).toBeVisible();
    await page.getByLabel("Feature 1 title").fill("Now valid");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved. Customers will not see it until you publish.")).toBeVisible();
    await resetContent(page);
  });
});

test.describe("workflow: draft, preview, publish, unpublish, discard, conflicts", () => {
  test("a draft is private, the admin preview shows it, publish and unpublish toggle the public page", async ({ page, browser }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    const anon = await visitor(browser);
    const pub = await anon.newPage();

    await page.goto(`/admin/products/${ID}`);
    await page.getByLabel("Website display title").fill("Draft Only Title");
    await page.getByLabel("Short description").fill("Draft sentence.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved.")).toBeVisible();

    // 4: persists across reload
    await page.reload();
    await expect(page.getByLabel("Website display title")).toHaveValue("Draft Only Title");

    // 5-6: admin preview shows it, visitor cannot
    await page.goto(`/products/${SLUG}?preview=1`);
    await expect(page.getByText("Preview of unpublished changes")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Draft Only Title");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    for (const url of [`/products/${SLUG}`, `/products/${SLUG}?preview=1`]) {
      await pub.goto(url);
      await expect(pub.getByRole("heading", { level: 1 })).toHaveText("Glide Tempered Glass");
      await expect(pub.getByText("Draft sentence.")).toHaveCount(0);
      await expect(pub.getByText("Preview of unpublished changes")).toHaveCount(0);
    }
    // the preview link is also refused for a signed-in customer who is not staff
    const shopper = await visitor(browser);
    await shopper.request.post("/api/account/register", { data: { name: "Shopper", email: `shopper${Date.now()}@example.com`, phone: "0771234567", password: "secret123" }, headers: O });
    const sp = await shopper.newPage();
    await sp.goto(`/products/${SLUG}?preview=1`);
    await expect(sp.getByText("Draft sentence.")).toHaveCount(0);
    await expect(sp.getByRole("heading", { level: 1 })).toHaveText("Glide Tempered Glass");
    await shopper.close();

    // 7: publish
    await page.goto(`/admin/products/${ID}`);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published. The product page now shows this content.")).toBeVisible();
    await pub.goto(`/products/${SLUG}`);
    await expect(pub.getByRole("heading", { level: 1 })).toHaveText("Draft Only Title");
    await expect(pub.getByText("Draft sentence.")).toBeVisible();

    // editing after publishing changes only the draft
    await page.getByLabel("Short description").fill("Newer draft sentence.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Unpublished changes")).toBeVisible();
    await pub.goto(`/products/${SLUG}`);
    await expect(pub.getByText("Draft sentence.", { exact: true })).toBeVisible();
    await expect(pub.getByText("Newer draft sentence.")).toHaveCount(0);

    // 9: discard removes the NEWER draft and goes back to the published copy
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Discard draft" }).click();
    await page.waitForLoadState("load");
    await expect(page.getByLabel("Short description")).toHaveValue("Draft sentence.");
    await expect(page.getByText("Unpublished changes")).toHaveCount(0);
    await pub.goto(`/products/${SLUG}`);
    await expect(pub.getByText("Draft sentence.", { exact: true })).toBeVisible();

    // 8: unpublish
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Unpublish" }).click();
    await expect(page.getByText("Unpublished. The product page shows the plain ERP details.")).toBeVisible();
    await pub.goto(`/products/${SLUG}`);
    await expect(pub.getByRole("heading", { level: 1 })).toHaveText("Glide Tempered Glass");
    await expect(pub.getByText("Draft sentence.")).toHaveCount(0);
    // the draft is kept after unpublishing
    await page.reload();
    await expect(page.getByLabel("Website display title")).toHaveValue("Draft Only Title");
    await anon.close();
    await resetContent(page);
  });

  test("two people editing at once: the second save is refused safely and nothing is overwritten", async ({ page }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    await page.goto(`/admin/products/${ID}`);
    const other = await page.context().newPage();
    await other.goto(`/admin/products/${ID}`);

    await other.getByLabel("Subtitle").fill("Saved first");
    await other.getByRole("button", { name: "Save draft" }).click();
    await expect(other.getByText("Draft saved.")).toBeVisible();

    await page.getByLabel("Subtitle").fill("Saved second (stale)");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.locator("#admin-main").getByRole("alert")).toContainText("Someone else saved this product");
    await expect(page.getByRole("button", { name: "Reload the latest version" })).toBeVisible();
    await expect(page.getByText("Unsaved edits")).toBeVisible(); // the stale edit is not marked as saved

    await page.getByRole("button", { name: "Reload the latest version" }).click();
    await page.waitForLoadState("load");
    await expect(page.getByLabel("Subtitle")).toHaveValue("Saved first");
    await resetContent(page);
  });
});

test.describe("images", () => {
  test("JPEG, PNG and WebP are accepted and served; fake, empty and oversized files are refused by content and size", async ({ page, browser }) => {
    await signInAsAdmin(page);
    const anon = await visitor(browser);
    for (const [name, type, buffer, expected] of [
      ["a.jpg", "image/jpeg", JPEG, "image/jpeg"],
      ["a.png", "image/png", PNG, "image/png"],
      ["a.webp", "image/webp", WEBP, "image/webp"],
    ] as const) {
      const up = await page.request.post(`/api/admin/products/${ID}/images`, { headers: O, multipart: { file: { name, mimeType: type, buffer } } });
      expect(up.status(), name).toBe(201);
      const { id, url } = await up.json();
      expect(url).toBe(`/api/media/${id}`);
      const res = await anon.request.get(url);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe(expected);
      expect(res.headers()["cache-control"]).toContain("immutable");
      expect(res.headers()["x-content-type-options"]).toBe("nosniff");
      expect(res.headers()["content-security-policy"]).toContain("default-src 'none'");
    }
    // the file's name or declared type does not matter, its bytes do
    const script = await page.request.post(`/api/admin/products/${ID}/images`, { headers: O, multipart: { file: { name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)></svg>") } } });
    expect(script.status()).toBe(422);
    const html = await page.request.post(`/api/admin/products/${ID}/images`, { headers: O, multipart: { file: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<html><script>1</script></html>") } } });
    expect(html.status()).toBe(422);
    const renamed = await page.request.post(`/api/admin/products/${ID}/images`, { headers: O, multipart: { file: { name: "photo.txt", mimeType: "text/plain", buffer: PNG } } });
    expect(renamed.status()).toBe(201); // a real PNG with a wrong name is still a PNG
    const empty = await page.request.post(`/api/admin/products/${ID}/images`, { headers: O, multipart: { file: { name: "e.png", mimeType: "image/png", buffer: Buffer.alloc(0) } } });
    expect(empty.status()).toBe(413);
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const huge = await page.request.post(`/api/admin/products/${ID}/images`, { headers: O, multipart: { file: { name: "big.png", mimeType: "image/png", buffer: big } } });
    expect(huge.status()).toBe(413);
    await anon.close();
  });

  test("the editor refuses an oversized file before uploading and keeps the gallery intact", async ({ page }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    await page.goto(`/admin/products/${ID}`);
    await page.getByRole("tab", { name: "Images" }).click();
    await page.locator("#img-file").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]) });
    await expect(page.locator("#admin-main").getByRole("alert")).toContainText("larger than 2 MB");
    await expect(page.getByTestId("image-list")).toHaveCount(0);
    await page.locator("#img-file").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image at all") });
    await expect(page.locator("#admin-main").getByRole("alert")).toContainText("Only JPEG, PNG or WebP");
    await expect(page.getByTestId("image-list")).toHaveCount(0);
  });

  test("removing an image drops it from the product after save, and unused uploads are not kept by saved content", async ({ page, browser }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    await page.goto(`/admin/products/${ID}`);
    await page.getByRole("tab", { name: "Images" }).click();
    await page.locator("#img-file").setInputFiles([{ name: "a.png", mimeType: "image/png", buffer: PNG }, { name: "b.jpg", mimeType: "image/jpeg", buffer: JPEG }]);
    await expect(page.getByTestId("image-list").getByRole("listitem")).toHaveCount(2);
    await page.getByLabel("Alt text for image 1").fill("Keep me");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved.")).toBeVisible();
    await publishAction(page, "publish");

    await page.getByRole("button", { name: "Remove image 2" }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved.")).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Images" }).click();
    await expect(page.getByTestId("image-list").getByRole("listitem")).toHaveCount(1);
    await expect(page.getByLabel("Alt text for image 1")).toHaveValue("Keep me");

    // the storefront still shows the PUBLISHED two images until the change is published
    const anon = await visitor(browser);
    const p = await anon.newPage();
    await p.goto(`/products/${SLUG}`);
    await expect(p.getByRole("list", { name: "Product images" }).getByRole("listitem")).toHaveCount(2);
    await publishAction(page, "publish");
    await p.goto(`/products/${SLUG}`);
    await expect(p.getByRole("list", { name: "Product images" })).toHaveCount(0); // one image: no thumbnail strip
    await expect(p.locator('img[alt="Keep me"]').first()).toBeVisible();
    await anon.close();
    await resetContent(page);
  });
});

test.describe("rich text and optional content", () => {
  test("links, lists and emphasis render safely; hostile HTML never reaches customers", async ({ page, browser }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    const html =
      '<h2>Title</h2><p>Visit <a href="https://volta.lk/help" onclick="x()">help</a> or <a href="javascript:alert(1)">bad</a>. <b>Bold</b> <i>it</i></p><ol><li>One</li><li>Two</li></ol><img src=x onerror="window.__x=1"><iframe src="https://evil.test"></iframe><script>window.__y=1</script>';
    expect((await save(page, await version(page), { descriptionHtml: html })).status()).toBe(200);
    await publishAction(page, "publish");
    const anon = await visitor(browser);
    const p = await anon.newPage();
    await p.goto(`/products/${SLUG}`);
    const rich = p.locator(".rich");
    await expect(rich.getByRole("heading", { name: "Title" })).toBeVisible();
    await expect(rich.locator("strong")).toHaveText("Bold");
    await expect(rich.locator("em")).toHaveText("it");
    await expect(rich.locator("ol li")).toHaveText(["One", "Two"]);
    const link = rich.getByRole("link", { name: "help" });
    await expect(link).toHaveAttribute("href", "https://volta.lk/help");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(rich.getByRole("link", { name: "bad" })).toHaveCount(0);
    await expect(rich.locator("img, iframe, script, [onclick], [onerror]")).toHaveCount(0);
    expect(await p.evaluate(() => (window as unknown as { __x?: number; __y?: number }).__x ?? (window as unknown as { __y?: number }).__y)).toBeUndefined();
    await anon.close();
    await resetContent(page);
  });

  test("optional sections that were not filled in are hidden, and nothing is invented", async ({ page, browser }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    expect((await save(page, await version(page), { displayTitle: "Only a title" })).status()).toBe(200);
    await publishAction(page, "publish");
    const anon = await visitor(browser);
    const p = await anon.newPage();
    await p.goto(`/products/${SLUG}`);
    await expect(p.getByRole("heading", { level: 1 })).toHaveText("Only a title");
    for (const h of ["Key features", "Warranty", "Delivery & pickup"]) await expect(p.getByRole("heading", { name: h })).toHaveCount(0);
    await expect(p.getByRole("list", { name: "Highlights" })).toHaveCount(0);
    await expect(p.getByText("Glide Tempered Glass by Glide.")).toBeVisible(); // the ERP description is kept
    await expect(p.getByText("LKR 990").first()).toBeVisible();
    await expect(p.getByText(/installment|best seller|% off/i)).toHaveCount(0);
    await anon.close();
    await resetContent(page);
  });
});

test.describe("ERP ownership", () => {
  test("content cannot carry price, SKU, name, stock, brand, category or variants; the ERP values stay in charge", async ({ page, browser }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    const sneaky = { displayTitle: "Cheap!", price: 1, salePrice: 1, sku: "HACK", name: "Hacked", stock: 9999, available: false, brand: "Fake", category: "Fake", variants: [{ key: "x" }], purchasableQuantity: 9999 };
    const r = await save(page, await version(page), sneaky);
    expect(r.status()).toBe(200);
    const draft = (await r.json()).draft as Record<string, unknown>;
    for (const k of ["price", "salePrice", "sku", "name", "stock", "available", "brand", "category", "variants", "purchasableQuantity"]) expect(draft).not.toHaveProperty(k);
    await publishAction(page, "publish");

    const anon = await visitor(browser);
    const p = await anon.newPage();
    await p.goto(`/products/${SLUG}`);
    await expect(p.getByRole("heading", { level: 1 })).toHaveText("Cheap!"); // display title only
    await expect(p.getByText("LKR 990").first()).toBeVisible();
    await expect(p.getByText("SKU: SKU-7")).toBeVisible();
    await expect(p.getByText("GLIDE", { exact: false }).first()).toBeVisible();
    await expect(p.getByText("HACK")).toHaveCount(0);

    // the admin editor shows the ERP's own values as read-only
    await page.goto(`/admin/products/${ID}`);
    const erp = page.locator("#admin-main").getByRole("complementary");
    await expect(erp).toContainText("SKU-7");
    await expect(erp).toContainText("LKR 990");
    await expect(erp.getByRole("textbox")).toHaveCount(0);
    await anon.close();
    await resetContent(page);
  });

  test("cart and orders keep the ERP name and the live ERP price, never the display title", async ({ page, browser }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    expect((await save(page, await version(page), { displayTitle: "Marketing Name" })).status()).toBe(200);
    await publishAction(page, "publish");
    const anon = await visitor(browser);
    const p = await anon.newPage();
    await p.goto(`/products/${SLUG}`);
    await expect(p.getByRole("heading", { level: 1 })).toHaveText("Marketing Name");
    await p.getByRole("button", { name: /add to cart/i }).first().click();
    await control({ setPrice: { id: ID, price: 1200 } }); // the ERP changes the price after it was added
    await p.goto("/cart");
    await expect(p.getByTestId("cart-line").getByText("Glide Tempered Glass", { exact: true })).toBeVisible();
    await expect(p.getByText("Marketing Name")).toHaveCount(0);
    await expect(p.getByTestId("price-note")).toContainText("LKR 1,200");
    await expect(p.getByTestId("subtotal")).toHaveText("LKR 1,200");

    await p.goto("/checkout");
    await p.getByLabel("Full name").fill("Kasun Perera");
    await p.getByLabel("Phone number").fill("0771234567");
    await p.getByRole("button", { name: "Continue" }).click();
    await p.getByLabel("Address", { exact: true }).fill("12 Galle Road");
    await p.getByLabel("City", { exact: true }).fill("Colombo");
    await p.getByLabel("District").selectOption("Colombo");
    await p.getByRole("button", { name: "Continue" }).click();
    await p.getByRole("checkbox").check();
    await p.getByRole("button", { name: /place order/i }).click();
    await expect(p).toHaveURL(/order-confirmation/);
    await expect(p.getByText("Glide Tempered Glass").first()).toBeVisible();
    await expect(p.getByText("Marketing Name")).toHaveCount(0);
    await expect(p.getByText("LKR 1,200").first()).toBeVisible();
    await anon.close();
    await resetContent(page);
  });

  test("an ERP catalogue refresh brings in the new price and stock and keeps the saved website content", async ({ page, browser }) => {
    test.setTimeout(180_000);
    await signInAsAdmin(page);
    await resetContent(page);
    expect((await save(page, await version(page), { displayTitle: "Survives Sync", subtitle: "Still here", features: [{ title: "Kept feature" }] })).status()).toBe(200);
    await publishAction(page, "publish");
    const anon = await visitor(browser);
    const p = await anon.newPage();
    await p.goto(`/products/${SLUG}`);
    await expect(p.getByText("LKR 990").first()).toBeVisible();

    await control({ setPrice: { id: ID, price: 1500 }, setStock: { id: ID, stock: 0 } }); // a real change in the ERP
    // the storefront re-reads the ERP catalogue about once a minute
    await expect.poll(async () => { await p.goto(`/products/${SLUG}`); return p.getByText("LKR 1,500").count(); }, { timeout: 120_000, intervals: [5_000] }).toBeGreaterThan(0);
    await expect(p.getByRole("heading", { level: 1 })).toHaveText("Survives Sync");
    await expect(p.getByText("Still here")).toBeVisible();
    await expect(p.getByText("Kept feature")).toBeVisible();
    await expect(p.getByText("Out of stock", { exact: true })).toBeVisible(); // stock 0 from the ERP wins

    // put the ERP back and wait for the storefront cache to follow, so later tests start from the normal catalogue
    await control({ setPrice: { id: ID, price: 990 }, setStock: { id: ID, stock: 20 } });
    await expect.poll(async () => { await p.goto(`/products/${SLUG}`); return p.getByText("LKR 990").count(); }, { timeout: 120_000, intervals: [5_000] }).toBeGreaterThan(0);
    await anon.close();
    await resetContent(page);
  });
});

test.describe("invalid references and access", () => {
  test("unknown products and malformed ids are refused everywhere", async ({ page }) => {
    await signInAsAdmin(page);
    const doc = { subtitle: "x" };
    for (const bad of ["not-a-product", "cm0item0000nope"]) {
      expect((await page.request.put(`/api/admin/products/${bad}/content`, { headers: O, data: { version: 0, doc } })).status(), bad).toBe(404);
      expect((await page.request.post(`/api/admin/products/${bad}/publish`, { headers: O, data: { action: "publish" } })).status(), bad).toBe(404);
      expect((await page.request.post(`/api/admin/products/${bad}/images`, { headers: O, multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } } })).status(), bad).toBe(404);
    }
    expect((await page.request.put(`/api/admin/products/bad%20id%3Cx/content`, { headers: O, data: { version: 0, doc } })).status()).toBe(404);
    expect((await page.request.post(`/api/admin/products/${ID}/publish`, { headers: O, data: { action: "explode" } })).status()).toBe(400);
    expect((await page.request.put(`/api/admin/products/${ID}/content`, { headers: O, data: "not json" })).status()).toBe(400);
    for (const url of ["/admin/products/not-a-product", "/admin/products/cm0item0000nope"]) {
      await page.goto(url);
      await expect(page.getByText("Page not found")).toBeVisible();
      await expect(page.getByRole("tab")).toHaveCount(0);
    }
    expect((await page.goto("/products/no-such-product?preview=1"))?.status()).toBe(404);
    // a related-products list may not point at the product itself
    const self = await save(page, await version(page), { related: [ID] });
    expect(self.status()).toBe(422);
    // unknown related ids are tolerated but never displayed
    const ghost = await save(page, await version(page), { related: ["cm0ghost000000"] });
    expect(ghost.status()).toBe(200);
    await resetContent(page);
  });

  test("a customer account cannot open the editor or call any content API; a missing Origin is refused", async ({ page, browser }) => {
    const shopper = await visitor(browser);
    await shopper.request.post("/api/account/register", { data: { name: "Shopper", email: `shopper${Date.now()}@example.com`, phone: "0771234567", password: "secret123" }, headers: O });
    const sp = await shopper.newPage();
    await sp.goto(`/admin/products/${ID}`);
    await expect(sp.getByRole("alert").filter({ hasText: "No access" })).toBeVisible();
    await expect(sp.getByRole("tab")).toHaveCount(0);
    for (const call of [
      () => shopper.request.put(`/api/admin/products/${ID}/content`, { headers: O, data: { version: 0, doc: {} } }),
      () => shopper.request.post(`/api/admin/products/${ID}/publish`, { headers: O, data: { action: "publish" } }),
      () => shopper.request.post(`/api/admin/products/${ID}/images`, { headers: O, multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } } }),
      () => shopper.request.get(`/api/admin/products/search?q=glide`),
      () => shopper.request.get(`/api/admin/products/export`),
    ]) expect((await call()).status()).toBe(403);
    await shopper.close();

    await signInAsAdmin(page);
    const noOrigin = await page.request.put(`/api/admin/products/${ID}/content`, { data: { version: 0, doc: {} } });
    expect(noOrigin.status()).toBe(403);
  });
});

test.describe("editor layout (reference design)", () => {
  test("header, tab bar, ERP panel, quick preview and completion card are present and driven by real data", async ({ page }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    await page.goto(`/admin/products/${ID}`);
    const main = page.locator("#admin-main");

    // header: identity badges and actions
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Glide Tempered Glass");
    await expect(main.getByText("SKU: SKU-7")).toBeVisible();
    await expect(main.getByText(`ERP ID: ${ID}`)).toBeVisible();
    await expect(main.getByText("ERP Product", { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "View on Storefront" })).toHaveAttribute("href", `/products/${SLUG}`);
    await expect(main.getByRole("link", { name: "Preview", exact: true })).toHaveAttribute("href", `/products/${SLUG}?preview=1`);
    await expect(main.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    await expect(main.getByRole("button", { name: "More actions" })).toBeVisible();

    // tab bar: eight tabs, active tab is the orange one
    const tabs = main.getByRole("tab");
    await expect(tabs).toHaveCount(8);
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(0)).toHaveClass(/bg-brand-500/);
    await expect(tabs.nth(1)).not.toHaveClass(/bg-brand-500/);

    // ERP panel: real, read-only values
    const erp = main.getByRole("complementary");
    await expect(erp.getByText("Read only")).toBeVisible();
    for (const t of ["SKU-7", "Glide", "Accessories", "LKR 990", "20 units", "In stock", "Connected"]) await expect(erp).toContainText(t);
    await expect(erp.locator("input, textarea, select")).toHaveCount(0);

    // completion starts at 0% and follows what is typed (unsaved edits count)
    await expect(page.getByTestId("completion-pct")).toHaveText("0%");
    await page.getByLabel("Short description").fill("A short sentence.");
    await expect(page.getByTestId("completion-pct")).toHaveText("13%"); // 1 of 8 sections
    await page.getByLabel("New Arrival").check();

    // quick preview follows the current (unsaved) edits and shows real ERP price/stock
    const qp = page.getByRole("region", { name: "Quick Preview" });
    await page.getByLabel("Website display title").fill("Live Preview Title");
    await expect(qp.getByRole("heading", { name: "Live Preview Title" })).toBeVisible();
    await expect(qp.getByText("A short sentence.")).toBeVisible();
    await expect(qp.getByText("New Arrival")).toBeVisible();
    await expect(qp.getByText("LKR 990")).toBeVisible();
    await expect(qp.getByText("No features added yet.")).toBeVisible();
    await page.getByRole("tab", { name: "Features" }).click();
    await page.getByRole("button", { name: "Add feature" }).click();
    await page.getByLabel("Feature 1 title").fill("Preview feature");
    await expect(qp.getByRole("listitem").filter({ hasText: "Preview feature" })).toBeVisible();
    await expect(page.getByTestId("completion-pct")).toHaveText("25%");

    // an unfinished section can be opened from the completion card
    const card = page.getByRole("region", { name: "Product Completion" });
    await card.locator("li", { hasText: "SEO information" }).getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("tab", { name: "SEO" })).toHaveAttribute("aria-selected", "true");

    // publication status panel reflects the real state and the switch controls work
    await page.getByRole("tab", { name: "Basics" }).click();
    await expect(page.getByRole("radio", { name: /Draft/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch", { name: "Featured" })).toHaveAttribute("aria-checked", "false");
    await page.getByRole("switch", { name: "Featured" }).click();
    await expect(page.getByRole("switch", { name: "Featured" })).toHaveAttribute("aria-checked", "true");

    // no horizontal overflow on any tab
    for (const t of ["Basics", "Images", "Description", "Features", "Specifications", "Delivery & Warranty", "SEO", "Related Products"]) {
      await page.getByRole("tab", { name: t }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test("publishing from the header updates the badges and button labels", async ({ page }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    await page.goto(`/admin/products/${ID}`);
    const main = page.locator("#admin-main");
    await page.getByLabel("Short description").fill("Ready.");
    await expect(main.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await main.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published. The product page now shows this content.")).toBeVisible();
    await expect(main.getByRole("button", { name: "Update Published" })).toBeDisabled(); // nothing new to publish
    await expect(page.getByRole("radio", { name: /Published/ })).toHaveAttribute("aria-checked", "true");
    await expect(main.getByText(/Last saved:/)).toBeVisible();

    // the Draft radio takes it off the storefront again
    page.once("dialog", (d) => d.accept());
    await page.getByRole("radio", { name: /Draft/ }).click();
    await expect(page.getByText("Unpublished. The product page shows the plain ERP details.")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Draft/ })).toHaveAttribute("aria-checked", "true");
    await resetContent(page);
  });
});

test.describe("storefront cards", () => {
  test("a published display title shows on product cards, but the cart keeps the ERP name", async ({ page, browser }) => {
    await signInAsAdmin(page);
    await resetContent(page);
    expect((await save(page, await version(page), { displayTitle: "Card Display Title" })).status()).toBe(200);
    await publishAction(page, "publish");
    const anon = await visitor(browser);
    const p = await anon.newPage();
    await p.goto("/search?q=glide");
    const card = p.locator("article").filter({ hasText: "Card Display Title" });
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("link", { name: /Card Display Title/ })).toHaveAttribute("href", `/products/${SLUG}`);
    await card.getByRole("button", { name: /add to cart/i }).click();
    await p.goto("/cart");
    await expect(p.getByTestId("cart-line").getByText("Glide Tempered Glass", { exact: true })).toBeVisible();
    await expect(p.getByText("Card Display Title")).toHaveCount(0);
    await anon.close();
    await resetContent(page);
  });
});
