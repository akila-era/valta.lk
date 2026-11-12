/**
 * The only two models this project may ask for. Any other name, and in particular any cloud/remote model, is refused
 * before a request is built, so a prompt can never be sent to a model we did not vet.
 */
export const MODELS = {
  qwen: "qwen3:1.7b-q4_K_M",
  sinhala: "hf.co/namindu94/SinhalaLLM-1.7B:Q4_K_M",
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelTag = (typeof MODELS)[ModelKey];

export const MODEL_KEYS = Object.keys(MODELS) as ModelKey[];

export function modelKeyOfTag(tag: string): ModelKey | null {
  for (const key of MODEL_KEYS) if (MODELS[key] === tag) return key;
  return null;
}

/** Fixed by the measured memory budget on the 4 GB server. Not configurable. */
export const NUM_CTX = 2048;
export const NUM_PREDICT_CAP = { classifier: 24, tool: 200, reply: 120 } as const;
export type Purpose = keyof typeof NUM_PREDICT_CAP;

export const MAX_MESSAGES = 8;
export const MAX_MESSAGE_CONTENT_CHARS = 4000;

export class ModelPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelPolicyError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface OllamaToolSchema {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface GenerateRequest {
  model: ModelKey;
  purpose: Purpose;
  messages: ChatMessage[];
  /** Qwen only. SinhalaLLM has no tool capability. */
  tools?: OllamaToolSchema[];
  temperature?: number;
  numPredict?: number;
  /** JSON schema for constrained output (Qwen classifier use). */
  format?: Record<string, unknown>;
  topP?: number;
  minP?: number;
  repeatPenalty?: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Builds the Ollama /api/chat body. Always non-streaming, fixed context, capped output, and no model-specific rule is left
 * to the caller: SinhalaLLM takes no system prompt (its model card says long system prompts confuse it) and no tools.
 */
export function buildChatBody(req: GenerateRequest): Record<string, unknown> {
  // hasOwn, not a truthiness check: keys such as "constructor" exist on every object and must not pass as models.
  if (!Object.hasOwn(MODELS, req.model)) throw new ModelPolicyError("Model is not allowed.");
  const tag = MODELS[req.model];
  if (req.messages.length === 0 || req.messages.length > MAX_MESSAGES) throw new ModelPolicyError("Unsupported number of messages.");
  for (const m of req.messages) {
    if (m.content.length > MAX_MESSAGE_CONTENT_CHARS) throw new ModelPolicyError("Message content is too long for the fixed context window.");
  }
  if (req.model === "sinhala") {
    if (req.messages.some((m) => m.role === "system")) throw new ModelPolicyError("SinhalaLLM must not receive a system prompt.");
    if (req.tools && req.tools.length > 0) throw new ModelPolicyError("SinhalaLLM has no tool capability.");
  }
  const cap = NUM_PREDICT_CAP[req.purpose];
  const options: Record<string, unknown> = {
    num_ctx: NUM_CTX,
    num_predict: clamp(Math.floor(req.numPredict ?? cap), 1, cap),
    temperature: clamp(req.temperature ?? 0.3, 0, 1),
  };
  if (req.topP !== undefined) options.top_p = clamp(req.topP, 0, 1);
  if (req.minP !== undefined) options.min_p = clamp(req.minP, 0, 1);
  if (req.repeatPenalty !== undefined) options.repeat_penalty = clamp(req.repeatPenalty, 1, 2);

  const body: Record<string, unknown> = { model: tag, stream: false, messages: req.messages, options };
  if (req.model === "qwen") body.think = false;
  if (req.tools && req.tools.length > 0) body.tools = req.tools;
  if (req.format) body.format = req.format;
  return body;
}
