/**
 * Real-Qwen tool-selection evaluation (option B in the M1 plan): bundled into ONE file, copied to /tmp on the AI server, run with
 * /opt/node/current/bin/node, then deleted. It installs nothing, changes no configuration and only talks to 127.0.0.1:11434.
 * Usage: node english-eval.mjs <start> <end>   (a slice of the 100 prompts, so one run stays under the tool time limit)
 */
import { OllamaClient } from "../../src/ollama/client";
import { EnglishPlanner, type KnownProduct } from "../../src/pipeline/english-planner";
import { InferenceScheduler } from "../../src/queue/scheduler";
import { extractEntities } from "../../src/router/entities";
import { normalizeMatch } from "../../src/router/normalize";
import { routeMessage } from "../../src/router/router";
import { createToolRegistry } from "../../src/tools/definitions";
import { runToolCalls } from "../../src/tools/runner";
import { ENGLISH_CASES, type EnglishCase } from "../eval/english-prompts";
import { MOCK_VOCAB } from "../fixtures/mock-vocab";
import { createStubBackend } from "../fixtures/stub-backend";

const hybrid = process.argv[4] === "hybrid";
let routerAnswered = 0;
let qwenAnswered = 0;
const start = Number(process.argv[2] ?? 0);
const end = Number(process.argv[3] ?? ENGLISH_CASES.length);
const cases = ENGLISH_CASES.slice(start, end);

const ollama = new OllamaClient({ baseUrl: "http://127.0.0.1:11434", requestTimeoutMs: 120_000 });
const scheduler = new InferenceScheduler({ maxQueued: 4 });
const stub = createStubBackend();
const registry = createToolRegistry(stub.backend);
const planner = new EnglishPlanner({ ollama, scheduler, registry });
const known = new Set(MOCK_VOCAB.products.map((p) => p.id));

function argsMatch(expected: Record<string, unknown> | undefined, got: Record<string, unknown>): string[] {
  const misses: string[] = [];
  for (const [k, v] of Object.entries(expected ?? {})) {
    const g = got[k];
    const same = Array.isArray(v) ? Array.isArray(g) && JSON.stringify([...v].sort()) === JSON.stringify([...g].sort()) : g === v;
    if (!same) misses.push(`${k}: expected ${JSON.stringify(v)} got ${JSON.stringify(g)}`);
  }
  return misses;
}

interface Row {
  idx: number;
  c: EnglishCase;
  verdict: "PASS" | "ALT" | "FAIL";
  detail: string;
  tool: string;
  argsOk: boolean | null;
  valid: boolean;
  attempts: number;
  ms: number;
  invalidAfterRetry: boolean;
}
const rows: Row[] = [];

