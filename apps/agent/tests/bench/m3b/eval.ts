import { route } from "../../eval/harness";
import type { RouteDecision } from "../../../src/router/types";
import type { Group, M3BCase, Style, Want } from "./types";

/**
 * Scoring for the M3-B datasets. Four outcomes matter, and they are reported separately because they cost different things:
 *  - correct:    the router's intent is the expected one (policy questions accept store_info; "ambiguous" accepts asking a question);
 *  - abstained:  it asked a question instead of acting. Annoying, harmless;
 *  - wrongIntent: a different intent. Can be harmless (a different question) or harmful (below);
 *  - falseToolCall: a SHOPPING TOOL was planned for a message that needed none (general, external site, small talk, policy,
 *    ambiguous) or for the wrong purpose. This is the number to drive to zero.
 */
export interface GroupReport {
  n: number;
  correct: number;
  correctPct: number;
  abstained: number;
  wrongIntent: number;
  falseToolCalls: number;
  entityChecked: number;
  entityCorrect: number;
}

export interface Miss {
  id: string;
  group: Group;
  style: Style;
  text: string;
  want: Want;
  got: string;
  action: string;
  kind: "abstained" | "wrongIntent" | "falseToolCall";
}

export interface M3BReport {
  set: string;
  n: number;
  perGroup: Record<Group, GroupReport>;
  perStyle: Record<string, { n: number; correct: number; correctPct: number }>;
  perWant: Record<string, { n: number; correct: number }>;
  overall: GroupReport;
  /** The shopping-intent subset only (excludes the scope labels general, external_site, ambiguous). */
  shoppingOnly: { n: number; correct: number; correctPct: number };
  /** The scope labels only: general, external_site, ambiguous, website_policy. */
  scopeOnly: { n: number; correct: number; correctPct: number; falseToolCalls: number };
  misses: Miss[];
}

const SCOPE: readonly Want[] = ["general", "external_site", "ambiguous", "website_policy"];
// store_info is not listed: a delivery-charge question legitimately runs the delivery lookup tool.
const NO_TOOL_WANTS: readonly Want[] = ["general", "external_site", "ambiguous", "website_policy", "smalltalk", "order_support", "checkout_handoff"];

export function isCorrect(want: Want, d: RouteDecision): boolean {
  const intent = d.intent as string;
  if (want === "website_policy") return intent === "store_info";
  if (want === "ambiguous") return intent === "unknown" || d.action === "clarify";
  return intent === want;
}

/** A shopping tool was planned although the message needed none, or the plan was for a different purpose. */
export function isFalseToolCall(want: Want, d: RouteDecision): boolean {
  if (d.action !== "tool") return false;
  if (NO_TOOL_WANTS.includes(want)) return true;
  return (d.intent as string) !== want;
}

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((1000 * a) / b) / 10);
const empty = (): GroupReport => ({ n: 0, correct: 0, correctPct: 0, abstained: 0, wrongIntent: 0, falseToolCalls: 0, entityChecked: 0, entityCorrect: 0 });

function entityOk(c: M3BCase, d: RouteDecision): boolean {
  const x = c.entities;
  if (!x) return true;
  const e = d.entities;
  return (
    (x.maxPriceLkr === undefined || e.maxPriceLkr === x.maxPriceLkr) &&
    (x.sort === undefined || e.sort === x.sort) &&
    (x.quantity === undefined || e.quantity === x.quantity) &&
    (x.referent === undefined || Boolean(e.referent) === x.referent) &&
    (x.topic === undefined || d.topic === x.topic)
  );
}

export function evaluateSet(name: string, cases: readonly M3BCase[]): M3BReport {
  const groups: Group[] = ["si", "singlish", "en", "mixed"];
  const perGroup = Object.fromEntries(groups.map((g) => [g, empty()])) as Record<Group, GroupReport>;
  const overall = empty();
  const perStyle: M3BReport["perStyle"] = {};
  const perWant: M3BReport["perWant"] = {};
  const misses: Miss[] = [];
  let shopN = 0;
  let shopOk = 0;
  const scope = { n: 0, correct: 0, correctPct: 0, falseToolCalls: 0 };

  for (const c of cases) {
    const d = route(c.text);
    const ok = isCorrect(c.want, d);
    const falseTool = isFalseToolCall(c.want, d);
    const abstained = !ok && (d.intent === "unknown" || d.action === "clarify") && c.want !== "ambiguous";
    const wrongIntent = !ok && !abstained;
    for (const r of [perGroup[c.group], overall]) {
      r.n++;
      if (ok) r.correct++;
      if (abstained) r.abstained++;
      if (wrongIntent) r.wrongIntent++;
      if (falseTool) r.falseToolCalls++;
      if (c.entities && ok) {
        r.entityChecked++;
        if (entityOk(c, d)) r.entityCorrect++;
      }
    }
    const st = (perStyle[c.style] ??= { n: 0, correct: 0, correctPct: 0 });
    st.n++;
    if (ok) st.correct++;
    const w = (perWant[c.want] ??= { n: 0, correct: 0 });
    w.n++;
    if (ok) w.correct++;
    if (SCOPE.includes(c.want)) {
      scope.n++;
      if (ok) scope.correct++;
      if (falseTool) scope.falseToolCalls++;
    } else {
      shopN++;
      if (ok) shopOk++;
    }
    if (!ok || falseTool) misses.push({ id: c.id, group: c.group, style: c.style, text: c.text, want: c.want, got: d.intent as string, action: d.action, kind: falseTool ? "falseToolCall" : abstained ? "abstained" : "wrongIntent" });
  }
  for (const r of [...Object.values(perGroup), overall]) r.correctPct = pct(r.correct, r.n);
  for (const s of Object.values(perStyle)) s.correctPct = pct(s.correct, s.n);
  scope.correctPct = pct(scope.correct, scope.n);
  return { set: name, n: cases.length, perGroup, perStyle, perWant, overall, shoppingOnly: { n: shopN, correct: shopOk, correctPct: pct(shopOk, shopN) }, scopeOnly: scope, misses };
}

export function formatReport(r: M3BReport): string {
  const g = (k: Group) => `${k.padEnd(9)} ${String(r.perGroup[k].correct).padStart(3)}/${String(r.perGroup[k].n).padEnd(3)} ${String(r.perGroup[k].correctPct).padStart(5)}%  abstained ${String(r.perGroup[k].abstained).padStart(2)}  wrongIntent ${String(r.perGroup[k].wrongIntent).padStart(2)}  falseToolCalls ${r.perGroup[k].falseToolCalls}`;
  return [`M3-B ${r.set} (n=${r.n})`, g("si"), g("singlish"), g("en"), g("mixed"), `overall   ${r.overall.correct}/${r.overall.n} ${r.overall.correctPct}%  falseToolCalls ${r.overall.falseToolCalls}`, `shopping intents ${r.shoppingOnly.correct}/${r.shoppingOnly.n} (${r.shoppingOnly.correctPct}%)   scope labels ${r.scopeOnly.correct}/${r.scopeOnly.n} (${r.scopeOnly.correctPct}%) falseToolCalls ${r.scopeOnly.falseToolCalls}`].join("\n");
}
