import { describe, expect, it } from "vitest";
import { isSinhalaProductionReady, LEXICON_META } from "../../src/router/lexicon/meta";
import { allSinhalaTemplates, renderTemplate, TEMPLATE_KEYS } from "../../src/router/templates";
import { hasSinhala } from "../../src/util/script";

describe("templates carry no facts", () => {
  for (const key of TEMPLATE_KEYS) {
    for (const lang of ["en", "si"] as const) {
      it(`${key} (${lang}) has no prices, digits, currency, links or product names`, () => {
        const { text } = renderTemplate(key, lang);
        expect(text.length).toBeGreaterThan(10);
        expect(text).not.toMatch(/\d/); // no numbers at all: not a price, stock level, warranty period or delivery charge
        expect(text).not.toMatch(/[%$₨]|\bRs\b|\bLKR\b|රු\./i);
        expect(text).not.toMatch(/https?:|www\./i);
        expect(text).not.toMatch(/\b(Nova|Orbit|Pulse|Volt|Glide|Atlas|Echo|Samsung|iPhone|Apple)\b/);
      });
    }
  }

});

describe("Sinhala templates are provisional and flagged", () => {
  it("every Sinhala template contains Sinhala script, and renders as sinhala", () => {
    for (const key of TEMPLATE_KEYS) {
      const r = renderTemplate(key, "si");
      expect(hasSinhala(r.text), key).toBe(true);
      expect(r.sinhala, key).toBe(true);
    }
  });

  it("English templates contain no Sinhala script", () => {
    for (const key of TEMPLATE_KEYS) expect(renderTemplate(key, "en").sinhala, key).toBe(false);
  });

  it("states that Sinhala is NOT production-ready, and that the lexicon is unreviewed", () => {
    expect(isSinhalaProductionReady()).toBe(false);
    expect(LEXICON_META).toMatchObject({ needsNativeReview: true, nativeReviewedBy: null, reviewedAt: null, authoredBy: "engineer" });
  });

  it("exposes the full list of Sinhala strings for the native reviewers", () => {
    const all = allSinhalaTemplates();
    expect(Object.keys(all).sort()).toEqual([...TEMPLATE_KEYS].sort());
    expect(new Set(Object.values(all)).size).toBe(Object.values(all).length); // no accidental duplicates
  });

  it("never marks a refusal, hand-off or error text as polishable (only fact-free conversational texts are)", () => {
    for (const key of TEMPLATE_KEYS) {
      if (/^(refuse_|order_|checkout_|tool_|store_info|tools_|busy_)/.test(key)) expect(renderTemplate(key, "si").polishable, key).toBe(false);
    }
  });
});
