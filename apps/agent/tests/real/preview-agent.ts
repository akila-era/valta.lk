/**
 * The Agent API for the website PREVIEW, to run on the AI server: the real Agent (HMAC, rate limits, router, verifier, metrics)
 * with the Qwen tool planner for English messages the router does not know, over the in-memory MOCK catalogue. It talks only to the
 * local Ollama (127.0.0.1:11434) and listens on loopback only. SinhalaLLM polishing stays OFF (the default). It has no ERP and
 * no customer data. Not the production entry (src/main.ts, which stays disabled until the real tool backends exist).
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

const config = loadConfig({ ...process.env, AI_ASSISTANT_ENABLED: "true", AGENT_ENGLISH_MODE: "router-first" });
const logger = createLogger(consoleSink);
const metrics = new Metrics();
const ollama = new OllamaClient({ baseUrl: config.ollamaUrl });
const scheduler = new InferenceScheduler({ maxQueued: config.queueMaxDepth, observer: (e) => metrics.job(e) });

// The planner needs the tool registry, which the mock stack builds; build it once to get the registry, then wire the real stack.
const registry = createMockStack().registry;
const planner = new EnglishPlanner({ ollama, scheduler, registry });
const chat = config.chatReplies ? new ChatResponder({ ollama, scheduler }) : undefined;
const stack = createMockStack({ planner, englishMode: "router-first", ...(chat ? { chat } : {}), metrics, onVerifierFailure: verifierFailureLogger(logger) });

const app = createAgentServer({ config, pipeline: stack.pipeline, ollama, scheduler, logger, metrics });
app.listen().then(({ host, port }) => process.stdout.write(`${JSON.stringify({ msg: "preview agent listening", host, port, ollama: config.ollamaUrl })}\n`));
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => void app.close().then(() => process.exit(0)));
