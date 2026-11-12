import "server-only";

/**
 * Settings for the AI shopping assistant (server side only). The assistant is OFF unless AI_ASSISTANT_ENABLED is exactly "true"
 * AND every setting below is valid; any problem turns it off (the route answers 404 and no button is shown), it never half-works.
 *
 * The Agent is reached only from this server, never from the browser. Its address must be loopback http (for example an SSH
 * tunnel's local port) or https; plain http to any other host is refused, so a signed request never crosses a network in clear.
 */
export interface AssistantConfig {
  agentUrl: URL;
  keyId: string;
  secret: string;
  timeoutMs: number;
  /** When set, the assistant is visible and usable only to browsers that opened the private preview link (see preview.ts). */
  previewKey: string | null;
}

const KEY_ID = /^[A-Za-z0-9_-]{1,16}$/;
const MIN_SECRET = 32;

function isLoopback(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

export function readAssistantConfig(env: Readonly<Record<string, string | undefined>> = process.env): AssistantConfig | null {
  if (env.AI_ASSISTANT_ENABLED?.trim() !== "true") return null;
  const keyId = env.AI_AGENT_HMAC_KEY_ID?.trim() ?? "";
  const secret = env.AI_AGENT_HMAC_SECRET?.trim() ?? "";
  if (!KEY_ID.test(keyId) || secret.length < MIN_SECRET) return null;
  let url: URL;
  try {
    url = new URL(env.AI_AGENT_URL?.trim() ?? "");
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) return null;
  const timeout = Number(env.AI_AGENT_TIMEOUT_MS ?? 50_000);
  const timeoutMs = Number.isInteger(timeout) && timeout >= 1_000 && timeout <= 120_000 ? timeout : 50_000;
  const preview = env.AI_ASSISTANT_PREVIEW_KEY?.trim() ?? "";
  if (preview !== "" && preview.length < 16) return null; // a weak preview key is a misconfiguration: stay off
  return { agentUrl: new URL(url.origin), keyId, secret, timeoutMs, previewKey: preview === "" ? null : preview };
}

/** True when the assistant is fully configured. Used by the layout (to show the button) and the route (404 when off). */
export const assistantEnabled = (): boolean => readAssistantConfig() !== null;
