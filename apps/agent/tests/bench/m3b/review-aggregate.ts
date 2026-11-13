/**
 * Aggregation of native-reviewer CSV files (M3-B review pack). Pure functions: parse reviewer files, measure agreement, and list the
 * rows that need adjudication. It scores the REVIEW (are the labels and wording right?); it never touches the router or tunes it.
 * Reviewer ids come from the file names; no personal data is read or kept.
 */
export interface ReviewRow {
  id: string;
  set: string;
  group: string;
  message: string;
  expectedLabel: string;
  style: string;
  natural: string; // yes | no | awkward | ""
  labelCorrect: string; // yes | no | ""
  betterLabel: string;
  betterWording: string;
  notes: string;
}

/** RFC 4180 style parser: quoted cells, doubled quotes, CRLF or LF, optional byte-order mark. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const norm = (v: string | undefined) => (v ?? "").trim().toLowerCase();

export function parseReviewFile(text: string): ReviewRow[] {
  const rows = parseCsv(text);
  const header = rows.shift() ?? [];
  const col = (prefix: string) => header.findIndex((h) => h.toLowerCase().startsWith(prefix));
  const ix = { id: col("id"), set: col("set"), group: col("language_group"), msg: col("message"), exp: col("expected_label"), style: col("style"), r1: col("r1_"), r2: col("r2_"), r3: col("r3_"), r4: col("r4_"), r5: col("r5_") };
  if (Object.values(ix).some((i) => i < 0)) throw new Error("This does not look like a review-messages file: a required column is missing.");
  return rows.map((r) => ({
    id: r[ix.id] ?? "",
    set: r[ix.set] ?? "",
    group: r[ix.group] ?? "",
    message: r[ix.msg] ?? "",
    expectedLabel: r[ix.exp] ?? "",
    style: r[ix.style] ?? "",
    natural: norm(r[ix.r1]),
    labelCorrect: norm(r[ix.r2]),
    betterLabel: (r[ix.r3] ?? "").trim(),
    betterWording: (r[ix.r4] ?? "").trim(),
    notes: (r[ix.r5] ?? "").trim(),
  }));
}

/** Cohen's kappa for two raters on categorical answers, over the items both answered. Returns null when it is undefined. */
export function cohenKappa(a: string[], b: string[]): number | null {
  const pairs = a.map((x, i) => [x, b[i]!] as const).filter(([x, y]) => x !== "" && y !== "");
  const n = pairs.length;
  if (n === 0) return null;
  const cats = [...new Set(pairs.flat())];
  const po = pairs.filter(([x, y]) => x === y).length / n;
  const pe = cats.reduce((sum, c) => sum + (pairs.filter(([x]) => x === c).length / n) * (pairs.filter(([, y]) => y === c).length / n), 0);
  if (pe === 1) return po === 1 ? 1 : null;
  return Math.round(((po - pe) / (1 - pe)) * 1000) / 1000;
}

export interface Reviewer {
  id: string;
  rows: ReviewRow[];
}

export interface AggregateReport {
  reviewers: string[];
  items: number;
  /** Items every reviewer answered (the basis of agreement figures). */
  itemsAllAnswered: number;
  agreement: { labelCorrect: { pairs: { a: string; b: string; kappa: number | null; percent: number | null }[]; meanKappa: number | null }; natural: { meanKappa: number | null } };
  /** Share of reviewer answers per group; the language-quality view, reported separately for each group. */
  perGroup: Record<string, { answers: number; naturalYesPct: number | null; naturalAwkwardPct: number | null; naturalNoPct: number | null; labelChallengedPct: number | null }>;
  /** Rows the reviewers disagree on, or that any reviewer says have a wrong label: for adjudication. */
  adjudication: { id: string; group: string; message: string; expectedLabel: string; answers: { reviewer: string; natural: string; labelCorrect: string; betterLabel: string; betterWording: string }[]; reason: "disagree_on_label" | "disagree_on_naturalness" | "label_challenged" }[];
  /** Meets the acceptance criteria written in docs/AI_M3B_NATIVE_REVIEW_PACK.md section 5 (reviews only; the independent set is separate). */
  criteria: { atLeastTwoReviewers: boolean; kappaAtLeast0_7: boolean | null; allItemsAnswered: boolean };
}

const pct = (a: number, b: number) => (b === 0 ? null : Math.round((1000 * a) / b) / 10);

