import { readFileSync } from "node:fs";
import { MODEL_DESCRIPTORS } from "../../src/models/registry";
import { toOllamaTools } from "../../src/tools/definitions";
import { createToolRegistry } from "../../src/tools/definitions";
import { INTENTS } from "../../src/router/types";
import { route } from "../eval/harness";
import { createStubBackend } from "../fixtures/stub-backend";
import { BENCH_CASES, GROUPS, REVIEW_STATUS, type BenchCase, type BenchIntent, type Group } from "./m3-dataset";

/**
 * Benchmark harness for M3-A. Two modes, reported separately and never mixed:
 *  - router mode: the deterministic router on the dataset. Runs anywhere, needs no model. MEASURED on the machine that runs it.
 *  - model mode: one local Ollama model choosing tools. Needs a running Ollama that ALREADY has the model; the harness never pulls,
 *    downloads or changes anything, refuses models the registry excludes, and records only counts, timings and tool names (the
 *    message text of the public dataset is not customer data; nothing from real customers is ever used).
 * Every report states its basis ("measured" with where and when) so measured results and estimates cannot be confused.
 */
const NEW_CATEGORIES: readonly BenchIntent[] = ["general", "website_policy", "external_site"];
const isNew = (w: BenchIntent) => NEW_CATEGORIES.includes(w);
const isRouterIntent = (w: BenchIntent): w is (typeof INTENTS)[number] => (INTENTS as readonly string[]).includes(w);

const pct = (a: number, b: number) => (b === 0 ? null : Math.round((1000 * a) / b) / 10);
export const quantile = (sorted: number[], q: number) => (sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!);

export interface GroupStats {
  n: number;
  /** Cases whose expected intent is one the router has (existing shopping, order and small-talk intents). */
  supported: number;
  intentCorrect: number;
  intentAccuracyPct: number | null;
  abstained: number;
  entityChecked: number;
  entityCorrect: number;
  /** Cases in the new categories (general, website policy, external site). */
  newCategory: number;
  /** New-category cases where the router ran a shopping tool: always wrong, and the number that matters for safety. */
  newCategoryRoutedToTool: number;
  newCategoryNoTool: number;
}

export interface RouterReport {
  basis: "measured";
  mode: "router";
  reviewStatus: typeof REVIEW_STATUS;
  ranAt: string;
  node: string;
  totalCases: number;
  perGroup: Record<Group, GroupStats>;
  overall: GroupStats;
  latencyMs: { p50: number | null; p95: number | null; max: number | null };
  /** Every miss, so a reader can judge it. The dataset is public test text, not customer data. */
  misses: { group: Group; text: string; want: BenchIntent; got: string; action: string }[];
}

const emptyStats = (): GroupStats => ({ n: 0, supported: 0, intentCorrect: 0, intentAccuracyPct: null, abstained: 0, entityChecked: 0, entityCorrect: 0, newCategory: 0, newCategoryRoutedToTool: 0, newCategoryNoTool: 0 });

export function runRouterBench(cases: readonly BenchCase[] = BENCH_CASES): RouterReport {
  const perGroup = Object.fromEntries(GROUPS.map((g) => [g, emptyStats()])) as Record<Group, GroupStats>;
  const overall = emptyStats();
  const times: number[] = [];
  const misses: RouterReport["misses"] = [];
  for (const k of cases) {
    const t0 = performance.now();
    const d = route(k.text);
    times.push(performance.now() - t0);
    for (const s of [perGroup[k.group], overall]) {
      s.n++;
      if (d.intent === "unknown") s.abstained++;
      if (isNew(k.want)) {
        s.newCategory++;
        if (d.action === "tool") s.newCategoryRoutedToTool++;
        else s.newCategoryNoTool++;
      } else if (isRouterIntent(k.want)) {
        s.supported++;
        if (d.intent === k.want) s.intentCorrect++;
      }
      if (k.entities && d.intent === k.want) {
        s.entityChecked++;
        const e = d.entities;
        const x = k.entities;
        const ok =
          (x.maxPriceLkr === undefined || e.maxPriceLkr === x.maxPriceLkr) &&
          (x.sort === undefined || e.sort === x.sort) &&
          (x.productIds === undefined || JSON.stringify(e.products.map((p) => p.id).sort()) === JSON.stringify([...x.productIds].sort())) &&
          (x.referent === undefined || Boolean(e.referent) === x.referent) &&
          (x.topic === undefined || d.topic === x.topic);
        if (ok) s.entityCorrect++;
      }
    }
    const wrong = isNew(k.want) ? d.action === "tool" : d.intent !== k.want;
    if (wrong) misses.push({ group: k.group, text: k.text, want: k.want, got: d.intent, action: d.action });
  }
  for (const s of [...Object.values(perGroup), overall]) s.intentAccuracyPct = pct(s.intentCorrect, s.supported);
  const sorted = [...times].sort((a, b) => a - b);
  return {
    basis: "measured",
    mode: "router",
    reviewStatus: REVIEW_STATUS,
    ranAt: new Date().toISOString(),
    node: process.version,
    totalCases: cases.length,
    perGroup,
    overall,
    latencyMs: { p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), max: sorted.at(-1) ?? null },
    misses,
  };
}

