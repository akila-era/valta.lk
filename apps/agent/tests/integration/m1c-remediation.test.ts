import { describe, expect, it } from "vitest";
import { FixtureErpTransport, itemId } from "../../src/mock/erp-fixture";
import { createMockStack } from "../../src/mock/stack";
import { renderTemplate } from "../../src/router/templates";
import { guestCtx, run } from "../fixtures/pipeline-helpers";

const ALL = Array.from({ length: 25 }, (_, i) => itemId(i + 1));

describe("catalogue consistency: all 25 products through every tool", () => {
  it("the ERP fixture lists exactly the 25 products", async () => {
    expect((await new FixtureErpTransport().listProducts()).map((p) => p.id)).toEqual(ALL);
  });

  it("each product is found by search (by its own name), has details, a stock answer and a comparison", async () => {
    const t = new FixtureErpTransport();
    const { backend } = createMockStack({ transport: t });
    const ctx = guestCtx();
    for (const id of ALL) {
      const details = (await backend.get_product_details({ productId: id }, ctx)) as { kind: string; product: { id: string; name: string } };
      expect(details.kind).toBe("details");
      const found = (await backend.search_products({ query: details.product.name, inStockOnly: false, limit: 8 } as never, ctx)) as { items: { id: string }[] };
      expect(found.items.map((x) => x.id), details.product.name).toContain(id);
      expect(await backend.check_stock({ productId: id, quantity: 1 } as never, ctx), id).toMatchObject({ kind: "stock", productId: id });
      const other = id === ALL[0] ? ALL[1]! : ALL[0]!;
      expect(await backend.compare_products({ productIds: [id, other] }, ctx), id).toMatchObject({ kind: "compare" });
      // Accessories: an answer (possibly an empty list), never an error, and only explicitly linked products appear.
      const acc = (await backend.get_accessories({ productId: id } as never, ctx)) as { kind: string; items: unknown[] };
      expect(acc.kind, id).toBe("accessories");
      expect(Array.isArray(acc.items)).toBe(true);
    }
  });

  it("every accessory link points at a product that exists, so no link is silently dropped", async () => {
    const { site, transport } = createMockStack({ transport: new FixtureErpTransport() });
    const ids = new Set((await transport.listProducts()).map((p) => p.id));
    for (const l of site.links) {
      expect(ids.has(l.sourceItemId), l.sourceItemId).toBe(true);
      expect(ids.has(l.accessoryItemId), l.accessoryItemId).toBe(true);
    }
  });

  it("products 16 to 25 are served by the web mock ERP server too (MOCK_ERP_CATALOGUE=extended), and mock-erp-contract.test.ts compares them item by item", () => {
    expect(ALL.slice(15)).toHaveLength(10);
  });
});

describe("router: category names that contain the word 'accessories'", () => {
  const names = (r: { cards: { type: string; name?: string }[] }) => r.cards.map((c) => c.name);
  it("'show me computer accessories' searches the Computer Accessories category", async () => {
    const s = createMockStack({ transport: new FixtureErpTransport() });
    const r = (await run(s.pipeline, "Show me computer accessories")).result;
    expect(names(r).sort()).toEqual(["Keyra Mechanical Keyboard", "Keyra USB-C Hub 7-in-1", "Keyra Wireless Mouse"]);
    expect(r.actions).toEqual([]);
  });

  it("an accessory question still needs a product, and a named product still works", async () => {
    const s = createMockStack({ transport: new FixtureErpTransport() });
    expect((await run(s.pipeline, "show me accessories")).result.reply.text).toMatch(/^Which product should the accessory fit/);
    expect((await run(s.pipeline, "what accessories fit the Zen Book 14")).result.cards.map((c) => c.type)).toEqual(["accessory", "accessory", "accessory"]);
  });

  it("a bare category noun ('keyboards') asks what the shopper wants, like 'phones' and 'laptops' do; with a verb it searches", async () => {
    const s = createMockStack({ transport: new FixtureErpTransport() });
    for (const m of ["keyboards", "laptops", "phones"]) expect((await run(s.pipeline, m)).result.reply.text, m).toBe(renderTemplate("clarify_what", "en").text);
    expect((await run(s.pipeline, "show me keyboards")).result.cards).toHaveLength(1);
  });
});
