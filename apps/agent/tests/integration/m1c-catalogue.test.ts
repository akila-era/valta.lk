import { describe, expect, it } from "vitest";
import { createMockStack } from "../../src/mock/stack";
import { FixtureErpTransport } from "../../src/mock/erp-fixture";
import { renderTemplate } from "../../src/router/templates";
import { run } from "../fixtures/pipeline-helpers";

const names = (r: { cards: { type: string; name?: string }[] }) => r.cards.filter((c) => c.type === "product").map((c) => c.name);

describe("extended mock catalogue (all planned categories)", () => {
  it("covers smartphones, tablets, laptops, watches, audio, chargers/cables, cases/protectors and computer accessories", async () => {
    const t = new FixtureErpTransport();
    const cats = new Set((await t.listProducts()).map((p) => p.category));
    for (const c of ["Mobile Phones", "Tablets", "Laptops", "Wearables", "Audio", "Accessories", "Computer Accessories"]) expect(cats.has(c), c).toBe(true);
    const subs = new Set((await t.listProducts()).map((p) => p.subCategory));
    for (const c of ["Chargers", "Cables", "Cases", "Screen Protectors", "Earbuds", "Headphones"]) expect(subs.has(c), c).toBe(true);
  });

  it("finds laptops and computer accessories through the pipeline", async () => {
    const s = createMockStack({ transport: new FixtureErpTransport() });
    expect(names((await run(s.pipeline, "Show me laptops")).result).sort()).toEqual(["Zen Book 14 Laptop", "Zen Book 16 Pro Laptop"]);
    expect(names((await run(s.pipeline, "Show me a wireless mouse")).result)).toEqual(["Keyra Wireless Mouse"]);
    expect(names((await run(s.pipeline, "Show me a mechanical keyboard")).result)).toEqual(["Keyra Mechanical Keyboard"]);
  });

  it("shows warranty only where the data has it, and recommends laptop accessories only from explicit links", async () => {
    const s = createMockStack({ transport: new FixtureErpTransport() });
    const specs = async (q: string) => ((await run(s.pipeline, q)).result.cards[0] as { specs?: { name: string; value: string }[] }).specs ?? [];
    expect(await specs("Tell me about the Zen Book 14")).toContainEqual({ name: "Warranty", value: "24 months (Mock warranty record)" });
    expect((await specs("Tell me about the Atlas Smartwatch")).map((x) => x.name)).not.toContain("Warranty");
    const acc = (await run(s.pipeline, "What accessories go with the Zen Book 14?")).result;
    expect(acc.cards.map((c) => (c as { product: { name: string } }).product.name).sort()).toEqual(["Keyra Wireless Mouse", "Keyra USB-C Hub 7-in-1", "Volt 65W Laptop Charger"].sort());
    // The mouse is not linked to the tablet, so it is never suggested for it.
    const tab = (await run(s.pipeline, "What accessories fit the Orbit Tablet 11 Plus?")).result;
    expect(JSON.stringify(tab)).not.toContain("Mouse");
  });

  it("compares laptops showing a missing specification as unavailable (null), never invented", async () => {
    const s = createMockStack({ transport: new FixtureErpTransport() });
    const { result } = await run(s.pipeline, "Compare Zen Book 14 and Orbit Tablet 11 Plus");
    const rows = (result.cards[0] as { rows: { label: string; values: (string | null)[] }[] }).rows;
    const mem = rows.find((r) => r.label === "Memory");
    expect([...(mem?.values ?? [])].sort()).toEqual(["16 GB", null].sort());
  });
});