export function aggregate(reviewers: Reviewer[]): AggregateReport {
  const byId = new Map<string, Map<string, ReviewRow>>();
  for (const r of reviewers) byId.set(r.id, new Map(r.rows.map((x) => [x.id, x])));
  const ids = [...new Set(reviewers.flatMap((r) => r.rows.map((x) => x.id)))].sort();
  const meta = new Map(reviewers.flatMap((r) => r.rows.map((x) => [x.id, x] as const)));

  const answered = (id: string) => reviewers.every((r) => byId.get(r.id)!.get(id)?.labelCorrect);
  const itemsAllAnswered = ids.filter(answered).length;

  const pairs: AggregateReport["agreement"]["labelCorrect"]["pairs"] = [];
  const naturalKappas: number[] = [];
  for (let i = 0; i < reviewers.length; i++) {
    for (let j = i + 1; j < reviewers.length; j++) {
      const A = reviewers[i]!.id;
      const B = reviewers[j]!.id;
      const get = (rid: string, f: (r: ReviewRow) => string) => ids.map((id) => f(byId.get(rid)!.get(id) ?? ({} as ReviewRow)) ?? "");
      const la = get(A, (r) => r.labelCorrect);
      const lb = get(B, (r) => r.labelCorrect);
      const both = la.map((x, k) => [x, lb[k]!]).filter(([x, y]) => x && y);
      pairs.push({ a: A, b: B, kappa: cohenKappa(la, lb), percent: pct(both.filter(([x, y]) => x === y).length, both.length) });
      const k = cohenKappa(get(A, (r) => r.natural), get(B, (r) => r.natural));
      if (k !== null) naturalKappas.push(k);
    }
  }
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);
  const kappas = pairs.map((p) => p.kappa).filter((k): k is number => k !== null);

  const perGroup: AggregateReport["perGroup"] = {};
  const counts: Record<string, { n: number; yes: number; awk: number; no: number; chal: number; lab: number }> = {};
  for (const r of reviewers) {
    for (const row of r.rows) {
      const c = (counts[row.group] ??= { n: 0, yes: 0, awk: 0, no: 0, chal: 0, lab: 0 });
      if (row.natural) {
        c.n++;
        if (row.natural === "yes") c.yes++;
        else if (row.natural === "awkward") c.awk++;
        else if (row.natural === "no") c.no++;
      }
      if (row.labelCorrect) {
        c.lab++;
        if (row.labelCorrect === "no") c.chal++;
      }
    }
  }
  for (const [g, c] of Object.entries(counts)) perGroup[g] = { answers: c.n, naturalYesPct: pct(c.yes, c.n), naturalAwkwardPct: pct(c.awk, c.n), naturalNoPct: pct(c.no, c.n), labelChallengedPct: pct(c.chal, c.lab) };

  const adjudication: AggregateReport["adjudication"] = [];
  for (const id of ids) {
    const answers = reviewers.map((r) => ({ reviewer: r.id, row: byId.get(r.id)!.get(id) })).filter((a) => a.row);
    const labels = new Set(answers.map((a) => a.row!.labelCorrect).filter(Boolean));
    const naturals = new Set(answers.map((a) => a.row!.natural).filter(Boolean));
    const challenged = answers.some((a) => a.row!.labelCorrect === "no");
    const reason = labels.size > 1 ? "disagree_on_label" : naturals.size > 1 ? "disagree_on_naturalness" : challenged ? "label_challenged" : null;
    if (!reason) continue;
    const m = meta.get(id)!;
    adjudication.push({ id, group: m.group, message: m.message, expectedLabel: m.expectedLabel, reason, answers: answers.map((a) => ({ reviewer: a.reviewer, natural: a.row!.natural, labelCorrect: a.row!.labelCorrect, betterLabel: a.row!.betterLabel, betterWording: a.row!.betterWording })) });
  }

  const meanKappa = mean(kappas);
  return {
    reviewers: reviewers.map((r) => r.id),
    items: ids.length,
    itemsAllAnswered,
    agreement: { labelCorrect: { pairs, meanKappa }, natural: { meanKappa: mean(naturalKappas) } },
    perGroup,
    adjudication,
    criteria: { atLeastTwoReviewers: reviewers.length >= 2, kappaAtLeast0_7: meanKappa === null ? null : meanKappa >= 0.7, allItemsAnswered: itemsAllAnswered === ids.length && ids.length > 0 },
  };
}

const q = (v: string) => `"${v.replaceAll('"', '""')}"`;
/** The adjudication sheet: one row per item that needs a decision, with every reviewer's answer and blank final columns. */
export function adjudicationCsv(report: AggregateReport): string {
  const head = ["id", "language_group", "message", "expected_label", "reason", ...report.reviewers.flatMap((r) => [`${r}_natural`, `${r}_label_correct`, `${r}_better_label`, `${r}_better_wording`]), "FINAL_label", "FINAL_wording", "adjudicator_notes"];
  const lines = report.adjudication.map((a) => [a.id, a.group, a.message, a.expectedLabel, a.reason, ...report.reviewers.flatMap((r) => { const x = a.answers.find((y) => y.reviewer === r); return [x?.natural ?? "", x?.labelCorrect ?? "", x?.betterLabel ?? "", x?.betterWording ?? ""]; }), "", "", ""]);
  return "﻿" + [head, ...lines].map((r) => r.map(q).join(",")).join("\r\n");
}
