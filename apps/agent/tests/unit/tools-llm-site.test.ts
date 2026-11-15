import { describe, expect, it } from "vitest";
import { createMockStack } from "../../src/mock/stack";
import { SiteErpTransport } from "../../src/backend/site-transport";
import { createLlmTools, LlmToolExecutor, toVerifierEvidence, type LlmToolDeps, type SiteInfo, type SiteInfoSource } from "../../src/tools/llm";
import { verifyAnswerV2 } from "../../src/verify/v2";
import { richSite, RichTransport } from "../fixtures/rich-catalogue";

/** The read-only public website tools: store details and page text. No customer data, no write; offered only when the site source exists. */
const stack = createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0 });
const INFO: SiteInfo = {
  name: "VOLTA.LK Official Store",
  phone: "077 123 4567",
  phone2: "",
  whatsapp: "+94 77 123 4567",
  email: "info@volta.lk",
  address: "Colombo 03",
  hours: ["Mon - Sat: 9:00 AM - 7:00 PM"],
  deliveryTime: "3 to 4 working days",
  pickupInfo: "",
  paymentMethods: ["Cash Payment", "Bank Transfer"],
  bankTransferOffered: true,
  instalments: { providers: ["koko"], parts: 3 },
  pages: ["shipping-policy"],
};
const source = (over: Partial<SiteInfoSource> = {}): SiteInfoSource => ({
  info: async () => INFO,
  page: async (slug) => (slug === "shipping-policy" ? { slug, path: "/shipping-policy", text: "Free delivery for orders above Rs. 15,000. The delivery charge is shown at checkout." } : null),
  ...over,
});
const call = (name: string, args: unknown) => ({ function: { name, arguments: args } });
const run = async (deps: LlmToolDeps, name: string, args: unknown) => {
  const ex = new LlmToolExecutor({ tools: createLlmTools() });
  const turn = ex.startTurn({ actor: { kind: "guest" }, requestId: "req_s", sessionKey: "s1", deps });
  const round = await ex.runRound(turn, [call(name, args)]);
  return { ex, turn, result: round.results[0]! };
};

describe("site tools", () => {
  it("are not offered (and are listed as unavailable) without a site source", async () => {
    const ex = new LlmToolExecutor({ tools: createLlmTools() });
    const turn = ex.startTurn({ actor: { kind: "guest" }, requestId: "r", sessionKey: "s", deps: { registry: stack.registry } });
    expect(ex.declarations(turn).map((d) => d.name)).not.toContain("volta_store_info");
    expect(ex.unavailable(turn)).toContain("volta_site_page");
    const withSite = ex.startTurn({ actor: { kind: "guest" }, requestId: "r", sessionKey: "s", deps: { registry: stack.registry, siteInfo: source() } });
    expect(ex.declarations(withSite).map((d) => d.name)).toEqual(expect.arrayContaining(["volta_store_info", "volta_site_page"]));
  });

  it("volta_store_info returns the published details as site_info evidence", async () => {
    const { result } = await run({ registry: stack.registry, siteInfo: source() }, "volta_store_info", {});
    expect(result.status).toBe("ok");
    expect(result.modelText).toContain("077 123 4567");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.kind).toBe("site_info");
  });

  it("volta_site_page returns page text, refuses unknown pages, and degrades honestly when the site is down", async () => {
    const deps = { registry: stack.registry, siteInfo: source() };
    expect((await run(deps, "volta_site_page", { page: "shipping-policy" })).result.modelText).toContain("Free delivery");
    expect((await run(deps, "volta_site_page", { page: "terms" })).result.status).not.toBe("ok");
    expect((await run(deps, "volta_site_page", { page: "../admin" })).result.status).not.toBe("ok");
    const down = await run({ registry: stack.registry, siteInfo: source({ page: async () => { throw new Error("boom"); } }) }, "volta_site_page", { page: "faqs" });
    expect(down.result.status).not.toBe("ok");
    expect(down.result.modelText).not.toContain("boom");
  });

  it("the verifier lets an answer repeat an amount the site text states, but not an invented one", async () => {
    const { turn } = await run({ registry: stack.registry, siteInfo: source() }, "volta_site_page", { page: "shipping-policy" });
    const base = { language: "en" as const, toolEvidence: toVerifierEvidence(turn.evidence), sourcesFetchedThisTurn: [], searchPerformed: false, userMessage: "Is delivery free?", actor: "guest" as const, performedActions: [] };
    expect(verifyAnswerV2({ ...base, answerText: "Delivery is free for orders above Rs. 15,000." }).verdict).toBe("pass");
    expect(verifyAnswerV2({ ...base, answerText: "Delivery is free for orders above Rs. 9,000." }).verdict).not.toBe("pass");
  });
});

describe("SiteErpTransport site routes", () => {
  const SECRET = "x".repeat(40);
  const make = (body: unknown, status = 200) => {
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
      urls.push(String(u));
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { urls, t: new SiteErpTransport({ siteUrl: "https://valta.hexalyte.com", keyId: "agent1", secret: SECRET, fetchImpl }) };
  };

  it("reads store info and a page from the site relay, signed as a guest", async () => {
    const a = make({ success: true, data: INFO });
    expect((await a.t.getSiteInfo()).phone).toBe("077 123 4567");
    expect(a.urls[0]).toBe("https://valta.hexalyte.com/api/internal/ai/site/info");
    const b = make({ success: true, data: { slug: "terms", path: "/terms", text: "Terms." } });
    expect((await b.t.getSitePage("terms"))?.text).toBe("Terms.");
    expect(b.urls[0]).toBe("https://valta.hexalyte.com/api/internal/ai/site/pages/terms");
  });

  it("maps a missing page to null, refuses a bad slug without a request, and rejects a malformed answer", async () => {
    const nf = make({ error: { code: "PAGE_NOT_FOUND" } }, 404);
    expect(await nf.t.getSitePage("nope")).toBeNull();
    expect(await nf.t.getSitePage("../x")).toBeNull();
    expect(nf.urls).toHaveLength(1);
    const bad = make({ success: true, data: { name: 1 } });
    await expect(bad.t.getSiteInfo()).rejects.toThrow();
  });
});
