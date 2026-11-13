import { mkdirSync, writeFileSync } from "node:fs";
import { allSinhalaTemplates } from "../../../src/router/templates";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEV } from "./dev";
import { HOLDOUT } from "./holdout";
import { evaluateSet, formatReport } from "./eval";
import { TEST } from "./test";

/**
 * M3-B benchmark on the fresh DEV and frozen TEST sets. Set M3B_REPORT_DIR=<dir> to write dev.json and test.json (used to record the
 * baseline before any router change, and the result after). These tests check the datasets' integrity, not accuracy thresholds:
 * accuracy is reported, and a regression guard for the older sets lives in the existing eval tests.
 */
describe("M3-B datasets", () => {
  it("are fresh: no message appears twice, in either set or across them", () => {
    const all = [...DEV, ...TEST, ...HOLDOUT].map((c) => c.text.trim().toLowerCase());
    expect(new Set(all).size).toBe(all.length);
    expect(new Set([...DEV, ...TEST, ...HOLDOUT].map((c) => c.id)).size).toBe(DEV.length + TEST.length + HOLDOUT.length);
  });

  it("cover every language group and scope label in both sets, with a similar spread", () => {
    for (const [name, set] of [["dev", DEV], ["test", TEST]] as const) {
      for (const g of ["si", "singlish", "en", "mixed"] as const) {
        const rows = set.filter((c) => c.group === g);
        expect(rows.length, `${name} ${g}`).toBeGreaterThanOrEqual(28);
        for (const w of ["search_products", "get_product_details", "compare_products", "check_stock", "get_accessories", "cart_add", "cart_remove", "cart_update_quantity", "cart_view", "order_status", "order_support", "checkout_handoff", "store_info", "website_policy", "smalltalk", "general", "external_site", "ambiguous"] as const) {
          expect(rows.some((c) => c.want === w), `${name} ${g} lacks ${w}`).toBe(true);
        }
      }
    }
  });

  it("uses Sinhala script where the group says so and Latin letters for Singlish and English", () => {
    const sinhala = /[඀-෿]/;
    for (const c of [...DEV, ...TEST, ...HOLDOUT]) {
      if (c.group === "si") {
        expect(sinhala.test(c.text), c.id).toBe(true);
        expect(/[a-zA-Z]{2,}/.test(c.text), `${c.id} has Latin words`).toBe(false);
      }
      if (c.group === "singlish" || c.group === "en") expect(sinhala.test(c.text), c.id).toBe(false);
      if (c.group === "mixed") expect(sinhala.test(c.text) && /[a-zA-Z]{2,}/.test(c.text), c.id).toBe(true);
    }
  });
});

describe("M3-B router measurement (deterministic router, mock vocabulary)", () => {
  const dev = evaluateSet("dev", DEV);
  const test = evaluateSet("test", TEST);
  const holdout = evaluateSet("holdout", HOLDOUT);

  it("reports both sets and writes JSON when asked", () => {
    console.log(`\n${formatReport(dev)}\n\n${formatReport(test)}\n`);
    const dir = process.env.M3B_REPORT_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "dev.json"), JSON.stringify({ ranAt: new Date().toISOString(), ...dev }, null, 2));
      writeFileSync(join(dir, "test.json"), JSON.stringify({ ranAt: new Date().toISOString(), ...test }, null, 2));
      writeFileSync(join(dir, "holdout.json"), JSON.stringify({ ranAt: new Date().toISOString(), ...holdout }, null, 2));
    }
    expect(dev.n).toBe(DEV.length);
    expect(test.n).toBe(TEST.length);
  });
});

/**
 * Native-review pack. Set M3B_REVIEW_PACK_DIR=<dir> to write two CSV files for native Sinhala reviewers: every benchmark message with
 * blank review columns, and every Sinhala reply template. UTF-8 with a byte-order mark so spreadsheets open Sinhala correctly.
 * The messages are test text written by engineers, not customer messages.
 */
describe("native review pack", () => {
  const csvCell = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const row = (cells: string[]) => cells.map(csvCell).join(",");

  it("exports the benchmark messages and the Sinhala templates for review when asked", () => {
    const dir = process.env.M3B_REVIEW_PACK_DIR;
    const messages = [
      row(["id", "set", "language_group", "message", "expected_label", "style", "R1_is_natural (yes/no/awkward)", "R2_label_correct (yes/no)", "R3_better_label_if_no", "R4_more_natural_wording", "R5_notes"]),
      ...[["dev", DEV], ["test", TEST], ["holdout", HOLDOUT]].flatMap(([name, set]) => (set as typeof DEV).map((c) => row([c.id, name as string, c.group, c.text, c.want, c.style, "", "", "", "", ""]))),
    ];
    const templates = [row(["template_key", "english_source", "sinhala_text_to_review", "R1_correct_meaning (yes/no)", "R2_natural (yes/no/awkward)", "R3_polite_register (yes/no)", "R4_suggested_wording", "R5_notes"]),
      ...Object.entries(allSinhalaTemplates()).map(([k, si]) => row([k, "(see src/router/templates.ts)", si, "", "", "", "", ""]))];
    expect(messages.length).toBe(DEV.length + TEST.length + HOLDOUT.length + 1);
    expect(templates.length).toBeGreaterThan(20);
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "review-messages.csv"), "\uFEFF" + messages.join("\r\n"));
      writeFileSync(join(dir, "review-sinhala-templates.csv"), "\uFEFF" + templates.join("\r\n"));
    }
  });
});
