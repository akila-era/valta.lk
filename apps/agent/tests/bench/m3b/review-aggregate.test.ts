import { describe, expect, it } from "vitest";
import { adjudicationCsv, aggregate, cohenKappa, parseCsv, parseReviewFile, type Reviewer } from "./review-aggregate";

/** SYNTHETIC reviewers only: these tests prove the scoring tool, not any language quality. */
const HEAD = '"id","set","language_group","message","expected_label","style","R1_is_natural (yes/no/awkward)","R2_label_correct (yes/no)","R3_better_label_if_no","R4_more_natural_wording","R5_notes"';
const csv = (rows: string[][]) => "﻿" + [HEAD, ...rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(","))].join("\r\n");
const row = (id: string, group: string, natural: string, correct: string, better = "", wording = ""): string[] => [id, "dev", group, `msg ${id}, with "quotes" and, commas`, "search_products", "plain", natural, correct, better, wording, ""];
const reviewer = (id: string, rows: string[][]): Reviewer => ({ id, rows: parseReviewFile(csv(rows)) });

describe("csv and review file parsing", () => {
  it("handles a byte-order mark, quotes, commas, doubled quotes and CRLF", () => {
    const rows = parseCsv('﻿"a","b,c","say ""hi"""\r\n"1","2","3"\r\n');
    expect(rows).toEqual([["a", "b,c", 'say "hi"'], ["1", "2", "3"]]);
  });

  it("reads a review file, normalising answers, and rejects a file with missing columns", () => {
    const r = parseReviewFile(csv([row("x1", "si", " YES ", "No", "general", "better words")]));
    expect(r[0]).toMatchObject({ id: "x1", group: "si", natural: "yes", labelCorrect: "no", betterLabel: "general", betterWording: "better words" });
    expect(r[0]!.message).toBe('msg x1, with "quotes" and, commas');
    expect(() => parseReviewFile('"id","message"\n"1","x"')).toThrow(/missing/);
  });
});

describe("agreement", () => {
  it("kappa is 1 for perfect agreement, about 0 for chance-level and undefined with no data", () => {
    expect(cohenKappa(["yes", "no", "yes", "no"], ["yes", "no", "yes", "no"])).toBe(1);
    expect(cohenKappa(["yes", "yes", "no", "no"], ["yes", "no", "yes", "no"])).toBe(0);
    expect(cohenKappa([], [])).toBeNull();
    expect(cohenKappa(["yes", "yes"], ["yes", "yes"])).toBe(1);
    expect(cohenKappa(["yes", ""], ["", "yes"])).toBeNull(); // no item answered by both
  });

  it("scores two reviewers, per language group, and lists exactly the rows that need adjudication", () => {
    const A = reviewer("rev_a", [row("1", "si", "yes", "yes"), row("2", "si", "awkward", "yes"), row("3", "mixed", "yes", "no", "general"), row("4", "mixed", "yes", "yes"), row("5", "en", "yes", "yes")]);
    const B = reviewer("rev_b", [row("1", "si", "yes", "yes"), row("2", "si", "yes", "yes"), row("3", "mixed", "yes", "no", "general"), row("4", "mixed", "no", "yes"), row("5", "en", "yes", "no")]);
    const r = aggregate([A, B]);
    expect(r.items).toBe(5);
    expect(r.itemsAllAnswered).toBe(5);
    expect(r.perGroup.si).toMatchObject({ answers: 4, naturalYesPct: 75, naturalAwkwardPct: 25 });
    expect(r.perGroup.mixed!.labelChallengedPct).toBe(50);
    const byId = Object.fromEntries(r.adjudication.map((a) => [a.id, a.reason]));
    expect(byId).toEqual({ "2": "disagree_on_naturalness", "3": "label_challenged", "4": "disagree_on_naturalness", "5": "disagree_on_label" });
    expect(r.criteria.atLeastTwoReviewers).toBe(true);
    expect(r.agreement.labelCorrect.pairs).toHaveLength(1);
  });

  it("applies the acceptance criteria: two reviewers, kappa at least 0.7 and every item answered", () => {
    const same = [row("1", "si", "yes", "yes"), row("2", "si", "yes", "no"), row("3", "en", "yes", "yes"), row("4", "en", "yes", "no")];
    const good = aggregate([reviewer("a", same), reviewer("b", same)]);
    expect(good.criteria).toEqual({ atLeastTwoReviewers: true, kappaAtLeast0_7: true, allItemsAnswered: true });
    const bad = aggregate([reviewer("a", same), reviewer("b", same.map((r, i) => (i % 2 ? r : [...r.slice(0, 7), r[7] === "yes" ? "no" : "yes", ...r.slice(8)])))]);
    expect(bad.criteria.kappaAtLeast0_7).toBe(false);
    const one = aggregate([reviewer("a", same)]);
    expect(one.criteria.atLeastTwoReviewers).toBe(false);
    const blank = aggregate([reviewer("a", [row("1", "si", "", "")]), reviewer("b", [row("1", "si", "", "")])]);
    expect(blank.criteria.allItemsAnswered).toBe(false);
  });

  it("writes an adjudication sheet with every reviewer's answers and blank final columns, in a spreadsheet-safe encoding", () => {
    const r = aggregate([reviewer("rev_a", [row("1", "si", "yes", "yes")]), reviewer("rev_b", [row("1", "si", "no", "yes", "", "better")])]);
    const out = adjudicationCsv(r);
    expect(out.startsWith("﻿")).toBe(true);
    const parsed = parseCsv(out);
    expect(parsed[0]).toContain("rev_b_better_wording");
    expect(parsed[0]!.slice(-3)).toEqual(["FINAL_label", "FINAL_wording", "adjudicator_notes"]);
    expect(parsed[1]).toContain("better");
  });
});
