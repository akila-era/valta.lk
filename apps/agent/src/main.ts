import { pathToFileURL } from "node:url";
import { loadConfig, ConfigError } from "./config";
import { createAgentServer } from "./http/server";
import { notEnabledPipeline } from "./http/pipeline";
import { consoleSink, createLogger } from "./observability/logger";
import { Metrics } from "./observability/metrics";
import { OllamaClient } from "./ollama/client";
import { InferenceScheduler } from "./queue/scheduler";

/**
 * Entry point. NOT run in M1: nothing is deployed and no service exists. It is here so the wiring is type-checked and
 * so the later deployment step only has to bundle and start this file.
 */
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  let config;
  try {
    config = loadConfig(env);
  } catch (e) {
    if (e instanceof ConfigError) {
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
  const ollama = new OllamaClient({ baseUrl: config.ollamaUrl });
  const metrics = new Metrics();
  const scheduler = new InferenceScheduler({ maxQueued: config.queueMaxDepth, observer: (e) => metrics.job(e) });
  const app = createAgentServer({ config, pipeline: notEnabledPipeline, ollama, scheduler, logger: createLogger(consoleSink), metrics });
  const { host, port } = await app.listen();
  process.stdout.write(`${JSON.stringify({ msg: "agent listening", host, port })}\n`);
  const stop = () => void app.close().then(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
