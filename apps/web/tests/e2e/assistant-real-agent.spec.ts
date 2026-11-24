import { expect, test, type Page } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalPrompt, BrowserProgressList, type ApprovalPhase } from "@/components/assistant/browser-task";
import { ComparisonView } from "@/components/assistant/cards";
import type { BrowserPanelData, BrowserProposalData, ComparisonCardData, ProductCardData } from "@/components/assistant/types";

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

test.describe("comparison on the real Agent", () => {
  test("two named products give a comparison table with a column each and the price difference", async ({ page }) => {
    await open(page);
    await say(page, "Compare Lumen P1 Smartphone and Lumen P2 Pro Smartphone");
    const card = page.getByTestId("assistant-panel").getByTestId("comparison-card").last();
    await expect(card).toBeVisible();
    await expect(card.locator('th[scope="col"]')).toHaveCount(2);
    await expect(card.locator('th[scope="row"]').first()).toBeVisible();
    await expect(card).toContainText("Rs. 35,000.00"); // 94,900 minus 59,900, computed by the Agent from the two prices
    if (process.env.ASSISTANT_SHOT_DIR) await page.screenshot({ path: `${process.env.ASSISTANT_SHOT_DIR}/comparison-desktop.png` });
  });

  test("@mobile the comparison scrolls inside its card and neither the panel nor the page scrolls sideways", async ({ page }) => {
    await open(page);
    await say(page, "Compare Lumen P1 Smartphone and Lumen P2 Pro Smartphone");
    const panel = page.getByTestId("assistant-panel");
    await expect(panel.getByTestId("comparison-card").last()).toBeVisible();
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    if (process.env.ASSISTANT_SHOT_DIR) await page.screenshot({ path: `${process.env.ASSISTANT_SHOT_DIR}/comparison-mobile.png` });
  });
});

/**
 * Browser task UI (contract 1.3). MOCK-ONLY, NOT the real flow: the real flow needs the widget switched on by the server (a layout change), the chat route
 * speaking 1.3 and the e2e Agent started with the browser feature, none of which exist yet. What these tests DO use is the real site CSS in a real browser:
 * the components' static markup is rendered in Node and injected into a real page of the store, so layout, tap-target size, colours and overflow are
 * measured for real, while behaviour (clicks, countdown, requests) is covered by the unit and route tests.
 */
const proposal: BrowserProposalData = { proposalId: "bp_AbCdEfGhIjKlMnOpQr", description: 'Change your cart: "Add to cart"', page: "/products/lumen-p2-pro-smartphone", actionClass: "reversible", expiresInSec: 120 };
const progress: BrowserPanelData = { source: "page", progress: [{ step: "open", status: "done" }, { step: "find", status: "done" }, { step: "act", status: "skipped" }] };
const prompt = (phase: ApprovalPhase, p: BrowserProposalData = proposal) => renderToStaticMarkup(createElement(ApprovalPrompt, { proposal: p, lang: "en", phase, secondsLeft: 87, onApprove: () => {}, onCancel: () => {}, onRetry: () => {} }));
const progressHtml = (lang: "en" | "si" = "en") => renderToStaticMarkup(createElement(BrowserProgressList, { panel: progress, lang }));

async function inject(page: Page, html: string, mobile: boolean) {
  await page.goto("/");
  await page.evaluate(
    ({ html, mobile }) => {
      document.getElementById("visual-host")?.remove();
      const d = document.createElement("div");
      d.id = "visual-host";
      d.style.cssText = mobile ? "position:fixed;inset:0;z-index:99999;overflow-y:auto;background:#f8fafc;padding:12px;display:flex;flex-direction:column;gap:12px" : "position:fixed;left:24px;bottom:24px;z-index:99999;width:26rem;max-height:80vh;overflow-y:auto;background:#f8fafc;padding:12px;border-radius:24px;border:1px solid #e2e8f0;display:flex;flex-direction:column;gap:12px";
      d.innerHTML = html;
      document.body.appendChild(d);
    },
    { html, mobile },
  );
  return page.locator("#visual-host");
}
const noSideways = (host: ReturnType<Page["locator"]>) => host.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
const shot = async (page: Page, name: string) => {
  if (process.env.ASSISTANT_SHOT_DIR) await page.screenshot({ path: `${process.env.ASSISTANT_SHOT_DIR}/${name}.png` });
};

