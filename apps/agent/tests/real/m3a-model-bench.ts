/**
 * Manual model benchmark (NOT part of the normal test run). Bundled with esbuild into ONE file and run with node on a machine that
 * already has the model. It only reads Ollama (/api/tags, /api/ps) and sends chat requests to a LOOPBACK Ollama, and it only reads
 * /proc for memory, load and CPU. It never pulls or deletes a model, never changes configuration, and writes only the report file.
 *
 * Safety rules built in (see docs/AI_MODEL_BENCHMARK_RUNBOOK.md):
 *  - it REFUSES to run if another model is loaded (it would evict the live one) or if nothing is loaded (it would trigger a cold load);
 *  - it checks free memory and load before every request and stops cleanly, keeping what it measured, if they cross the limits;
 *  - it pauses between requests so live traffic is served in the gaps, and sends the same request options as the live Agent.
 *
 * Usage: node m3a-model-bench.mjs --model <tag> [--ollama http://127.0.0.1:11434] [--set holdout|test|dev|m3a|all] [--limit N]
 *        [--pause-ms 3000] [--min-free-mb 400] [--max-load 3] [--max-seconds 1800] [--out report.json] [--dry-run] [--allow-cold-load]
 */
import { writeFileSync } from "node:fs";
import { BENCH_CASES } from "../bench/m3-dataset";
import { linuxProbe, runModelBench, BenchRefusal, type BenchRow } from "../bench/bench-core";
import { DEV } from "../bench/m3b/dev";
import { HOLDOUT } from "../bench/m3b/holdout";
import { TEST } from "../bench/m3b/test";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const num = (n: string, d?: number) => {
  const v = opt(n);
  return v === undefined ? d : Number(v);
};

const model = opt("model");
if (!model) {
  console.error("usage: m3a-model-bench --model <tag> [--ollama url] [--set holdout|test|dev|m3a|all] [--limit N] [--pause-ms N] [--min-free-mb N] [--max-load N] [--max-seconds N] [--out file] [--dry-run] [--allow-cold-load]");
  process.exit(2);
}

const SETS: Record<string, readonly BenchRow[]> = { holdout: HOLDOUT, test: TEST, dev: DEV, m3a: BENCH_CASES, all: [...HOLDOUT, ...TEST, ...DEV] };
const setName = opt("set", "holdout")!;
const cases = SETS[setName];
if (!cases) {
  console.error(`unknown --set "${setName}"`);
  process.exit(2);
}

try {
  const report = await runModelBench({
    baseUrl: opt("ollama", "http://127.0.0.1:11434")!,
    tag: model,
    cases,
    probe: linuxProbe,
    dryRun: flag("dry-run"),
    allowColdLoad: flag("allow-cold-load"),
    pauseMs: num("pause-ms", 3000)!,
    minFreeMb: num("min-free-mb", 400)!,
    maxLoad1: num("max-load", 3)!,
    ...(num("max-seconds") !== undefined ? { maxSeconds: num("max-seconds")! } : {}),
    ...(num("limit") !== undefined ? { limit: num("limit")! } : {}),
  });
  const out = opt("out");
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  const v = report.verification;
  console.log(`MODEL ${report.tag}  digest ${v.digest ?? "?"}  ${v.parameterSize ?? "?"} ${v.quantization ?? "?"}  installed size ${v.sizeMb ?? "?"} MB  loaded before: ${v.loadedBefore.join(", ") || "(none)"}`);
  console.log(`LICENCE ${report.licenseVerdict}   registry status ${report.registryStatus}   set "${setName}" (${report.totalCases} messages)${report.dryRun ? "   DRY RUN: nothing was sent to the model" : ""}`);
  if (!report.dryRun) {
    for (const [g, s] of Object.entries(report.perGroup)) console.log(`${g.padEnd(9)} tool choice ${s.toolCorrect}/${s.n} (${s.toolAccuracyPct ?? "n/a"}%)  false tool calls ${s.falseTool}  median ${s.medianMs ?? "n/a"} ms`);
    console.log(`overall   ${report.overall.toolAccuracyPct ?? "n/a"}%  false tool calls ${report.overall.falseTool}   completed ${report.completed}/${report.totalCases}  errors ${report.errors}${report.aborted ? `   STOPPED EARLY: ${report.aborted.reason}` : ""}`);
    console.log(`latency   first ${report.latencyMs.firstCall} ms   warm p50 ${report.latencyMs.warmP50} ms   p95 ${report.latencyMs.warmP95} ms   generation ${report.throughput.genTokensPerSecondMedian} tokens/s (median)`);
    const r = report.resources;
    console.log(`resources free MB before ${r.hostFreeMbBefore}, minimum ${r.hostFreeMbMin}; model resident ${r.modelResidentMbAfterFirstCall} MB; ollama processes max ${r.ollamaProcessesRssMbMax} MB; swap max ${r.swapUsedMbMax} MB; CPU busy median ${r.cpuBusyPctMedianPerRequest}% max ${r.cpuBusyPctMax}%; load1 max ${r.load1Max}; OOM kills ${r.oomKillsDuringRun}`);
  }
} catch (e) {
  if (e instanceof BenchRefusal) {
    console.error(`REFUSED (nothing was changed): ${e.message}`);
    process.exitCode = 3;
  }
  throw e;
}
