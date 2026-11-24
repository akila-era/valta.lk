import { expect, test } from "@playwright/test";

/**
 * Phone behaviour of the assistant modal, with the on-screen keyboard simulated by shrinking the visible viewport (Playwright cannot open
 * a real soft keyboard). The modal follows the dynamic viewport height, so when the keyboard takes space the message box and Send button
 * must stay inside the visible area. A real device check is still needed for iOS/Android keyboard quirks.
 */
const AGENT = "http://127.0.0.1:4013";

let n = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  n = (n % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.40.${Math.floor(Math.random() * 250)}.${n}` });
  await fetch(`${AGENT}/__reset`, { method: "POST" });
});

test.describe("assistant on a phone", () => {
  test("@mobile the launcher shows a labelled 'Ask AI' pill that stays on screen", async ({ page }) => {
    await page.goto("/");
    const launcher = page.getByTestId("assistant-launcher");
    await expect(launcher).toBeVisible();
    await expect(launcher).toContainText("Ask AI");
    const box = (await launcher.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  });

  test("@mobile with a keyboard-sized viewport the message box and Send stay visible, and a reply still arrives", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("assistant-launcher").click();
    const input = page.getByLabel("Message the shopping assistant");
    await expect(input).toBeVisible();
    const full = page.viewportSize()!;
    await page.setViewportSize({ width: full.width, height: Math.round(full.height * 0.55) });
    const vp = page.viewportSize()!;
    await input.focus();
    await input.fill("show me phones");
    for (const target of [input, page.getByRole("button", { name: "Send" })]) {
      const box = (await target.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
    }
    const panel = (await page.getByTestId("assistant-panel").boundingBox())!;
    expect(panel.height).toBeLessThanOrEqual(vp.height + 1);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByTestId("assistant-panel").getByTestId("product-card").first()).toBeVisible();
  });

  test("@mobile a product image that cannot be loaded is replaced by the placeholder, not a broken icon", async ({ page }) => {
    // The fake Agent sends no images, so add a URL the site does not serve (as the mock ERP's /uploads/*.svg is on the live site).
    await page.route("**/uploads/**", (r) => r.fulfill({ status: 404, body: "" }));
    await page.route("**/api/assistant/chat", async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { cards?: { imageUrl?: string }[] };
      for (const c of body.cards ?? []) c.imageUrl = "/uploads/missing.svg";
      await route.fulfill({ response: res, json: body });
    });
    await page.goto("/");
    await page.getByTestId("assistant-launcher").click();
    await page.getByLabel("Message the shopping assistant").fill("show me phones");
    await page.getByRole("button", { name: "Send" }).click();
    const card = page.getByTestId("assistant-panel").getByTestId("product-card").first();
    await expect(card).toBeVisible();
    await expect(card.locator("img")).toHaveCount(0);
    await expect(card.getByRole("img")).toBeVisible();
  });
});
