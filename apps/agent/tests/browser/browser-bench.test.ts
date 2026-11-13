import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { runBrowserBench, SCENARIOS } from "./browser-bench";

/**
 * Runs the 15 browser-control scenarios 20 times each against the MOCK driver with SCRIPTED planners. These are safety invariants of
 * the controls (not model quality): every scenario must end as designed, with zero incorrect actions, zero off-site pages shown to
 * the assistant and zero session leaks. Set M3A_BROWSER_REPORT=<file> to write the JSON report.
 */
describe("browser-control benchmark (mock driver, scripted planners)", async () => {
  const { results, summary } = await runBrowserBench();

  it("covers the fourteen required scenarios plus the leaky-driver defence-in-depth case", () => {
    expect(SCENARIOS).toHaveLength(15);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(15);
  });

  it("every scenario ends as designed, in every one of its 20 runs", () => {
    for (const r of results) expect(r.passed, `${r.id} ${r.name}: expected ${r.expected}, got ${r.actual}`).toBe(true);
    expect(summary.taskCompletionAccuracyPct).toBe(100);
  });

  it("makes no incorrect action, shows the assistant no off-site page, leaks no session, and has no unexpected tool failure", () => {
    expect(summary.incorrectActions).toBe(0);
    expect(summary.assistantVisibleDomainViolations).toBe(0);
    expect(summary.sessionIsolationLeaks).toBe(0);
    expect(summary.unexpectedToolFailures).toBe(0);
  });

  it("records, honestly, that a leaky driver DOES send the request off-site before the tool layer stops the assistant (which is why the network layer is required)", () => {
    expect(Number(summary.driverLevelEscapesWithLeakyDriver)).toBeGreaterThan(0);
  });

  it("writes the report when asked", () => {
    const out = process.env.M3A_BROWSER_REPORT;
    console.log(JSON.stringify(summary, null, 2));
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), node: process.version, summary, results }, null, 2));
    }
    expect(true).toBe(true);
  });
});
