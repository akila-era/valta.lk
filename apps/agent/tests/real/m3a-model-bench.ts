/**
 * Manual model benchmark entry (NOT part of the normal test run). Bundle it with esbuild into one file, copy it to a machine that
 * already has the model, and run: node m3a-model-bench.mjs <ollama-url> <model-tag> [report.json]
 * It only reads (/api/tags, /api/ps) and sends chat requests to a loopback Ollama. It never pulls a model, changes configuration or
 * writes anywhere except the report path. Do not run it on the production AI server without the owner's approval: loading another
 * model evicts the live one for tens of seconds.
 */
import { writeFileSync } from "node:fs";
import { readLinuxFreeMb, runModelBench } from "../bench/bench-core";

const [url, tag, out] = process.argv.slice(2);
if (!url || !tag) {
  console.error("usage: m3a-model-bench <ollama-url> <model-tag> [report.json]");
  process.exit(2);
}
const report = await runModelBench({ baseUrl: url, tag, readHostFreeMb: readLinuxFreeMb });
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
for (const [g, s] of Object.entries(report.perGroup)) console.log(`${g.padEnd(9)} tool ${s.toolCorrect}/${s.n} (${s.toolAccuracyPct}%)  false tool ${s.falseTool}`);
console.log(`first call ${report.latencyMs.firstCall} ms, warm p50 ${report.latencyMs.warmP50} ms, p95 ${report.latencyMs.warmP95} ms, resident ${report.memory.modelResidentMbAfterFirstCall} MB, host free ${report.memory.hostFreeMbBefore} -> ${report.memory.hostFreeMbAfter} MB, errors ${report.errors}`);
