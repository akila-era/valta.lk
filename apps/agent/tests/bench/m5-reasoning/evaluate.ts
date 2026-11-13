import { createMockStack } from "../../../src/mock/stack";
import type { Card } from "../../../src/contract/schemas";
import type { ConversationIntent } from "../../../src/router/conversation";
import { isNeutralMessage } from "../../../src/router/conversation";
import { detectLanguage } from "../../../src/router/language";
import { renderTemplate, TEMPLATE_KEYS } from "../../../src/router/templates";
import { sessionKey } from "../../../src/session/store";
import { hasSinhala } from "../../../src/util/script";
import { RichTransport, RICH, richById, richPrice, richSite } from "../../fixtures/rich-catalogue";
import { run, SESSION } from "../../fixtures/pipeline-helpers";
import type { ConvLang } from "../m4-conversation/types";
import type { Expect, Scenario } from "./types";

type ProductCard = Extract<Card, { type: "product" }>;
const products = (cards: Card[]): ProductCard[] => cards.filter((c): c is ProductCard => c.type === "product");

export type Metric = "intent" | "context" | "relevance" | "followUp" | "recommendation" | "tools" | "language" | "hallucination";

export interface TurnResult {
  scenario: string;
  lang: ConvLang;
  turn: number;
  say: string;
  /** Per metric: undefined = not applicable to this turn, true/false = result. */
  checks: Partial<Record<Metric, boolean>>;
  failures: string[];
}

const SENTENCE_DIGITS = /\d|\bRs\b|\bLKR\b/;

/** A template-made reply (or reply + one question). Anything else is not a verified answer. */
function isTemplateReply(text: string): boolean {
  const parts = text.split("\n\n");
  const known = new Set<string>();
  for (const k of TEMPLATE_KEYS) for (const l of ["en", "si"] as const) known.add(renderTemplate(k, l).text);
  return parts.length >= 1 && parts.length <= 2 && parts.every((p) => known.has(p));
}

function cardRules(e: Expect, cards: Card[], prevIds: string[]): string[] {
  const out: string[] = [];
  const ps = products(cards);
  if (e.noCards && cards.length > 0) out.push("expected no cards");
  if (e.minCards !== undefined && ps.length < e.minCards) out.push(`expected at least ${e.minCards} product cards, got ${ps.length}`);
  if (e.category) for (const c of ps) if (richById(c.id)?.category && !slugMatches(richById(c.id)!.category, e.category)) out.push(`card ${c.id} is not in ${e.category}`);
  if (e.maxPrice !== undefined) for (const c of ps) if (c.price.amount > e.maxPrice) out.push(`card ${c.id} costs ${c.price.amount} > ${e.maxPrice}`);
  if (e.brand) for (const c of ps) if ((c.brand ?? "").toLowerCase() !== e.brand.toLowerCase()) out.push(`card ${c.id} is not ${e.brand}`);
  if (e.containsIds) for (const id of e.containsIds) if (!ps.some((c) => c.id === id)) out.push(`missing ${id}`);
  if (e.excludesIds) for (const id of e.excludesIds) if (ps.some((c) => c.id === id)) out.push(`should not show ${id}`);
  if (e.comparison !== undefined) {
    const cmp = cards.find((c) => c.type === "comparison");
    if (!cmp || cmp.type !== "comparison" || cmp.products.length !== e.comparison) out.push(`expected a comparison of ${e.comparison}`);
  }
  void prevIds;
  return out;
}

const slugMatches = (categoryName: string, slug: string): boolean => categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-") === slug;

