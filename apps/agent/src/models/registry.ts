import { MODELS } from "../ollama/models";
import type { ModelChoice, ModelDescriptor, ResourceSnapshot, Task } from "./types";

/**
 * Model and capability registry (M3-A). Descriptive and pure: it does not call Ollama, download anything or change which model
 * answers shoppers today. Licence evidence below was read from the model cards on 2026-11-13; "estimate" numbers are not measurements.
 */
const CHECKED = "2026-11-13";
const card = (name: string) => `Hugging Face model card: ${name}`;

export const MODEL_DESCRIPTORS: readonly ModelDescriptor[] = Object.freeze([
  {
    id: "qwen3-1.7b",
    tag: MODELS.qwen,
    provider: "ollama-local",
    license: { spdxOrName: "apache-2.0", verdict: "permissive", source: card("Qwen/Qwen3-1.7B"), checkedOn: CHECKED },
    memoryMb: { value: 1400, basis: "estimate", note: "About 1.1 GB of weights plus context; not yet measured by this harness. Earlier server runs left enough headroom for it alone." },
    tokensPerSecond: { value: 5.1, basis: "measured", note: "AI server, 2 vCPU, M1-E benchmark, 2026-11" },
    toolCalling: true,
    languageEvidence: { en: "100-prompt English tool-selection eval, M1-B (65/100 alone, 89/100 router-first)" },
    allowedTasks: ["classify", "plan_tools", "chat"],
    status: "live",
    statusReason: "Current default planner and chat model.",
  },
  {
    id: "sinhalallm-1.7b",
    tag: MODELS.sinhala,
    provider: "ollama-local",
    license: { spdxOrName: "apache-2.0", verdict: "permissive", source: card("namindu94/SinhalaLLM-1.7B (base SmolLM2-1.7B, apache-2.0)"), checkedOn: CHECKED },
    memoryMb: { value: 1400, basis: "estimate", note: "Same size class as Qwen3 1.7B; one model is loaded at a time." },
    toolCalling: false,
    languageEvidence: { si: "Model card: Sinhala chat, writing and answers from supplied text. Weak at facts, arithmetic and multi-step reasoning; formal register; 2,048 context. No native-speaker evaluation of our use yet." },
    allowedTasks: ["rewrite_sinhala"],
    status: "experimental",
    statusReason: "In the live allow-list for rewording fixed templates, but switched off by default and flagged for native review.",
  },
  {
    id: "qwen3-4b-instruct-2507",
    tag: "qwen3:4b-instruct-2507",
    provider: "ollama-local",
    license: { spdxOrName: "apache-2.0", verdict: "permissive", source: card("Qwen/Qwen3-4B-Instruct-2507"), checkedOn: CHECKED },
    memoryMb: { value: 3300, basis: "estimate", note: "Earlier server test left about 525 MB free with this model loaded on the 4 GB server." },
    tokensPerSecond: { value: 3.9, basis: "measured", note: "AI server, 2 vCPU, benchmark session 2026-11" },
    toolCalling: true,
    languageEvidence: {},
    allowedTasks: ["classify", "plan_tools", "chat", "general_answer"],
    status: "experimental",
    statusReason: "Benchmark only. Owner decision 2026-11-13: not to be downloaded or switched to without separate approval. Verify the exact installed tag first.",
  },
  {
    id: "qwen3.5-4b",
    tag: "qwen3.5:4b-q4_K_M",
    provider: "ollama-local",
    license: { spdxOrName: "apache-2.0", verdict: "permissive", source: `${card("Qwen/Qwen3.5-4B")}; Apache-2.0 licence layer inside the Ollama package`, checkedOn: CHECKED },
    memoryMb: { value: 3500, basis: "measured", note: "New 6 vCPU / 12 GB server, 4096 context, 2026-11-13: about 3.5 GB of host RAM above idle." },
    tokensPerSecond: { value: 4.4, basis: "measured", note: "New server, one short reply, single request; not a benchmark." },
    toolCalling: true,
    languageEvidence: {},
    allowedTasks: ["classify", "plan_tools", "chat", "general_answer"],
    status: "experimental",
    statusReason: "Fast-fallback candidate under evaluation on the new server. Capabilities per Ollama: completion, vision, tools, thinking. Not approved for shoppers.",
  },
  {
    id: "gemma4-e4b",
    tag: "gemma4:e4b-it-q4_K_M",
    provider: "ollama-local",
    license: { spdxOrName: "apache-2.0", verdict: "permissive", source: `${card("google/gemma-4-E4B-it")}; Apache-2.0 licence layer inside the Ollama package`, checkedOn: CHECKED },
    memoryMb: { value: 6600, basis: "measured", note: "New server, 4096 context, 2026-11-13: about 6.6 GB of host RAM above idle (7.5 B parameters including per-layer embeddings)." },
    tokensPerSecond: { value: 2.0, basis: "measured", note: "New server, one short reply, single request; not a benchmark." },
    toolCalling: true,
    languageEvidence: {},
    allowedTasks: ["classify", "plan_tools"],
    status: "experimental",
    statusReason: "Vision and audio candidate (Ollama capabilities: completion, vision, audio, tools, thinking). Audio and Sinhala audio untested. Not approved for shoppers.",
  },
  {
    id: "qwen3.5-9b",
    tag: "qwen3.5:9b-q4_K_M",
    provider: "ollama-local",
    license: { spdxOrName: "apache-2.0", verdict: "permissive", source: `${card("Qwen/Qwen3.5-9B")}; Apache-2.0 licence layer inside the Ollama package`, checkedOn: CHECKED },
    memoryMb: { value: 6600, basis: "measured", note: "New server, 4096 context, 2026-11-13: about 6.6 GB of host RAM above idle; leaves little for browser, RAG and speech running together." },
    tokensPerSecond: { value: 2.8, basis: "measured", note: "New server, one short reply, single request; not a benchmark." },
    toolCalling: true,
    languageEvidence: {},
    allowedTasks: ["classify", "plan_tools", "chat", "general_answer"],
    status: "experimental",
    statusReason: "Main-model candidate under evaluation on the new server. Capabilities per Ollama: completion, vision, tools, thinking. Not approved for shoppers.",
  },
  {
    id: "qwen2.5-3b-instruct",
    tag: "qwen2.5:3b-instruct",
    provider: "ollama-local",
    license: { spdxOrName: "qwen-research", verdict: "non-commercial", source: "Hugging Face LICENSE of Qwen/Qwen2.5-3B-Instruct: use 'FOR NON-COMMERCIAL PURPOSES ONLY' (clause 2.a); commercial use needs a separate licence (2.b)", checkedOn: CHECKED },
    memoryMb: { value: 2300, basis: "estimate", note: "Not relevant: excluded." },
    toolCalling: true,
    languageEvidence: {},
    allowedTasks: [],
    status: "excluded",
    statusReason: "Non-commercial licence. Removed from commercial candidates by owner decision 2026-11-13.",
  },
  {
    id: "gemma-3-4b-it",
    tag: "gemma3:4b",
    provider: "ollama-local",
    license: { spdxOrName: "gemma", verdict: "custom-review-needed", source: card("google/gemma-3-4b-it, linked Gemma terms and prohibited-use policy"), checkedOn: CHECKED },
    memoryMb: { value: 3500, basis: "estimate", note: "Not tested." },
    toolCalling: false,
    languageEvidence: { en: "Model card claims 140+ languages but does not name Sinhala; unverified." },
    allowedTasks: [],
    status: "excluded",
    statusReason:
      "Gemma Terms of Use read 2026-11-13 (via a page summary, not a lawyer's reading): not non-commercial, but it passes use restrictions to downstream users, treats a hosted service as distribution, and lets Google restrict use remotely or terminate. Needs the owner's and legal approval before any benchmark.",
  },
  {
    id: "gpt-oss-20b",
    tag: "gpt-oss:20b",
    provider: "ollama-local",
    license: { spdxOrName: "apache-2.0", verdict: "permissive", source: card("openai/gpt-oss-20b"), checkedOn: CHECKED },
    memoryMb: { value: 16000, basis: "model-card", note: "Model card: runs within 16 GB of memory." },
    toolCalling: true,
    languageEvidence: {},
    allowedTasks: [],
    status: "excluded",
    statusReason: "Does not fit the 4 GB server. Needs a larger host, which is not approved.",
  },
]);

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

