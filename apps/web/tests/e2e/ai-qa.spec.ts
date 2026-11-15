import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * The AI QA control center in a real browser (Chromium), against a development web server (a production build refuses to serve it)
 * and the repo's FAKE Agent (a test double: signed, canned, and reporting NO model). What this proves is the control center itself:
 * that its statuses are honest, that it reaches the Agent through the signed path, that results and export are real, and that the gate
 * holds. It does NOT prove anything about the real model, real voice or a real browser worker, and the page says so.
 */
const DEV = "http://localhost:3101";
const PROD = "http://localhost:3100";
const SHOTS = "../../docs/screenshots/ai-qa";

let ip = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ip = (ip % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.50.${Math.floor(Math.random() * 250)}.${ip}` });
});

async function signInAsAdmin(page: Page) {
  const body = { name: "Store Admin", email: "admin@example.test", phone: "0771234567", password: "secret123" };
  const reg = await page.request.post("/api/account/register", { data: body, headers: { Origin: DEV } });
  if (reg.status() !== 201) expect(reg.status()).toBe(409);
  const res = await page.request.post("/api/admin/login", { data: { email: body.email, password: body.password }, headers: { Origin: DEV } });
  expect(res.status()).toBe(200);
}

const shot = async (page: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize()!.width < 600 ? "mobile" : "desktop"}.png`, fullPage: false });
};
const status = (page: Page, id: string) => page.getByTestId(`cap-${id}-status`);

