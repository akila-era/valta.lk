import { describe, expect, it } from "vitest";
import { ConfirmationStore } from "../../src/browser/confirmations";
import { createPlaywrightDriver } from "../../src/browser/playwright-driver";
import { BrowserToolService } from "../../src/browser/service";
import { BrowserSessionManager, DEFAULT_SESSION_LIMITS, type SessionOwner } from "../../src/browser/sessions";
import { productionPolicy } from "../../src/security/url-policy";

/**
 * OPT-IN (VOLTA_REAL_SITE=1). One read-only visit to the public home page of the real site through the PRODUCTION factory, the egress proxy
 * and the tool layer: real DNS, real TLS, one navigation, no click, no typing. Skipped in every normal run.
 */
describe.skipIf(process.env.VOLTA_REAL_SITE !== "1")("production sanity (one read-only GET of the home page)", () => {
  it("opens the home page through the production policy, reads it, takes a screenshot and closes", async () => {
    const driver = createPlaywrightDriver({ enabled: true, navigationTimeoutMs: 25_000 });
    const policy = productionPolicy();
    const sessions = new BrowserSessionManager(driver, { ...DEFAULT_SESSION_LIMITS, maxConcurrent: 1 });
    const service = new BrowserToolService({ driver, sessions, confirmations: new ConfirmationStore(), policy });
    const owner: SessionOwner = { assistantSessionId: "sess_sanity", identityKey: "guest:sanity" };
    try {
      const opened = await service.call(owner, "browser.open_page", { target: "https://valta.hexalyte.com/" });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      expect(opened.page?.url).toMatch(/^https:\/\/valta\.hexalyte\.com\//);
      expect(opened.page?.title.length).toBeGreaterThan(0);
      expect(opened.page?.text.startsWith("<<<PAGE_DATA")).toBe(true);
      process.stdout.write(`SANITY ${JSON.stringify({ url: opened.page?.url, title: opened.page?.title, elementCount: opened.page?.elementCount, blockedRequests: opened.page?.blockedRequests, verified: opened.verified, egress: driver.egressStats() })}\n`);
      const shot = await service.call(owner, "browser.take_screenshot", { sessionId: opened.sessionId });
      expect(shot.ok).toBe(true);
      // an off-site address is still refused by the tool layer on the real driver
      const off = await service.call(owner, "browser.open_page", { target: "https://example.com/", sessionId: opened.sessionId });
      expect(off.ok).toBe(false);
      await service.call(owner, "browser.close_session", { sessionId: opened.sessionId });
      expect(driver.liveSessionCount()).toBe(0);
    } finally {
      await sessions.shutdown();
      await driver.shutdown();
    }
  });
});
