import type { OllamaLike } from "../ollama/client";
import type { InferenceScheduler, Priority } from "../queue/scheduler";
import { hasSinhala } from "../util/script";

/**
 * SinhalaLLM may only reword a fixed template. It never chooses a tool, never sees product data, and its output is accepted only
 * if it adds nothing the original did not contain (no digits, links, names or extra Latin words), is Sinhala, is a sensible
 * length and does not loop. Anything else falls back to the original template. Polishing is OFF unless the pipeline is given a
 * polisher, and it is applied only to templates marked `polishable` (none of which contains a fact). The full response verifier
 * is M1-D; this guard is the minimum that makes polishing safe to test now.
 */
export type PolishVerdict = { ok: true } | { ok: false; reason: string };

const SINHALA_LETTERS = /[අ-ෆ]/g;
const latinWords = (s: string): Set<string> => new Set((s.toLowerCase().match(/[a-z][a-z.]{2,}/g) ?? []).map((w) => w.replace(/\.$/, "")));
const digits = (s: string): string => (s.normalize("NFKC").replace(/[෦-෯]/g, (c) => String(c.charCodeAt(0) - 0x0de6)).match(/\d/g) ?? []).join("");

export function acceptPolish(original: string, candidate: string): PolishVerdict {
  const text = candidate.trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if ((text.match(SINHALA_LETTERS) ?? []).length < 10 || !hasSinhala(text)) return { ok: false, reason: "not_sinhala" };
  if (text.length > original.length * 2 || text.length < original.length * 0.4) return { ok: false, reason: "length" };
  if ((text.match(/\n/g) ?? []).length > 1) return { ok: false, reason: "multiline" };
  if (/https?:\/\/|www\.|@|\.com\b|\.lk\b/i.test(text.replace(/volta\.lk/gi, ""))) return { ok: false, reason: "link" };
  const added = digits(text);
  const had = digits(original);
  if ([...added].some((d) => !had.includes(d))) return { ok: false, reason: "new_digits" };
  const allowed = latinWords(original);
  for (const w of latinWords(text)) if (!allowed.has(w)) return { ok: false, reason: "new_latin_word" };
  const words = text.split(/\s+/);
  for (let i = 0; i + 2 < words.length; i++) {
    const tri = words.slice(i, i + 3).join(" ");
    if (text.split(tri).length - 1 >= 3) return { ok: false, reason: "repetition" };
  }
  for (let i = 0; i + 3 < words.length; i++) if (words[i] === words[i + 1] && words[i] === words[i + 2] && words[i] === words[i + 3]) return { ok: false, reason: "repetition" };
  return { ok: true };
}

export interface PolishResult {
  text: string;
  polished: boolean;
  reason?: string;
}

export class SinhalaPolisher {
  constructor(private readonly deps: { ollama: OllamaLike; scheduler: InferenceScheduler }) {}

  async polish(original: string, opts: { priority: Priority; deadlineAt: number; signal: AbortSignal }): Promise<PolishResult> {
    const { scheduler, ollama } = this.deps;
    if (scheduler.shouldDegrade("sinhala")) return { text: original, polished: false, reason: "busy" };
    try {
      // No system prompt: the SinhalaLLM model card says long system prompts confuse it. The instruction is one fixed sentence.
      const prompt = `පහත වාක්‍ය එකම තේරුමින්, වඩා ස්වභාවික සිංහලෙන් නැවත ලියන්න. අලුත් තොරතුරු, අංක හෝ නම් එකතු නොකරන්න.\n\n${original}`;
      const r = await scheduler.submit({
        model: "sinhala",
        priority: opts.priority,
        deadlineAt: opts.deadlineAt,
        signal: opts.signal,
        run: ({ signal }) =>
          ollama.generate({ model: "sinhala", purpose: "reply", messages: [{ role: "user", content: prompt }], temperature: 0.3, topP: 0.9, minP: 0.1, repeatPenalty: 1.15 }, { signal }),
      });
      const verdict = acceptPolish(original, r.content);
      return verdict.ok ? { text: r.content.trim(), polished: true } : { text: original, polished: false, reason: verdict.reason };
    } catch {
      return { text: original, polished: false, reason: "error" };
    }
  }
}
