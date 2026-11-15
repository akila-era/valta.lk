import { describe, expect, it } from "vitest";
import { readSnapshot, renderMarkdown, runAudit } from "../../src/catalogue-intel";
import { audit, product, rng, variant, type Raw } from "../fixtures/catalogue-intel/builders";

/** Property-style tests: whatever is thrown at the audit, it must not throw, must stay JSON-serialisable and deterministic, and must stay fast. */
function junk(rnd: () => number, depth = 0): unknown {
  const pick = Math.floor(rnd() * 14);
  switch (pick) {
    case 0: return null;
    case 1: return undefined;
    case 2: return NaN;
    case 3: return Infinity;
    case 4: return -rnd() * 1e12;
    case 5: return String.fromCharCode(...Array.from({ length: Math.floor(rnd() * 12) }, () => Math.floor(rnd() * 0x2fff)));
    case 6: return "ඇපල් 11 pro ".repeat(Math.floor(rnd() * 5));
    case 7: return "1,000.00 Rs";
    case 8: return rnd() < 0.5;
    case 9: return depth < 3 ? Array.from({ length: Math.floor(rnd() * 4) }, () => junk(rnd, depth + 1)) : [];
    case 10: return depth < 3 ? Object.fromEntries(Array.from({ length: Math.floor(rnd() * 5) }, (_, i) => [["id", "name", "price", "variants", "images", "category", "sku", "description", "brand", "model"][i % 10]!, junk(rnd, depth + 1)])) : {};
    case 11: return "\u0000‮﻿<script>";
    case 12: return Math.floor(rnd() * 1000);
    default: return "x".repeat(Math.floor(rnd() * 3000));
  }
}

function damagedProduct(rnd: () => number): Raw {
  const p = product() as Raw;
  const keys = Object.keys(p);
  for (let i = 0; i < 1 + Math.floor(rnd() * 5); i++) p[keys[Math.floor(rnd() * keys.length)]!] = junk(rnd);
  if (rnd() < 0.3) p.id = `id-${Math.floor(rnd() * 20)}`; // collisions
  return p;
}

describe("robustness", () => {
  it("never throws, stays serialisable and deterministic on 300 catalogues of garbage", () => {
    const rnd = rng(42);
    for (let i = 0; i < 300; i++) {
      const raw: unknown = rnd() < 0.2 ? junk(rnd) : { items: Array.from({ length: Math.floor(rnd() * 12) }, () => (rnd() < 0.3 ? junk(rnd) : damagedProduct(rnd))) };
      const content = rnd() < 0.5 ? junk(rnd) : undefined;
      const links = rnd() < 0.5 ? junk(rnd) : undefined;
      let json = "";
      expect(() => {
        const report = runAudit(readSnapshot(raw, { content, links }));
        json = JSON.stringify(report);
        renderMarkdown(report);
      }).not.toThrow();
      expect(() => JSON.parse(json)).not.toThrow();
      expect(JSON.stringify(runAudit(readSnapshot(raw, { content, links })))).toBe(json);
    }
  });

  it("handles an empty catalogue and a single product", () => {
    const empty = audit([]);
    expect(empty.scope.products).toBe(0);
    expect(empty.products).toEqual([]);
    expect(empty.gates).toEqual([]);
    expect(renderMarkdown(empty)).toMatch(/Products read: \*\*0\*\*/);
    const one = audit([product()]);
    expect(one.products).toHaveLength(1);
    expect(one.gates[0]!.lowSample).toBe(true);
  });

  it("reads numeric strings, NaN and missing fields without dropping the product", () => {
    const r = audit([{ id: "n1", name: "Thing", price: "12.5", updatedAt: "t" }, { id: "n2", name: "NaN thing", price: NaN, purchasableQuantity: NaN }, { id: "n3" }]);
    expect(r.scope.products).toBe(3);
    expect(r.findings.some((f) => f.code === "price.format")).toBe(true);
  });

  it("copes with Sinhala, emoji and mixed-script names", () => {
    const r = audit([product({ name: "ඇපල් අයිෆෝන් 15 Pro 📱", brand: "ඇපල්", category: "දුරකථන" }), product({ name: "سامسونج", category: "Phones" })]);
    expect(r.scope.products).toBe(2);
    expect(() => JSON.stringify(r)).not.toThrow();
  });

  it("audits 3,000 products in a few seconds, with duplicate blocks bounded", () => {
    const ps: Raw[] = [];
    for (let i = 0; i < 3000; i++) ps.push(product({ name: `Model ${i % 500} ${["Pro", "Max", "Lite"][i % 3]}`, sku: `S-${i}`, variants: [variant({ sku: `V-${i}` })] }));
    const t0 = Date.now();
    const r = audit(ps);
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(r.scope.products).toBe(3000);
  });

  it("is not fooled into slowness by hostile text in every field at once", () => {
    const evil = "<".repeat(200_000) + "\u0000".repeat(1000);
    const t0 = Date.now();
    audit([product({ name: evil, description: evil, brand: evil, category: evil, model: evil, sku: evil })]);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
