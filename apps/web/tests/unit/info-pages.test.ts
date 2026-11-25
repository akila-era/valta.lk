import { describe, expect, it } from "vitest";
import { PAGES, pageSchema } from "@/lib/info-pages";

describe("info page defaults", () => {
  it("has unique slugs and paths", () => {
    expect(new Set(PAGES.map((p) => p.slug)).size).toBe(PAGES.length);
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length);
  });

  it.each(PAGES.map((p) => [p.slug, p] as const))("%s default text can be saved unchanged", (_slug, p) => {
    expect(pageSchema.safeParse(p.defaults).success).toBe(true);
  });

  it("rejects empty headings, empty text and too many sections", () => {
    expect(pageSchema.safeParse({ title: "Page", intro: "", sections: [{ heading: "", body: "x" }] }).success).toBe(false);
    expect(pageSchema.safeParse({ title: "Page", intro: "", sections: [{ heading: "H", body: "" }] }).success).toBe(false);
    expect(pageSchema.safeParse({ title: "Page", intro: "", sections: Array.from({ length: 15 }, () => ({ heading: "H", body: "b" })) }).success).toBe(false);
  });

  it("never links the defaults to anything but this site or https", () => {
    const links = PAGES.flatMap((p) => p.defaults.sections.flatMap((s) => [...s.body.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])));
    for (const l of links) expect(l.startsWith("/") || l.startsWith("https://")).toBe(true);
  });
});
