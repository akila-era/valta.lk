import { readFileSync, readdirSync } from "node:fs";
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

/**
 * The tool a correct plan starts with, or "none" when no shopping tool should run (general, policy, external site, small talk,
 * hand-offs, too vague). Keyed by plain strings so both the M3-A and the M3-B datasets can use it.
 */
export const EXPECTED_TOOL: Record<string, string> = {
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
  ambiguous: "none",
};

/** What the model benchmark needs from a dataset row (both the M3-A and M3-B datasets satisfy it). */
export interface BenchRow {
  group: Group;
  text: string;
  want: string;
}

/** Linux host readings used to protect the machine while the benchmark runs. Every reading may be null where it cannot be taken. */
export interface HostProbe {
  freeMb(): number | null;
  load1(): number | null;
  cpuTimes(): { busy: number; total: number } | null;
  ollamaRssMb(): number | null;
  oomKills(): number | null;
  swapUsedMb(): number | null;
}

const procText = (p: string): string | null => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

export function readLinuxFreeMb(): number | null {
  const m = /MemAvailable:\s+(\d+) kB/.exec(procText("/proc/meminfo") ?? "");
  return m ? Math.round(Number(m[1]) / 1024) : null;
}

export const linuxProbe: HostProbe = {
  freeMb: readLinuxFreeMb,
  load1: () => {
    const t = procText("/proc/loadavg");
    return t ? Number(t.split(" ")[0]) : null;
  },
  cpuTimes: () => {
    const line = (procText("/proc/stat") ?? "").split("\n")[0] ?? "";
    const n = line.split(/\s+/).slice(1).map(Number);
    if (n.length < 5 || n.some(Number.isNaN)) return null;
    const idle = (n[3] ?? 0) + (n[4] ?? 0);
    const total = n.reduce((a, b) => a + b, 0);
    return { busy: total - idle, total };
  },
  ollamaRssMb: () => {
    // The Ollama server and its model runner are separate processes; the runner holds the model. Sum both, by process name.
    let kb = 0;
    try {
      for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
        const comm = (procText(`/proc/${pid}/comm`) ?? "").trim();
        if (!comm.startsWith("ollama")) continue;
        const m = /VmRSS:\s+(\d+) kB/.exec(procText(`/proc/${pid}/status`) ?? "");
        if (m) kb += Number(m[1]);
      }
    } catch {
      return null;
    }
    return kb ? Math.round(kb / 1024) : null;
  },
  oomKills: () => {
    const m = /^oom_kill (\d+)/m.exec(procText("/proc/vmstat") ?? "");
    return m ? Number(m[1]) : null;
  },
  swapUsedMb: () => {
    const t = procText("/proc/meminfo") ?? "";
    const tot = /SwapTotal:\s+(\d+) kB/.exec(t);
    const free = /SwapFree:\s+(\d+) kB/.exec(t);
    return tot && free ? Math.round((Number(tot[1]) - Number(free[1])) / 1024) : null;
  },
};

