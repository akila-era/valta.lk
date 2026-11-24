import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { identityClaim, type AgentIdentity } from "./sign";

/**
 * The conversation id sent to the Agent is NOT chosen by the browser. The browser holds a random httpOnly cookie; the id is an HMAC
 * of that cookie and the signed-in identity, using a server secret. Consequences:
 *  - signing in or out changes the id automatically (the Agent binds an id to one identity and refuses to share it), so there is
 *    no session fixation and no guest conversation carries over into an account;
 *  - the id cannot be guessed, forged or chosen by an attacker;
 *  - nothing is stored on the server.
 */
export const ASSISTANT_COOKIE = "volta_ai";
export const ASSISTANT_COOKIE_MAX_AGE = 60 * 60 * 24; // one day

const TOKEN = /^[A-Za-z0-9_-]{32}$/;

export const newAssistantToken = (): string => randomBytes(24).toString("base64url");
export const isAssistantToken = (t: string | undefined): t is string => typeof t === "string" && TOKEN.test(t);

export function agentSessionId(secret: string, token: string, identity: AgentIdentity): string {
  const mac = createHmac("sha256", secret).update(`ai-session|${token}|${identityClaim(identity)}`).digest("base64url");
  return `sess_${mac.slice(0, 32)}`;
}
