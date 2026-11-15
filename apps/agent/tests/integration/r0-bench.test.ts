import { describe, expect, it } from "vitest";
import { R0_DEV_SET } from "../bench/r0-local-rules/dev-set";
import { METRICS, runAll, summarise } from "../bench/r0-local-rules/evaluate";

/**
 * R0 DEV SET guard. DEV ONLY (TUNED-ON): the rules were built while this set was written, so 100% here is NOT held-out evidence. It guards the behaviour R0
 * added (and the near-miss scenarios guard against rules that fire where they must not) from regressing. Each metric is reported separately.
 */
describe("R0: the DEV set must not regress (tuned-on; guards behaviour, is not held-out evidence)", () => {
  it("holds every measured metric at 100%, and every scenario family is represented", async () => {
    const res = await runAll(R0_DEV_SET);
    const failing = res.filter((r) => Object.values(r.checks).some((ok) => ok === false)).map((r) => `${r.scenario}#${r.turn} ${JSON.stringify(r.say)}: ${r.failures.join(" | ")}`);
    expect(failing).toEqual([]);
    const rep = summarise(res);
    for (const m of METRICS) {
      expect(rep[m].applicable, `${m} has scenarios`).toBeGreaterThan(0);
      expect(rep[m].pct, m).toBe(100);
    }
  });
});
