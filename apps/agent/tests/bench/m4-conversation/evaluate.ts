import { createMockStack } from "../../../src/mock/stack";
import type { ConversationIntent } from "../../../src/router/conversation";
import { run } from "../../fixtures/pipeline-helpers";
import type { ConvCase, ConvLang } from "./types";

export interface ConvResult {
  case: ConvCase;
  got: ConversationIntent | "none";
  ok: boolean;
}

/** Runs each case through the real pipeline on the MOCK catalogue (no model): history first, then the message. Returns the intent decided for the last message. */
export async function evaluate(cases: readonly ConvCase[]): Promise<ConvResult[]> {
  const out: ConvResult[] = [];
  for (const c of cases) {
    const seen: { v: ConversationIntent | "none" } = { v: "none" };
    const s = createMockStack({ onDecision: (d) => void (seen.v = d.intent) });
    for (const h of c.history ?? []) await run(s.pipeline, h);
    seen.v = "none";
    await run(s.pipeline, c.text);
    const got = ((): ConversationIntent | "none" => seen.v)();
    out.push({ case: c, got, ok: got === c.expected });
  }
  return out;
}

export interface Accuracy {
  total: number;
  correct: number;
  pct: number;
}

export function accuracyByLanguage(results: readonly ConvResult[]): Record<ConvLang | "all", Accuracy> {
  const langs: (ConvLang | "all")[] = ["si", "singlish", "en", "mixed", "all"];
  const rec = {} as Record<ConvLang | "all", Accuracy>;
  for (const l of langs) {
    const rows = l === "all" ? results : results.filter((r) => r.case.lang === l);
    const correct = rows.filter((r) => r.ok).length;
    rec[l] = { total: rows.length, correct, pct: rows.length ? Math.round((correct / rows.length) * 1000) / 10 : 0 };
  }
  return rec;
}

export const formatAccuracy = (a: Record<ConvLang | "all", Accuracy>): string =>
  (["si", "singlish", "en", "mixed", "all"] as const).map((l) => `${l.padEnd(8)} ${a[l].correct}/${a[l].total} = ${a[l].pct}%`).join("\n");
