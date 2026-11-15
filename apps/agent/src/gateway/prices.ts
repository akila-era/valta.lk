import type { Usage } from "./provider";

/**
 * Model prices in USD. Every number here is "as reported by a summarising fetch tool from Google's pricing page on 2026-11-14" and is
 * marked verified:false: a person MUST re-read the pricing page before the gateway may spend (see GEMINI_ALLOW_UNVERIFIED_PRICES).
 * Prices change on schedule, so entries carry effectiveFrom and the budget always uses the dearer of "now" and "the next 35 days".
 */
export interface PriceEntry {
  /** ISO date (UTC) from which this entry applies. Omit for "always / since the beginning". */
  effectiveFrom?: string;
  /** USD per 1M text/image input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens (thinking tokens are billed as output unless thinkingPerM is given). */
  outputPerM: number;
  thinkingPerM?: number;
  cachedInputPerM?: number;
  /** USD per 1M audio input tokens (32 tokens per audio second) when it differs from inputPerM. */
  audioInPerM?: number;
  /** USD per audio minute for transcription-style models (input side). */
  audioInPerMin?: number;
  /** USD per 1M audio output tokens (text-to-speech / live). */
  audioOutPerM?: number;
  /** Above this prompt size the long-context prices apply. */
  longContext?: { thresholdTokens: number; inputPerM: number; outputPerM: number };
}

export interface ModelPrice {
  model: string;
  verified: boolean;
  /** Where the number came from and when. */
  source: string;
  verifiedAt?: string;
  note?: string;
  entries: PriceEntry[];
}

export interface PriceTable {
  version: string;
  currency: "USD";
  models: ModelPrice[];
  search: { per1000Usd: number; freeMonthly: number; treatAsBillableFromFirst: boolean; verified: boolean; source: string };
}

const SRC = "gemini-facts.md (fetch-tool summary of https://aistudio.google.com/docs/pricing, 2026-11-14)";

/** The seed table. NOT VERIFIED by a person. Replace it from a reviewed JSON file (GATEWAY_PRICE_TABLE_PATH) before any paid call. */
export const SEED_PRICE_TABLE: PriceTable = {
  version: "seed-2026-11-14",
  currency: "USD",
  search: { per1000Usd: 14, freeMonthly: 5000, treatAsBillableFromFirst: true, verified: false, source: SRC },
  models: [
    { model: "gemini-3.5-flash-lite", verified: false, source: SRC, entries: [{ inputPerM: 0.3, outputPerM: 2.5, cachedInputPerM: 0.03 }] },
    { model: "gemini-2.5-flash-lite", verified: false, source: SRC, entries: [{ inputPerM: 0.1, outputPerM: 0.4, cachedInputPerM: 0.01, audioInPerM: 0.3 }] },
    {
      model: "gemini-3.8-flash",
      verified: false,
      source: SRC,
      note: "price doubles on 2027-01-01",
      entries: [
        { inputPerM: 0.75, outputPerM: 3.75, cachedInputPerM: 0.075 },
        { effectiveFrom: "2027-01-01", inputPerM: 1.5, outputPerM: 7.5, cachedInputPerM: 0.15 },
      ],
    },
    {
      model: "gemini-3.6-flash",
      verified: false,
      source: SRC,
      entries: [
        { inputPerM: 0.75, outputPerM: 3.75, cachedInputPerM: 0.075 },
        { effectiveFrom: "2027-01-01", inputPerM: 1.5, outputPerM: 7.5, cachedInputPerM: 0.15 },
      ],
    },
    {
      model: "gemini-3.1-pro-preview",
      verified: false,
      source: SRC,
      entries: [{ inputPerM: 2, outputPerM: 12, cachedInputPerM: 0.2, longContext: { thresholdTokens: 200_000, inputPerM: 4, outputPerM: 18 } }],
    },
    { model: "gemini-3.5-transcribe", verified: false, source: SRC, entries: [{ inputPerM: 0, outputPerM: 12, audioInPerMin: 0.003, audioInPerM: 2 }] },
    {
      model: "gemini-3.8-flash-lite-tts",
      verified: false,
      source: SRC,
      note: "prices double on 2027-01-01",
      entries: [
        { inputPerM: 0.5, outputPerM: 0, audioOutPerM: 6 },
        { effectiveFrom: "2027-01-01", inputPerM: 1, outputPerM: 0, audioOutPerM: 12 },
      ],
    },
    { model: "gemini-3.8-live", verified: false, source: SRC, entries: [{ inputPerM: 0.75, outputPerM: 4.5, audioInPerM: 3, audioOutPerM: 12 }] },
  ],
};

export class PriceError extends Error {}

