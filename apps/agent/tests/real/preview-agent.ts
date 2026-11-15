/**
 * The Agent API for the website PREVIEW, to run on the AI server: the real Agent (HMAC, rate limits, router, verifier, metrics)
 * with the Qwen tool planner for English messages the router does not know, over the in-memory MOCK catalogue. It talks only to the
 * local Ollama (127.0.0.1:11434) and listens on loopback only. SinhalaLLM polishing stays OFF (the default). It has no ERP and
 * no customer data. Not the production entry (src/main.ts, which stays disabled until the real tool backends exist).
 *
 * REAL CATALOGUE (optional): set AGENT_CATALOGUE_URL (the website origin), AGENT_CATALOGUE_KEY_ID and AGENT_CATALOGUE_SECRET and the same
 * Agent reads products, prices and availability THROUGH THE WEBSITE (read-only relay, the ERP credential stays on the website).
 * Orders, customers, accessory links and promotions are not available on that path (empty), so those answers say "nothing found".
 *
 * Environment: AGENT_HMAC_KEYS (keyId:secret), AGENT_HOST (127.0.0.1), AGENT_PORT, and the usual AGENT_* limits from .env.example.
 */
import { loadConfig } from "../../src/config";
import { createAgentServer } from "../../src/http/server";
import { consoleSink, createLogger, verifierFailureLogger } from "../../src/observability/logger";
import { Metrics } from "../../src/observability/metrics";
import { OllamaClient } from "../../src/ollama/client";
import { ChatResponder } from "../../src/pipeline/chat-responder";
import { EnglishPlanner } from "../../src/pipeline/english-planner";
import { InferenceScheduler } from "../../src/queue/scheduler";
import { createMockStack } from "../../src/mock/stack";
import { SiteErpTransport } from "../../src/backend/site-transport";
import type { SiteData } from "../../src/backend/site";
import { createLiveSiteData, type LiveSiteData } from "../../src/backend/live-site-data";
import { loadVoiceConfig, VoiceService } from "../../src/voice";

const config = loadConfig({ ...process.env, AI_ASSISTANT_ENABLED: "true", AGENT_ENGLISH_MODE: "router-first" });
const logger = createLogger(consoleSink);
const metrics = new Metrics();
const ollama = new OllamaClient({ baseUrl: config.ollamaUrl });
const scheduler = new InferenceScheduler({ maxQueued: config.queueMaxDepth, observer: (e) => metrics.job(e) });

// The planner needs the tool registry, which the mock stack builds; build it once to get the registry, then wire the real stack.
const registry = createMockStack().registry;
const planner = new EnglishPlanner({ ollama, scheduler, registry });
const chat = config.chatReplies ? new ChatResponder({ ollama, scheduler }) : undefined;
const catalogueUrl = process.env.AGENT_CATALOGUE_URL?.trim();
const siteTransport = catalogueUrl ? new SiteErpTransport({ siteUrl: catalogueUrl, keyId: process.env.AGENT_CATALOGUE_KEY_ID ?? "", secret: process.env.AGENT_CATALOGUE_SECRET ?? "" }) : undefined;
// Staff-entered specification rows come from the website in the background (last good copy served); orders, links and promotions stay empty.
const liveSite: LiveSiteData | undefined = siteTransport ? createLiveSiteData(() => siteTransport.getContent()) : undefined;
if (liveSite) {
  void liveSite.refresh();
  liveSite.start();
}
const real = siteTransport && liveSite ? { transport: siteTransport, site: liveSite as SiteData } : {};
const stack = createMockStack({ ...real, planner, englishMode: "router-first", ...(chat ? { chat } : {}), metrics, onVerifierFailure: verifierFailureLogger(logger) });

// Voice routes exist only when an operator configured a speech engine (loopback); otherwise they are 404 and nothing changes.
const voiceCfg = loadVoiceConfig(process.env);
const voice = voiceCfg.stt.name !== "none" || voiceCfg.tts.name !== "none" ? new VoiceService(voiceCfg) : undefined;

const app = createAgentServer({ config, pipeline: stack.pipeline, ollama, scheduler, logger, metrics, ...(voice ? { voice } : {}) });
app.listen().then(({ host, port }) => process.stdout.write(`${JSON.stringify({ msg: "preview agent listening", host, port, catalogue: catalogueUrl ? "website (real)" : "mock", ollama: config.ollamaUrl })}\n`));
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => void app.close().then(() => process.exit(0)));
