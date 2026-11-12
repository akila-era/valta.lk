import { isIP } from "node:net";
import { cookies } from "next/headers";
import { getCurrentCustomer, sessionCookieOptions } from "@/lib/auth/session";
import { readAssistantConfig } from "@/lib/assistant/config";
import { AGENT_CONTRACT_VERSION, AgentChatResponse, BrowserRequest, toPublic } from "@/lib/assistant/schema";
import { agentSessionId, ASSISTANT_COOKIE, ASSISTANT_COOKIE_MAX_AGE, isAssistantToken, newAssistantToken } from "@/lib/assistant/session-id";
import { signAgentRequest, type AgentIdentity } from "@/lib/assistant/sign";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";
import { clientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AGENT_RESPONSE_BYTES = 200_000;
const UNAVAILABLE = "The shopping assistant is not available right now. Please try again in a moment, or use the store chat.";

/**
 * The shopper's message goes to the Agent (a separate, private service) and the answer comes back as text plus cards.
 * Nothing here is public API for the Agent: the browser talks only to this route.
 *
 *  - Off (404) unless the assistant is fully configured; no button is shown either.
 *  - Same-origin only, rate limited per client, strict input validation, small body.
 *  - Identity comes ONLY from the signed-in session cookie (never the body); a guest is a guest. The Agent receives it signed.
 *  - The conversation id is derived on the server (see lib/assistant/session-id.ts), never taken from the browser.
 *  - The Agent's answer is validated against a strict schema before the browser sees it; cart changes in it are proposals that the
 *    browser applies only after the shopper confirms.
 *  - No message text is logged or stored here.
 */
export async function POST(req: Request) {
  const cfg = readAssistantConfig();
  if (!cfg) return errorResponse(404, "NOT_FOUND", "Not found.");
  const blocked = guard(req, { name: "assistant-chat", limit: 20, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await readJson(req, 8_000);
  } catch {
    return errorResponse(422, "INVALID", "Please type a message (up to 800 characters).");
  }
  const parsed = BrowserRequest.safeParse(raw);
  if (!parsed.success) return errorResponse(422, "INVALID", parsed.error.issues[0]?.message ?? "That request is not valid.");
  const input = parsed.data;

  const customer = await getCurrentCustomer();
  const identity: AgentIdentity = customer ? { kind: "customer", customerId: customer.id } : { kind: "guest" };
  const existing = (await cookies()).get(ASSISTANT_COOKIE)?.value;
  const token = isAssistantToken(existing) ? existing : newAssistantToken();
  const sessionId = agentSessionId(cfg.secret, token, identity);
  const ip = isIP(clientIp(req)) !== 0 ? clientIp(req) : "0.0.0.0";

  const body = JSON.stringify({
    sessionId,
    message: input.message,
    locale: input.locale,
    cart: input.cart,
    ...(input.page ? { context: { page: input.page } } : {}),
    contractVersion: AGENT_CONTRACT_VERSION,
  });
  const path = "/v1/chat";

  let res: Response;
  try {
    res = await fetch(new URL(path, cfg.agentUrl), {
      method: "POST",
      headers: { "content-type": "application/json", ...signAgentRequest({ keyId: cfg.keyId, secret: cfg.secret, method: "POST", path, identity, clientIp: ip, body }) },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch {
    return errorResponse(503, "ASSISTANT_UNAVAILABLE", UNAVAILABLE);
  }

  const text = await res.text().catch(() => "");
  if (text.length > MAX_AGENT_RESPONSE_BYTES) return errorResponse(502, "ASSISTANT_ERROR", UNAVAILABLE);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return errorResponse(502, "ASSISTANT_ERROR", UNAVAILABLE);
  }

  if (!res.ok) {
    // Only a fixed set of the Agent's error codes is passed on, with our own wording; nothing from its message is forwarded.
    const code = (data as { error?: { code?: unknown; retryAfterSec?: unknown } })?.error?.code;
    const retry = Number((data as { error?: { retryAfterSec?: unknown } })?.error?.retryAfterSec);
    const headers: Record<string, string> = Number.isFinite(retry) && retry > 0 ? { "Retry-After": String(Math.min(300, Math.ceil(retry))) } : {};
    if (code === "RATE_LIMITED" || code === "CHALLENGE_REQUIRED") return json({ error: { code: "RATE_LIMITED", message: "Too many messages. Please wait a moment and try again." } }, 429, headers);
    if (code === "VALIDATION_FAILED" || code === "INVALID_REQUEST" || code === "PAYLOAD_TOO_LARGE") return errorResponse(422, "INVALID", "That message could not be processed.");
    if (code === "QUEUE_FULL" || code === "AI_UNAVAILABLE" || code === "AI_DISABLED" || code === "TIMEOUT") return json({ error: { code: "ASSISTANT_BUSY", message: "The shopping assistant is busy. Please try again shortly." } }, 503, headers);
    return errorResponse(502, "ASSISTANT_ERROR", UNAVAILABLE);
  }

  const checked = AgentChatResponse.safeParse(data);
  if (!checked.success) return errorResponse(502, "ASSISTANT_ERROR", UNAVAILABLE);

  const out = json(toPublic(checked.data));
  if (!isAssistantToken(existing)) out.cookies.set(ASSISTANT_COOKIE, token, { ...sessionCookieOptions(new Date(Date.now() + ASSISTANT_COOKIE_MAX_AGE * 1000)), maxAge: ASSISTANT_COOKIE_MAX_AGE });
  return out;
}
