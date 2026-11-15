import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { M8_DEV_SET } from "./dev-set";
import { formatReport, runAll, summarise } from "./evaluate";

/**
 * Manual recording of the M8 DEV result (an evaluation tool, skipped in the normal run). M8_OUT is the output file. DEV ONLY: this set is tuned on.
 */
it.runIf(process.env.M8_OUT)("records the M8 DEV result", async () => {
  const res = await runAll(M8_DEV_SET);
  const langs = ["si", "singlish", "en", "mixed"] as const;
  const lines = [`scenarios: ${M8_DEV_SET.length}  turns: ${res.length}`, "", "ALL", formatReport(summarise(res))];
  for (const l of langs) lines.push("", l, formatReport(summarise(res, (r) => r.lang === l)));
  lines.push("", "FAILURES");
  for (const r of res) if (Object.values(r.checks).some((v) => v === false)) lines.push(`${r.scenario}#${r.turn} ${JSON.stringify(r.say)}: ${r.failures.join(" | ")}`);
  writeFileSync(process.env.M8_OUT ?? "m8.txt", lines.join("\n"));
});
