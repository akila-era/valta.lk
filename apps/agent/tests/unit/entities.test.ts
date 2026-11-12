import { describe, expect, it } from "vitest";
import { extractEntities } from "../../src/router/entities";
import { itemId, MOCK_VOCAB } from "../fixtures/mock-vocab";

const ent = (s: string) => extractEntities(s, MOCK_VOCAB);
const ids = (s: string) => ent(s).products.map((p) => p.id);

describe("product matching", () => {
  it("finds a product by brand plus a distinguishing word, in any language mix", () => {
    expect(ids("Nova X1 එකේ camera එක")).toEqual([itemId(1)]);
    expect(ids("nova x1 ekata charger")).toEqual([itemId(1)]);
    expect(ids("Atlas smartwatch")).toEqual([itemId(8)]);
    expect(ids("Volt power bank එකක්")).toEqual([itemId(14)]);
  });

  it("does not treat a brand alone, or a generic word alone, as a product", () => {
    expect(ids("Nova phone එකක්")).toEqual([]);
    expect(ent("Nova phone එකක්").brand).toBe("Nova");
    expect(ids("smartphone")).toEqual([]);
    expect(ids("speaker")).toEqual([]);
  });

  it("tolerates one typo in a longer word", () => {
    expect(ids("Orbyt Pro")).toEqual([itemId(2)]);
    expect(ids("Atlass smartwatch")).toEqual([itemId(8)]);
  });

  it("returns two products for two different mentions without calling it ambiguous", () => {
    const e = ent("Pulse earbuds සහ Pulse headphones වල වෙනස");
    expect(e.products.map((p) => p.id).sort()).toEqual([itemId(3), itemId(4)].sort());
    expect(e.productAmbiguous).toBe(false);
  });

  it("flags a message that names two products by exactly the same words as ambiguous", () => {
    const e = ent("Echo speaker එකේ battery");
    expect(e.productAmbiguous).toBe(true);
    expect(ent("echo mini speaker").productAmbiguous).toBe(false);
    expect(ids("echo mini speaker")).toEqual([itemId(15)]);
  });

  it("returns nothing for text with no catalogue words", () => {
    expect(ent("hello there").products).toEqual([]);
    expect(ent("").products).toEqual([]);
  });
});

describe("categories, brands and search words", () => {
  it("resolves concept words to a category that exists in the vocabulary", () => {
    expect(ent("phones under budget").categorySlug).toBe("mobile-phones");
    expect(ent("ලාභ earbuds").categorySlug).toBe("audio");
    expect(ent("smartwatches").categorySlug).toBe("wearables");
    expect(ent("tablet එකක්").categorySlug).toBe("tablets");
    expect(ent("charger එකක්").categorySlug).toBe("accessories");
    expect(ent("charger එකක්").queryWord).toBe("charger");
  });

  it("does not invent a category the catalogue lacks", () => {
    const noTablets = { ...MOCK_VOCAB, categories: MOCK_VOCAB.categories.filter((c) => c.slug !== "tablets") };
    expect(extractEntities("tablet එකක්", noTablets).categorySlug).toBeUndefined();
  });

  it("collects unknown brand-like words so a search can still use them", () => {
    expect(ent("Samsung phone එකක් තියෙනවද?").unknownTerms).toEqual(["samsung"]);
    expect(ent("iPhone 15 ekak ganna one").unknownTerms).toContain("iphone");
    expect(ent("Show me phones").unknownTerms).toEqual([]);
    expect(ent("Nova X1").unknownTerms).toEqual([]);
  });
});

describe("amounts, colours, storage, quantity, sort, sale", () => {
  it("reads price bounds", () => {
    expect(ent("රුපියල් 100,000ට අඩු").maxPriceLkr).toBe(100000);
    expect(ent("above 50000").minPriceLkr).toBe(50000);
    expect(ent("budget eka hondai").unparsedAmount).toBe(true);
  });

  it("reads colours in English, Singlish and Sinhala", () => {
    expect(ent("black").colors).toEqual(["black"]);
    expect(ent("kalu color eka").colors).toEqual(["black"]);
    expect(ent("නිල් පාට").colors).toEqual(["blue"]);
    expect(ent("hello").colors).toEqual([]);
  });

  it("reads storage sizes", () => {
    expect(ent("256GB model").storages).toEqual(["256GB"]);
    expect(ent("128 gb or 256gb").storages).toEqual(["128GB", "256GB"]);
  });

  it("reads quantities from digits, spoken words and phrases", () => {
    expect(ent("Atlas smartwatch එක 2ක් දාන්න").quantity).toBe(2);
    expect(ent("දෙකක් ඕන").quantity).toBe(2);
    expect(ent("quantity to 4").quantity).toBe(4);
    expect(ent("make it 3").quantity).toBe(3);
    expect(ent("ප්‍රමාණය 2 කරන්න").quantity).toBe(2);
    expect(ent("99 pcs").quantity).toBe(10); // capped at the per-line maximum
    expect(ent("Nova X1").quantity).toBeUndefined();
  });

  it("reads sort and sale hints", () => {
    expect(ent("cheapest phone").sort).toBe("price-asc");
    expect(ent("ලාභම phone එක").sort).toBe("price-asc");
    expect(ent("අලුත්ම phone").sort).toBe("newest");
    expect(ent("වට්ටම් තියෙන phones").onSale).toBe(true);
    expect(ent("phones").onSale).toBeUndefined();
  });
});

describe("referents and order references", () => {
  it("detects 'this one' and 'these'", () => {
    expect(ent("මේක කොහොමද").referent).toBe("single");
    expect(ent("add this to my cart").referent).toBe("single");
    expect(ent("මේ දෙක compare කරන්න").referent).toBe("plural");
    expect(ent("compare these").referent).toBe("plural");
    expect(ent("show me phones").referent).toBeUndefined();
  });

  it("extracts a valid order reference only", () => {
    expect(ent("my order is vlk-261012-abcdefghjk").orderRef).toBe("VLK-261012-ABCDEFGHJK");
    expect(ent("my order is VLK-1-ABC").orderRef).toBeUndefined();
    expect(ent("order VLK-261012-ABCDEFGHIO").orderRef).toBeUndefined(); // I and O are not in the reference alphabet
  });
});
