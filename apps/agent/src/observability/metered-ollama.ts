import type { GenerateResult, OllamaLike } from "../ollama/client";
import type { GenerateRequest } from "../ollama/models";
import type { Metrics } from "./metrics";

/**
 * Wraps the model client and records, for every call, the model KEY (a fixed label), Ollama's own prompt and generated token counts and the
 * wall time. Nothing about the request or the answer is read except those numbers, so no message text can reach a metric. A failed call is
 * not counted as tokens (it produced none) but still rethrows unchanged.
 */
export function meteredOllama(inner: OllamaLike, metrics: Pick<Metrics, "modelCall">, now: () => number = Date.now): OllamaLike {
  return {
    version: (signal) => inner.version(signal),
    loadedModels: (signal) => inner.loadedModels(signal),
    unload: (model, signal) => inner.unload(model, signal),
    async generate(req: GenerateRequest, opts?: { signal?: AbortSignal }): Promise<GenerateResult> {
      const t0 = now();
      const out = await inner.generate(req, opts);
      metrics.modelCall(String(req.model), out.promptTokens, out.generatedTokens, Math.max(0, now() - t0));
      return out;
    },
  };
}
