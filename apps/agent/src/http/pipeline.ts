import type { Identity } from "../auth/hmac";
import type { Card, ChatRequest, ChatResponse, ClientAction, ReplySource } from "../contract/schemas";
import { ApiError } from "../errors";

export type PipelineEvent =
  | { type: "status"; phase: "queued" | "routing" | "tool" | "writing"; position?: number }
  | { type: "card"; card: Card }
  | { type: "action"; action: ClientAction }
  | { type: "token"; text: string }
  | { type: "text"; text: string; source: ReplySource; needsNativeReview: boolean };

export interface PipelineInput {
  requestId: string;
  identity: Identity;
  clientIp: string;
  request: ChatRequest;
  /** Aborted when the client disconnects or the request deadline passes. */
  signal: AbortSignal;
  deadlineAt: number;
}

export type PipelineResult = Omit<ChatResponse, "requestId" | "sessionId" | "meta"> & {
  meta: { model: string | null; degraded: boolean; queuedMs: number };
};

/** The seam between the HTTP layer (M1-A) and the conversation logic (M1-B onward). */
export interface ChatPipeline {
  run(input: PipelineInput, emit: (event: PipelineEvent) => void): Promise<PipelineResult>;
}

/** M1-A ships no conversation logic: until the pipeline exists the endpoint says so instead of improvising an answer. */
export const notEnabledPipeline: ChatPipeline = {
  async run() {
    throw new ApiError("AI_UNAVAILABLE", "The assistant pipeline is not enabled in this build.");
  },
};
