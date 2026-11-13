/**
 * Provider-independent model descriptions (M3-A contract). Nothing here talks to a model or changes the live Ollama path: the live
 * allow-list stays in `src/ollama/models.ts`. This file describes what a model IS (licence evidence, size, measured speed, what it
 * is allowed to do) so a later router can choose by task and resources, and so an unvetted model cannot be added by accident.
 */
export const TASKS = ["classify", "plan_tools", "chat", "general_answer", "rewrite_sinhala", "code"] as const;
export type Task = (typeof TASKS)[number];

/** Only local, self-hosted runtimes exist as a type. There is deliberately no "remote" or "paid" provider kind. */
export type ProviderKind = "ollama-local";

export type LicenseVerdict =
  | "permissive" // Apache-2.0, MIT: commercial use allowed
  | "custom-review-needed" // a bespoke licence (for example Gemma terms): must be read and approved by the owner before use
  | "non-commercial" // research-only: not usable for the store
  | "unknown"; // not read yet

export interface LicenseEvidence {
  /** Licence identifier exactly as shown on the model card (for example "apache-2.0", "qwen-research"). */
  spdxOrName: string;
  verdict: LicenseVerdict;
  /** Where it was read and when (ISO date). Required: no evidence, no use. */
  source: string;
  checkedOn: string;
}

/** Numbers are either measured (with where and when) or an estimate. The two must never be mixed in one field. */
export interface Measured<T> {
  value: T;
  basis: "measured" | "estimate" | "model-card";
  note: string;
}

export interface ModelDescriptor {
  /** Registry key, stable. */
  id: string;
  /** Exact runtime tag that would be requested. Verified against the installed model before any production use. */
  tag: string;
  provider: ProviderKind;
  license: LicenseEvidence;
  /** Approximate resident memory with the fixed 2,048-token context, MB. */
  memoryMb: Measured<number>;
  tokensPerSecond?: Measured<number>;
  /** Native tool calling supported by the runtime and model. */
  toolCalling: boolean;
  /** Languages with any evidence of quality; absence means "unknown", not "no". */
  languageEvidence: Partial<Record<"en" | "si" | "singlish" | "mixed", string>>;
  /** Tasks the owner has allowed this model for. */
  allowedTasks: readonly Task[];
  /** live = answering shoppers today; experimental = may be benchmarked, never routed to; excluded = must not be used. */
  status: "live" | "experimental" | "excluded";
  statusReason: string;
}

/** What the host can give right now. The router must never choose a model that does not fit. */
export interface ResourceSnapshot {
  availableMemoryMb: number;
  /** Model currently loaded (the server holds one at a time); switching costs seconds. */
  loadedModelId?: string;
  queueDepth: number;
}

export interface ModelChoice {
  modelId: string;
  reason: string;
}
