import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    { command: "npx tsx tests/mock-erp/server.ts", port: 4011, reuseExistingServer: false, env: { MOCK_ERP_PORT: "4011" } },
    // Disposable in-memory Postgres (PGlite) for customer accounts. Never a real database.
    { command: "npx tsx tests/e2e-db/server.ts", port: 5499, reuseExistingServer: false, env: { E2E_DB_PORT: "5499" } },
    {
      command: "npx next build && npx next start -p 3100",
      port: 3100,
      timeout: 240_000,
      reuseExistingServer: false, // always a fresh build and a fresh mock: never share state with dev servers
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        HX_API_BASE: "http://localhost:4011/api/v1/store-api",
        HX_STORE_CREDENTIAL: "hxs_test.testsecret",
        SITE_URL: "http://localhost:3100",
        SITE_CONTACT_PHONE: "+94 70 000 0000",
        // Test-only videos: local thumbnails, so no request leaves the machine until play is pressed
        HOME_VIDEOS_TITLE: "Watch our videos",
        HOME_VIDEOS: JSON.stringify([
          { id: "AAAAAAAAAAA", title: "Test video one", channel: "Test channel", thumbnail: "/images/e2e-video-thumb.svg" },
          { id: "BBBBBBBBBBB", title: "Test video two", thumbnail: "/images/e2e-video-thumb.svg" },
        ]),
        ADMIN_EMAILS: "admin@example.test",
        SETTINGS_ENCRYPTION_KEY: "e2e-settings-key-0123456789-abcdefghij",
        ORDER_SYNC_SECRET: "e2e-sync-secret-0123456789",
        ORDER_SYNC_BACKOFF_MS: "1500", // tests only: retry quickly instead of after minutes
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5499/postgres?sslmode=disable",
      },
    },
  ],
});
