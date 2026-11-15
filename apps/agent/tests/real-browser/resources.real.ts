import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newTestDriver, startFixture, type Fixture } from "./fixture";
import { listProcesses, peakTreeRssMb, pidAlive, processTree, treeRssMb } from "./helpers";

/** Real memory of the real Chromium process tree, and proof that closing leaves nothing behind. Numbers go to the console and, if asked, to a file. */
let fx: Fixture;
beforeAll(async () => {
  fx = await startFixture();
});
afterAll(async () => {
  await fx.close();
});

describe("resources and cleanup (real Chromium)", () => {
  it("measures the process tree for 0 (idle browser), 1, 2 and 3 concurrent sessions, then proves cleanup", async () => {
    const { driver: d } = newTestDriver(fx, { maxSessions: 3 });
    const results: Record<string, unknown> = { platform: process.platform, node: process.version };
    try {
      await d.open("warm");
      const rootPid = (await d.browserPid())!;
      expect(rootPid).toBeGreaterThan(0);
      const tree0 = processTree(rootPid);
      results.processesIdleBrowserOneEmptySession = tree0.length;
      await d.goto("warm", fx.url("/products"));
      await new Promise((r) => setTimeout(r, 1_500));
      results.rssMb_1session_products = treeRssMb(processTree(rootPid));
      results.processes_1session = processTree(rootPid).length;

      const sessions = ["s1", "s2", "s3"];
      await d.close("warm");
      for (const [i, s] of sessions.entries()) {
        await peakTreeRssMb(rootPid, async () => {
          await d.open(s);
          await d.goto(s, fx.url("/products"));
          await d.goto(s, fx.url("/")); // a second page, a screenshot and a snapshot: normal task work
          await d.screenshot(s);
          await d.snapshot(s);
        }).then((peak) => {
          results[`peakRssMb_${i + 1}_sessions`] = peak;
        });
        await new Promise((r) => setTimeout(r, 1_000));
        results[`settledRssMb_${i + 1}_sessions`] = treeRssMb(processTree(rootPid));
        results[`processes_${i + 1}_sessions`] = processTree(rootPid).length;
      }
      expect(d.liveSessionCount()).toBe(3);

      // closing every session must give the renderers back
      for (const s of sessions) await d.close(s);
      await new Promise((r) => setTimeout(r, 2_000));
      const afterClose = processTree(rootPid);
      results.processes_after_closing_all_sessions = afterClose.length;
      results.rssMb_after_closing_all_sessions = treeRssMb(afterClose);
      expect(d.liveSessionCount()).toBe(0);
      expect(afterClose.filter((p) => /chrome|headless/i.test(p.name)).length).toBeLessThanOrEqual(tree0.length);

      // open/close churn does not leak processes
      for (let i = 0; i < 6; i++) {
        await d.open(`churn${i}`);
        await d.goto(`churn${i}`, fx.url("/products"));
        await d.close(`churn${i}`);
      }
      await new Promise((r) => setTimeout(r, 2_000));
      const afterChurn = processTree(rootPid).length;
      results.processes_after_6_open_close_cycles = afterChurn;
      expect(afterChurn).toBeLessThanOrEqual(tree0.length + 1);

      // shutdown: the browser and every child are gone
      const everyPidBefore = processTree(rootPid).map((p) => p.pid);
      await d.shutdown();
      await new Promise((r) => setTimeout(r, 2_000));
      expect(pidAlive(rootPid)).toBe(false);
      const stillAlive = everyPidBefore.filter((pid) => listProcesses().some((p) => p.pid === pid));
      results.processes_alive_after_shutdown = stillAlive.length;
      expect(stillAlive).toEqual([]);
      expect(d.egressStats()).toBeNull(); // the proxy is closed too
    } finally {
      await d.shutdown();
      const line = `RESOURCE_RESULTS ${JSON.stringify(results)}`;
      process.stdout.write(`${line}\n`);
      if (process.env.VOLTA_RESULTS_FILE) writeFileSync(process.env.VOLTA_RESULTS_FILE, `${line}\n`, { flag: "a" });
    }
  });

  it("the idle timer closes the browser (and its memory) after the last session ends", async () => {
    const { driver: d } = newTestDriver(fx, { idleBrowserCloseMs: 800 });
    await d.open("idle1");
    const pid = (await d.browserPid())!;
    await d.close("idle1");
    await new Promise((r) => setTimeout(r, 3_000));
    expect(pidAlive(pid)).toBe(false);
    await d.open("idle2"); // and a later open starts a fresh browser
    expect(await d.browserPid()).not.toBe(pid);
    await d.shutdown();
  });

  it("the maximum session lifetime destroys a session that is still open", async () => {
    const { driver: d } = newTestDriver(fx, { maxSessionLifetimeMs: 1_200 });
    await d.open("short");
    await d.goto("short", fx.url("/products"));
    await new Promise((r) => setTimeout(r, 2_500));
    expect(d.liveSessionCount()).toBe(0);
    await expect(d.snapshot("short")).rejects.toMatchObject({ code: "closed" });
    await d.shutdown();
  });
});
