import { describe, expect, it } from "vitest";
import { parseAmounts, toPriceBounds } from "../../src/router/amounts";
import { normalizeMatch } from "../../src/router/normalize";

const read = (s: string) => parseAmounts(normalizeMatch(s));
const bounds = (s: string) => toPriceBounds(read(s).amounts);

describe("parseAmounts", () => {
  it("reads plain, comma and currency-marked amounts", () => {
    expect(read("under 150000 rupees").amounts[0]?.value).toBe(150000);
    expect(read("rs. 150,000").amounts[0]?.value).toBe(150000);
    expect(read("රුපියල් 100,000ට අඩු").amounts[0]?.value).toBe(100000);
    expect(read("lkr 80000").amounts[0]?.value).toBe(80000);
  });

  it("reads k and lakh suffixes", () => {
    expect(read("100k").amounts[0]?.value).toBe(100000);
    expect(read("90k wage").amounts[0]?.value).toBe(90000);
    expect(read("1.5 lakh").amounts[0]?.value).toBe(150000);
    expect(read("2 lakhs").amounts[0]?.value).toBe(200000);
    expect(read("tablet එකක් ඕන, රුපියල් ලක්ෂයක් විතර").amounts[0]?.value).toBe(100000);
  });

  it("tolerates the Singlish trailing i and a Sinhala suffix glued to the number", () => {
    expect(read("budget eka 80000i").amounts[0]?.value).toBe(80000);
    expect(read("150000ට අඩු").amounts[0]?.value).toBe(150000);
    expect(read("70000ක් විතර").amounts[0]?.value).toBe(70000);
  });

  it("never reads model numbers, units, phone numbers or order references as prices", () => {
    for (const s of ["iPhone 15", "Redmi Note 13", "8gb ram 128 gb", "5000mah battery", "6.7 inch screen", "call 0771234567", "order VLK-261012-ABCDEFGHJK", "2 pcs", "Volt 20W charger", "Orbit Tablet 10"]) {
      expect(read(s).amounts, s).toEqual([]);
    }
  });

  it("ignores absurd values", () => {
    expect(read("999999999999").amounts).toEqual([]);
    expect(read("rs 0").amounts).toEqual([]);
  });

  it("assigns roles from the words around the amount", () => {
    expect(read("under 150000").amounts[0]?.role).toBe("max");
    expect(read("150000ට අඩු").amounts[0]?.role).toBe("max");
    expect(read("above 50000").amounts[0]?.role).toBe("min");
    expect(read("50000ට වැඩි").amounts[0]?.role).toBe("min");
    expect(read("around 80000").amounts[0]?.role).toBe("around");
    expect(read("70000ක් විතර").amounts[0]?.role).toBe("around");
  });

  it("reads a range as min and max", () => {
    const r = read("between 50000 and 90000");
    expect(r.amounts.map((a) => [a.value, a.role])).toEqual([[50000, "min"], [90000, "max"]]);
    expect(bounds("between 90000 and 50000")).toEqual({ minPriceLkr: 50000, maxPriceLkr: 90000 });
  });

  it("asks (unparsedCue) when a budget or a spoken number is present but unreadable", () => {
    expect(read("budget eka hondai").unparsedCue).toBe(true);
    expect(read("හැට දාහකට වඩා අඩු").unparsedCue).toBe(true);
    expect(read("fifty thousand rupees").unparsedCue).toBe(true); // number WORDS are not parsed: ask, do not guess
    expect(read("fifty thousand rupees").amounts).toEqual([]); // and no amount is invented
    expect(read("show me phones").unparsedCue).toBe(false);
  });
});

describe("toPriceBounds", () => {
  it("reads a lone amount as a ceiling, never a floor", () => {
    expect(bounds("budget eka 80000")).toEqual({ maxPriceLkr: 80000 });
  });
  it("uses the explicit role when there is one", () => {
    expect(bounds("above 50000")).toEqual({ minPriceLkr: 50000 });
    expect(bounds("under 150000")).toEqual({ maxPriceLkr: 150000 });
  });
  it("returns nothing when there is no amount", () => {
    expect(bounds("show me phones")).toEqual({});
  });
});
