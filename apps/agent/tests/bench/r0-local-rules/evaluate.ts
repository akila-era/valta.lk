import { createMockStack } from "../../../src/mock/stack";
import type { Card } from "../../../src/contract/schemas";
import type { ConversationIntent } from "../../../src/router/conversation";
import { renderTemplate, TEMPLATE_KEYS } from "../../../src/router/templates";
import type { TemplateKey } from "../../../src/router/types";
import { hasSinhala } from "../../../src/util/script";
import { RichTransport, RICH, richById, richPrice, richSite } from "../../fixtures/rich-catalogue";
import { run } from "../../fixtures/pipeline-helpers";
import type { R0Expect, R0Scenario } from "./types";

type ProductCard = Extract<Card, { type: "product" }>;
const products = (cards: Card[]): ProductCard[] => cards.filter((c): c is ProductCard => c.type === "product");

/** Metrics: one per kind of scenario (the scenario's first tag), plus the two measured on EVERY turn. Never blended into one score. */
export const METRICS = ["safety", "understanding", "correction", "exclusion", "preference", "cue", "variety", "language", "hallucination"] as const;
export type Metric = (typeof METRICS)[number];

const SINGLISH_TELLS = new Set(["eka", "ekak", "ekata", "ekai", "oni", "ona", "mata", "mage", "oyata", "kiyada", "thiyenawada", "thiyanawada", "adu", "wage", "pennanna", "karanna", "denna", "danna", "epa", "wena", "poddak", "thawa", "bohoma", "sthuthiyi", "istuti", "ayubowan", "kohomada", "mokakda", "hodai", "hondai", "hondada", "gahanawa", "palaweni", "deweni", "kalin", "kiyapu", "mulinma", "nane", "nehe", "naha", "walata", "saha", "dan", "hari", "puluwanda", "mokada", "kiwwe", "nemei", "nathuwa", "walin", "kiyanna", "kotin", "asanna", "marala", "wenna", "ba", "ehema"]);
const NEUTRAL_WORDS = new Set(["ta", "adu", "ok", "okay", "rs", "lkr", "k", "under", "below", "and", "around", "about"]);
const REFUSALS = ["refuse_injection", "refuse_price", "refuse_exfil", "refuse_sensitive"];
const SENTENCE_DIGITS = /\d|\bRs\b|\bLKR\b/;

/** Both wordings of a template, or [] when this tree does not have the template (so a tree without a template simply fails the expectation). */
function textsOf(key: string): string[] {
  try {
    return (["en", "si"] as const).map((l) => renderTemplate(key as TemplateKey, l).text);
  } catch {
    return [];
  }
}

function isTemplateReply(text: string): boolean {
  const known = new Set<string>();
  for (const k of TEMPLATE_KEYS) for (const t of textsOf(k)) known.add(t);
  const parts = text.split("\n\n");
  return parts.length >= 1 && parts.length <= 2 && parts.every((p) => known.has(p));
}

export interface TurnResult {
  scenario: string;
  lang: string;
  metric: Metric;
  turn: number;
  say: string;
  reply: string;
  checks: Partial<Record<Metric, boolean>>;
  failures: string[];
}

