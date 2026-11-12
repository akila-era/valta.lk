import { describe, expect, it } from "vitest";
import type { RouteContext } from "../../src/router/types";
import { checkSafety } from "../../src/router/safety";
import { route } from "./harness";
import { ENGLISH_CASES } from "./english-prompts";

/**
 * Informational: how the DETERMINISTIC router does on the same 100 English prompts that were used to measure Qwen3 1.7B tool
 * selection (see the M1-B report for the Qwen numbers). The router was developed on Sinhala/Singlish/mixed sets, and these
 * prompts were written before it was ever run on them, but the author is the same person, so this is not independent either.
 */
function check(c: (typeof ENGLISH_CASES)[number]) {
  const ctx: RouteContext = {
    ...(c.page ? { contextProductId: c.page } : {}),
    lastShownProductIds: [],
    cart: Array.from({ length: c.cartCount ?? 0 }, (_, i) => ({ productId: `cm0item${String(8 + i).padStart(8, "0")}`, variantKey: "", quantity: 1 })),
  };
  const d = route(c.text, ctx);
  const got = d.calls[0];
  const tool = got ? got.name : "none";
  return { d, tool };
}

describe("deterministic router on the English prompts (informational)", () => {
  it("prints per-tag results and checks nothing dangerous is produced", () => {
    let pass = 0;
    const byTag: Record<string, { n: number; ok: number }> = {};
    const wrongWrite: string[] = [];
    for (const c of ENGLISH_CASES) {
      const { tool, d } = check(c);
      const ok = tool === c.expect.tool || (c.expect.alsoOk ?? []).includes(tool);
      const bucket = (byTag[c.tag] ??= { n: 0, ok: 0 });
      bucket.n++;
      if (ok) {
        bucket.ok++;
        pass++;
      }
      // A write-like cart proposal or a hand-off must never appear for a prompt that expected none or a read.
      if (!ok && /^(add_to_cart|update_cart_quantity|remove_from_cart)$/.test(tool)) wrongWrite.push(`${c.text} -> ${tool}`);
      void d;
    }
    console.log(`router on 100 English prompts: tool correct (incl. acceptable alternatives) ${pass}/100`);
    console.log("by tag: " + Object.entries(byTag).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join("  "));
    console.log("wrong cart proposals: " + JSON.stringify(wrongWrite));
    expect(ENGLISH_CASES).toHaveLength(100);
    expect(wrongWrite).toEqual([]);
  });

  it("blocks the injection prompts in the safety pre-filter, or plans only harmless read tools", () => {
    let blocked = 0;
    for (const c of ENGLISH_CASES.filter((c) => c.tag === "injection")) {
      if (checkSafety(c.text).blocked) {
        blocked++;
        continue;
      }
      const { d } = check(c);
      expect(d.calls.every((x) => x.name === "search_products" || x.name === "get_product_details"), c.text).toBe(true);
    }
    console.log(`injection prompts stopped by the safety pre-filter before any router or model: ${blocked}/8`);
    expect(blocked).toBeGreaterThanOrEqual(5);
  });
});
