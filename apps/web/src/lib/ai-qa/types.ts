/**
 * Vocabulary of the AI QA control center. Statuses and evidence types are fixed so nothing on screen can claim more than was checked.
 * "Working" needs real evidence and no mock data in the path. A button or an endpoint that exists proves nothing.
 */
export const STATUSES = ["working", "limited", "mock", "not_connected", "failed", "not_tested"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  working: "Working",
  limited: "Limited",
  mock: "Mock only",
  not_connected: "Not connected",
  failed: "Failed",
  not_tested: "Not tested",
};

export const EVIDENCE = ["unit", "integration", "mock", "real_browser", "real_model", "real_voice", "not_tested"] as const;
export type Evidence = (typeof EVIDENCE)[number];

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  unit: "Unit tested",
  integration: "Integration tested",
  mock: "Mock tested",
  real_browser: "Real browser tested",
  real_model: "Real model tested",
  real_voice: "Real voice tested",
  not_tested: "Not tested",
};

export interface Capability {
  id: string;
  label: string;
  status: Status;
  /** Why this status, in plain words, naming the evidence. */
  reason: string;
  evidence: Evidence[];
}

/** What the server-side probes found. Every field is the result of a real request or a real check, never an assumption. */
export interface AgentProbe {
  reachable: boolean;
  /** HTTP status of the signed health call, when one was received. */
  httpStatus?: number;
  ready?: boolean;
  enabled?: boolean;
  appVersion?: string;
  contractVersion?: string;
  ollamaReachable?: boolean;
  loadedModel?: string | null;
  uptimeSec?: number;
  /** A short code, never a message from the Agent. */
  error?: "unreachable" | "unauthorized" | "bad_response" | "timeout";
  latencyMs?: number;
}

export interface VoiceProbe {
  /** The website routes exist (an unknown route answers 404). Existing is NOT the same as working. */
  transcribeRoute: boolean;
  speakRoute: boolean;
}

export type OutcomeGroup = "en" | "singlish" | "si" | "mixed" | "general" | "shopping" | "safety" | "context";

export interface ScenarioResult {
  id: string;
  group: OutcomeGroup;
  prompt: string;
  /** pass and fail are verdicts on the checks; skipped means it could not run (for example the Agent was unreachable). */
  verdict: "pass" | "fail" | "skipped";
  /** The Agent answered over a MOCK catalogue, so shopping facts in this result are demo data. */
  mockData: boolean;
  latencyMs: number | null;
  failures: string[];
  replyText: string;
  cardNames: string[];
  actionTypes: string[];
  ranAt: string;
}

export interface ProbeSnapshot {
  agent: AgentProbe;
  voice: VoiceProbe;
  /** True while the assistant runs on the mock catalogue (AI_ASSISTANT_DEMO_DATA is not "false"). */
  demoData: boolean;
  checkedAt: string;
}
