import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke test against a REAL local HEXALYTE ERP (see tools/erp-local). Expects the VALTA dev site on :3000
 * (npm run dev) already running with HX_API_BASE / HX_STORE_CREDENTIAL in .env.local. Places real orders in the
 * disposable local ERP database only. Never point this at staging or production.
 */
export default defineConfig({
  testDir: "tests/real-erp",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 }, // the dev server compiles pages on first visit
  reporter: [["list"]],
  use: { baseURL: process.env.VALTA_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "real-erp", use: { ...devices["Desktop Chrome"] } }],
});
