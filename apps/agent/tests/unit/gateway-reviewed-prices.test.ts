import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { entryAt, findModelPrice, parsePriceTable } from "../../src/gateway/prices";

/**
 * The reviewed price file that the operator points GATEWAY_PRICE_TABLE_PATH at. Its numbers were read from Google's own plain-text pricing page on 2026-11-15.
 * These tests prove the file parses, covers the recommended models and keeps the known scheduled change; they cannot prove the page has not changed since.
 */
const FILE = path.resolve(__dirname, "../../../../tools/ops/prepared/gemini/price-table.reviewed.json");

describe("reviewed price table", () => {
  it("parses with the gateway's own validator", async () => {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as unknown;
    const t = parsePriceTable(raw);
    expect(t.currency).toBe("USD");
    expect(t.version).toBe("official-2026-11-15");
  });

  it("holds the recommended cheap chat model at the officially listed price, marked verified with its date and source", async () => {
    const t = parsePriceTable(JSON.parse(await fs.readFile(FILE, "utf8")));
    const m = findModelPrice(t, "gemini-3.5-flash-lite")!;
    expect(m.verified).toBe(true);
    expect(m.verifiedAt).toBe("2026-11-15");
    expect(m.source).toMatch(/aistudio\.google\.com\/docs\/pricing/);
    const e = entryAt(m, new Date("2026-11-20T00:00:00Z"));
    expect(e.inputPerM).toBe(0.3);
    expect(e.outputPerM).toBe(2.5);
  });

  it("keeps the announced doubling of gemini-3.8-flash on 2027-01-01", async () => {
    const t = parsePriceTable(JSON.parse(await fs.readFile(FILE, "utf8")));
    const m = findModelPrice(t, "gemini-3.8-flash")!;
    expect(entryAt(m, new Date("2026-12-31T00:00:00Z")).outputPerM).toBe(3.75);
    expect(entryAt(m, new Date("2027-01-02T00:00:00Z")).outputPerM).toBe(7.5);
  });

  it("contains only models that are covered by the file (no unknown model can be spent on)", async () => {
    const t = parsePriceTable(JSON.parse(await fs.readFile(FILE, "utf8")));
    expect(t.models.map((m) => m.model).sort()).toEqual(["gemini-3.5-flash-lite", "gemini-3.8-flash"]);
    expect(t.models.every((m) => m.verified)).toBe(true);
  });

  it("contains no secret-looking text", async () => {
    const text = await fs.readFile(FILE, "utf8");
    expect(text).not.toMatch(/AIza|AQ\.[A-Za-z0-9]|sk-[A-Za-z0-9]{20}|BEGIN [A-Z ]*PRIVATE KEY/);
  });
});