for (let i = 0; i < cases.length; i++) {
  const c = cases[i]!;
  const actor = c.actor ?? "guest";
  const candidates: KnownProduct[] = [];
  const add = (pid: string | undefined) => {
    const p = pid ? MOCK_VOCAB.products.find((x) => x.id === pid) : undefined;
    if (p && !candidates.some((k) => k.id === p.id)) candidates.push({ id: p.id, name: p.name });
  };
  for (const p of extractEntities(c.text, MOCK_VOCAB).products) add(p.id);
  add(c.page);

  const t0 = Date.now();
  let calls: { name: unknown; arguments: unknown }[] = [];
  let attempts = 0;
  let invalidAfterRetry = false;
  let degraded = false;
  // "hybrid" = englishMode router-first: the deterministic router answers when it recognises the intent; Qwen only when it abstains.
  const det = hybrid
    ? routeMessage({
        matchText: normalizeMatch(c.text),
        rawText: c.text,
        vocab: MOCK_VOCAB,
        context: { ...(c.page ? { contextProductId: c.page } : {}), lastShownProductIds: [], cart: Array.from({ length: c.cartCount ?? 0 }, (_, k) => ({ productId: `cm0item${String(8 + k).padStart(8, "0")}`, variantKey: "", quantity: 1 })) },
      })
    : null;
  if (det && det.intent !== "unknown") {
    routerAnswered++;
    calls = actor === "guest" && det.intent === "order_status" ? [] : det.calls.map((x) => ({ name: x.name, arguments: x.arguments }));
  } else
  try {
    if (hybrid) qwenAnswered++;
    const plan = await planner.plan({ message: c.text, actor, priority: actor === "customer" ? "customer" : "guest", deadlineAt: Date.now() + 100_000, signal: new AbortController().signal, page: c.page ? "product" : undefined, candidates: candidates.slice(0, 6), cartCount: c.cartCount ?? 0 });
    calls = plan.calls;
    attempts = plan.attempts;
    invalidAfterRetry = plan.invalid;
    degraded = plan.degraded;
  } catch (e) {
    rows.push({ idx: start + i, c, verdict: "FAIL", detail: `error ${(e as Error).name}`, tool: "error", argsOk: null, valid: false, attempts, ms: Date.now() - t0, invalidAfterRetry });
    continue;
  }
  const ms = Date.now() - t0;

  // What the server would do: allow-list of ids, then strict validation. "valid" = nothing the model proposed would be rejected.
  const safe = calls.filter((x) => {
    const a = (x.arguments ?? {}) as { productId?: unknown; productIds?: unknown };
    if (typeof a.productId === "string" && !known.has(a.productId)) return false;
    if (Array.isArray(a.productIds) && a.productIds.some((p) => typeof p !== "string" || !known.has(p))) return false;
    return true;
  });
  const outcomes = calls.length ? await runToolCalls(registry, safe, { actor: actor === "customer" ? { kind: "customer", customerId: "c1" } : { kind: "guest" }, requestId: "eval", signal: new AbortController().signal }) : [];
  const valid = calls.length === 0 || (safe.length === calls.length && outcomes.every((o) => o.status === "ok"));

  const first = calls[0];
  const tool = first ? String(first.name) : "none";
  const want = c.expect.tool;
  let verdict: Row["verdict"] = "FAIL";
  let argsOk: boolean | null = null;
  let detail = "";
  if (degraded) detail = "degraded";
  if (tool === want) {
    if (want === "none") verdict = "PASS";
    else {
      const misses = argsMatch(c.expect.args, (first!.arguments ?? {}) as Record<string, unknown>);
      argsOk = misses.length === 0;
      verdict = argsOk ? "PASS" : "FAIL";
      detail = misses.join("; ");
    }
  } else if (c.expect.alsoOk?.includes(tool)) {
    verdict = "ALT";
    detail = `acceptable alternative ${tool}`;
  } else detail = `expected ${want}, got ${tool}${first ? " " + JSON.stringify(first.arguments).slice(0, 90) : ""}`;
  rows.push({ idx: start + i, c, verdict, detail, tool, argsOk, valid, attempts, ms, invalidAfterRetry });
  console.log(`${verdict.padEnd(4)} #${String(start + i).padStart(3)} ${c.tag.padEnd(11)} ${String(ms).padStart(6)}ms a${attempts} ${valid ? "valid  " : "INVALID"} ${c.text.replace(/\n/g, " ").slice(0, 52).padEnd(52)} ${detail}`);
}

const n = rows.length;
const pass = rows.filter((r) => r.verdict === "PASS").length;
const alt = rows.filter((r) => r.verdict === "ALT").length;
const toolRight = rows.filter((r) => r.tool === r.c.expect.tool || r.verdict === "ALT").length;
const withTool = rows.filter((r) => r.c.expect.tool !== "none");
const argsRight = withTool.filter((r) => r.tool === r.c.expect.tool && r.argsOk).length;
const toolRightWithTool = withTool.filter((r) => r.tool === r.c.expect.tool).length;
const times = rows.map((r) => r.ms).sort((a, b) => a - b);
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "n/a");
const q = (p: number) => times[Math.min(times.length - 1, Math.floor(p * times.length))] ?? 0;
const byTag: Record<string, { n: number; ok: number }> = {};
for (const r of rows) {
  const t = (byTag[r.c.tag] ??= { n: 0, ok: 0 });
  t.n++;
  if (r.verdict !== "FAIL") t.ok++;
}
console.log(
  `\nSLICE ${start}-${end} (${n} prompts): PASS ${pass}, ALT ${alt}, FAIL ${n - pass - alt} | tool correct ${toolRight}/${n} (${pct(toolRight, n)}) | args correct (when a tool was expected and chosen) ${argsRight}/${toolRightWithTool} | all proposals valid ${rows.filter((r) => r.valid).length}/${n} | retried ${rows.filter((r) => r.attempts > 1).length} | invalid after retry ${rows.filter((r) => r.invalidAfterRetry).length} | latency ms p50 ${q(0.5)} p95 ${q(0.95)} max ${times.at(-1) ?? 0}`,
);
if (hybrid) console.log(`HYBRID router answered ${routerAnswered}, Qwen answered ${qwenAnswered}`);
console.log("BYTAG " + JSON.stringify(byTag));
console.log("TOOLS_USED " + JSON.stringify(rows.reduce((m: Record<string, number>, r) => ((m[r.tool] = (m[r.tool] ?? 0) + 1), m), {})));
console.log("RAWROWS " + JSON.stringify(rows.map((r) => ({ i: r.idx, v: r.verdict, ok: r.valid, a: r.attempts, ms: r.ms, tag: r.c.tag }))));