test.describe("browser task UI layout (mock-only markup in the real page)", () => {
  test("progress and approval: tap targets, colours, wrapping, no sideways scroll", async ({ page }) => {
    const host = await inject(page, progressHtml() + prompt("ready"), false);
    await expect(host.getByTestId("browser-progress")).toBeVisible();
    await expect(host.getByTestId("browser-approval")).toBeVisible();
    const approve = host.getByTestId("browser-approve");
    const box = (await approve.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await approve.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(37, 99, 235)");
    expect((await host.getByTestId("browser-cancel").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await noSideways(host)).toBe(true);
    await shot(page, "browser-approval-desktop");
  });

  test("a long description and path wrap inside the card", async ({ page }) => {
    const long: BrowserProposalData = { ...proposal, description: "Change your cart: " + "Add to cart for the Ultra-Extended-Edition ".repeat(4).slice(0, 180), page: "/products/" + "very-long-product-name-".repeat(8) };
    const host = await inject(page, prompt("ready", long), false);
    await expect(host.getByTestId("browser-approval")).toBeVisible();
    expect(await noSideways(host)).toBe(true);
  });

  test("sending, error and expired states: buttons disabled while sending; no buttons once expired", async ({ page }) => {
    let host = await inject(page, prompt("sending"), false);
    await expect(host.getByTestId("browser-approve")).toBeDisabled();
    await expect(host.getByTestId("browser-cancel")).toBeDisabled();
    await shot(page, "browser-approval-sending");
    host = await inject(page, prompt("error"), false);
    await expect(host.getByTestId("browser-approval-error")).toBeVisible();
    await expect(host.getByTestId("browser-approve")).toBeEnabled();
    host = await inject(page, prompt("expired"), false);
    await expect(host.getByTestId("browser-approval-result")).toContainText("expired");
    await expect(host.getByRole("button")).toHaveCount(0);
    await shot(page, "browser-approval-expired");
  });

  test("@mobile approval buttons stack, fill the width, stay tappable, and nothing scrolls sideways", async ({ page }) => {
    const host = await inject(page, progressHtml() + prompt("ready"), true);
    const a = (await host.getByTestId("browser-approve").boundingBox())!;
    const c = (await host.getByTestId("browser-cancel").boundingBox())!;
    expect(a.height).toBeGreaterThanOrEqual(44);
    expect(c.height).toBeGreaterThanOrEqual(44);
    expect(c.y).toBeGreaterThan(a.y + a.height - 1); // stacked, not side by side
    expect(a.width).toBeGreaterThan(200);
    expect(await noSideways(host)).toBe(true);
    await shot(page, "browser-approval-mobile");
  });

  test("Sinhala wording fits without overflow (provisional text, awaiting native review)", async ({ page }) => {
    const si = renderToStaticMarkup(createElement(ApprovalPrompt, { proposal, lang: "si", phase: "ready", secondsLeft: 60, onApprove: () => {}, onCancel: () => {}, onRetry: () => {} }));
    const host = await inject(page, progressHtml("si") + si, false);
    await expect(host.getByTestId("browser-approval")).toBeVisible();
    expect(await noSideways(host)).toBe(true);
    await shot(page, "browser-approval-sinhala");
  });

  test("@mobile a four-product comparison scrolls inside its own card (markup injected)", async ({ page }) => {
    const mk = (i: number): ProductCardData => ({ type: "product", id: `p${i}`, name: `Ultra-Extended-Edition Gaming Laptop Model ${i}`, price: { amount: 100000 + i, text: `Rs. ${100000 + i}.00` }, available: true, url: `/products/p${i}` });
    const card: ComparisonCardData = { type: "comparison", products: [1, 2, 3, 4].map(mk), rows: [{ label: "Price", values: ["Rs. 1", "Rs. 2", "Rs. 3", "Rs. 4"], differs: true }], priceDelta: { amount: 3, text: "Rs. 3.00" } };
    const host = await inject(page, renderToStaticMarkup(createElement(ComparisonView, { card, demo: false })), true);
    await expect(host.getByTestId("comparison-card")).toBeVisible();
    expect(await noSideways(host)).toBe(true); // the host does not scroll sideways: the card's own overflow-x-auto handles the table
    await shot(page, "comparison-four-mobile");
  });
});
