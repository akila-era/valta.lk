import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests of the AI assistant against the REAL Agent code (HMAC, router, reasoning layer, tools, verifier) on an invented fixture
 * catalogue. The Agent is started from the main checkout (apps/agent on the feature/ai-agent-m1 branch), because this worktree does not carry
 * it. Everything runs on 127.0.0.1 with disposable state: mock ERP for the storefront, an in-memory database, no model, no network.
 *   npx playwright test -c playwright.real-agent.config.ts
 */
const AGENT_DIR = process.env.AGENT_REPO_DIR ?? "E:/valta.lk/apps/agent";
const SECRET = "e2e-agent-secret-0123456789-abcdefghij";

const webEnv = {
  NEXT_DIST_DIR: ".next-e2e-real",
  HX_API_BASE: "http://localhost:4011/api/v1/store-api",
  HX_STORE_CREDENTIAL: "hxs_test.testsecret",
  SITE_URL: "http://localhost:3102",
  SITE_CONTACT_PHONE: "+94 70 000 0000",
  ADMIN_EMAILS: "admin@example.test",
  SETTINGS_ENCRYPTION_KEY: "e2e-settings-key-0123456789-abcdefghij",
  ORDER_SYNC_SECRET: "e2e-sync-secret-0123456789",
  WA_GRAPH_BASE: "http://localhost:4031",
  AI_ASSISTANT_ENABLED: "true",
  AI_ASSISTANT_DEMO_DATA: "false", // the cards come from the (fixture) catalogue and are labelled as live, not as demo
  AI_AGENT_URL: "http://127.0.0.1:4014",
  AI_AGENT_HMAC_KEY_ID: "web1",
  AI_AGENT_HMAC_SECRET: SECRET,
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5499/postgres?sslmode=disable",
};

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /assistant-real-agent\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3102", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    { command: "npx tsx tests/mock-erp/server.ts", port: 4011, reuseExistingServer: false, env: { MOCK_ERP_PORT: "4011" } },
    { command: "npx tsx tests/mock-wa/server.ts", port: 4031, reuseExistingServer: false, env: { MOCK_WA_PORT: "4031" } },
    { command: "npx tsx tests/e2e-db/server.ts", port: 5499, reuseExistingServer: false, env: { E2E_DB_PORT: "5499" } },
    {
      // The Agent's own code, run from its own checkout so its dependencies and tsconfig apply.
      command: `npx tsx ${AGENT_DIR}/tests/real/e2e-agent.ts`,
      cwd: AGENT_DIR,
      port: 4014,
      reuseExistingServer: false,
      env: { AGENT_E2E_SECRET: SECRET, AGENT_E2E_KEY_ID: "web1", AGENT_E2E_PORT: "4014" },
    },
    { command: "npx next dev -p 3102", port: 3102, timeout: 240_000, reuseExistingServer: false, env: webEnv },
  ],
});