export interface ModelBenchOptions {
  baseUrl: string;
  tag: string;
  cases?: readonly BenchRow[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  probe?: HostProbe;
  /** Only verify the model and the host and report what WOULD run. Sends no chat request. */
  dryRun?: boolean;
  /** Stop (and report what was measured so far) if free memory falls below this. Default 400 MB. */
  minFreeMb?: number;
  /** Stop if the one-minute load average exceeds this (the Agent shares these 2 CPUs). Default 3. */
  maxLoad1?: number;
  /** Pause between requests so live traffic can be served in the gaps. Default 0 here, 3000 on the command line. */
  pauseMs?: number;
  /** Stop after this many seconds. */
  maxSeconds?: number;
  limit?: number;
  /** Permit loading the model when NOTHING is loaded right now. Without it the benchmark refuses to start a cold load. */
  allowColdLoad?: boolean;
  sleep?: (ms: number) => Promise<void>;
}

export interface ModelBenchRow {
  group: Group;
  want: string;
  expectedTool: string;
  gotTool: string;
  toolCorrect: boolean;
  /** A shopping tool was chosen for a case that needed none (general, policy, external site...). */
  falseTool: boolean;
  ms: number;
  loadMs: number;
  promptTokens: number | null;
  genTokens: number | null;
  genTokensPerSecond: number | null;
  /** Host CPU busy percentage over this request (includes other processes, such as the live Agent). */
  cpuBusyPct: number | null;
  error?: string;
}

export interface ModelBenchReport {
  basis: "measured";
  mode: "model";
  reviewStatus: string;
  ranAt: string;
  tag: string;
  registryStatus: string;
  licenseVerdict: string;
  dryRun: boolean;
  /** Facts read from the running Ollama about the installed model. */
  verification: { installed: true; digest: string | null; sizeMb: number | null; family: string | null; parameterSize: string | null; quantization: string | null; loadedBefore: string[]; wouldEvictAnotherModel: false };
  totalCases: number;
  completed: number;
  errors: number;
  aborted: { reason: "low_memory" | "high_load" | "time_limit" } | null;
  perGroup: Record<Group, { n: number; toolCorrect: number; toolAccuracyPct: number | null; falseTool: number; medianMs: number | null }>;
  overall: { toolAccuracyPct: number | null; falseTool: number };
  latencyMs: { firstCall: number | null; warmP50: number | null; warmP95: number | null };
  throughput: { genTokensPerSecondMedian: number | null; promptTokensTotal: number; genTokensTotal: number };
  resources: {
    basis: "measured";
    hostFreeMbBefore: number | null;
    hostFreeMbMin: number | null;
    swapUsedMbMax: number | null;
    modelResidentMbAfterFirstCall: number | null;
    ollamaProcessesRssMbMax: number | null;
    cpuBusyPctMedianPerRequest: number | null;
    cpuBusyPctMax: number | null;
    load1Max: number | null;
    oomKillsDuringRun: number | null;
  };
  /** What this run did to the host, in numbers the owner can check. */
  safety: { minFreeMbLimit: number; maxLoad1Limit: number; pauseMs: number; requestsSent: number };
  rows: ModelBenchRow[];
}

export class BenchRefusal extends Error {}

const median = (xs: number[]) => (xs.length ? quantile([...xs].sort((a, b) => a - b), 0.5) : null);
const maxOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
};
const minOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.min(...v) : null;
};

