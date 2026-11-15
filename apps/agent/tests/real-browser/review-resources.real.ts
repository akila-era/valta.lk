import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlaywrightDriverForTests, type PlaywrightDriver } from "../../src/browser/playwright-driver";
import { FIXTURE_HOSTS, testResolver } from "./fixture";
import { listProcesses, pidAlive, peakTreeRssMb, processTree, treeRssMb } from "./helpers";

/**
 * INDEPENDENT REVIEW (Agent F): a second, independent measurement of the browser's memory for 1 and 3 concurrent sessions (one run, different
 * page weight than the authors' fixture), plus the leak check. Windows working set: it counts shared pages, so a Linux figure will be lower.
 */
let srv: Server;
let port = 0;
const heavy = `<!doctype html><title>Heavy</title><body>${Array.from({ length: 1500 }, (_, i) => `<p>Item ${i} <a href="/p/${i}">link ${i}</a> <img width="40" height="40" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></p>`).join("")}</body>`;
beforeAll(async () => {
  srv = createServer((_q, r) => r.writeHead(200, { "content-type": "text/html" }).end(heavy));
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  port = (srv.address() as AddressInfo).port;
});
afterAll(() => {
  srv.closeAllConnections?.();
  srv.close();
});

describe("review: browser memory and cleanup", () => {
  it("peak working set of the browser process tree for 1 and 3 sessions on a 1,500-element page, and nothing left after shutdown", async () => {
    const d: PlaywrightDriver = createPlaywrightDriverForTests({ enabled: true, idleBrowserCloseMs: 0, resolver: testResolver().resolve, navigationTimeoutMs: 10_000 }, { hosts: FIXTURE_HOSTS, fixturePort: port, treatAsPublic: ["127.0.0.1"] });
    const first = "rm_0";
    await d.open(first);
    const pid = (await d.browserPid())!;
    const idle = treeRssMb(processTree(pid));
    const one = await peakTreeRssMb(pid, async () => {
      await d.goto(first, `http://shop.test:${port}/`);
      await d.snapshot(first);
      await d.screenshot(first);
    });
    for (const id of ["rm_1", "rm_2"]) await d.open(id);
    const three = await peakTreeRssMb(pid, async () => {
      await Promise.all(["rm_0", "rm_1", "rm_2"].map(async (id) => {
        await d.goto(id, `http://shop.test:${port}/`);
        await d.snapshot(id);
        await d.screenshot(id);
      }));
    });
    console.log(`REVIEW-MEMORY (Windows working set, MB): idle-with-1-context=${idle}, 1 session peak=${one}, 3 sessions peak=${three}`);
    for (const id of ["rm_0", "rm_1", "rm_2"]) await d.close(id);
    await d.shutdown();
    await new Promise((r) => setTimeout(r, 1_500));
    expect(pidAlive(pid)).toBe(false);
    const leftovers = listProcesses().filter((p) => p.ppid === pid);
    expect(leftovers).toEqual([]);
    expect(one).toBeGreaterThan(50);
    expect(three).toBeGreaterThan(one);
  }, 120_000);
});
