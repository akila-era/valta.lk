import { pathToFileURL } from "node:url";
import { createAgentStack } from "./app/stack";
import { createLiveSiteData } from "./backend/live-site-data";
import type { SiteData } from "./backend/site";
import { SiteErpTransport } from "./backend/site-transport";
import type { ErpTransport } from "./backend/transport";
import type { BrowserDriver } from "./browser/driver";
import { BrowserConfigError, createBrowserAgent, loadBrowserAgentConfig, type BrowserAgent, type BrowserAgentConfig } from "./browser-agent";
import { ConfigError, loadConfig, type AgentConfig } from "./config";
import { buildGateway } from "./gateway";
import type { ChatPipeline } from "./http/pipeline";
import { createAgentServer, type RunningServer } from "./http/server";
import { createLlmFirst, loadLlmFirstConfig } from "./llm";
import { consoleSink, createLogger, verifierFailureLogger } from "./observability/logger";
import { meteredOllama } from "./observability/metered-ollama";
import { Metrics } from "./observability/metrics";
import { OllamaClient, type OllamaLike } from "./ollama/client";
import { ChatResponder } from "./pipeline/chat-responder";
import { EnglishPlanner } from "./pipeline/english-planner";
import { InferenceScheduler } from "./queue/scheduler";
import { productionPolicy, type UrlPolicy } from "./security/url-policy";
import { loadVoiceConfig, VoiceConfigError, VoiceService } from "./voice";

/**
 * The production entry point. It wires exactly what the preview entry (tests/real/preview-agent.ts) wires on the live server: configuration, the
 * local Ollama (metered: tokens and time per call), the scheduler, the website catalogue relay with the live site data, the speech service when an
 * operator configured an engine, and the metrics. Differences, all deliberate:
 *  - there is NO fixture fallback: without AGENT_CATALOGUE_URL, AGENT_CATALOGUE_KEY_ID and AGENT_CATALOGUE_SECRET it refuses to start;
 *  - a bad setting stops the start with a message that names the variable and the rule, never a value;
 *  - the assistant is ON unless AI_ASSISTANT_ENABLED is set to "false" (the live env file does not set it, and the preview entry forced it on);
 *  - the browser integration is OFF unless AGENT_BROWSER_ENABLED=true AND this build contains a driver (see main-browser.ts). The standard bundle
 *    contains no browser driver at all.
 * Preparation only: the owner decides when the live service switches to a bundle of this file (docs/VOLTA_AI_ARCHITECTURE_ASSESSMENT.md).
 */
export class StartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartupError";
  }
}

export interface AgentOverrides {
  ollama?: OllamaLike;
  /** Tests only: replaces the website relay (production never passes these). */
  transport?: ErpTransport;
  site?: SiteData;
  /** Builds the real browser driver. Only main-browser.ts supplies one; absent, AGENT_BROWSER_ENABLED=true is a startup error. */
  loadBrowserDriver?: (cfg: BrowserAgentConfig) => BrowserDriver | Promise<BrowserDriver>;
  /** Tests only: the URL policy the browser agent and driver share (production always uses the one-host production policy). */
  browserPolicy?: UrlPolicy;
  /** Tests only. */
  logSink?: { write(line: string): void };
}

export interface RunningAgent {
  app: RunningServer;
  config: AgentConfig;
  metrics: Metrics;
  browser: BrowserAgent | undefined;
  stop(): Promise<void>;
}

const present = (v: string | undefined): boolean => v !== undefined && v.trim() !== "";