export async function runModelBench(opts: ModelBenchOptions): Promise<ModelBenchReport> {
  const f = opts.fetchImpl ?? fetch;
  const probe = opts.probe ?? { freeMb: () => null, load1: () => null, cpuTimes: () => null, ollamaRssMb: () => null, oomKills: () => null, swapUsedMb: () => null };
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const minFreeMb = opts.minFreeMb ?? 400;
  const maxLoad1 = opts.maxLoad1 ?? 3;
  const pauseMs = opts.pauseMs ?? 0;
  let cases: readonly BenchRow[] = opts.cases ?? BENCH_CASES;
  // A limit takes messages evenly spaced across the whole set, so a short run still covers every language group and label.
  if (opts.limit !== undefined && opts.limit < cases.length) {
    const all = cases;
    cases = Array.from({ length: Math.max(0, opts.limit) }, (_, i) => all[Math.floor((i * all.length) / opts.limit!)]!);
  }

  // 1. The model must be one the project has vetted, and must be usable (not excluded for licence, terms or size).
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

  // 2. Verify the INSTALLED tag exactly (never pulls, never substitutes) and record what it really is.
  const tags = (await getJson("/api/tags")) as { models?: { name?: string; model?: string; digest?: string; size?: number; details?: { family?: string; parameter_size?: string; quantization_level?: string } }[] };
  const entry = (tags.models ?? []).find((m) => (m.name ?? m.model) === opts.tag);
  if (!entry) throw new BenchRefusal(`"${opts.tag}" is not installed on this Ollama. The benchmark never downloads models. Installed: ${(tags.models ?? []).map((m) => m.name ?? m.model).join(", ") || "(none)"}`);

  // 3. NEVER evict. With one model loaded at a time, asking for a different model would unload the live one and cost every shopper
  // a cold start (tens of seconds) and, for a bigger model, risk running out of memory on the 4 GB host. Refuse instead.
  const ps0 = (await getJson("/api/ps")) as { models?: { name?: string; model?: string; size?: number }[] };
  const loadedBefore = (ps0.models ?? []).map((m) => m.name ?? m.model ?? "");
  if (loadedBefore.length > 0 && !loadedBefore.includes(opts.tag)) {
    throw new BenchRefusal(`Refusing to run: "${loadedBefore.join(", ")}" is loaded and Ollama holds one model at a time, so loading "${opts.tag}" would evict it and disturb live traffic. Run this benchmark on a separate Ollama or machine, or in an approved maintenance window.`);
  }
  if (loadedBefore.length === 0 && !opts.allowColdLoad && !opts.dryRun) {
    throw new BenchRefusal("Refusing to run: no model is loaded, so this would trigger a cold load. Pass allowColdLoad only on a machine that is not serving live traffic.");
  }

  const verification: ModelBenchReport["verification"] = {
    installed: true,
    digest: entry.digest ?? null,
    sizeMb: entry.size ? Math.round(entry.size / 1024 / 1024) : null,
    family: entry.details?.family ?? null,
    parameterSize: entry.details?.parameter_size ?? null,
    quantization: entry.details?.quantization_level ?? null,
    loadedBefore,
    wouldEvictAnotherModel: false,
  };

  const hostFreeMbBefore = probe.freeMb();
  const perGroup = Object.fromEntries(GROUPS.map((g) => [g, { n: 0, toolCorrect: 0, toolAccuracyPct: null as number | null, falseTool: 0, medianMs: null as number | null }])) as ModelBenchReport["perGroup"];
  const rows: ModelBenchRow[] = [];
  const startedAt = Date.now();
  const oom0 = probe.oomKills();
  const frees: (number | null)[] = [hostFreeMbBefore];
  const swaps: (number | null)[] = [probe.swapUsedMb()];
  const rss: (number | null)[] = [];
  const loads: (number | null)[] = [];
  let aborted: ModelBenchReport["aborted"] = null;
  let residentMb: number | null = null;
  let requestsSent = 0;

  const report = (): ModelBenchReport => {
    const times: Record<string, number[]> = {};
    const counts = Object.fromEntries(GROUPS.map((g) => [g, { n: 0, ok: 0, ft: 0 }])) as Record<Group, { n: number; ok: number; ft: number }>;
    for (const r of rows) {
      (times[r.group] ??= []).push(r.ms);
      counts[r.group].n++;
      if (r.toolCorrect) counts[r.group].ok++;
      if (r.falseTool) counts[r.group].ft++;
    }
    for (const g of GROUPS) perGroup[g] = { n: counts[g].n, toolCorrect: counts[g].ok, toolAccuracyPct: pct(counts[g].ok, counts[g].n), falseTool: counts[g].ft, medianMs: median(times[g] ?? []) };
    const warm = rows.slice(1).filter((r) => !r.error).map((r) => r.ms).sort((a, b) => a - b);
    const tps = rows.map((r) => r.genTokensPerSecond).filter((x): x is number => x !== null);
    const cpu = rows.map((r) => r.cpuBusyPct).filter((x): x is number => x !== null);
    const oom1 = probe.oomKills();
    return {
      basis: "measured",
      mode: "model",
      reviewStatus: REVIEW_STATUS,
      ranAt: new Date().toISOString(),
      tag: opts.tag,
      registryStatus: model.status,
      licenseVerdict: model.license.verdict,
      dryRun: Boolean(opts.dryRun),
      verification,
      totalCases: cases.length,
      completed: rows.length,
      errors: rows.filter((r) => r.error).length,
      aborted,
      perGroup,
      overall: { toolAccuracyPct: pct(rows.filter((r) => r.toolCorrect).length, rows.length), falseTool: rows.filter((r) => r.falseTool).length },
      latencyMs: { firstCall: rows[0]?.ms ?? null, warmP50: quantile(warm, 0.5), warmP95: quantile(warm, 0.95) },
      throughput: { genTokensPerSecondMedian: median(tps), promptTokensTotal: rows.reduce((a, r) => a + (r.promptTokens ?? 0), 0), genTokensTotal: rows.reduce((a, r) => a + (r.genTokens ?? 0), 0) },
      resources: {
        basis: "measured",
        hostFreeMbBefore,
        hostFreeMbMin: minOf(frees),
        swapUsedMbMax: maxOf(swaps),
        modelResidentMbAfterFirstCall: residentMb,
        ollamaProcessesRssMbMax: maxOf(rss),
        cpuBusyPctMedianPerRequest: median(cpu),
        cpuBusyPctMax: cpu.length ? Math.max(...cpu) : null,
        load1Max: maxOf(loads),
        oomKillsDuringRun: oom0 !== null && oom1 !== null ? oom1 - oom0 : null,
      },
      safety: { minFreeMbLimit: minFreeMb, maxLoad1Limit: maxLoad1, pauseMs, requestsSent },
      rows,
    };
  };

  if (opts.dryRun) return report();

  const tools = toOllamaTools(createToolRegistry(createStubBackend().backend), "guest");
  // Same request options as the live Agent (context size, no extra options): a different context size would make Ollama reload the
  // model and interrupt live traffic.
  const system =
    "You choose tool calls for the shopper's message using only the provided tools. Never invent ids. " +
    "If no tool fits (a greeting, a general question, a question about store policy, or a request to visit another website), call no tool.";

  for (let i = 0; i < cases.length; i++) {
    // Host protection, checked before EVERY request.
    const free = probe.freeMb();
    const load = probe.load1();
    frees.push(free);
    loads.push(load);
    if (free !== null && free < minFreeMb) {
      aborted = { reason: "low_memory" };
      break;
    }
    if (load !== null && load > maxLoad1) {
      aborted = { reason: "high_load" };
      break;
    }
    if (opts.maxSeconds !== undefined && (Date.now() - startedAt) / 1000 > opts.maxSeconds) {
      aborted = { reason: "time_limit" };
      break;
    }
    if (i > 0 && pauseMs > 0) await sleep(pauseMs);

    const k = cases[i]!;
    const expectedTool = EXPECTED_TOOL[k.want] ?? "none";
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
    const cpuA = probe.cpuTimes();
    const t0 = performance.now();
    requestsSent++;
    try {
      const r = await f(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs ?? 300_000) });
      const ms = performance.now() - t0;
      const cpuB = probe.cpuTimes();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { message?: { tool_calls?: { function?: { name?: string } }[] }; load_duration?: number; prompt_eval_count?: number; eval_count?: number; eval_duration?: number };
      const first = d.message?.tool_calls?.[0]?.function?.name ?? "none";
      rows.push({
        group: k.group,
        want: k.want,
        expectedTool,
        gotTool: first,
        toolCorrect: first === expectedTool,
        falseTool: expectedTool === "none" && first !== "none",
        ms: Math.round(ms),
        loadMs: Math.round((d.load_duration ?? 0) / 1e6),
        promptTokens: d.prompt_eval_count ?? null,
        genTokens: d.eval_count ?? null,
        genTokensPerSecond: d.eval_count && d.eval_duration ? Math.round((10 * d.eval_count) / (d.eval_duration / 1e9)) / 10 : null,
        cpuBusyPct: cpuA && cpuB && cpuB.total > cpuA.total ? Math.round((1000 * (cpuB.busy - cpuA.busy)) / (cpuB.total - cpuA.total)) / 10 : null,
      });
      if (rows.length === 1) {
        const ps = (await getJson("/api/ps")) as { models?: { name?: string; model?: string; size?: number }[] };
        const mine = (ps.models ?? []).find((m) => (m.name ?? m.model) === opts.tag);
        residentMb = mine?.size ? Math.round(mine.size / 1024 / 1024) : null;
      }
    } catch (e) {
      rows.push({ group: k.group, want: k.want, expectedTool, gotTool: "error", toolCorrect: false, falseTool: false, ms: Math.round(performance.now() - t0), loadMs: 0, promptTokens: null, genTokens: null, genTokensPerSecond: null, cpuBusyPct: null, error: (e as Error).name });
    }
    swaps.push(probe.swapUsedMb());
    rss.push(probe.ollamaRssMb());
  }
  return report();
}
