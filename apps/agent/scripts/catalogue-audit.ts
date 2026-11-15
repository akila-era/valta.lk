import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readSnapshot, renderMarkdown, runAudit, SEVERITY_RANK, type Severity } from "../src/catalogue-intel";

/**
 * Read-only catalogue audit.
 *   catalogue-audit <snapshot.json> [--content rows.json] [--links links.json] [--out DIR] [--format json|md|both]
 *                   [--min-sample N] [--currency LKR] [--fail-on high|medium|low] [--force]
 * Reads files you give it and writes report.json / report.md into --out. It never contacts a server, never writes to a catalogue, and refuses to
 * overwrite an existing report unless --force is given. Exit codes: 0 done, 1 findings at or above --fail-on, 2 usage or input error.
 */
export interface CliIO {
  readFile(path: string): string;
  size(path: string): number;
  exists(path: string): boolean;
  mkdir(path: string): void;
  writeFile(path: string, data: string): void;
  now(): string;
}

export const nodeIO: CliIO = {
  readFile: (p) => readFileSync(p, "utf8"),
  size: (p) => statSync(p).size,
  exists: (p) => existsSync(p),
  mkdir: (p) => void mkdirSync(p, { recursive: true }),
  writeFile: (p, d) => writeFileSync(p, d, { encoding: "utf8", flag: "wx" }),
  now: () => new Date().toISOString(),
};

const MAX_FILE_BYTES = 300_000_000;

export function run(argv: string[], io: CliIO, out: (s: string) => void, err: (s: string) => void): number {
  const args = [...argv];
  const opt: Record<string, string | boolean> = {};
  const positional: string[] = [];
  const valued = new Set(["--content", "--links", "--out", "--format", "--min-sample", "--currency", "--fail-on"]);
  while (args.length) {
    const a = args.shift()!;
    if (a === "--force") opt.force = true;
    else if (a === "--help" || a === "-h") opt.help = true;
    else if (valued.has(a)) {
      const v = args.shift();
      if (v === undefined || v.startsWith("--")) {
        err(`${a} needs a value.`);
        return 2;
      }
      opt[a.slice(2)] = v;
    } else if (a.startsWith("--")) {
      err(`Unknown option ${a}.`);
      return 2;
    } else positional.push(a);
  }
  if (opt.help || positional.length !== 1) {
    err("Usage: catalogue-audit <snapshot.json> [--content rows.json] [--links links.json] [--out DIR] [--format json|md|both] [--min-sample N] [--currency LKR] [--fail-on high|medium|low] [--force]");
    return opt.help ? 0 : 2;
  }
  const format = String(opt.format ?? "both");
  if (!["json", "md", "both"].includes(format)) {
    err("--format must be json, md or both.");
    return 2;
  }
  const failOn = opt["fail-on"] === undefined ? null : (String(opt["fail-on"]) as Severity);
  if (failOn !== null && !(failOn in SEVERITY_RANK)) {
    err("--fail-on must be high, medium, low or info.");
    return 2;
  }
  const minSample = opt["min-sample"] === undefined ? undefined : Number(opt["min-sample"]);
  if (minSample !== undefined && !(Number.isInteger(minSample) && minSample >= 3 && minSample <= 10_000)) {
    err("--min-sample must be a whole number from 3 to 10000.");
    return 2;
  }

  const load = (label: string, path: string): unknown => {
    if (!io.exists(path)) throw new Error(`${label} file not found: ${path}`);
    if (io.size(path) > MAX_FILE_BYTES) throw new Error(`${label} file is larger than ${MAX_FILE_BYTES} bytes.`);
    try {
      return JSON.parse(io.readFile(path));
    } catch {
      throw new Error(`${label} file is not valid JSON: ${path}`);
    }
  };
  let report;
  try {
    const snapshot = load("Snapshot", positional[0]!);
    const content = opt.content ? load("Content", String(opt.content)) : undefined;
    const links = opt.links ? load("Links", String(opt.links)) : undefined;
    const input = readSnapshot(snapshot, { content, links, ...(opt.currency ? { currency: String(opt.currency) } : {}) });
    if (input.products.length === 0 && input.invalid.length === 0) throw new Error("No products were found in the snapshot (expected an array, {items}, or {data:{items}}).");
    report = runAudit(input, minSample !== undefined ? { minSampleForOutliers: minSample } : {});
  } catch (e) {
    err(e instanceof Error ? e.message : "Unreadable input.");
    return 2;
  }

  const dir = resolve(String(opt.out ?? "catalogue-audit-out"));
  const targets: [string, string][] = [];
  if (format !== "md") targets.push([join(dir, "report.json"), `${JSON.stringify({ generatedAt: io.now(), ...report }, null, 2)}\n`]);
  if (format !== "json") targets.push([join(dir, "report.md"), renderMarkdown(report)]);
  if (!opt.force) {
    for (const [p] of targets)
      if (io.exists(p)) {
        err(`${p} already exists; pass --force to replace it. Nothing was written.`);
        return 2;
      }
  }
  try {
    io.mkdir(dir);
    for (const [p, data] of targets) {
      if (opt.force && io.exists(p)) throw new Error(`--force given but ${p} exists: delete it yourself first (this tool never deletes files).`);
      io.writeFile(p, data);
    }
  } catch (e) {
    err(e instanceof Error ? e.message : "Could not write the report.");
    return 2;
  }
  const s = report.summary;
  out(`Audited ${report.scope.products} products: ${s.findingsBySeverity.high} high, ${s.findingsBySeverity.medium} medium, ${s.findingsBySeverity.low} low, ${s.findingsBySeverity.info} info findings. Verdicts: ${s.verdicts.ready} ready, ${s.verdicts.limited} limited, ${s.verdicts.not_ready} not ready. Wrote ${targets.map(([p]) => p).join(", ")}.`);
  if (failOn !== null && report.findings.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[failOn])) return 1;
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.argv.slice(2), nodeIO, (s) => process.stdout.write(`${s}\n`), (s) => process.stderr.write(`${s}\n`));
}