// ---------------------------------------------------------------- model mode

/** The tool a correct plan starts with, or "none" when no shopping tool should run (general, policy, external, small talk, hand-offs). */
export const EXPECTED_TOOL: Record<BenchIntent, string> = {
  search_products: "search_products",
  get_product_details: "get_product_details",
  compare_products: "compare_products",
  check_stock: "check_stock",
  get_accessories: "get_accessories",
  cart_add: "add_to_cart",
  cart_remove: "remove_from_cart",
  cart_update_quantity: "update_cart_quantity",
  cart_view: "get_cart",
  order_status: "get_order_status",
  order_support: "none",
  checkout_handoff: "none",
  store_info: "none",
  smalltalk: "none",
  unknown: "none",
  general: "none",
  website_policy: "none",
  external_site: "none",
};

export interface ModelBenchOptions {
  baseUrl: string;
  tag: string;
  cases?: readonly BenchCase[];
  fetchImpl?: typeof fetch;
  /** Free host memory in MB, if it can be read (Linux /proc/meminfo). Omitted elsewhere. */
  readHostFreeMb?: () => number | null;
  timeoutMs?: number;
}

export interface ModelBenchRow {
  group: Group;
  want: BenchIntent;
  expectedTool: string;
  gotTool: string;
  toolCorrect: boolean;
  /** A shopping tool was chosen for a case that needed none (general, policy, external site...). */
  falseTool: boolean;
  ms: number;
  loadMs: number;
  genTokensPerSecond: number | null;
  error?: string;
}

export interface ModelBenchReport {
  basis: "measured";
  mode: "model";
  reviewStatus: typeof REVIEW_STATUS;
  ranAt: string;
  tag: string;
  registryStatus: string;
  licenseVerdict: string;
  totalCases: number;
  errors: number;
  perGroup: Record<Group, { n: number; toolCorrect: number; toolAccuracyPct: number | null; falseTool: number }>;
  latencyMs: { firstCall: number | null; warmP50: number | null; warmP95: number | null };
  memory: { modelResidentMbAfterFirstCall: number | null; hostFreeMbBefore: number | null; hostFreeMbAfter: number | null; basis: "measured" };
  rows: ModelBenchRow[];
}

export class BenchRefusal extends Error {}

export function readLinuxFreeMb(): number | null {
  try {
    const m = /MemAvailable:\s+(\d+) kB/.exec(readFileSync("/proc/meminfo", "utf8"));
    return m ? Math.round(Number(m[1]) / 1024) : null;
  } catch {
    return null;
  }
}

