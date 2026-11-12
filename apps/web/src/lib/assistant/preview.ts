import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { readAssistantConfig, type AssistantConfig } from "./config";

/**
 * Private preview. While the assistant is being tried on the live site (on demo data), set AI_ASSISTANT_PREVIEW_KEY: only a browser
 * that opened /api/assistant/preview?key=<that key> gets a cookie that shows the assistant and lets it chat. Everyone else sees
 * nothing and the chat route answers 404, exactly as if it were off. Remove the key to open it to all visitors.
 */
export const PREVIEW_COOKIE = "volta_ai_preview";
export const PREVIEW_MAX_AGE = 60 * 60 * 24 * 30;

const mac = (cfg: AssistantConfig) => createHmac("sha256", cfg.secret).update(`ai-preview|${cfg.previewKey}`).digest("base64url");

export const previewCookieValue = (cfg: AssistantConfig): string | null => (cfg.previewKey ? mac(cfg) : null);

export function previewKeyMatches(cfg: AssistantConfig, given: string | null): boolean {
  if (!cfg.previewKey || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(cfg.previewKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when there is no preview restriction, or this browser holds the preview cookie. */
export async function hasAssistantAccess(cfg: AssistantConfig): Promise<boolean> {
  const expected = previewCookieValue(cfg);
  if (expected === null) return true;
  const given = (await cookies()).get(PREVIEW_COOKIE)?.value ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Used by the page shell: the assistant is configured AND this visitor may see it. */
export async function assistantVisible(): Promise<boolean> {
  const cfg = readAssistantConfig();
  return cfg !== null && (await hasAssistantAccess(cfg));
}
