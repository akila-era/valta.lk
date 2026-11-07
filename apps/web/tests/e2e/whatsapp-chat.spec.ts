import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/**
 * WhatsApp Support chat over the Cloud API path, against a mock Graph API (tests/mock-wa): a visitor's message is
 * delivered to the staff number, a staff reply arriving by webhook shows in that visitor's chat (and only there),
 * duplicates are dropped, unsigned webhooks are refused, and the admin inbox can answer too.
 * The QR (linked device) path needs a real phone, so it is not covered here.
 */
const SITE = "http://localhost:3100";
const WA = "http://localhost:4031";
const APP_SECRET = "test-app-secret-123";
const STAFF = "94771234567";

let ip = Math.floor(Math.random() * 200);
const nextIp = () => `10.72.${Math.floor(Math.random() * 250)}.${(ip = (ip % 250) + 1)}`;

async function signInAsAdmin(page: Page) {
  const body = { name: "Store Admin", email: "admin@example.test", phone: "0771234567", password: "secret123" };
  const reg = await page.request.post("/api/account/register", { data: body, headers: { Origin: SITE } });
  if (reg.status() !== 201) expect(reg.status()).toBe(409);
  const res = await page.request.post("/api/admin/login", { data: { email: body.email, password: body.password }, headers: { Origin: SITE } });
  expect(res.status()).toBe(200);
}

