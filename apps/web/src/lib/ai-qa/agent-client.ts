import "server-only";
import { readAssistantConfig } from "@/lib/assistant/config";
import { AGENT_CONTRACT_VERSION, AgentChatResponse, toPublic, type PublicChatResponse } from "@/lib/assistant/schema";
import { agentSessionId, isAssistantToken, newAssistantToken } from "@/lib/assistant/session-id";
import { signAgentRequest, type AgentIdentity } from "@/lib/assistant/sign";
import type { AgentProbe } from "./types";

/**
 * Signed calls from the QA control center to the Agent, using the SAME configuration, signing and response validation as the public
 * assistant route (so QA exercises the real path, not a side door). Guest identity only: QA never acts as a customer. Nothing from an
 * Agent error message is returned, only short codes.
 */
const GUEST: AgentIdentity = { kind: "guest" };
const QA_IP = "127.0.0.1";

export async function probeAgent(): Promise<AgentProbe> {
  const cfg = readAssistantConfig();
  if (!cfg) return { reachable: false, error: "unreachable" };
  const path = "/v1/health";
  const t0 = Date.now();
  try {
    const res = await fetch(new URL(path, cfg.agentUrl), { method: "GET", headers: signAgentRequest({ keyId: cfg.keyId, secret: cfg.secret, method: "GET", path, identity: GUEST, clientIp: QA_IP }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000) });
    const latencyMs = Date.now() - t0;
    if (res.status === 401 || res.status === 403) return { reachable: true, httpStatus: res.status, error: "unauthorized", latencyMs };
    if (res.status === 404) return { reachable: true, httpStatus: res.status, error: "bad_response", latencyMs }; // an Agent without a health route (for example a test double)
    const j = (await res.json().catch(() => null)) as { ok?: boolean; ready?: boolean; enabled?: boolean; appVersion?: string; contractVersion?: string; ollama?: { reachable?: boolean; loadedModel?: string | null }; uptimeSec?: number } | null;
    if (!res.ok || !j || j.ok !== true) return { reachable: true, httpStatus: res.status, error: "bad_response", latencyMs };
    return {
      reachable: true,
      httpStatus: res.status,
      latencyMs,
      ...(j.ready !== undefined ? { ready: j.ready } : {}),
      ...(j.enabled !== undefined ? { enabled: j.enabled } : {}),
      ...(j.appVersion ? { appVersion: j.appVersion } : {}),
      ...(j.contractVersion ? { contractVersion: j.contractVersion } : {}),
      ...(j.ollama ? { ollamaReachable: Boolean(j.ollama.reachable), loadedModel: j.ollama.loadedModel ?? null } : {}),
      ...(j.uptimeSec !== undefined ? { uptimeSec: j.uptimeSec } : {}),
    };
  } catch (e) {
    return { reachable: false, error: (e as Error).name === "TimeoutError" ? "timeout" : "unreachable" };
  }
}

export type QaChatResult = { ok: true; token: string; response: PublicChatResponse; latencyMs: number } | { ok: false; code: "NOT_CONFIGURED" | "UNREACHABLE" | "RATE_LIMITED" | "REJECTED" | "BAD_RESPONSE" | "AGENT_ERROR"; latencyMs: number; retryAfterSec?: number };

export async function qaChat(input: { message: string; locale: "auto" | "en" | "si"; token?: string }): Promise<QaChatResult> {
  const cfg = readAssistantConfig();
  const t0 = Date.now();
  if (!cfg) return { ok: false, code: "NOT_CONFIGURED", latencyMs: 0 };
  const token = isAssistantToken(input.token) ? input.token : newAssistantToken();
  const sessionId = agentSessionId(cfg.secret, token, GUEST);
  const path = "/v1/chat";
  const body = JSON.stringify({ sessionId, message: input.message, locale: input.locale, cart: [], contractVersion: AGENT_CONTRACT_VERSION });
  try {
    const res = await fetch(new URL(path, cfg.agentUrl), { method: "POST", headers: { "content-type": "application/json", ...signAgentRequest({ keyId: cfg.keyId, secret: cfg.secret, method: "POST", path, identity: GUEST, clientIp: QA_IP, body }) }, body, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(cfg.timeoutMs) });
    const latencyMs = Date.now() - t0;
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data as { error?: { code?: unknown; retryAfterSec?: unknown } } | null)?.error;
      if (err?.code === "RATE_LIMITED" || err?.code === "CHALLENGE_REQUIRED") return { ok: false, code: "RATE_LIMITED", latencyMs, retryAfterSec: Math.min(120, Math.max(1, Math.ceil(Number(err.retryAfterSec) || 10))) };
      if (res.status >= 400 && res.status < 500) return { ok: false, code: "REJECTED", latencyMs };
      return { ok: false, code: "AGENT_ERROR", latencyMs };
    }
    const checked = AgentChatResponse.safeParse(data);
    if (!checked.success) return { ok: false, code: "BAD_RESPONSE", latencyMs };
    return { ok: true, token, response: toPublic(checked.data), latencyMs };
  } catch {
    return { ok: false, code: "UNREACHABLE", latencyMs: Date.now() - t0 };
  }
}
