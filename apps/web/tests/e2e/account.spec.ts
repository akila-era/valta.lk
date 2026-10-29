import { expect, test, type Page } from "@playwright/test";

const ERP = "http://localhost:4011/__control";
const control = (body: unknown) => fetch(ERP, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const unique = () => `cust${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;

async function registerVia(page: Page, email: string, password = "secret123") {
  await page.goto("/account/register");
  await page.getByLabel("Full name").fill("Kasun Perera");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone (optional)").fill("0771234567");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// Every test gets its own client IP (the site's rate limiter keys on x-forwarded-for), so the many test orders and
// sign-ups in one run never trip the per-IP limits that protect the real site.
let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ipCounter = (ipCounter % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.20.${Math.floor(Math.random() * 250)}.${ipCounter}` });
  await control({ reset: true });
});

test.describe("customer accounts", () => {
  test("header menu: sign in / register when signed out", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator("header").getByRole("button", { name: /My account, sign in or register/ });
    await btn.click();
    await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/account/login?next=%2F");
    await expect(page.locator("header").getByRole("link", { name: "Register" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });

  test("register → signed-in header → sign out → sign in again", async ({ page, context }) => {
    const email = unique();
    await registerVia(page, email);
    await expect(page.getByRole("heading", { name: "Kasun Perera" })).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: /signed in as Kasun Perera/ })).toBeVisible();

    // session cookie is httpOnly + SameSite=Lax and not readable by page scripts
    const cookie = (await context.cookies()).find((c) => c.name === "volta_session")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain("volta_session");

    await page.locator("header").getByRole("button", { name: /signed in as/ }).click();
    await page.locator("header").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("http://localhost:3100/");
    await expect(page.locator("header").getByRole("button", { name: /sign in or register/ })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === "volta_session")).toBeUndefined();

    // signed-out users are sent to sign in, then back to where they were going
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/login\?next=(%2F|\/)account$/);
    await page.getByLabel("Email").fill(email.toUpperCase()); // emails are case-insensitive
    await page.getByLabel("Password", { exact: true }).fill("secret123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("validation and duplicate email messages", async ({ page }) => {
    await page.goto("/account/register");
    await page.getByLabel("Full name").fill("K");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Please enter your full name")).toBeVisible();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");

    const email = unique();
    await registerVia(page, email);
    await page.locator("header").getByRole("button", { name: /signed in as/ }).click();
    await page.locator("header").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("http://localhost:3100/");
    await page.goto("/account/register");
    await page.getByLabel("Full name").fill("Someone Else");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("secret123");
    await page.getByLabel("Confirm password").fill("secret123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("This email is already registered")).toBeVisible();
  });

  test("wrong password gives a generic message; open redirects are ignored", async ({ page }) => {
    const email = unique();
    await registerVia(page, email);
    await page.context().clearCookies();
    await page.goto("/account/login?next=https://evil.example");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("wrongpass1");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect." })).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill("secret123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("http://localhost:3100/account");
  });

  test("forgot password never reveals whether the email exists", async ({ page }) => {
    await page.goto("/account/forgot-password");
    await page.getByLabel("Email").fill("nobody-here@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If an account exists for that email");
  });

  test("signed-in checkout is pre-filled and the order appears in My orders with ERP status", async ({ page }) => {
    await registerVia(page, unique());
    await page.goto("/products/pulse-wireless-earbuds-cm0item00000003");
    await page.getByRole("button", { name: "Add to cart", exact: true }).click();
    await expect(page.getByRole("link", { name: "View cart" })).toBeVisible();
    await page.goto("/checkout");
    await expect(page.getByLabel("Full name")).toHaveValue("Kasun Perera");
    await expect(page.getByLabel("Phone number")).toHaveValue("0771234567");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Address", { exact: true }).fill("12 Galle Road");
    await page.getByLabel("City", { exact: true }).fill("Colombo");
    await page.getByLabel("District").selectOption("Colombo");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page).toHaveURL(/order-confirmation\/(VLK-[A-Z0-9-]+)/);
    const ref = page.url().split("/").pop()!;

    await page.goto("/account");
    const row = page.locator("li", { hasText: ref });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("order-status")).toHaveText("Placed");
    await control({ setOrderStatus: { ref, status: "DISPATCHED" } });
    await page.reload();
    await expect(page.locator("li", { hasText: ref }).getByTestId("order-status")).toHaveText("Dispatched");
  });

  test("account API rejects cross-site requests", async ({ request }) => {
    const res = await request.post("/api/account/login", {
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      data: { email: "a@b.lk", password: "x" },
    });
    expect(res.status()).toBe(403);
  });
});