test.describe("the gate", () => {
  test("a production build does not serve the QA page or its API at all (even with AI_QA_ENABLED set)", async ({ request }) => {
    // The API answers a real 404. The page shows only the site's "not found" screen and none of the QA markup; its HTTP status can be 200
    // because Next.js has already started streaming the admin layout when notFound() is raised, so the BODY is what is asserted.
    const page = await request.get(`${PROD}/admin/ai-qa`, { maxRedirects: 0 });
    const html = await page.text();
    expect(html).not.toMatch(/qa-center|control center|Test console|Language QA|Browser QA|Voice QA/i);
    expect(html).toMatch(/not found|404|could not be found/i);
    expect((await request.get(`${PROD}/api/admin/ai-qa/status`)).status()).toBe(404);
    const chat = await request.post(`${PROD}/api/admin/ai-qa/chat`, { data: { message: "hi" }, headers: { Origin: PROD } });
    expect(chat.status()).toBe(404);
  });

  test("in development it still needs an admin: signed-out visitors are sent to sign in and the API answers 401", async ({ page, request }) => {
    test.setTimeout(150_000); // the first request to a fresh development server compiles the route
    const api = await request.get(`${DEV}/api/admin/ai-qa/status`);
    expect(api.status()).toBe(401);
    const chat = await request.post(`${DEV}/api/admin/ai-qa/chat`, { data: { message: "hi" }, headers: { Origin: DEV } });
    expect(chat.status()).toBe(401);
    await page.goto("/admin/ai-qa", { timeout: 120_000 });
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("a signed-in customer who is not staff gets no access", async ({ page }) => {
    const reg = await page.request.post("/api/account/register", { data: { name: "Shopper", email: "shopper@example.test", phone: "0771234568", password: "secret123" }, headers: { Origin: DEV } });
    expect([201, 409]).toContain(reg.status());
    await page.request.post("/api/account/login", { data: { email: "shopper@example.test", password: "secret123" }, headers: { Origin: DEV } });
    const api = await page.request.get("/api/admin/ai-qa/status");
    expect(api.status()).toBe(403);
    await page.goto("/admin/ai-qa");
    await expect(page.getByTestId("qa-center")).toHaveCount(0);
  });
});

test.describe("QA control center", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/ai-qa");
    await expect(page.getByRole("heading", { level: 1, name: /AI QA control center/ })).toBeVisible();
  });

  test("the overview reports what is real: no model, a mock catalogue, no browser worker, no voice, and nothing is Working", async ({ page }) => {
    await expect(page.getByTestId("demo-banner")).toContainText("MOCK");
    await expect(page.getByTestId("fact-model")).toContainText("None connected");
    await expect(page.getByTestId("fact-agent")).toContainText("HTTP 200"); // the signed health call reached the (fake) Agent
    await expect(page.getByTestId("capability-grid")).toBeVisible();
    await expect(status(page, "general_chat")).toHaveAttribute("data-status", "not_connected");
    await expect(status(page, "shopping")).toHaveAttribute("data-status", "mock");
    await expect(status(page, "search")).toHaveAttribute("data-status", "mock");
    await expect(status(page, "compare")).toHaveAttribute("data-status", "mock");
    await expect(status(page, "browser")).toHaveAttribute("data-status", "mock");
    for (const id of ["rag", "stt", "tts", "image", "document"]) await expect(status(page, id), id).toHaveAttribute("data-status", "not_connected");
    for (const id of ["sinhala", "singlish", "english", "memory"]) await expect(status(page, id), id).toHaveAttribute("data-status", "not_tested");
    await expect(page.locator('[data-testid^="cap-"][data-status="working"]')).toHaveCount(0);
    await expect(page.getByTestId("cap-browser")).toContainText("Mock tested");
    await expect(page.getByTestId("cap-browser")).not.toContainText("Real browser tested");
    await shot(page, "1-overview");
  });

  test("the tabs are an accessible tablist and switch the panel", async ({ page }) => {
    const tabs = page.getByRole("tablist", { name: "AI QA sections" }).getByRole("tab");
    await expect(tabs).toHaveCount(6);
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Test console" }).click();
    await expect(page.getByRole("tab", { name: "Test console" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await page.getByRole("tab", { name: "Voice QA" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: "Voice QA" })).toHaveAttribute("aria-selected", "true");
  });

  test("the console talks to the Agent through the signed path, shows the reply, cards and latency, and says the trace is unavailable", async ({ page }) => {
    await page.getByRole("tab", { name: "Test console" }).click();
    await expect(page.getByTestId("trace-unavailable")).toContainText("not available");
    await page.getByLabel("Test message").fill("Show me phones");
    await page.keyboard.press("Enter"); // keyboard send
    const reply = page.getByTestId("console-reply").first();
    await expect(reply).toContainText("Here is what I found.");
    await expect(reply).toContainText("Pulse Wireless Earbuds"); // a card from the fake Agent
    await expect(reply).toContainText(/\d+ ms/);
    await shot(page, "2-console-reply");
    await page.getByRole("button", { name: "New conversation" }).click();
    await expect(page.getByTestId("console-turn")).toHaveCount(0);
  });

  test("a proposed cart change is shown but the console never confirms it", async ({ page }) => {
    await page.getByRole("tab", { name: "Test console" }).click();
    await page.getByLabel("Test message").fill("add the earbuds to my cart");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByTestId("console-reply").first()).toContainText("Proposed action: cart.add");
    await expect(page.getByTestId("console-reply").first()).toContainText("does not confirm");
    await expect(page.getByRole("button", { name: /confirm/i })).toHaveCount(0);
  });

  test("Language QA runs real scenarios against the Agent, shows expected versus observed, and Results count them as mock-only", async ({ page }) => {
    test.setTimeout(120_000);
    await page.getByRole("tab", { name: "Language QA" }).click();
    await page.getByLabel("Group").selectOption("safety");
    await page.getByTestId("run-language-qa").click();
    await expect(page.getByTestId("qa-progress")).toHaveText("Finished.", { timeout: 100_000 });
    const rows = page.locator('[data-testid^="row-sf-"]');
    await expect(rows).toHaveCount(4);
    for (const row of await rows.all()) {
      expect(["pass", "fail"]).toContain(await row.getAttribute("data-verdict"));
      await expect(row.getByTestId("verdict")).toHaveText(/^(PASS|FAIL)$/); // a passed check is PASS, never "Working"
      await expect(row).not.toContainText("Working");
    }
    await shot(page, "3-language-qa");

    await page.getByRole("tab", { name: "Results" }).click();
    await expect(page.getByTestId("total-total")).toContainText("4");
    await expect(page.getByTestId("total-mock")).toContainText("4"); // over a MOCK catalogue: counted as mock-only
    await expect(page.getByTestId("total-real")).toContainText("0"); // and never as a real integration test
    await shot(page, "4-results");

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-json").click()]);
    expect(download.suggestedFilename()).toMatch(/^volta-ai-qa-.*\.json$/);
    const text = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
    const doc = JSON.parse(text) as { results: { id: string; mockData: boolean }[]; capabilities: { id: string; status: string }[]; totals: { total: number; mockOnly: number; realIntegration: number } };
    expect(doc.results).toHaveLength(4);
    expect(doc.totals).toMatchObject({ total: 4, mockOnly: 4, realIntegration: 0 });
    expect(doc.capabilities.find((c) => c.id === "browser")?.status).toBe("mock");
    for (const secret of ["e2e-agent-secret", "e2e-settings-key", "e2e-sync-secret", "hxs_test", "DATABASE_URL"]) expect(text, secret).not.toContain(secret); // no secret ever leaves
  });

  test("the browser tab is honest: MOCK ONLY, no real driver, ten scenarios all Not tested", async ({ page }) => {
    await page.getByRole("tab", { name: "Browser QA" }).click();
    await expect(page.getByTestId("browser-banner")).toContainText("MOCK ONLY");
    await expect(page.getByTestId("browser-banner")).toContainText("No real Playwright driver exists");
    const items = page.getByTestId("browser-scenarios").getByRole("listitem");
    await expect(items).toHaveCount(10);
    await expect(items.last()).toContainText("external domain");
    for (const item of await items.all()) {
      await expect(item).toContainText("Not tested");
      await expect(item).toContainText("mock-tested only");
      await expect(item).not.toContainText("Working");
    }
    await expect(page.getByTestId("browser-mock-results")).toContainText("MOCK driver");
    await shot(page, "5-browser");
  });

  test("the voice tab says no speech service exists, and the microphone test uses a real (fake) device and releases it", async ({ page }) => {
    await page.getByRole("tab", { name: "Voice QA" }).click();
    await expect(page.getByTestId("voice-banner")).toContainText("No speech service is connected");
    await expect(page.getByTestId("voice-stt")).toContainText("Not connected");
    await expect(page.getByTestId("voice-tts")).toContainText("Not connected");
    await expect(page.getByTestId("mic-result")).toContainText("Not tested yet");
    await page.getByTestId("mic-test").click();
    await expect(page.getByTestId("mic-result")).toContainText("Microphone works", { timeout: 15_000 });
    await expect(page.getByTestId("voice-mic")).toContainText("Working");
    await shot(page, "6-voice");
  });

  test("@mobile the page fits a phone and the tabs stay usable", async ({ page }) => {
    const width = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(width.doc).toBeLessThanOrEqual(width.win + 1);
    await page.getByRole("tab", { name: "Test console" }).click();
    await expect(page.getByLabel("Test message")).toBeVisible();
    await shot(page, "7-phone-console");
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByTestId("capability-grid")).toBeVisible();
    await shot(page, "8-phone-overview");
  });
});

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }, permissions: ["microphone"] });
