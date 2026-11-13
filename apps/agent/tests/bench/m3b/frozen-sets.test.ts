import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Freeze guard. TEST and HOLDOUT are frozen: they are evaluation sets, never tuning data. This test fails if either file changes, so a
 * change cannot happen by accident. A deliberate change (for example fixing a label after native review) must update
 * frozen-hashes.json IN THE SAME COMMIT, with the reason written in the commit message, and every earlier result stays as recorded.
 * Hashes are taken over the file text with line endings normalised to LF, so they are the same on Windows and Linux.
 */
const here = join(__dirname);
const hashOf = (file: string) => createHash("sha256").update(readFileSync(join(here, file), "utf8").replace(/\r\n/g, "\n")).digest("hex");
const recorded = JSON.parse(readFileSync(join(here, "frozen-hashes.json"), "utf8")) as { files: Record<string, string>; recordedOn: string; note: string };

describe("frozen evaluation sets", () => {
  it.each(Object.keys(recorded.files))("%s has not changed since it was frozen", (file) => {
    expect(hashOf(file), `${file} changed: it is frozen. Update frozen-hashes.json only for a deliberate, documented correction.`).toBe(recorded.files[file]);
  });

  it("records both frozen sets and says when and why", () => {
    expect(Object.keys(recorded.files).sort()).toEqual(["holdout.ts", "test.ts"]);
    expect(recorded.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(recorded.note).toContain("never");
  });
});
