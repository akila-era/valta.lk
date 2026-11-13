// Compare two M3-B report directories (each holding dev.json and test.json): node compare.mjs <before-dir> <after-dir> [--misses dev]
// Prints overall, per-group and false-tool numbers for dev and test, and optionally the remaining misses of ONE set.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [before, after, ...rest] = process.argv.slice(2);
const missesOf = rest[0] === "--misses" ? rest[1] : null;
const load = (d, n) => JSON.parse(readFileSync(join(d, `${n}.json`), "utf8"));
const groups = ["si", "singlish", "en", "mixed"];
for (const n of ["dev", "test"]) {
  const b = load(before, n);
  const a = load(after, n);
  console.log(`\n== ${n} (n=${a.n})`);
  const line = (label, x, y) => console.log(`${label.padEnd(10)} ${String(x.correct).padStart(3)}/${x.n} ${String(x.correctPct).padStart(5)}%  ->  ${String(y.correct).padStart(3)}/${y.n} ${String(y.correctPct).padStart(5)}%   falseTool ${x.falseToolCalls} -> ${y.falseToolCalls}   abstained ${x.abstained} -> ${y.abstained}   wrongIntent ${x.wrongIntent} -> ${y.wrongIntent}`);
  for (const g of groups) line(g, b.perGroup[g], a.perGroup[g]);
  line("overall", b.overall, a.overall);
  console.log(`shopping   ${b.shoppingOnly.correctPct}% -> ${a.shoppingOnly.correctPct}%    scope labels ${b.scopeOnly.correctPct}% -> ${a.scopeOnly.correctPct}% (falseTool ${b.scopeOnly.falseToolCalls} -> ${a.scopeOnly.falseToolCalls})`);
  if (missesOf === n) for (const m of a.misses) console.log(`  ${m.group.slice(0, 4)} | ${m.kind.slice(0, 6)} | ${m.want} -> ${m.got} (${m.action}) | ${m.text}`);
}
