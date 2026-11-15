import { defineConfig } from "vitest/config";

// REAL browser tests: they start real headless Chromium against local fixture servers. Kept apart from `npm test` (mock/unit tests):
//   npx vitest run -c vitest.real-browser.config.ts
export default defineConfig({
  test: {
    include: ["tests/real-browser/**/*.real.ts"],
    environment: "node",
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
  },
});
