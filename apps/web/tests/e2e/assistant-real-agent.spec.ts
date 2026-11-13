import { expect, test, type Page } from "@playwright/test";

/**
 * The AI assistant in a real browser against the REAL Agent code (HMAC, router, reasoning layer, tools, verifier) on an invented fixture
 * catalogue (apps/agent tests/fixtures/rich-catalogue.ts): nothing is canned. Run with `npx playwright test -c playwright.real-agent.config.ts`.
 * The fixture items are invented and are not VOLTA.LK products.
 */
let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.40.${Math.floor(Math.random() * 250)}.${ip}` });
});

async function open(page: Page) {
  await page.goto("/");
  await page.getByTestId("assistant-launcher").click();
  const panel = page.getByTestId("assistant-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/** Sends a message and waits for the new assistant reply (one more reply bubble than before). */
async function say(page: Page, text: string) {
  const panel = page.getByTestId("assistant-panel");
  const before = await panel.getByTestId("assistant-reply").count();
  await panel.getByPlaceholder(/./).fill(text);
  await panel.getByRole("button", { name: /^(Send|යවන්න)$/ }).click();
  await expect(panel.getByTestId("assistant-reply")).toHaveCount(before + 1, { timeout: 30_000 });
  return panel.getByTestId("assistant-reply").last();
}

/** The block of the latest assistant turn: its reply, its cards and its chips (earlier turns stay in the panel and must not be counted). */
const lastTurn = (page: Page) => page.getByTestId("assistant-panel").getByTestId("assistant-reply").last().locator("xpath=..");
const lastCards = (page: Page) => lastTurn(page).getByTestId("product-card");
const prices = async (page: Page): Promise<number[]> => (await lastCards(page).locator("span.text-lg").allTextContents()).map((t) => Number((/([\d,]+\.\d{2})/.exec(t)?.[1] ?? "NaN").replace(/,/g, "")));
const names = async (page: Page): Promise<string[]> => (await lastCards(page).locator("h3").allTextContents()).map((s) => s.trim());

test.describe("greetings in three languages", () => {
  test("a Sinhala greeting is answered in Sinhala, with no product cards, and keeps the internal review flag", async ({ page }) => {
    await open(page);
    const reply = await say(page, "ආයුබෝවන්");
    await expect(reply).toContainText("සාදරයෙන්");
    await expect(page.getByTestId("product-card")).toHaveCount(0);
    await expect(reply).toHaveAttribute("data-native-review", "pending");
  });

  test("a Singlish greeting ('kohomada oyata') is answered conversationally in Sinhala-style text, no search", async ({ page }) => {
    await open(page);
    const reply = await say(page, "kohomada oyata");
    await expect(reply).toContainText("මට හොඳින් ඉන්නවා");
    await expect(page.getByTestId("product-card")).toHaveCount(0);
  });

  test("an English greeting is answered in English", async ({ page }) => {
    await open(page);
    const reply = await say(page, "hi");
    await expect(reply).toContainText("Welcome to VOLTA.LK");
    await expect(reply).not.toHaveAttribute("data-native-review", "pending");
  });
});

test.describe("multi-turn shopping on the real reasoning layer", () => {
  test("asks one question at a time, remembers the budget, then recommends with fit chips", async ({ page }) => {
    await open(page);
    const first = await say(page, "show me phones");
    await expect(first).toContainText("What budget do you have in mind?");
    expect((await names(page)).length).toBeGreaterThan(0);

    const second = await say(page, "150000");
    await expect(second).toContainText("What matters most to you in a phone");
    for (const p of await prices(page)) expect(p).toBeLessThanOrEqual(150000);

    const third = await say(page, "camera");
    await expect(third).not.toContainText("?"); // two questions in a row is the limit: now it just recommends
    const cards = lastCards(page);
    await expect(cards.first()).toContainText("Lumen P2 Pro Smartphone");
    const chips = cards.first().getByTestId("fit-codes");
    await expect(chips).toContainText("Highest camera spec listed among the matches");
    await expect(chips).toContainText("Within your budget");
    for (const p of await prices(page)) expect(p).toBeLessThanOrEqual(150000);
  });

  test("keeps the budget for a follow-up ('show me the cheapest')", async ({ page }) => {
    await open(page);
    await say(page, "phones under 100000");
    for (const p of await prices(page)) expect(p).toBeLessThanOrEqual(100000);
    await say(page, "show me the cheapest");
    const list = await prices(page);
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) expect(p).toBeLessThanOrEqual(100000);
    expect((await names(page))[0]).toContain("Kite K1");
  });

  test("resolves 'the second one' to the second card that was shown, and shows its details", async ({ page }) => {
    await open(page);
    await say(page, "show me phones under 60000");
    const shown = await names(page);
    expect(shown.length).toBeGreaterThanOrEqual(2);
    await say(page, "tell me about the second one");
    const after = await names(page);
    expect(after).toEqual([shown[1]]);
  });

  test("product cards carry real prices and a live (not demo) stock label, and never show the out-of-stock item", async ({ page }) => {
    await open(page);
    await say(page, "Kite phones");
    const cards = lastCards(page);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Kite K1 Smartphone");
    await expect(cards.first()).toContainText("Rs. 29,900.00");
    await expect(cards.first()).toContainText("In stock");
    await expect(cards.first()).not.toContainText("demo");
    await expect(page.getByTestId("assistant-panel")).not.toContainText("Kite K0");
  });

  test("no exact match: says so, shows close alternatives, and marks them as over budget", async ({ page }) => {
    await open(page);
    const reply = await say(page, "a laptop under 50000");
    await expect(reply).toContainText("I couldn't find exactly that");
    const first = lastCards(page).first();
    await expect(first.getByTestId("fit-codes")).toContainText("Above your budget");
  });

  test("a Singlish budget follow-up keeps the topic and answers in the conversation's language", async ({ page }) => {
    await open(page);
    await say(page, "laptop ekak pennanna");
    const reply = await say(page, "150000 ta adu");
    await expect(reply).toContainText(/[඀-෿]/);
    for (const p of await prices(page)) expect(p).toBeLessThanOrEqual(150000);
  });
});

test.describe("language switching and errors", () => {
  test("an explicit language choice wins over what Auto would detect", async ({ page }) => {
    await open(page);
    const selector = page.getByTestId("language-selector");
    await selector.getByRole("radio", { name: "සිංහල" }).click();
    const si = await say(page, "hello");
    await expect(si).toContainText("සාදරයෙන්");
    await page.getByTestId("language-selector").getByRole("radio", { name: "English" }).click();
    const en = await say(page, "kohomada oyata");
    await expect(en).toContainText("I'm doing well");
  });

  test("a failed request shows a plain error with a retry, and retrying works once the service is back", async ({ page }) => {
    await open(page);
    await page.route("**/api/assistant/chat", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "ASSISTANT_UNAVAILABLE", message: "unavailable" } }) }));
    const panel = page.getByTestId("assistant-panel");
    await panel.getByPlaceholder(/./).fill("hi");
    await panel.getByRole("button", { name: "Send" }).click();
    await expect(panel.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(panel).not.toContainText("ASSISTANT_UNAVAILABLE"); // no internal code reaches the shopper
    await page.unroute("**/api/assistant/chat");
    await panel.getByRole("button", { name: "Try again" }).click();
    await expect(panel.getByTestId("assistant-reply").last()).toContainText("Welcome to VOLTA.LK");
  });
});

test.describe("phone", () => {
  test("@mobile the assistant opens, takes a message and shows a card with fit chips", async ({ page }) => {
    await open(page);
    await say(page, "phone with good camera under 100000");
    const first = lastCards(page).first();
    await expect(first).toBeVisible();
    await expect(first.getByTestId("fit-codes")).toBeVisible();
  });
});
