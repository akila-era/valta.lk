import "server-only";
import { cookies } from "next/headers";
import { getCurrentCustomer } from "@/lib/auth/session";
import { readAssistantConfig } from "@/lib/assistant/config";
import { browserEnabled } from "@/lib/assistant/browser-flag";
import { agentClientAddress } from "@/lib/assistant/client-address";
import { hasAssistantAccess } from "@/lib/assistant/preview";
import { AgentDecisionResponse, BrowserDecisionBody, type PublicDecision } from "@/lib/assistant/schema";
import { agentSessionId, ASSISTANT_COOKIE, isAssistantToken } from "@/lib/assistant/session-id";
import { signAgentRequest, type AgentIdentity } from "@/lib/assistant/sign";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const MAX_DECISION_RESPONSE_BYTES = 60_000;
const UNAVAILABLE = "The shopping assistant is not available right now. Please try again in a moment.";

/**
 * The shopper's decision about ONE browser proposal (approve or cancel). Shared by the two routes.
 *
 *  - Off (404) unless the assistant is configured, the shopper has access AND AI_ASSISTANT_BROWSER=1.
 *  - Same-origin only, rate limited per client, a tiny strict body ({ proposalId } and nothing else).
 *  - The conversation id is derived on the server from the assistant cookie and the signed-in identity, exactly like the chat route; the browser never sends
 *    one and cannot choose another conversation. Without the cookie there is no conversation to decide about, so nothing is sent to the Agent.
 *  - The answer is validated against the strict 1.3 schema, must belong to the same conversation, and only the outcome, the Agent's fixed reply and the
 *    progress steps reach the browser. No Agent error text is forwarded.
 *  - Nothing about the decision or the page is logged or stored here.
 */
export async function decideProposal(req: Request, kind: "confirm" | "cancel", fetchImpl: typeof fetch = fetch): Promise<Response> {
  const cfg = readAssistantConfig();
  if (!cfg || !browserEnabled() || !(await hasAssistantAccess(cfg))) return errorResponse(404, "NOT_FOUND", "Not found.");
  const blocked = guard(req, { name: "assistant-browser-decision", limit: 12, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await readJson(req, 1_000);
  } catch {
    return errorResponse(422, "INVALID", "That request is not valid.");
  }
  const parsed = BrowserDecisionBody.safeParse(raw);
  if (!parsed.success) return errorResponse(422, "INVALID", "That request is not valid.");

  const existing = (await cookies()).get(ASSISTANT_COOKIE)?.value;
  if (!isAssistantToken(existing)) return errorResponse(422, "INVALID", "That request is not valid.");
  const customer = await getCurrentCustomer();
  const identity: AgentIdentity = customer ? { kind: "customer", customerId: customer.id } : { kind: "guest" };
  const sessionId = agentSessionId(cfg.secret, existing, identity);

  const path = kind === "confirm" ? "/v1/browser/confirm" : "/v1/browser/cancel";
  const body = JSON.stringify({ sessionId, proposalId: parsed.data.proposalId });
  let res: Response;
  try {
    res = await fetchImpl(new URL(path, cfg.agentUrl), {
      method: "POST",
      headers: { "content-type": "application/json", ...signAgentRequest({ keyId: cfg.keyId, secret: cfg.secret, method: "POST", path, identity, clientIp: agentClientAddress(req), body }) },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch {
    return errorResponse(503, "ASSISTANT_UNAVAILABLE", UNAVAILABLE);
  }

  const text = await res.text().catch(() => "");
  if (text.length > MAX_DECISION_RESPONSE_BYTES) return errorResponse(502, "ASSISTANT_ERROR", UNAVAILABLE);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return errorResponse(502, "ASSISTANT_ERROR", UNAVAILABLE);
  }

  if (!res.ok) {
    // A fixed set of the Agent's error codes, with our own wording; nothing from its message is forwarded.
    const err = (data as { error?: { code?: unknown; retryAfterSec?: unknown } })?.error;
    const retry = Number(err?.retryAfterSec);
    const headers: Record<string, string> = Number.isFinite(retry) && retry > 0 ? { "Retry-After": String(Math.min(300, Math.ceil(retry))) } : {};
    const code = err?.code;
    if (code === "RATE_LIMITED" || code === "CHALLENGE_REQUIRED") return json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." } }, 429, headers);
    if (code === "VALIDATION_FAILED" || code === "INVALID_REQUEST" || code === "PAYLOAD_TOO_LARGE") return errorResponse(422, "INVALID", "That request is not valid.");
    if (code === "NOT_FOUND" || code === "AI_DISABLED") return errorResponse(404, "NOT_FOUND", "Not found.");
    if (code === "QUEUE_FULL" || code === "AI_UNAVAILABLE" || code === "TIMEOUT" || code === "REQUEST_TIMEOUT") return json({ error: { code: "ASSISTANT_BUSY", message: "The shopping assistant is busy. Please try again shortly." } }, 503, headers);
    return errorResponse(502, "ASSISTANT_ERROR", UNAVAILABLE);
  }

  const checked = AgentDecisionResponse.safeParse(data);
  // An answer about another conversation is never shown: it would mean the Agent mixed up sessions.
  if (!checked.success || checked.data.sessionId !== sessionId) return errorResponse(502, "ASSISTANT_ERROR", UNAVAILABLE);
  const sinhala = /[඀-෿]/.test(checked.data.reply.text);
  const out: PublicDecision = { outcome: checked.data.outcome, reply: { text: checked.data.reply.text }, needsNativeReview: checked.data.needsNativeReview || sinhala, browser: checked.data.browser };
  return json(out);
}