export async function runModelBench(opts: ModelBenchOptions): Promise<ModelBenchReport> {
  const f = opts.fetchImpl ?? fetch;
  const cases = opts.cases ?? BENCH_CASES;
  const model = MODEL_DESCRIPTORS.find((m) => m.tag === opts.tag);
  if (!model) throw new BenchRefusal(`"${opts.tag}" is not in the model registry. Add it with licence evidence first.`);
  if (model.status === "excluded") throw new BenchRefusal(`"${model.id}" is excluded: ${model.statusReason}`);
  const base = opts.baseUrl.replace(/\/$/, "");
  const url = new URL(base);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) throw new BenchRefusal("The benchmark only talks to a local Ollama (loopback address).");

  const getJson = async (path: string) => {
    const r = await f(`${base}${path}`, { signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) });
    if (!r.ok) throw new BenchRefusal(`Ollama ${path} answered ${r.status}`);
    return (await r.json()) as Record<string, unknown>;
  };

  const tags = (await getJson("/api/tags")) as { models?: { name?: string; model?: string }[] };
  const installed = (tags.models ?? []).map((m) => m.name ?? m.model ?? "");
  if (!installed.includes(opts.tag)) throw new BenchRefusal(`"${opts.tag}" is not installed on this Ollama. The benchmark never downloads models.`);

  const tools = toOllamaTools(createToolRegistry(createStubBackend().backend), "guest");
  const system =
    "You choose tool calls for the shopper's message using only the provided tools. Never invent ids. " +
    "If no tool fits (a greeting, a general question, a question about store policy, or a request to visit another website), call no tool.";
  const readFree = opts.readHostFreeMb ?? (() => null);
  const hostBefore = readFree();
  const rows: ModelBenchRow[] = [];
  let residentMb: number | null = null;

  for (let i = 0; i < cases.length; i++) {
    const k = cases[i]!;
    const expectedTool = EXPECTED_TOOL[k.want];
    const body: Record<string, unknown> = {
      model: opts.tag,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: k.text },
      ],
      tools,
      options: { num_ctx: 2048, num_predict: 120, temperature: 0.2 },
    };
    if (opts.tag.startsWith("qwen3")) body.think = false;
    const t0 = performance.now();
    try {
      const r = await f(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs ?? 300_000) });
      const ms = performance.now() - t0;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { message?: { tool_calls?: { function?: { name?: string } }[] }; load_duration?: number; eval_count?: number; eval_duration?: number };
      const first = d.message?.tool_calls?.[0]?.function?.name ?? "none";
      const toolCorrect = first === expectedTool;
      rows.push({
        group: k.group,
        want: k.want,
        expectedTool,
        gotTool: first,
        toolCorrect,
        falseTool: expectedTool === "none" && first !== "none",
        ms: Math.round(ms),
        loadMs: Math.round((d.load_duration ?? 0) / 1e6),
        genTokensPerSecond: d.eval_count && d.eval_duration ? Math.round((10 * d.eval_count) / (d.eval_duration / 1e9)) / 10 : null,
      });
      if (i === 0) {
        const ps = (await getJson("/api/ps")) as { models?: { name?: string; model?: string; size?: number }[] };
        const mine = (ps.models ?? []).find((m) => (m.name ?? m.model) === opts.tag);
        residentMb = mine?.size ? Math.round(mine.size / 1024 / 1024) : null;
      }
    } catch (e) {
      rows.push({ group: k.group, want: k.want, expectedTool, gotTool: "error", toolCorrect: false, falseTool: false, ms: Math.round(performance.now() - t0), loadMs: 0, genTokensPerSecond: null, error: (e as Error).name });
    }
  }

  const perGroup = Object.fromEntries(GROUPS.map((g) => [g, { n: 0, toolCorrect: 0, toolAccuracyPct: null as number | null, falseTool: 0 }])) as ModelBenchReport["perGroup"];
  for (const r of rows) {
    const g = perGroup[r.group];
    g.n++;
    if (r.toolCorrect) g.toolCorrect++;
    if (r.falseTool) g.falseTool++;
  }
  for (const g of Object.values(perGroup)) g.toolAccuracyPct = pct(g.toolCorrect, g.n);
  const warm = rows.slice(1).filter((r) => !r.error).map((r) => r.ms).sort((a, b) => a - b);
  return {
    basis: "measured",
    mode: "model",
    reviewStatus: REVIEW_STATUS,
    ranAt: new Date().toISOString(),
    tag: opts.tag,
    registryStatus: model.status,
    licenseVerdict: model.license.verdict,
    totalCases: cases.length,
    errors: rows.filter((r) => r.error).length,
    perGroup,
    latencyMs: { firstCall: rows[0]?.ms ?? null, warmP50: quantile(warm, 0.5), warmP95: quantile(warm, 0.95) },
    memory: { modelResidentMbAfterFirstCall: residentMb, hostFreeMbBefore: hostBefore, hostFreeMbAfter: readFree(), basis: "measured" },
    rows,
  };
}
