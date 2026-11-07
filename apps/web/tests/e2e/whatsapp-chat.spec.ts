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

    // A plain staff message (no Reply, no code) answers the chat whose visitor wrote last: B
    await webhook(request, reply(STAFF, "wamid.PLAIN1", "Plain answer for the latest chat"));
    await expect(b.chat.getByText("Plain answer for the latest chat")).toBeVisible({ timeout: 10_000 });
    await expect(a.chat.getByText("Plain answer for the latest chat")).toHaveCount(0);
    // and the site's own copy of a visitor message, if it ever comes back, is never taken as an answer
    await webhook(request, reply(STAFF, "wamid.ECHO1", `VOLTA.LK website chat #${code}\n\nOrder status`));
    await expect(a.chat.getByText("Order status", { exact: true })).toHaveCount(1);

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

  test("a pre-order sends the chosen template to the customer on WhatsApp, and the admin sees it was sent", async ({ page, request }) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
    await signInAsAdmin(page);
    expect((await page.request.put("/api/admin/whatsapp", {
      headers: { Origin: SITE },
      data: { mode: "cloud", notifyTo: "0771234567", cloud: { phoneNumberId: "1234567890", verifyToken: "verify-token-123", accessToken: "test-access-token", appSecret: APP_SECRET } },
    })).status()).toBe(200);

    // Template 2 (Short), reworded by staff (on the WhatsApp Chat page)
    await page.goto("/admin/whatsapp");
    await page.getByRole("radio", { name: "Template 2: Short" }).check();
    await page.getByLabel("Template 2 text").fill("Hi {name}, {store} got your pre-order {ref} for {qty} x {product}.");
    const templates = page.getByRole("region", { name: "Pre-order message to the customer (WhatsApp)" });
    await templates.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    const res = await request.post("/api/store/preorders", {
      headers: { Origin: SITE, "x-forwarded-for": nextIp() },
      data: { productId: "cm0item00000013", name: "Nimal", phone: "0712345678", quantity: 2 },
    });
    expect(res.status()).toBe(201);
    const { ref } = await res.json();
    const sent = (await sentTo(request)).filter((m) => m.to === "94712345678");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe(`Hi Nimal, VOLTA.LK got your pre-order ${ref} for 2 x Limited Case (sold out).`);

    await page.goto("/admin/orders/preorders");
    await expect(page.getByRole("row", { name: new RegExp(ref) }).getByText("Sent", { exact: true })).toBeVisible();

    // switched off: no message
    await page.goto("/admin/whatsapp");
    await page.getByLabel("Send the customer a WhatsApp message when they send a pre-order").uncheck();
    await templates.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await request.post("/api/store/preorders", { headers: { Origin: SITE, "x-forwarded-for": nextIp() }, data: { productId: "cm0item00000013", name: "Off Test", phone: "0712345679" } });
    expect((await sentTo(request)).filter((m) => m.to === "94712345679")).toHaveLength(0);

    // back to the defaults so other tests see the site as before
    await page.request.put("/api/admin/preorders/message", { headers: { Origin: SITE }, data: { enabled: true, selected: 0, templates: ["Hi {name}, thank you for your pre-order at {store}!", "{store}: pre-order {ref} received.", "Dear {name}, we have received your pre-order {ref}."] } });
    await page.request.put("/api/admin/whatsapp", { headers: { Origin: SITE }, data: { mode: "off", notifyTo: "", cloud: {} } });
  });

  test("a signed-in customer's chat carries their name and phone, follows the account, and admin and shop sign-ins are separate", async ({ page, request }) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
    await signInAsAdmin(page);
    await page.request.put("/api/admin/whatsapp", {
      headers: { Origin: SITE },
      data: { mode: "cloud", notifyTo: "0771234567", cloud: { phoneNumberId: "1234567890", verifyToken: "verify-token-123", accessToken: "test-access-token", appSecret: APP_SECRET } },
    });

    // The admin stays signed in to the admin while a different customer signs in on the shop in the same browser.
    const email = `naveen.${Date.now()}@example.test`;
    expect((await page.request.post("/api/account/register", { headers: { Origin: SITE }, data: { name: "Naveen Perera", email, phone: "0771112223", password: "secret123" } })).status()).toBe(201);
    await page.goto("/admin/whatsapp");
    await expect(page.getByRole("heading", { level: 1, name: "WhatsApp Chat" })).toBeVisible();
    await page.goto("/");
    await expect(page.locator("header").getByRole("button", { name: /signed in as Naveen Perera/ })).toBeVisible();

    // Naveen's chat message reaches WhatsApp with his account name and phone
    await page.getByRole("button", { name: "Open WhatsApp support chat" }).click();
    const chat = page.getByRole("dialog", { name: "WhatsApp Support" });
    await chat.getByLabel("Type a message").fill("Is the power bank back in stock?");
    await chat.getByRole("button", { name: "Send" }).click();
    await expect(chat.getByLabel("Sent")).toBeVisible();
    const copy = (await sentTo(request)).find((m) => m.body.includes("Is the power bank back in stock?"))!;
    expect(copy.body).toContain("(Naveen Perera, +94771112223)");

    // After signing out of the shop, the chat is not shown in this browser; signing in again brings it back.
    await page.request.post("/api/account/logout", { headers: { Origin: SITE } });
    expect(JSON.stringify(await (await page.request.get("/api/store/chat")).json())).not.toContain("power bank back in stock");
    await page.request.post("/api/account/login", { headers: { Origin: SITE }, data: { email, password: "secret123" } });
    expect(JSON.stringify(await (await page.request.get("/api/store/chat")).json())).toContain("power bank back in stock");

    // The admin inbox shows who it is, with the phone number; the admin is still signed in after the shop sign-out.
    await page.goto("/admin/whatsapp");
    await page.getByRole("list", { name: "Chats" }).getByRole("link", { name: /Naveen Perera/ }).first().click();
    await expect(page.getByRole("link", { name: "Open in WhatsApp" })).toHaveAttribute("href", "https://wa.me/94771112223");

    await page.request.put("/api/admin/whatsapp", { headers: { Origin: SITE }, data: { mode: "off", notifyTo: "", cloud: {} } });
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
