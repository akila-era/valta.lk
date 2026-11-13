/**
 * Command line for scoring native-reviewer files (not part of the normal test run). Bundled into one file so it can be run with
 * plain node anywhere; it only reads the CSV files named and writes the report and adjudication sheet to --out.
 * Usage: node aggregate-reviews.mjs --out <dir> reviewer1.csv reviewer2.csv [reviewer3.csv ...]
 * The reviewer id is the file name without its extension (use initials or ids, never real names).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { adjudicationCsv, aggregate, parseReviewFile } from "../bench/m3b/review-aggregate";

const args = process.argv.slice(2);
const oi = args.indexOf("--out");
const out = oi >= 0 ? args[oi + 1] : undefined;
const files = args.filter((a, i) => i !== oi && i !== oi + 1);
if (!out || files.length === 0) {
  console.error("usage: aggregate-reviews --out <dir> reviewer1.csv reviewer2.csv [...]");
  process.exit(2);
}
const reviewers = files.map((f) => ({ id: basename(f).replace(/\.[^.]+$/, ""), rows: parseReviewFile(readFileSync(f, "utf8")) }));
const report = aggregate(reviewers);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "review-report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(out, "adjudication.csv"), adjudicationCsv(report));
console.log(`reviewers ${report.reviewers.join(", ")}   items ${report.items}   answered by all ${report.itemsAllAnswered}`);
console.log(`label-correct agreement: mean kappa ${report.agreement.labelCorrect.meanKappa ?? "n/a"}; naturalness kappa ${report.agreement.natural.meanKappa ?? "n/a"}`);
for (const [g, s] of Object.entries(report.perGroup)) console.log(`${g.padEnd(9)} natural ${s.naturalYesPct ?? "n/a"}% / awkward ${s.naturalAwkwardPct ?? "n/a"}% / not ${s.naturalNoPct ?? "n/a"}%   label challenged ${s.labelChallengedPct ?? "n/a"}%`);
console.log(`${report.adjudication.length} items need adjudication (written to adjudication.csv)`);
console.log(`criteria: two reviewers ${report.criteria.atLeastTwoReviewers}; kappa >= 0.7 ${report.criteria.kappaAtLeast0_7}; all items answered ${report.criteria.allItemsAnswered}`);
