import { pathToFileURL } from "node:url";
import { createPlaywrightDriver } from "./browser/playwright-driver";
import { main } from "./main";

/**
 * The BROWSER build of the production entry. It is the only file that imports the real Playwright driver, so the standard bundle (main.ts) contains
 * no browser code at all. Even in this build the driver is created only when AGENT_BROWSER_ENABLED=true, and the one-host production URL policy is
 * fixed inside `createPlaywrightDriver` (no parameter widens it).
 *
 * NOT READY FOR THE LIVE SERVER: it needs a fresh independent review of the browser work, operating-system isolation of the browser process and
 * the owner's approval (docs/VOLTA_BROWSER_SECURITY_REPORT.md). Build it with `npm run bundle:browser` (playwright-core stays external).
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main(process.env, { loadBrowserDriver: (cfg) => createPlaywrightDriver({ enabled: true, maxSessions: cfg.maxSessions }) });
}
