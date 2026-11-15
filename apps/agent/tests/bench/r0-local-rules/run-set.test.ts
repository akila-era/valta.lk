import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { R0_DEV_SET } from "./dev-set";
import { formatReport, runAll, summarise } from "./evaluate";

/**
 * Manual recording of the R0 DEV result (an evaluation tool, skipped in the normal run). R0_OUT is the output file. DEV ONLY: this set is tuned on.
 */
it.runIf(process.env.R0_OUT)("records the R0 DEV result", async () => {
  const res = await runAll(R0_DEV_SET);
  const lines = [`scenarios: ${R0_DEV_SET.length}  turns: ${res.length}`, "", "ALL", formatReport(summarise(res))];
  for (const l of ["si", "singlish", "en", "mixed"]) lines.push("", l, formatReport(summarise(res, (r) => r.lang === l)));
  lines.push("", "FAILURES");
  for (const r of res) if (Object.values(r.checks).some((v) => v === false)) lines.push(`${r.scenario}#${r.turn} ${JSON.stringify(r.say)}: ${r.failures.join(" | ")}`);
  writeFileSync(process.env.R0_OUT ?? "r0.txt", lines.join("\n"));
});
