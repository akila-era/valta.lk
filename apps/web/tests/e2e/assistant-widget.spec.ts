import { expect, test } from "@playwright/test";

/**
 * The AI shopping assistant widget in a real browser, against a FAKE Agent (tests/stubs/fake-agent.ts): the launcher and panel, cards,
 * the confirm-gated cart change, error handling, and what the website sent to the Agent (signed, no personal data, derived session).
 */
const AGENT = "http://127.0.0.1:4013";
const seen = async () => (await (await fetch(`${AGENT}/__seen`)).json()) as { identity: string; sessionId: string; message: string; cartLines: number; page?: string; signatureValid: boolean; clientIp: string }[];

let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ipCounter = (ipCounter % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.30.${Math.floor(Math.random() * 250)}.${ipCounter}` });
  await fetch(`${AGENT}/__reset`, { method: "POST" });
});

const ask = async (page: import("@playwright/test").Page, text: string) => {
  await page.getByLabel("Message the shopping assistant").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
};

test.describe("assistant widget", () => {
  test("is a separate launcher beside the store chat, opens a labelled dialog and shows cards with the demo label", async ({ page }) => {
    await page.goto("/");
    const launcher = page.getByTestId("assistant-launcher");
    await expect(launcher).toBeVisible();
    await launcher.click();
    const panel = page.getByRole("dialog", { name: "Shopping assistant" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("demo data");
    await panel.getByRole("button", { name: "Show me phones", exact: true }).click();
    await expect(panel.getByTestId("product-card")).toHaveCount(2);
    await expect(panel.getByText("Rs. 14,900.00")).toBeVisible();
    await expect(panel.getByText("Demo data").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("shows a comparison with missing values as unavailable", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("assistant-launcher").click();
    await ask(page, "compare these two");
    const table = page.getByTestId("comparison-card");
    await expect(table).toBeVisible();
    await expect(table.getByText("Not available")).toBeVisible();
    await expect(table.getByText("Rs. 10,000.00")).toBeVisible();
  });

  test("a cart proposal changes nothing until Confirm; Cancel changes nothing; Confirm adds the item once to the real cart", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("assistant-launcher").click();
    await ask(page, "add the earbuds to my cart");
    const confirm = page.getByTestId("cart-confirm");
    await expect(confirm).toContainText("Nothing changes in your cart until you confirm.");
    expect(await page.evaluate(() => window.localStorage.getItem("volta.cart.v1"))).toBeNull();

    await confirm.getByRole("button", { name: "Cancel" }).click();
    expect(await page.evaluate(() => window.localStorage.getItem("volta.cart.v1"))).toBeNull();

    await ask(page, "add the earbuds to my cart again");
    await page.getByTestId("cart-confirm").getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Added to your cart.")).toBeVisible();
    const cart = JSON.parse((await page.evaluate(() => window.localStorage.getItem("volta.cart.v1"))) ?? "[]") as { productId: string; quantity: number; name: string }[];
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ productId: "cm0item00000003", quantity: 2, name: "Pulse Wireless Earbuds" });
    await page.goto("/cart");
    await expect(page.getByText("Pulse Wireless Earbuds").first()).toBeVisible();
  });

  test("sends the Agent a signed guest request with the cart and page, no personal data, and a server-derived session id", async ({ page }) => {
    await page.goto("/cart");
    await page.getByTestId("assistant-launcher").click();
    await ask(page, "show me phones");
    await expect(page.getByTestId("product-card").first()).toBeVisible();
    await ask(page, "show me phones again");
    await expect(page.getByTestId("product-card")).toHaveCount(4);
    const calls = await seen();
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.signatureValid && c.identity === "anon")).toBe(true);
    expect(calls[0]!.page).toBe("cart");
    expect(calls[0]!.sessionId).toMatch(/^sess_[A-Za-z0-9_-]{32}$/);
    expect(calls[1]!.sessionId).toBe(calls[0]!.sessionId); // the cookie keeps one conversation
    const cookies = await page.context().cookies();
    const c = cookies.find((x) => x.name === "volta_ai");
    expect(c?.httpOnly).toBe(true);
    expect(c?.value).not.toContain(calls[0]!.sessionId);
  });

  test("offers tap-to-send suggestions after a reply that needs more, and sending one asks the assistant", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("assistant-launcher").click();
    await ask(page, "asdf qwerty");
    const chips = page.getByTestId("assistant-suggestions");
    await expect(chips.getByRole("button", { name: "Show me phones" })).toBeVisible();
    await chips.getByRole("button", { name: "Show me phones" }).click();
    await expect(page.getByTestId("product-card").first()).toBeVisible();
    expect((await seen()).map((c) => c.message)).toEqual(["asdf qwerty", "Show me phones"]);
    await expect(page.getByTestId("assistant-suggestions")).toHaveCount(0); // only the latest reply offers chips, and this one shows cards
  });

  test("shows a generic, retryable error when the Agent fails, never its internal message", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("assistant-launcher").click();
    await ask(page, "boom");
    const panel = page.getByRole("dialog", { name: "Shopping assistant" });
    await expect(panel.getByText(/not available right now/i)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByText("internal detail")).toHaveCount(0);
  });

  test("Sinhala answers carry the native-review notice", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("assistant-launcher").click();
    await ask(page, "ආයුබෝවන්");
    await expect(page.locator("[data-native-review=pending]").first()).toBeVisible();
  });

  test("hands a guest asking about orders to the Track order page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("assistant-launcher").click();
    await ask(page, "where is my order");
    await page.getByRole("link", { name: "Track an order" }).click();
    await expect(page).toHaveURL(/\/track-order/);
  });

  test("@mobile the panel fits a phone screen and the launcher does not cover the tab bar", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("assistant-launcher").click();
    const panel = page.getByRole("dialog", { name: "Shopping assistant" });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const vp = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    await ask(page, "show me phones");
    await expect(panel.getByTestId("product-card").first()).toBeVisible();
  });
});
