import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { DEV_SET } from "./dev-set";
import { EVAL } from "./eval-set";
import { formatReport, runAll, summarise } from "./evaluate";

/**
 * Manual recording of a set's result (evaluation tool, skipped in the normal run). M5_OUT is the output file, M5_SET is "dev" or "eval".
 * EVAL is for evaluation only: never change the layer, its rules or its templates in response to what it shows.
 */
it.runIf(process.env.M5_OUT)("records a set's result", async () => {
  const set = process.env.M5_SET === "eval" ? EVAL : DEV_SET;
  const res = await runAll(set);
  const langs = ["si", "singlish", "en", "mixed"] as const;
  const lines = [`scenarios: ${set.length}  turns: ${res.length}`, "", "ALL", formatReport(summarise(res))];
  for (const l of langs) lines.push("", l, formatReport(summarise(res, (r) => r.lang === l)));
  lines.push("", "FAILURES");
  for (const r of res) if (Object.values(r.checks).some((v) => v === false)) lines.push(`${r.scenario}#${r.turn} ${JSON.stringify(r.say)}: ${r.failures.join(" | ")}`);
  writeFileSync(process.env.M5_OUT ?? "m5.txt", lines.join("\n"));
});