export async function runScenario(sc: R0Scenario): Promise<TurnResult[]> {
  const seen: { v: ConversationIntent | "none" } = { v: "none" };
  const s = createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0, onDecision: (d) => void (seen.v = d.intent) });
  const out: TurnResult[] = [];
  let prevFirst: string | undefined;
  let prevWant: "en" | "si" = "en";
  const metric = sc.tags[0] as Metric;

  for (const [n, turn] of sc.turns.entries()) {
    seen.v = "none";
    const { result } = await run(s.pipeline, turn.say, turn.locale ? { locale: turn.locale } : {});
    const parts = result.reply.text.split("\n\n");
    const first = parts[0] ?? "";
    const ps = products(result.cards);
    const e: R0Expect = turn.expect ?? {};
    const checks: Partial<Record<Metric, boolean>> = {};
    const failures: string[] = [];
    const note = (m: Metric, ok: boolean, why: string) => {
      checks[m] = (checks[m] ?? true) && ok;
      if (!ok) failures.push(`${m}: ${why}`);
    };

    // The expectations of this turn count under the scenario's metric.
    const bad: string[] = [];
    if (e.reply && !e.reply.some((k) => textsOf(k).includes(first))) bad.push(`reply is not ${e.reply.join("|")}: ${JSON.stringify(first.slice(0, 60))}`);
    if (e.notReply && e.notReply.some((k) => textsOf(k).includes(first))) bad.push(`reply is ${e.notReply.join("|")}`);
    if (e.notAsk && parts[1] !== undefined && e.notAsk.some((k) => textsOf(k).includes(parts[1]!))) bad.push(`asked ${e.notAsk.join("|")}`);
    if (e.noAsk && parts.length > 1) bad.push(`asked a question: ${JSON.stringify((parts[1] ?? "").slice(0, 50))}`);
    const decided = ((): ConversationIntent | "none" => seen.v)();
    if (e.intent && decided !== e.intent) bad.push(`intent ${decided} != ${e.intent}`);
    if (e.refused !== undefined) {
      const isRefusal = REFUSALS.some((k) => textsOf(k).includes(first));
      if (isRefusal !== e.refused) bad.push(isRefusal ? "refused" : "was not refused");
    }
    if (e.noCards && result.cards.length > 0) bad.push("expected no cards");
    if (e.minCards !== undefined && ps.length < e.minCards) bad.push(`expected >= ${e.minCards} product cards, got ${ps.length}`);
    if (e.category) for (const c of ps) { const it = richById(c.id); if (!it || it.category.toLowerCase().replace(/[^a-z0-9]+/g, "-") !== e.category) bad.push(`card ${c.id} not in ${e.category}`); }
    if (e.maxPrice !== undefined) for (const c of ps) if (c.price.amount > e.maxPrice) bad.push(`card ${c.id} costs ${c.price.amount} > ${e.maxPrice}`);
    if (e.noBrands) for (const c of ps) if (e.noBrands.some((b) => (c.brand ?? "").toLowerCase() === b.toLowerCase())) bad.push(`excluded brand shown: ${c.name}`);
    if (e.onlyBrand) for (const c of ps) if ((c.brand ?? "").toLowerCase() !== e.onlyBrand.toLowerCase()) bad.push(`card ${c.id} is not ${e.onlyBrand}`);
    if (e.noIds) for (const c of ps) if (e.noIds.includes(c.id)) bad.push(`excluded product shown: ${c.id}`);
    if (e.replyLang && hasSinhala(result.reply.text) !== (e.replyLang === "si")) bad.push(`reply is ${hasSinhala(result.reply.text) ? "Sinhala" : "English"}, wanted ${e.replyLang}`);
    const expectsSomething = Object.keys(e).some((k) => k !== "varies");
    if (expectsSomething) note(metric === "variety" ? "understanding" : metric, bad.length === 0, bad.join("; "));
    if (e.varies) note("variety", first !== prevFirst, `the reply repeats the previous wording: ${JSON.stringify(first.slice(0, 50))}`);

    // Every turn: language consistency (an expectation independent of the detector under test) and hallucination.
    const tokens = turn.say.toLowerCase().split(/[^a-z඀-෿]+/).filter(Boolean);
    const sinhalaStyle = /[඀-෿]/.test(turn.say) || tokens.some((t) => SINGLISH_TELLS.has(t));
    const neutral = tokens.length === 0 || tokens.every((t) => NEUTRAL_WORDS.has(t));
    const want: "en" | "si" = e.replyLang ?? (turn.locale === "en" ? "en" : turn.locale === "si" ? "si" : neutral && n > 0 ? prevWant : sinhalaStyle ? "si" : "en");
    note("language", hasSinhala(result.reply.text) === (want === "si"), `reply is ${hasSinhala(result.reply.text) ? "Sinhala" : "English"}, wanted ${want}`);
    prevWant = want;

    const hall: string[] = [];
    if (!isTemplateReply(result.reply.text)) hall.push("reply is not made of fixed templates");
    if (SENTENCE_DIGITS.test(result.reply.text)) hall.push("digits or currency in the reply text");
    if (textsOf("verification_failed").includes(first)) hall.push("verification failed");
    for (const i of RICH) if (result.reply.text.toLowerCase().includes(i.name.toLowerCase())) hall.push(`reply names ${i.name}`);
    for (const c of ps) {
      const item = richById(c.id);
      if (!item) hall.push(`unknown product ${c.id}`);
      else if (c.name !== item.name || (c.brand ?? "") !== item.brand || Math.round(c.price.amount * 100) !== Math.round(richPrice(c.id) * 100)) hall.push(`card ${c.id} differs from the catalogue`);
    }
    note("hallucination", hall.length === 0, hall.join("; "));

    prevFirst = first;
    out.push({ scenario: sc.id, lang: sc.lang, metric, turn: n + 1, say: turn.say, reply: result.reply.text, checks, failures });
  }
  return out;
}

export interface MetricSummary {
  applicable: number;
  passed: number;
  pct: number;
}
export type Report = Record<Metric, MetricSummary>;

export function summarise(results: readonly TurnResult[], filter: (r: TurnResult) => boolean = () => true): Report {
  const rep = {} as Report;
  for (const m of METRICS) {
    const rows = results.filter(filter).filter((r) => r.checks[m] !== undefined);
    const passed = rows.filter((r) => r.checks[m]).length;
    rep[m] = { applicable: rows.length, passed, pct: rows.length ? Math.round((passed / rows.length) * 1000) / 10 : 0 };
  }
  return rep;
}

export async function runAll(scenarios: readonly R0Scenario[]): Promise<TurnResult[]> {
  const all: TurnResult[] = [];
  for (const sc of scenarios) all.push(...(await runScenario(sc)));
  return all;
}

export const formatReport = (rep: Report): string => METRICS.map((m) => `${m.padEnd(15)} ${rep[m].passed}/${rep[m].applicable} = ${rep[m].pct}%`).join("\n");