/** Every turn, whatever the scenario expects: no invented or altered catalogue fact, no free text, no false fit claim. */
function hallucinations(cards: Card[], reply: string, budgetMax: number | undefined, brand: string | undefined): string[] {
  const out: string[] = [];
  const ps = products(cards);
  if (reply === renderTemplate("verification_failed", "en").text || reply === renderTemplate("verification_failed", "si").text) out.push("verification failed");
  if (!isTemplateReply(reply)) out.push("reply is not made of fixed templates");
  if (SENTENCE_DIGITS.test(reply)) out.push("digits or currency in reply text");
  for (const i of RICH) if (reply.toLowerCase().includes(i.name.toLowerCase())) out.push(`reply names ${i.name}`);
  for (const c of ps) {
    const item = richById(c.id);
    if (!item) {
      out.push(`unknown product ${c.id}`);
      continue;
    }
    if (c.name !== item.name || (c.brand ?? "") !== item.brand) out.push(`card ${c.id} name or brand differs from the catalogue`);
    if (Math.round(c.price.amount * 100) !== Math.round(richPrice(c.id) * 100)) out.push(`card ${c.id} price differs from the catalogue`);
    if (c.available !== ((item.stock ?? 10) > 0)) out.push(`card ${c.id} stock state differs from the catalogue`);
  }
  // Fit claims are re-derived independently from the fixture numbers. "Best camera" means best among everything that matched, so the
  // candidate set is rebuilt from the fixture: same category, in stock, within the budget when anything fits it, the brand when the
  // shopper searched one brand.
  const shown = ps.map((c) => richById(c.id)!).filter(Boolean);
  let candidates = shown.length ? RICH.filter((i) => i.category === shown[0]!.category && (i.stock ?? 10) > 0) : [];
  if (shown.length && shown.every((i) => i.brand === shown[0]!.brand) && brand && shown[0]!.brand.toLowerCase() === brand.toLowerCase()) candidates = candidates.filter((i) => i.brand === shown[0]!.brand);
  if (budgetMax !== undefined && candidates.some((i) => richPrice(i.id) <= budgetMax)) candidates = candidates.filter((i) => richPrice(i.id) <= budgetMax);
  const best = (f: (i: (typeof shown)[number]) => number | undefined) => {
    const v = candidates.map(f).filter((x): x is number => x !== undefined);
    return v.length >= 2 && Math.max(...v) > Math.min(...v) ? Math.max(...v) : undefined;
  };
  const bestCam = best((i) => i.camera);
  const bestBat = best((i) => i.battery);
  const bestRam = best((i) => i.ram);
  for (const c of ps) {
    const item = richById(c.id);
    if (!item || !c.fit) continue;
    const price = richPrice(c.id);
    for (const r of c.fit.reasons) {
      const bad =
        (r === "within_budget" && !(budgetMax !== undefined && price <= budgetMax)) ||
        (r === "brand_match" && !(brand && item.brand.toLowerCase() === brand.toLowerCase())) ||
        (r === "best_camera" && !(bestCam !== undefined && item.camera === bestCam)) ||
        (r === "best_battery" && !(bestBat !== undefined && item.battery === bestBat)) ||
        (r === "most_memory" && !(bestRam !== undefined && item.ram === bestRam)) ||
        (r === "lowest_price" && !(price === Math.min(...shown.map((i) => richPrice(i.id))))) ||
        (r === "on_sale" && !item.salePrice) ||
        (r === "has_warranty" && !item.warrantyMonths) ||
        (r === "in_stock" && (item.stock ?? 10) <= 0);
      if (bad) out.push(`false fit reason ${r} on ${c.id}`);
    }
    for (const t of c.fit.tradeoffs) {
      const bad =
        (t === "over_budget" && !(budgetMax !== undefined && price > budgetMax)) ||
        (t === "out_of_stock" && (item.stock ?? 10) > 0) ||
        (t === "different_brand" && (!brand || item.brand.toLowerCase() === brand.toLowerCase())) ||
        (t === "no_camera_data" && item.camera !== undefined && item.via !== "none") ||
        (t === "no_battery_data" && item.battery !== undefined && item.via !== "none") ||
        (t === "no_memory_data" && item.ram !== undefined && item.via !== "none");
      if (bad) out.push(`false fit tradeoff ${t} on ${c.id}`);
    }
  }
  return out;
}