export async function createAgent(env: NodeJS.ProcessEnv = process.env, overrides: AgentOverrides = {}): Promise<RunningAgent> {
  let config: AgentConfig;
  let browserCfg: BrowserAgentConfig;
  let voiceCfg: ReturnType<typeof loadVoiceConfig>;
  try {
    config = loadConfig({ AI_ASSISTANT_ENABLED: "true", AGENT_ENGLISH_MODE: "router-first", ...env });
    browserCfg = loadBrowserAgentConfig(env);
    voiceCfg = loadVoiceConfig(env);
  } catch (e) {
    if (e instanceof ConfigError || e instanceof BrowserConfigError || e instanceof VoiceConfigError) throw new StartupError(e.message);
    throw e;
  }

  const logger = createLogger(overrides.logSink ?? consoleSink);
  const price = Number(env.AGENT_REFERENCE_PRICE_PER_MTOKENS);
  const metrics = new Metrics({ ...(Number.isFinite(price) && price > 0 ? { referencePricePerMillionTokens: price } : {}) });
  const ollama = meteredOllama(overrides.ollama ?? new OllamaClient({ baseUrl: config.ollamaUrl }), metrics);
  const scheduler = new InferenceScheduler({ maxQueued: config.queueMaxDepth, observer: (e) => metrics.job(e) });

  // Data sources: the website's read-only catalogue relay. No fixture fallback exists in this entry.
  let transport: ErpTransport;
  let site: SiteData;
  let stopSite: () => void = () => {};
  if (overrides.transport && overrides.site) {
    transport = overrides.transport;
    site = overrides.site;
  } else {
    const missing = ["AGENT_CATALOGUE_URL", "AGENT_CATALOGUE_KEY_ID", "AGENT_CATALOGUE_SECRET"].filter((n) => !present(env[n]));
    if (missing.length) throw new StartupError(`Missing configuration: ${missing.join(", ")} (the production entry has no fixture fallback).`);
    let relay: SiteErpTransport;
    try {
      relay = new SiteErpTransport({ siteUrl: env.AGENT_CATALOGUE_URL!.trim(), keyId: env.AGENT_CATALOGUE_KEY_ID!.trim(), secret: env.AGENT_CATALOGUE_SECRET!.trim() });
    } catch (e) {
      // The constructor's messages name the rule only (never the secret); keep that property.
      throw new StartupError(`Invalid catalogue configuration: ${(e as Error).message}`);
    }
    const live = createLiveSiteData(() => relay.getContent());
    void live.refresh();
    stopSite = live.start();
    transport = relay;
    site = live;
  }

  const stack = createAgentStack({
    transport,
    site,
    planner: (registry) => new EnglishPlanner({ ollama, scheduler, registry }),
    englishMode: config.englishMode,
    ...(config.chatReplies ? { chat: new ChatResponder({ ollama, scheduler }) } : {}),
    metrics,
    onVerifierFailure: (info) => {
      metrics.verifierRejected(info.code);
      verifierFailureLogger(logger)(info);
    },
  });

  // LLM-first lane: OFF unless AGENT_LLM_FIRST is "shadow" or "on". Off means the legacy pipeline object is used as is: no gateway is built, nothing
  // is constructed or called (the modules are only loaded), behaviour is identical to before. A bad value stops the start (names the variable and the rule, never the value).
  const llmCfg = loadLlmFirstConfig(env);
  if (llmCfg.issues.length) throw new StartupError(`Invalid configuration: ${llmCfg.issues.join(" ")}`);
  let pipeline: ChatPipeline = stack.pipeline;
  if (llmCfg.mode !== "off") {
    const { gateway } = await buildGateway(env);
    pipeline = createLlmFirst({ legacy: stack.pipeline, env, gateway, toolDeps: { registry: stack.registry } });
  }

  const voice = voiceCfg.stt.name !== "none" || voiceCfg.tts.name !== "none" ? new VoiceService(voiceCfg, { metrics: metrics.voiceHook() }) : undefined;

  let browser: BrowserAgent | undefined;
  let driver: BrowserDriver | undefined;
  if (browserCfg.enabled) {
    if (!overrides.loadBrowserDriver) throw new StartupError("AGENT_BROWSER_ENABLED is true, but this build contains no browser driver (use the browser build, main-browser.ts).");
    driver = await overrides.loadBrowserDriver(browserCfg);
    browser = createBrowserAgent({
      driver,
      policy: overrides.browserPolicy ?? productionPolicy(),
      config: browserCfg,
      audit: (e) => (overrides.logSink ?? consoleSink).write(JSON.stringify({ msg: "browser_audit", ...e })),
      metrics,
    });
    metrics.setBrowserEnabled(true);
  }

  const app = createAgentServer({ config, pipeline, ollama, scheduler, logger, metrics, ...(voice ? { voice } : {}), ...(browser ? { browser } : {}) });
  const sweeper = browser ? setInterval(() => void browser.sweep(), 15_000) : undefined;
  sweeper?.unref();

  return {
    app,
    config,
    metrics,
    browser,
    async stop() {
      if (sweeper) clearInterval(sweeper);
      stopSite();
      await app.close();
      await browser?.shutdown();
      const closable = driver as (BrowserDriver & { shutdown?: () => Promise<void> }) | undefined;
      await closable?.shutdown?.();
    },
  };
}

/** Starts the service: prints one JSON line, handles SIGTERM/SIGINT with a graceful stop, and exits 1 with a safe message on a bad configuration. */
export async function main(env: NodeJS.ProcessEnv = process.env, overrides: AgentOverrides = {}): Promise<void> {
  let agent: RunningAgent;
  try {
    agent = await createAgent(env, overrides);
  } catch (e) {
    if (e instanceof StartupError) {
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
  const { host, port } = await agent.app.listen();
  process.stdout.write(`${JSON.stringify({ msg: "agent listening", host, port, catalogue: "website (real)", browser: agent.browser ? "enabled" : "off", ollama: agent.config.ollamaUrl })}\n`);
  const stop = (): void => void agent.stop().then(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
