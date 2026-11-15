import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { signAgentRequest } from "@/lib/assistant/sign";
import { resetCatalogueNonces } from "@/lib/assistant/catalogue-auth";
import { htmlToPlainText } from "@/lib/assistant/site-text";

vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }) }));
vi.mock("@/lib/store-info", () => ({
  PAYMENT_BADGES: { cod: "Cash Payment", bank: "Bank Transfer", visa: "VISA" },
  getStoreInfo: async () => ({
    topLine: "VOLTA.LK Official Store",
    phone: "077 123 4567",
    phone2: "",
    whatsapp: "+94 77 123 4567",
    email: "info@volta.lk",
    address: "Colombo 03",
    hours: ["Mon - Sat: 9:00 AM - 7:00 PM"],
    deliveryTime: "3 to 4 working days",
    pickupInfo: "",
    payments: ["cod", "bank"],
    bankName: "Secret Bank",
    bankAccountName: "Secret Name",
    bankAccountNumber: "123456789",
    bankBranch: "Main",
  }),
}));
vi.mock("@/lib/instalments", () => ({ getInstalmentSettings: async () => ({ enabled: true, providers: ["koko"], parts: 3 }) }));

import { GET } from "@/app/api/internal/ai/site/[...path]/route";

const SECRET = "s".repeat(40);
const KEY = "agent1";
const ORIGIN = "https://valta.hexalyte.com";

function call(pathWithQuery: string, over: { unsigned?: boolean; customer?: boolean } = {}) {
  const headers = over.unsigned
    ? {}
    : signAgentRequest({ keyId: KEY, secret: SECRET, method: "GET", path: pathWithQuery, identity: over.customer ? { kind: "customer", customerId: "c1" } : { kind: "guest" }, clientIp: "203.0.113.5" });
  const parts = new URL(ORIGIN + pathWithQuery).pathname.replace("/api/internal/ai/site/", "").split("/");
  return GET(new Request(ORIGIN + pathWithQuery, { headers }), { params: Promise.resolve({ path: parts }) });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("AI_CATALOGUE_ENABLED", "true");
  vi.stubEnv("AI_CATALOGUE_KEY_ID", KEY);
  vi.stubEnv("AI_CATALOGUE_SECRET", SECRET);
  resetCatalogueNonces();
});
afterEach(() => vi.unstubAllGlobals());

describe("AI site relay", () => {
  it("is 404 when off, unsigned, or a customer identity rides on the key", async () => {
    expect((await call("/api/internal/ai/site/info", { unsigned: true })).status).toBe(404);
    expect((await call("/api/internal/ai/site/info", { customer: true })).status).toBe(404);
    vi.stubEnv("AI_CATALOGUE_ENABLED", "false");
    expect((await call("/api/internal/ai/site/info")).status).toBe(404);
  });

  it("returns the public store details and never the bank account", async () => {
    const res = await call("/api/internal/ai/site/info");
    expect(res.status).toBe(200);
    const body = JSON.stringify(await res.json());
    expect(body).toContain("077 123 4567");
    expect(body).toContain("Bank Transfer");
    expect(body).toContain("koko");
    expect(body).not.toContain("123456789");
    expect(body).not.toContain("Secret Bank");
    expect(body).not.toContain("Secret Name");
  });

  it("serves a listed page as plain text read over loopback, and refuses unlisted pages and queries", async () => {
    const fetchMock = vi.fn(async (_u: string) => new Response("<html><header>MENU</header><main><h1>Shipping policy</h1><p>Delivery charge is shown at checkout.</p></main><footer>FOOT</footer></html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ok = await call("/api/internal/ai/site/pages/shipping-policy");
    expect(ok.status).toBe(200);
    const text = (await ok.json()).data.text as string;
    expect(text).toContain("Delivery charge is shown at checkout.");
    expect(text).not.toContain("MENU");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("http://127.0.0.1:3000/shipping-policy");
    expect((await call("/api/internal/ai/site/pages/admin")).status).toBe(404);
    expect((await call("/api/internal/ai/site/pages/..%2Fadmin")).status).toBe(404);
    expect((await call("/api/internal/ai/site/info?x=1")).status).toBe(400);
  });
});

describe("htmlToPlainText", () => {
  it("keeps main content, drops scripts and markup, decodes entities and caps the length", () => {
    const t = htmlToPlainText("<nav>NAV</nav><main><script>alert(1)</script><h2>Returns &amp; refunds</h2><ul><li>7 days</li><li>Unused&nbsp;items</li></ul></main>");
    expect(t).toBe("Returns & refunds\n7 days\nUnused items");
    expect(htmlToPlainText("<main>" + "a ".repeat(5000) + "</main>", 100).length).toBeLessThanOrEqual(103);
  });
});
