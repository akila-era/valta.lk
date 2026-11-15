// Starts everything needed to open the VOLTA AI QA control center on THIS computer, all local, nothing deployed:
//   mock ERP (invented products) + a disposable in-memory database + an Agent + the web app in development mode.
//
//   node scripts/qa-dev.mjs                         # uses the repo's FAKE Agent (a signed test double: canned replies, no model)
//   AGENT_DIR=E:\valta.lk\apps\agent node scripts/qa-dev.mjs
//                                                   # uses the REAL Agent code (router, tools, verifier) over the mock catalogue
//
// Then open  http://localhost:3201/admin/login  and sign in as  admin@example.test / secret123  (created for you), then go to
//   http://localhost:3201/admin/ai-qa
// Ports (4111, 4113, 5599, 3201) differ from the automated tests so both can run. Stop everything with Ctrl+C.
// No real model, no real ERP, no real customer data, no internet service other than the packages already installed.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";

const SECRET = "dev-agent-secret-0123456789-abcdefghij";
const AGENT_DIR = process.env.AGENT_DIR;
const useRealAgent = Boolean(AGENT_DIR && existsSync(AGENT_DIR));
const children = [];
const run = (name, cmd, args, opts = {}) => {
  const p = spawn(cmd, args, { shell: true, stdio: ["ignore", "pipe", "pipe"], ...opts });
  p.stdout.on("data", (d) => process.stdout.write(`[${name}] ${d}`));
  p.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  children.push(p);
  return p;
};
const portOpen = (port) => new Promise((r) => { const s = net.connect(port, "127.0.0.1"); s.on("connect", () => { s.destroy(); r(true); }); s.on("error", () => r(false)); });
async function waitFor(port, label, ms = 120_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await portOpen(port)) return; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`${label} did not start on port ${port}`);
}
const stopAll = () => { for (const c of children) { try { c.kill(); } catch { /* already gone */ } } process.exit(0); };
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

run("mock-erp", "npx", ["tsx", "tests/mock-erp/server.ts"], { env: { ...process.env, MOCK_ERP_PORT: "4111" } });
run("db", "npx", ["tsx", "tests/e2e-db/server.ts"], { env: { ...process.env, E2E_DB_PORT: "5599" } });
// The Agent package has no tsx of its own: use this web package's copy.
const TSX = new URL("../node_modules/.bin/tsx", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const TSX_ROOT = new URL("../../../node_modules/.bin/tsx", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EXT = process.platform === "win32" ? ".cmd" : "";
const tsxBin = existsSync(TSX + EXT) ? TSX + EXT : TSX_ROOT + EXT;
if (useRealAgent) run("agent", `"${tsxBin}"`, ["tests/real/dev-mock-agent.ts"], { cwd: AGENT_DIR, env: { ...process.env, AGENT_DEV_SECRET: SECRET, AGENT_DEV_KEY_ID: "web1", AGENT_DEV_PORT: "4113" } });
else run("fake-agent", "npx", ["tsx", "tests/stubs/fake-agent.ts"], { env: { ...process.env, FAKE_AGENT_PORT: "4113", FAKE_AGENT_SECRET: SECRET } });

await Promise.all([waitFor(4111, "mock ERP"), waitFor(5599, "database"), waitFor(4113, "agent")]);
console.log(`\nAgent in use: ${useRealAgent ? "REAL Agent code over the mock catalogue (no model)" : "the repo's FAKE Agent (canned replies)"}\n`);

run("web", "npx", ["next", "dev", "-p", "3201"], {
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-qa-dev",
    HX_API_BASE: "http://localhost:4111/api/v1/store-api",
    HX_STORE_CREDENTIAL: "hxs_test.testsecret",
    SITE_URL: "http://localhost:3201",
    ADMIN_EMAILS: "admin@example.test",
    SETTINGS_ENCRYPTION_KEY: "dev-settings-key-0123456789-abcdefghij",
    ORDER_SYNC_SECRET: "dev-sync-secret-0123456789",
    AI_ASSISTANT_ENABLED: "true",
    AI_ASSISTANT_DEMO_DATA: "true",
    AI_AGENT_URL: "http://127.0.0.1:4113",
    AI_AGENT_HMAC_KEY_ID: "web1",
    AI_AGENT_HMAC_SECRET: SECRET,
    AI_QA_ENABLED: "true",
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5599/postgres?sslmode=disable",
  },
});
await waitFor(3201, "web app", 240_000);
const origin = { Origin: "http://localhost:3201", "content-type": "application/json" };
const body = { name: "Store Admin", email: "admin@example.test", phone: "0771234567", password: "secret123" };
await fetch("http://localhost:3201/api/account/register", { method: "POST", headers: origin, body: JSON.stringify(body) }).catch(() => {});
console.log("\n==============================================================");
console.log(" VOLTA AI QA control center is ready (local only)");
console.log("   1. Open  http://localhost:3201/admin/login");
console.log("   2. Sign in:  admin@example.test  /  secret123");
console.log("   3. Open  http://localhost:3201/admin/ai-qa");
console.log("   The shopper-facing assistant is at http://localhost:3201 (button at the bottom left).");
console.log(" Press Ctrl+C to stop everything.");
console.log("==============================================================\n");
