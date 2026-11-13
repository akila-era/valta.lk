import { describe, expect, it } from "vitest";
import { safeImageUrl, toPublic, type AgentChatResponse } from "@/lib/assistant/schema";

const env = { ERP_IMAGE_HOSTS: "valta.hexalyte.com, cdn.example.test", SITE_URL: "https://valta.hexalyte.com/" };

describe("card images come only from approved https hosts", () => {
  it("keeps this site's paths and https images on listed hosts", () => {
    expect(safeImageUrl("/uploads/a.svg", env)).toBe("/uploads/a.svg");
    expect(safeImageUrl("https://valta.hexalyte.com/uploads/a.svg", env)).toBe("https://valta.hexalyte.com/uploads/a.svg");
    expect(safeImageUrl("https://CDN.example.test/p.png", env)).toBe("https://cdn.example.test/p.png");
  });

  it.each([
    "http://mock-erp.local/uploads/cm0item00000011.svg",
    "http://valta.hexalyte.com/uploads/a.svg",
    "https://evil.example/p.png",
    "https://valta.hexalyte.com.evil.example/p.png",
    "https://user:pw@valta.hexalyte.com/p.png",
    "//evil.example/p.png",
    "/\\evil.example/p.png",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "not a url",
  ])("drops %s", (u) => expect(safeImageUrl(u, env)).toBeUndefined());

  it("drops nothing when the host list is empty except this site's own origin", () => {
    expect(safeImageUrl("https://cdn.example.test/p.png", { SITE_URL: "https://valta.hexalyte.com" })).toBeUndefined();
    expect(safeImageUrl("https://valta.hexalyte.com/p.png", { SITE_URL: "https://valta.hexalyte.com" })).toBeDefined();
  });

  it("removes a bad imageUrl from every card shape before the browser sees it, leaving the rest of the card intact", () => {
    const product = { type: "product", id: "p1", slug: "s", name: "Nova", price: { amount: 1, text: "Rs. 1" }, available: true, url: "/products/s", imageUrl: "http://mock-erp.local/x.svg" };
    const good = { ...product, id: "p2", imageUrl: "https://valta.hexalyte.com/x.svg" };
    const r = { language: "en", reply: { text: "ok", source: "template" }, needsNativeReview: false, cards: [product, good, { type: "comparison", products: [product, good], rows: [] }], actions: [], suggestions: [], meta: {} } as unknown as AgentChatResponse;
    const pub = toPublic(r, env) as unknown as { cards: { imageUrl?: string; name?: string; products?: { imageUrl?: string }[] }[] };
    expect(pub.cards[0]).not.toHaveProperty("imageUrl");
    expect(pub.cards[0]!.name).toBe("Nova");
    expect(pub.cards[1]!.imageUrl).toBe("https://valta.hexalyte.com/x.svg");
    expect(pub.cards[2]!.products![0]).not.toHaveProperty("imageUrl");
    expect(pub.cards[2]!.products![1]!.imageUrl).toBe("https://valta.hexalyte.com/x.svg");
    expect(JSON.stringify(r.cards[0])).toContain("mock-erp.local"); // the input is not mutated
  });
});
