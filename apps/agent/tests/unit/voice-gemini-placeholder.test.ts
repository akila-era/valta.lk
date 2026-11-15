import { describe, expect, it, vi } from "vitest";
import { GeminiSttPlaceholder, GeminiTtsPlaceholder } from "../../src/voice/gemini";
import { ProviderError } from "../../src/voice/providers";

/** The hosted-speech placeholders must stay inert: no network, no key use, refusal even when everything is injected. */
describe("Gemini speech placeholders are inert", () => {
  const signal = new AbortController().signal;

  it("speech-to-text refuses with 'unsupported' and makes no call, with or without an injected fetch and key", async () => {
    const fakeFetch = vi.fn();
    for (const opts of [{}, { fetchImpl: fakeFetch as unknown as typeof fetch, apiKey: "FAKE_TEST_KEY_not_a_secret", model: "any" }]) {
      const p = new GeminiSttPlaceholder(opts);
      await expect(p.transcribe({ audio: Buffer.from("x"), format: "wav", lang: "si", signal })).rejects.toMatchObject({ name: "ProviderError", kind: "unsupported" });
    }
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("text-to-speech supports no language and refuses to synthesise", async () => {
    const fakeFetch = vi.fn();
    const p = new GeminiTtsPlaceholder({ fetchImpl: fakeFetch as unknown as typeof fetch, apiKey: "FAKE_TEST_KEY_not_a_secret" });
    expect(p.supports("en")).toBe(false);
    expect(p.supports("si")).toBe(false);
    await expect(p.synthesize({ text: "hello", lang: "en", signal })).rejects.toBeInstanceOf(ProviderError);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("never touches the global fetch", async () => {
    const g = vi.fn();
    vi.stubGlobal("fetch", g);
    try {
      await new GeminiSttPlaceholder().transcribe({ audio: Buffer.from("x"), format: "wav", lang: "auto", signal }).catch(() => undefined);
      await new GeminiTtsPlaceholder().synthesize({ text: "x", lang: "si", signal }).catch(() => undefined);
      expect(g).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not leak the key in its name or errors", async () => {
    const p = new GeminiSttPlaceholder({ apiKey: "FAKE_TEST_KEY_not_a_secret" });
    const err = await p.transcribe({ audio: Buffer.from("x"), format: "wav", lang: "en", signal }).catch((e: unknown) => e);
    expect(`${p.name} ${String(err)} ${JSON.stringify(err)}`).not.toContain("FAKE_TEST_KEY");
  });
});