async function webhook(request: APIRequestContext, payload: unknown, sign = true) {
  const raw = JSON.stringify(payload);
  const sig = `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;
  return request.post("/api/whatsapp/webhook", { data: raw, headers: { "Content-Type": "application/json", ...(sign ? { "X-Hub-Signature-256": sig } : {}) } });
}
const reply = (from: string, id: string, text: string, quotedId?: string) => ({
  entry: [{ changes: [{ value: { messages: [{ from, id, type: "text", text: { body: text }, ...(quotedId ? { context: { id: quotedId } } : {}) }] } }] }],
});
const sentTo = async (request: APIRequestContext) => (await (await request.get(`${WA}/__sent`)).json()) as { id: string; to: string; body: string }[];

async function visitor(browser: Browser, mobile = false) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  await ctx.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator(".splash-auto-out")).toHaveCount(0, { timeout: 10_000 });
  await page.getByRole("button", { name: "Open WhatsApp support chat" }).click();
  const chat = page.getByRole("dialog", { name: "WhatsApp Support" });
  await expect(chat).toBeVisible();
  return { ctx, page, chat };
}

test.describe("WhatsApp support chat", () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${WA}/__reset`);
  });

  test("cloud mode: send, reply by webhook, separate customers, duplicates, signatures, admin inbox", async ({ page, browser, request }) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
    await signInAsAdmin(page);
    // only admins can see or change the connection
    expect((await request.get("/api/admin/whatsapp")).status()).toBe(401);
    const saved = await page.request.put("/api/admin/whatsapp", {
      headers: { Origin: SITE },
      data: { mode: "cloud", notifyTo: "0771234567", cloud: { phoneNumberId: "1234567890", verifyToken: "verify-token-123", accessToken: "test-access-token", appSecret: APP_SECRET } },
    });
    expect(saved.status()).toBe(200);
    const info = await (await page.request.get("/api/admin/whatsapp")).json();
    expect(JSON.stringify(info)).not.toContain("test-access-token"); // secrets never come back
    expect(JSON.stringify(info)).not.toContain(APP_SECRET);

    // Meta's webhook verification
    expect(await (await request.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token-123&hub.challenge=4242")).text()).toBe("4242");
    expect((await request.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")).status()).toBe(403);

    // Visitor A: a quick question goes to the staff number with the chat code
    const a = await visitor(browser);
    await expect(a.chat.getByText("Online")).toBeVisible();
    await a.chat.getByRole("button", { name: "Order status" }).click();
    await expect(a.chat.getByLabel("Sent")).toBeVisible();
    const out = await sentTo(request);
    expect(out).toHaveLength(1);
    expect(out[0].to).toBe(STAFF);
    expect(out[0].body).toContain("Order status");
    const code = /#([A-Z0-9]{5})/.exec(out[0].body)![1];

    // Visitor B has a separate chat
    const b = await visitor(browser);
    await b.chat.getByLabel("Type a message").fill("Hello from B");
    await b.chat.getByRole("button", { name: "Send" }).click();
    await expect(b.chat.getByText("Hello from B")).toBeVisible();
    await expect(b.chat.getByText("Order status", { exact: true })).toHaveCount(0); // only the quick-question chip text is absent too

    // Staff reply (WhatsApp "Reply" to the copy) shows in A only; the same webhook twice is stored once
    expect((await webhook(request, reply(STAFF, "wamid.STAFF1", "Your order ships today", out[0].id))).status()).toBe(200);
    expect((await webhook(request, reply(STAFF, "wamid.STAFF1", "Your order ships today", out[0].id))).status()).toBe(200);
    await expect(a.chat.getByText("Your order ships today")).toHaveCount(1, { timeout: 10_000 });
    await expect(b.chat.getByText("Your order ships today")).toHaveCount(0);

    // "#CODE text" also works; another number using the code is ignored; unsigned calls are refused
    await webhook(request, reply(STAFF, "wamid.STAFF2", `#${code} It is on the way`));
    await webhook(request, reply("94770000000", "wamid.STRANGER", `#${code} hacked`));
    expect((await webhook(request, reply(STAFF, "wamid.UNSIGNED", `#${code} unsigned`), false)).status()).toBe(401);
    await expect(a.chat.getByText("It is on the way")).toBeVisible({ timeout: 10_000 });
    await expect(a.chat.getByText("hacked")).toHaveCount(0);
    await expect(a.chat.getByText("unsigned")).toHaveCount(0);

    // Delivery updates move the ticks forward
    await webhook(request, { entry: [{ changes: [{ value: { statuses: [{ id: out[0].id, status: "read" }] } }] }] });
    await expect(a.chat.getByLabel("Read")).toBeVisible({ timeout: 10_000 });

    // The admin inbox lists both chats and can answer A
    await page.goto("/admin/whatsapp");
    await page.getByRole("list", { name: "Chats" }).getByRole("link", { name: new RegExp(`#${code}`) }).click();
    await expect(page.getByRole("region", { name: `Chat #${code}` }).getByText("Replied on WhatsApp").first()).toBeVisible();
    await page.getByLabel("Reply").fill("Anything else we can help with?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(a.chat.getByText("Anything else we can help with?")).toBeVisible({ timeout: 10_000 });

    // A reloaded page keeps the conversation (cookie), and the API never returns B's chat to A
    await a.page.reload();
    await a.page.getByRole("button", { name: "Open WhatsApp support chat" }).click();
    await expect(a.page.getByRole("dialog", { name: "WhatsApp Support" }).getByText("Your order ships today")).toBeVisible();
    const aView = await (await a.page.request.get("/api/store/chat")).json();
    expect(JSON.stringify(aView)).not.toContain("Hello from B");

    await a.ctx.close();
    await b.ctx.close();
    // switch the chat off again so other tests see the plain site
    expect((await page.request.put("/api/admin/whatsapp", { headers: { Origin: SITE }, data: { mode: "off", notifyTo: "", cloud: {} } })).status()).toBe(200);
  });

  test("the chat window fits a phone screen and closes @mobile", async ({ page, browser }) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
    await signInAsAdmin(page);
    await page.request.put("/api/admin/whatsapp", {
      headers: { Origin: SITE },
      data: { mode: "cloud", notifyTo: "0771234567", cloud: { phoneNumberId: "1234567890", verifyToken: "verify-token-123", accessToken: "test-access-token", appSecret: APP_SECRET } },
    });
    const v = await visitor(browser, true);
    const box = (await v.chat.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expect(v.chat.getByRole("group", { name: "Quick questions" })).toBeVisible();
    await v.chat.getByRole("button", { name: "Close chat" }).click();
    await expect(v.chat).toHaveCount(0);
    await v.ctx.close();
    await page.request.put("/api/admin/whatsapp", { headers: { Origin: SITE }, data: { mode: "off", notifyTo: "", cloud: {} } });
  });
});
