/**
 * The REAL Agent API (HMAC, rate limits, router, reasoning layer, tools, verifier) over the invented TEST fixture catalogue
 * (tests/fixtures/rich-catalogue.ts), bound to 127.0.0.1, for the website's browser tests. No model, no ERP, no network. Never used in
 * production and never imported by src/.
 *
 * Run: AGENT_E2E_SECRET=<32+ chars> AGENT_E2E_KEY_ID=web1 AGENT_E2E_PORT=4014 npx tsx tests/real/e2e-agent.ts
 */
import { loadConfig } from "../../src/config";
import { createAgentServer } from "../../src/http/server";
import { Metrics } from "../../src/observability/metrics";
import { createMockStack } from "../../src/mock/stack";
import { RichTransport, richSite } from "../fixtures/rich-catalogue";

const secret = process.env.AGENT_E2E_SECRET ?? "";
if (secret.length < 32) {
  process.stderr.write("Set AGENT_E2E_SECRET to 32 or more characters.\n");
  process.exit(1);
}
const keyId = process.env.AGENT_E2E_KEY_ID ?? "web1";
const port = Number(process.env.AGENT_E2E_PORT ?? 4014);

const metrics = new Metrics();
const stack = createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0, metrics, onVerifierFailure: (f) => metrics.verifierRejected(f.code) });
const config = loadConfig({
  AGENT_HMAC_KEYS: `${keyId}:${secret}`,
  AGENT_HOST: "127.0.0.1",
  AGENT_PORT: String(port),
  AI_ASSISTANT_ENABLED: "true",
  AGENT_NEW_SESSIONS_PER_HOUR: "200",
  AGENT_RATE_IP_PER_MIN: "300",
  AGENT_RATE_SESSION_PER_MIN: "300",
  AGENT_RATE_IDENTITY_PER_MIN: "300",
});
const app = createAgentServer({ config, pipeline: stack.pipeline, metrics, memory: async () => ({ availableMb: null, swapUsedMb: null }) });
app.listen().then(({ host, port: p }) => process.stdout.write(`e2e Agent on http://${host}:${p} (key ${keyId})\n`));
