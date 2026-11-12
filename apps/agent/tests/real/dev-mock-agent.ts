/**
 * A LOCAL development Agent on MOCK data: the real Agent API (HMAC, rate limits, router, tools, verifier) over the in-memory mock
 * catalogue, bound to 127.0.0.1 only. It lets the website's assistant route be tried end to end on a developer machine without
 * the AI server, a model or any ERP. Not used in production and never imported by src/ (a test enforces that src does not import
 * the mock folder).
 *
 * Run: AGENT_DEV_SECRET=<32+ chars> AGENT_DEV_KEY_ID=web1 AGENT_DEV_PORT=18787 npx tsx tests/real/dev-mock-agent.ts
 * English messages the router does not know get a clarification (there is no model here); Sinhala is deterministic as in production.
 */
import { loadConfig } from "../../src/config";
import { createAgentServer } from "../../src/http/server";
import { Metrics } from "../../src/observability/metrics";
import { createMockStack } from "../../src/mock/stack";

const secret = process.env.AGENT_DEV_SECRET ?? "";
if (secret.length < 32) {
  process.stderr.write("Set AGENT_DEV_SECRET to 32 or more characters.\n");
  process.exit(1);
}
const keyId = process.env.AGENT_DEV_KEY_ID ?? "web1";
const port = Number(process.env.AGENT_DEV_PORT ?? 18787);

const metrics = new Metrics();
const stack = createMockStack({ metrics, onVerifierFailure: (f) => metrics.verifierRejected(f.code) });
const config = loadConfig({ AGENT_HMAC_KEYS: `${keyId}:${secret}`, AGENT_HOST: "127.0.0.1", AGENT_PORT: String(port), AI_ASSISTANT_ENABLED: "true" });
const app = createAgentServer({ config, pipeline: stack.pipeline, metrics, memory: async () => ({ availableMb: null, swapUsedMb: null }) });
app.listen().then(({ host, port: p }) => process.stdout.write(`mock Agent on http://${host}:${p} (key ${keyId})\n`));
