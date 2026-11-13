import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { accuracyByLanguage, evaluate, formatAccuracy } from "./evaluate";
import { DEV } from "./dev";
import { HOLDOUT } from "./holdout";

/**
 * Manual recording of a set's result (evaluation tool, skipped in the normal run). M4_OUT is the output file, M4_SET is "dev" or "holdout".
 * HOLDOUT is for evaluation only: never change the lexicon, rules or templates in response to what it shows.
 */
it.runIf(process.env.M4_OUT)("records a set's result", async () => {
  const set = process.env.M4_SET === "holdout" ? HOLDOUT : DEV;
  const res = await evaluate(set);
  const acc = accuracyByLanguage(res);
  const lines = [formatAccuracy(acc), "", ...res.filter((r) => !r.ok).map((r) => `MISS [${r.case.lang}] ${JSON.stringify(r.case.history ?? [])} ${JSON.stringify(r.case.text)} expected ${r.case.expected} got ${r.got}`)];
  writeFileSync(process.env.M4_OUT ?? "m4.txt", lines.join("\n"));
});
