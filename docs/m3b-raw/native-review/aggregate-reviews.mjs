// tests/real/review-aggregate.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// tests/bench/m3b/review-aggregate.ts
function parseCsv(text) {
  const s = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
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
var norm = (v) => (v ?? "").trim().toLowerCase();
function parseReviewFile(text) {
  const rows = parseCsv(text);
  const header = rows.shift() ?? [];
  const col = (prefix) => header.findIndex((h) => h.toLowerCase().startsWith(prefix));
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
    notes: (r[ix.r5] ?? "").trim()
  }));
}
function cohenKappa(a, b) {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x !== "" && y !== "");
  const n = pairs.length;
  if (n === 0) return null;
  const cats = [...new Set(pairs.flat())];
  const po = pairs.filter(([x, y]) => x === y).length / n;
  const pe = cats.reduce((sum, c) => sum + pairs.filter(([x]) => x === c).length / n * (pairs.filter(([, y]) => y === c).length / n), 0);
  if (pe === 1) return po === 1 ? 1 : null;
  return Math.round((po - pe) / (1 - pe) * 1e3) / 1e3;
}
var pct = (a, b) => b === 0 ? null : Math.round(1e3 * a / b) / 10;
function aggregate(reviewers2) {
  const byId = /* @__PURE__ */ new Map();
  for (const r of reviewers2) byId.set(r.id, new Map(r.rows.map((x) => [x.id, x])));
  const ids = [...new Set(reviewers2.flatMap((r) => r.rows.map((x) => x.id)))].sort();
  const meta = new Map(reviewers2.flatMap((r) => r.rows.map((x) => [x.id, x])));
  const answered = (id) => reviewers2.every((r) => byId.get(r.id).get(id)?.labelCorrect);
  const itemsAllAnswered = ids.filter(answered).length;
  const pairs = [];
  const naturalKappas = [];
  for (let i = 0; i < reviewers2.length; i++) {
    for (let j = i + 1; j < reviewers2.length; j++) {
      const A = reviewers2[i].id;
      const B = reviewers2[j].id;
      const get = (rid, f) => ids.map((id) => f(byId.get(rid).get(id) ?? {}) ?? "");
      const la = get(A, (r) => r.labelCorrect);
      const lb = get(B, (r) => r.labelCorrect);
      const both = la.map((x, k2) => [x, lb[k2]]).filter(([x, y]) => x && y);
      pairs.push({ a: A, b: B, kappa: cohenKappa(la, lb), percent: pct(both.filter(([x, y]) => x === y).length, both.length) });
      const k = cohenKappa(get(A, (r) => r.natural), get(B, (r) => r.natural));
      if (k !== null) naturalKappas.push(k);
    }
  }
  const mean = (xs) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 1e3) / 1e3 : null;
  const kappas = pairs.map((p) => p.kappa).filter((k) => k !== null);
  const perGroup = {};
  const counts = {};
  for (const r of reviewers2) {
    for (const row of r.rows) {
      const c = counts[row.group] ??= { n: 0, yes: 0, awk: 0, no: 0, chal: 0, lab: 0 };
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
  const adjudication = [];
  for (const id of ids) {
    const answers = reviewers2.map((r) => ({ reviewer: r.id, row: byId.get(r.id).get(id) })).filter((a) => a.row);
    const labels = new Set(answers.map((a) => a.row.labelCorrect).filter(Boolean));
    const naturals = new Set(answers.map((a) => a.row.natural).filter(Boolean));
    const challenged = answers.some((a) => a.row.labelCorrect === "no");
    const reason = labels.size > 1 ? "disagree_on_label" : naturals.size > 1 ? "disagree_on_naturalness" : challenged ? "label_challenged" : null;
    if (!reason) continue;
    const m = meta.get(id);
    adjudication.push({ id, group: m.group, message: m.message, expectedLabel: m.expectedLabel, reason, answers: answers.map((a) => ({ reviewer: a.reviewer, natural: a.row.natural, labelCorrect: a.row.labelCorrect, betterLabel: a.row.betterLabel, betterWording: a.row.betterWording })) });
  }
  const meanKappa = mean(kappas);
  return {
    reviewers: reviewers2.map((r) => r.id),
    items: ids.length,
    itemsAllAnswered,
    agreement: { labelCorrect: { pairs, meanKappa }, natural: { meanKappa: mean(naturalKappas) } },
    perGroup,
    adjudication,
    criteria: { atLeastTwoReviewers: reviewers2.length >= 2, kappaAtLeast0_7: meanKappa === null ? null : meanKappa >= 0.7, allItemsAnswered: itemsAllAnswered === ids.length && ids.length > 0 }
  };
}
var q = (v) => `"${v.replaceAll('"', '""')}"`;
function adjudicationCsv(report2) {
  const head = ["id", "language_group", "message", "expected_label", "reason", ...report2.reviewers.flatMap((r) => [`${r}_natural`, `${r}_label_correct`, `${r}_better_label`, `${r}_better_wording`]), "FINAL_label", "FINAL_wording", "adjudicator_notes"];
  const lines = report2.adjudication.map((a) => [a.id, a.group, a.message, a.expectedLabel, a.reason, ...report2.reviewers.flatMap((r) => {
    const x = a.answers.find((y) => y.reviewer === r);
    return [x?.natural ?? "", x?.labelCorrect ?? "", x?.betterLabel ?? "", x?.betterWording ?? ""];
  }), "", "", ""]);
  return "\uFEFF" + [head, ...lines].map((r) => r.map(q).join(",")).join("\r\n");
}

// tests/real/review-aggregate.ts
var args = process.argv.slice(2);
var oi = args.indexOf("--out");
var out = oi >= 0 ? args[oi + 1] : void 0;
var files = args.filter((a, i) => i !== oi && i !== oi + 1);
if (!out || files.length === 0) {
  console.error("usage: aggregate-reviews --out <dir> reviewer1.csv reviewer2.csv [...]");
  process.exit(2);
}
var reviewers = files.map((f) => ({ id: basename(f).replace(/\.[^.]+$/, ""), rows: parseReviewFile(readFileSync(f, "utf8")) }));
var report = aggregate(reviewers);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "review-report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(out, "adjudication.csv"), adjudicationCsv(report));
console.log(`reviewers ${report.reviewers.join(", ")}   items ${report.items}   answered by all ${report.itemsAllAnswered}`);
console.log(`label-correct agreement: mean kappa ${report.agreement.labelCorrect.meanKappa ?? "n/a"}; naturalness kappa ${report.agreement.natural.meanKappa ?? "n/a"}`);
for (const [g, s] of Object.entries(report.perGroup)) console.log(`${g.padEnd(9)} natural ${s.naturalYesPct ?? "n/a"}% / awkward ${s.naturalAwkwardPct ?? "n/a"}% / not ${s.naturalNoPct ?? "n/a"}%   label challenged ${s.labelChallengedPct ?? "n/a"}%`);
console.log(`${report.adjudication.length} items need adjudication (written to adjudication.csv)`);
console.log(`criteria: two reviewers ${report.criteria.atLeastTwoReviewers}; kappa >= 0.7 ${report.criteria.kappaAtLeast0_7}; all items answered ${report.criteria.allItemsAnswered}`);