export async function runScenario(sc: Scenario): Promise<TurnResult[]> {
  const transport = new RichTransport();
  const tools: string[] = [];
  const seen: { v: ConversationIntent | "none" } = { v: "none" };
  const s = createMockStack({
    transport,
    site: richSite(),
    catalogueTtlMs: 0,
    metrics: { tool: (n) => void tools.push(n), toolBatchMs: () => undefined },
    onDecision: (d) => void (seen.v = d.intent),
  });
  const results: TurnResult[] = [];
  let prevIds: string[] = [];
  let prevWant: "en" | "si" = "en";
  const key = sessionKey({ kind: "guest" }, SESSION);

  for (const [n, turn] of sc.turns.entries()) {
    if (turn.setup === "erp_down") transport.setDown(true);
    tools.length = 0;
    seen.v = "none";
    const { result } = await run(s.pipeline, turn.say.trim() === "" ? " " : turn.say, turn.locale ? { locale: turn.locale } : {});
    const state = s.sessions.get(key);
    const profile = state?.reasoning.profile;
    const cards = result.cards;
    const ps = products(cards);
    const e = turn.expect ?? {};
    const intent = ((): ConversationIntent | "none" => seen.v)();
    const checks: Partial<Record<Metric, boolean>> = {};
    const failures: string[] = [];
    const note = (m: Metric, ok: boolean, why: string) => {
      checks[m] = (checks[m] ?? true) && ok;
      if (!ok) failures.push(`${m}: ${why}`);
    };

    if (e.intent !== undefined) note("intent", intent === e.intent, `intent ${intent} != ${e.intent}`);
    if (e.tools !== undefined) note("tools", JSON.stringify(tools) === JSON.stringify(e.tools), `tools ${JSON.stringify(tools)} != ${JSON.stringify(e.tools)}`);

    const rel = [...cardRules(e, cards, prevIds)];
    if (e.template !== undefined) {
      const firstPart = result.reply.text.split("\n\n")[0];
      const ok = firstPart === renderTemplate(e.template, "en").text || firstPart === renderTemplate(e.template, "si").text;
      if (!ok) rel.push(`reply is not ${e.template}`);
    }
    if (e.refers !== undefined && !(ps.length === 1 && ps[0]!.id === e.refers) && !ps.some((c) => c.id === e.refers)) rel.push(`not about ${e.refers}`);
    if (e.refersIndex !== undefined) {
      const want = prevIds[e.refersIndex - 1];
      if (!want || !ps.some((c) => c.id === want) || ps.length > 1) rel.push(`not about card #${e.refersIndex} of the previous turn (${want})`);
    }
    if (e.cartAddIndex !== undefined) {
      const want = prevIds[e.cartAddIndex - 1];
      const add = result.actions.find((a) => a.type === "cart.add");
      if (!add || (add as { productId?: string }).productId !== want) rel.push(`no cart proposal for card #${e.cartAddIndex} (${want})`);
    }
    const relevanceApplies = Object.keys(e).some((k) => ["noCards", "minCards", "category", "maxPrice", "brand", "template", "containsIds", "excludesIds", "refers", "refersIndex", "cartAddIndex", "comparison"].includes(k));
    if (relevanceApplies) note("relevance", rel.length === 0, rel.join("; "));

    const recs: string[] = [];
    if (e.topId !== undefined && ps[0]?.id !== e.topId) recs.push(`top is ${ps[0]?.id}, wanted ${e.topId}`);
    if (e.topAmong !== undefined && !(ps[0] && e.topAmong.includes(ps[0].id))) recs.push(`top is ${ps[0]?.id}, wanted one of ${e.topAmong.join(",")}`);
    if (e.fitHas) for (const r of e.fitHas) if (!ps[0]?.fit?.reasons.includes(r)) recs.push(`top card lacks fit reason ${r}`);
    if (e.fitOf) {
      const c = ps.find((x) => x.id === e.fitOf!.id);
      for (const t of e.fitOf.tradeoffs ?? []) if (!c?.fit?.tradeoffs.includes(t)) recs.push(`${e.fitOf.id} lacks tradeoff ${t}`);
      for (const r of e.fitOf.reasons ?? []) if (!c?.fit?.reasons.includes(r)) recs.push(`${e.fitOf.id} lacks reason ${r}`);
    }
    if (e.topId !== undefined || e.topAmong !== undefined || e.fitHas !== undefined || e.fitOf !== undefined) note("recommendation", recs.length === 0, recs.join("; "));

    if (e.ask !== undefined || e.noAsk) {
      const asked = state?.reasoning.pending;
      note("followUp", e.ask !== undefined ? asked === e.ask : asked === undefined, `asked ${asked ?? "nothing"}, wanted ${e.ask ?? "no question"}`);
    }
    if (e.profile) {
      const p = e.profile;
      const bad: string[] = [];
      if (p.category !== undefined && profile?.category !== p.category) bad.push(`category ${profile?.category} != ${p.category}`);
      if (p.brand !== undefined && (profile?.brand ?? "").toLowerCase() !== p.brand.toLowerCase()) bad.push(`brand ${profile?.brand} != ${p.brand}`);
      if (p.budgetMax !== undefined && profile?.budgetMaxLkr !== p.budgetMax) bad.push(`budget ${profile?.budgetMaxLkr} != ${p.budgetMax}`);
      if (p.noBudget && profile?.budgetMaxLkr !== undefined) bad.push(`budget should have been cleared, is ${profile.budgetMaxLkr}`);
      for (const u of p.usage ?? []) if (!profile?.usage.includes(u)) bad.push(`usage ${u} not remembered`);
      note("context", bad.length === 0, bad.join("; "));
    }

    // Always measured: language consistency and hallucination.
    const base = detectLanguage(turn.say, turn.locale && turn.locale !== "auto" ? { locale: turn.locale } : {}).script === "en" ? "en" : "si";
    const want: "en" | "si" = turn.locale === "en" ? "en" : turn.locale === "si" ? "si" : isNeutralMessage(turn.say) && n > 0 ? prevWant : base;
    const gotSinhala = hasSinhala(result.reply.text);
    note("language", gotSinhala === (want === "si"), `reply is ${gotSinhala ? "Sinhala-style" : "English"}, message wanted ${want}`);
    prevWant = want;
    const hall = hallucinations(cards, result.reply.text, profile?.budgetMaxLkr, profile?.brand);
    note("hallucination", hall.length === 0, hall.join("; "));

    prevIds = ps.length > 0 ? ps.map((c) => c.id) : prevIds;
    results.push({ scenario: sc.id, lang: sc.lang, turn: n + 1, say: turn.say, checks, failures });
  }
  return results;
}

export interface MetricSummary {
  applicable: number;
  passed: number;
  pct: number;
}

export type Report = Record<Metric, MetricSummary>;
export const METRICS: Metric[] = ["intent", "context", "relevance", "followUp", "recommendation", "tools", "language", "hallucination"];

export function summarise(results: readonly TurnResult[], filter: (r: TurnResult) => boolean = () => true): Report {
  const rep = {} as Report;
  for (const m of METRICS) {
    const rows = results.filter(filter).filter((r) => r.checks[m] !== undefined);
    const passed = rows.filter((r) => r.checks[m]).length;
    rep[m] = { applicable: rows.length, passed, pct: rows.length ? Math.round((passed / rows.length) * 1000) / 10 : 0 };
  }
  return rep;
}

export async function runAll(scenarios: readonly Scenario[]): Promise<TurnResult[]> {
  const all: TurnResult[] = [];
  for (const sc of scenarios) all.push(...(await runScenario(sc)));
  return all;
}

export const formatReport = (rep: Report): string => METRICS.map((m) => `${m.padEnd(15)} ${rep[m].passed}/${rep[m].applicable} = ${rep[m].pct}%`).join("\n");
