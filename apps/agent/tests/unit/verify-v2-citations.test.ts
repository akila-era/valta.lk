import { describe, expect, it } from "vitest";
import { findUrls, verifyAnswerV2 } from "../../src/verify/v2";
import { LUMEN, SRC_ANDROID, SRC_URL, has, input } from "./verify-v2-fixtures";

const searched = { searchPerformed: true, toolEvidence: [SRC_ANDROID], sourcesFetchedThisTurn: [{ url: SRC_URL, title: "Android 16 release notes" }] };
const v = (answerText: string, over: Parameters<typeof input>[0] extends infer T ? Partial<T> : never = {}) => verifyAnswerV2(input({ answerText, ...searched, ...over }));

describe("(d) links and citations", () => {
  it("finds full and bare URLs and normalises them", () => {
    const f = findUrls("See https://developer.android.com/about/versions/16/. Also www.example.com/path and android.com.");
    expect(f.map((x) => x.key)).toEqual(["developer.android.com/about/versions/16", "example.com/path", "android.com"]);
  });
  it("accepts a cited, fetched source in several spellings", () => {
    expect(v("Android version 16.2 is the current stable release [1]. Source: https://developer.android.com/about/versions/16").ok).toBe(true);
    expect(v("The current stable release is version 16.2 (https://developer.android.com/about/versions/16/).").ok).toBe(true);
    expect(v("The current stable release is version 16.2 (https://www.developer.android.com/about/versions/16?utm_source=x#top).").ok).toBe(true);
  });
  it("accepts the shop's own product link and a link from the evidence", () => {
    expect(verifyAnswerV2(input({ answerText: "See https://valta.hexalyte.com/products/lumen-p1 for the Lumen P1.", toolEvidence: [LUMEN] })).ok).toBe(true);
  });
  it("a made-up source next to a real search is a fabricated source (fail)", () => {
    const r = v("Android version 16.2 is current [1]. More at https://android-updates-now.example/16");
    expect(has(r, "fabricated_source")).toBe(true);
    expect(r.verdict).toBe("fail");
  });
  it("a different path on a fetched host is only an unsourced link (repairable and auto-fixable)", () => {
    const r = v("Version 16.2 is current [1]. Details at https://developer.android.com/other/page");
    expect(has(r, "unsourced_link")).toBe(true);
    expect(r.verdict).toBe("repairable");
    expect(r.repairs[0]?.kind).toBe("autofix");
    const fix = r.repairs[0] as { text: string };
    expect(fix.text).not.toContain("other/page");
    expect(fix.text).toContain("[1]");
  });
  it("a model-knowledge link without any search is unsourced, not fabricated", () => {
    const r = verifyAnswerV2(input({ answerText: "You can read more at https://www.python.org/doc/." }));
    expect(has(r, "unsourced_link")).toBe(true);
    expect(has(r, "fabricated_source")).toBe(false);
  });
  it("flags a citation marker that points at nothing", () => {
    expect(has(v("Version 16.2 is current [2]."), "citation_invalid")).toBe(true);
    expect(has(verifyAnswerV2(input({ answerText: "It is true [1]." })), "citation_invalid")).toBe(true);
    expect(has(verifyAnswerV2(input({ answerText: "Here is the answer.\nSource: the internet" })), "citation_invalid")).toBe(true);
  });
  it("flags 'I searched' without a search, in English, Singlish and Sinhala", () => {
    for (const t of ["I searched the web and found the answer is 42.", "I just googled it and the answer is 42.", "Mama search karala baladdi eka 42 kiyala hambuna.", "මම සොයා බැලුවා, පිළිතුර 42 යි."]) {
      expect(has(verifyAnswerV2(input({ answerText: t })), "search_claimed_without_search"), t).toBe(true);
    }
  });
  it("accepts 'I searched' when a search really ran with results; flags it when it returned nothing", () => {
    expect(v("I searched and found that version 16.2 is the current stable release [1].").ok).toBe(true);
    expect(has(verifyAnswerV2(input({ answerText: "I searched the web but found nothing useful.", searchPerformed: true })), "search_claimed_without_search")).toBe(true);
  });
  it("does not flag talking about search in general, or not claiming a search", () => {
    expect(verifyAnswerV2(input({ answerText: "You could search the web for the official release notes." })).ok).toBe(true);
    expect(verifyAnswerV2(input({ answerText: "Python is a programming language created by Guido van Rossum." })).ok).toBe(true);
  });
  it("requires a citation when the answer uses fetched content, but not for an unrelated answer", () => {
    expect(has(v("Android version 16.2 was released on 2026-03-02 and is the current stable release for supported Pixel devices."), "citation_missing")).toBe(true);
    expect(v("A processor executes instructions one after another, very quickly.").ok).toBe(true);
  });
  it("a cited sentence unsupported by its source is only a warning", () => {
    const r = v("Bananas contain lots of potassium and are grown across tropical regions worldwide [1].");
    expect(has(r, "citation_unsupported")).toBe(true);
    expect(r.issues.find((i) => i.code === "citation_unsupported")!.severity).toBe("warn");
  });
  it("can switch the citation requirement off by policy", () => {
    expect(has(v("Android version 16.2 was released on 2026-03-02 and is the current stable release for supported Pixel devices.", { policy: { requireCitationsWhenSearched: false } }), "citation_missing")).toBe(false);
  });
});