/** Validates a price table that came from a reviewed JSON file. Throws PriceError naming the problem (never a value that could be secret). */
export function parsePriceTable(raw: unknown): PriceTable {
  const bad = (m: string): never => {
    throw new PriceError(`invalid price table: ${m}`);
  };
  if (!raw || typeof raw !== "object") return bad("not an object");
  const t = raw as Record<string, unknown>;
  if (typeof t.version !== "string" || !t.version) bad("version missing");
  if (t.currency !== "USD") bad("currency must be USD");
  if (!Array.isArray(t.models) || t.models.length === 0) bad("models missing");
  const nonNeg = (v: unknown, name: string): void => {
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) bad(`${name} must be a non-negative number`);
  };
  for (const m of t.models as unknown[]) {
    const mm = m as Record<string, unknown>;
    if (typeof mm?.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(mm.model)) bad("model id invalid");
    if (typeof mm.verified !== "boolean") bad(`verified flag missing for ${String(mm.model)}`);
    if (!Array.isArray(mm.entries) || mm.entries.length === 0) bad(`entries missing for ${String(mm.model)}`);
    for (const e of mm.entries as Record<string, unknown>[]) {
      nonNeg(e.inputPerM, "inputPerM");
      nonNeg(e.outputPerM, "outputPerM");
      nonNeg(e.thinkingPerM, "thinkingPerM");
      nonNeg(e.cachedInputPerM, "cachedInputPerM");
      nonNeg(e.audioInPerM, "audioInPerM");
      nonNeg(e.audioInPerMin, "audioInPerMin");
      nonNeg(e.audioOutPerM, "audioOutPerM");
      if (typeof e.inputPerM !== "number" || typeof e.outputPerM !== "number") bad("inputPerM and outputPerM are required");
      if (e.effectiveFrom !== undefined && (typeof e.effectiveFrom !== "string" || Number.isNaN(Date.parse(e.effectiveFrom)))) bad("effectiveFrom must be an ISO date");
    }
  }
  const s = t.search as Record<string, unknown> | undefined;
  if (!s || typeof s.per1000Usd !== "number" || typeof s.freeMonthly !== "number" || typeof s.verified !== "boolean") bad("search section invalid");
  return raw as PriceTable;
}

export function findModelPrice(table: PriceTable, model: string): ModelPrice | undefined {
  return table.models.find((m) => m.model === model);
}

const DAY = 86_400_000;

/** The entry in force at a date: the latest entry whose effectiveFrom is not after it. */
export function entryAt(price: ModelPrice, at: Date): PriceEntry {
  let best: PriceEntry | undefined;
  let bestT = -Infinity;
  for (const e of price.entries) {
    const t = e.effectiveFrom ? Date.parse(e.effectiveFrom) : -Infinity;
    if (t <= at.getTime() && t >= bestT) {
      best = e;
      bestT = t;
    }
  }
  return best ?? price.entries[0]!;
}

/** For reservations: the dearer of now and the next 35 days, field by field, so a scheduled price rise can never be under-reserved. */
export function conservativeEntry(price: ModelPrice, at: Date, horizonDays = 35): PriceEntry {
  const now = entryAt(price, at);
  const later = entryAt(price, new Date(at.getTime() + horizonDays * DAY));
  const max = (a: number | undefined, b: number | undefined): number | undefined => (a === undefined ? b : b === undefined ? a : Math.max(a, b));
  const merged: PriceEntry = { inputPerM: Math.max(now.inputPerM, later.inputPerM), outputPerM: Math.max(now.outputPerM, later.outputPerM) };
  for (const k of ["thinkingPerM", "cachedInputPerM", "audioInPerM", "audioInPerMin", "audioOutPerM"] as const) {
    const v = max(now[k], later[k]);
    if (v !== undefined) merged[k] = v;
  }
  const lc = now.longContext ?? later.longContext;
  if (lc) merged.longContext = lc;
  return merged;
}

/** Cost in USD of known usage at a price entry. Thinking tokens are billed as output unless the entry says otherwise. */
export function costUsd(entry: PriceEntry, usage: Usage, promptTokensForTier?: number): number {
  let inPerM = entry.inputPerM;
  let outPerM = entry.outputPerM;
  if (entry.longContext && (promptTokensForTier ?? usage.inputTokens) > entry.longContext.thresholdTokens) {
    inPerM = entry.longContext.inputPerM;
    outPerM = entry.longContext.outputPerM;
  }
  const cached = Math.min(usage.cachedTokens, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  let usd = (fresh * inPerM) / 1e6;
  usd += (cached * (entry.cachedInputPerM ?? inPerM)) / 1e6;
  usd += (usage.outputTokens * outPerM) / 1e6;
  usd += (usage.thinkingTokens * (entry.thinkingPerM ?? outPerM)) / 1e6;
  usd += (usage.toolUseTokens * inPerM) / 1e6;
  if (usage.audioSeconds > 0) {
    if (entry.audioInPerMin !== undefined) usd += (usage.audioSeconds / 60) * entry.audioInPerMin;
    else usd += (usage.audioSeconds * 32 * (entry.audioInPerM ?? inPerM)) / 1e6;
  }
  return usd;
}

/**
 * A deliberately pessimistic token estimate, used only for reservations and size guards (the real figure comes from the provider's usage
 * metadata). Non-ASCII text (Sinhala) is counted at one token per character because its real ratio on Gemini is UNKNOWN and Sinhala is
 * token-heavy in most tokenizers; ASCII at one token per 3 characters.
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 3) + other;
}

/** Worst-case cost of a call before it is made: all input at the dearer price, plus the full output and thinking allowance. */
export function estimateCostUsd(entry: PriceEntry, input: { inputTokens: number; maxOutputTokens: number; maxThinkingTokens: number; audioSeconds?: number }): number {
  return costUsd(entry, { inputTokens: input.inputTokens, outputTokens: input.maxOutputTokens, thinkingTokens: input.maxThinkingTokens, cachedTokens: 0, toolUseTokens: 0, audioSeconds: input.audioSeconds ?? 0 }, input.inputTokens);
}
