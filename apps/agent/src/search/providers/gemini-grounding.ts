import { SearchProviderError, type GroundedAnswer, type GroundedAnswerProvider } from "../types";

/**
 * DISABLED SKELETON of a "grounded generation" adapter (the Gemini API with Google Search grounding shape). Same rules as the Brave skeleton: no environment
 * or file is read, it throws NOT_ENABLED without an explicit `fetchImpl` AND `apiKey`, and nothing in this repository constructs it with a key. It has never made a call.
 *
 * Shape (from the vendor documentation as summarised in the audit, read 2026-11-14; NOT exercised, re-check before enabling): POST
 * https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent with body { contents: [{ parts: [{ text }] }], tools: [{ google_search: {} }] };
 * the answer is `candidates[0].content.parts[].text` and the sources are `candidates[0].groundingMetadata.groundingChunks[].web { uri, title }`.
 * Open points before enabling: the two vendor pricing pages disagree on whether the monthly free allowance needs billing; the Terms (display of search suggestions,
 * caching, logging) were not read; Sinhala answer quality is unmeasured; the question text and any context sent leave the shop's infrastructure to a third party
 * (privacy notice and the owner's approval are required).
 */
export interface GeminiGroundingOptions {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  model?: string;
  endpointBase?: string;
}

export class GeminiGroundingAdapter implements GroundedAnswerProvider {
  readonly name = "gemini-grounding";
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly base: string;

  constructor(opts: GeminiGroundingOptions = {}) {
    this.fetchImpl = opts.fetchImpl;
    this.apiKey = opts.apiKey ?? "";
    this.model = opts.model ?? "";
    this.base = opts.endpointBase ?? "https://generativelanguage.googleapis.com/v1beta/models";
  }

  get enabled(): boolean {
    return this.fetchImpl !== undefined && this.apiKey.length > 0 && this.model.length > 0;
  }

  async answer(question: string, opts: { signal?: AbortSignal } = {}): Promise<GroundedAnswer> {
    if (!this.fetchImpl || this.apiKey.length === 0 || this.model.length === 0) throw new SearchProviderError("NOT_ENABLED", "The Gemini grounding adapter is not enabled (no key, model or fetch were provided).");
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: question }] }], tools: [{ google_search: {} }] }),
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
    } catch {
      throw new SearchProviderError("PROVIDER_ERROR", "The grounding provider could not be reached.");
    }
    if (res.status === 429) throw new SearchProviderError("RATE_LIMITED", "The grounding provider is rate limiting.");
    if (!res.ok) throw new SearchProviderError("PROVIDER_ERROR", `The grounding provider answered HTTP ${res.status}.`);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new SearchProviderError("PROVIDER_ERROR", "The grounding provider sent an unreadable answer.");
    }
    const cand = (json as { candidates?: { content?: { parts?: { text?: unknown }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: unknown; title?: unknown } }[] } }[] })?.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p) => (typeof p.text === "string" ? p.text : "")).join("");
    const citations: { title: string; url: string }[] = [];
    for (const chunk of cand?.groundingMetadata?.groundingChunks ?? []) {
      const w = chunk.web;
      if (typeof w?.uri === "string") citations.push({ url: w.uri, title: typeof w.title === "string" ? w.title : w.uri });
    }
    return { text, citations };
  }
}