/** Rules that keep an unvetted or unlicensed model out. Throws on the first violation, so a bad entry fails the build and the tests. */
export function validateRegistry(models: readonly ModelDescriptor[]): void {
  const ids = new Set<string>();
  const tags = new Set<string>();
  for (const m of models) {
    if (ids.has(m.id) || tags.has(m.tag)) throw new RegistryError(`Duplicate model id or tag: ${m.id}`);
    ids.add(m.id);
    tags.add(m.tag);
    if (m.provider !== "ollama-local") throw new RegistryError(`${m.id}: only local providers are allowed.`);
    if (!m.license.source || !m.license.checkedOn || !m.license.spdxOrName) throw new RegistryError(`${m.id}: licence evidence is required.`);
    if ((m.status === "live" || m.status === "experimental") && m.license.verdict !== "permissive") {
      throw new RegistryError(`${m.id}: only permissively licensed models can be live or experimental.`);
    }
    if (m.status === "excluded" && m.allowedTasks.length > 0) throw new RegistryError(`${m.id}: an excluded model has no allowed tasks.`);
    if (m.status === "live" && m.allowedTasks.length === 0) throw new RegistryError(`${m.id}: a live model needs at least one task.`);
    if (m.license.verdict === "non-commercial" && m.status !== "excluded") throw new RegistryError(`${m.id}: a non-commercial model must be excluded.`);
  }
}

validateRegistry(MODEL_DESCRIPTORS);

/**
 * Chooses among LIVE models only. Experimental and excluded models are never selected, whatever the task or the resources.
 * Prefers the already loaded model (switching costs seconds on this hardware). Returns null when nothing fits: the caller keeps its
 * fixed, verified template and never falls back to a paid or remote model, because none can exist in this registry.
 */
export function selectModel(task: Task, resources: ResourceSnapshot, models: readonly ModelDescriptor[] = MODEL_DESCRIPTORS): ModelChoice | null {
  const fits = models.filter((m) => m.status === "live" && m.allowedTasks.includes(task) && m.memoryMb.value <= resources.availableMemoryMb);
  if (fits.length === 0) return null;
  const loaded = fits.find((m) => m.id === resources.loadedModelId);
  const pick = loaded ?? fits[0]!;
  return { modelId: pick.id, reason: loaded ? "already loaded" : "first live model that fits" };
}

/** Before any production use: the installed tag must be exactly the registered tag (no silent substitution by a same-named model). */
export function installedTagMatches(model: ModelDescriptor, installedTags: readonly string[]): boolean {
  return installedTags.includes(model.tag);
}
