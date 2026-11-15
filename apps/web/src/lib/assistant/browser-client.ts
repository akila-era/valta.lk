import type { BrowserDecisionData, BrowserPanelData, BrowserProgressItem, BrowserProposalData, BrowserStepName, DecisionOutcome } from "@/components/assistant/types";

/**
 * Browser-side client of the two decision routes of THIS website:
 *   POST /api/assistant/browser/confirm   body: { proposalId }   answer: { outcome, reply, needsNativeReview, browser }
 *   POST /api/assistant/browser/cancel    body: { proposalId }   answer: the same
 * Both are OFF (404) unless the server has AI_ASSISTANT_BROWSER=1. Nothing here decides anything: it sends the shopper's click and shows what comes back.
 * Everything that comes back is re-checked below (shape, sizes, allowed values) and then shown as plain text only. No zod: this file ships to the browser.
 */
export type DecisionFailure = "unavailable" | "rate_limited" | "failed" | "network";
export type DecisionResult = { ok: true; data: BrowserDecisionData } | { ok: false; reason: DecisionFailure };

export const CONFIRM_URL = "/api/assistant/browser/confirm";
export const CANCEL_URL = "/api/assistant/browser/cancel";

const STEPS: readonly BrowserStepName[] = ["open", "read", "find", "act", "verify", "close"];
const STATUSES = ["done", "failed", "skipped"] as const;
const OUTCOMES: readonly DecisionOutcome[] = ["done", "failed", "cancelled", "expired"];
const PROPOSAL_ID = /^bp_[A-Za-z0-9_-]{16,40}$/;
const PATH = /^\/(?![\/\\])[A-Za-z0-9._~!$&'()*+,;=:@%\/?\-]*$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const plain = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !CONTROL.test(v);

/** Returns a clean copy of a browser panel, or null when anything is off (unknown field values, too long, wrong type). Unknown extra fields are dropped. */
export function parseBrowserPanel(v: unknown): BrowserPanelData | null {
  if (!isObj(v) || v.source !== "page" || !Array.isArray(v.progress) || v.progress.length > 8) return null;
  const progress: BrowserProgressItem[] = [];
  for (const p of v.progress) {
    if (!isObj(p) || !STEPS.includes(p.step as BrowserStepName) || !STATUSES.includes(p.status as (typeof STATUSES)[number])) return null;
    progress.push({ step: p.step as BrowserStepName, status: p.status as BrowserProgressItem["status"] });
  }
  const out: BrowserPanelData = { progress, source: "page" };
  if (v.confirmation !== undefined) {
    const c = v.confirmation;
    if (!isObj(c) || typeof c.proposalId !== "string" || !PROPOSAL_ID.test(c.proposalId) || !plain(c.description, 200) || !plain(c.page, 200) || !PATH.test(c.page)) return null;
    if (c.actionClass !== "reversible" && c.actionClass !== "sensitive") return null;
    if (!Number.isInteger(c.expiresInSec) || (c.expiresInSec as number) < 1 || (c.expiresInSec as number) > 600) return null;
    const proposal: BrowserProposalData = { proposalId: c.proposalId, description: c.description, page: c.page, actionClass: c.actionClass, expiresInSec: c.expiresInSec as number };
    out.confirmation = proposal;
  }
  return out;
}

export function parseDecision(v: unknown): BrowserDecisionData | null {
  if (!isObj(v) || !OUTCOMES.includes(v.outcome as DecisionOutcome) || !isObj(v.reply) || !plain(v.reply.text, 2000) || typeof v.needsNativeReview !== "boolean") return null;
  const browser = parseBrowserPanel(v.browser);
  if (!browser) return null;
  return { outcome: v.outcome as DecisionOutcome, reply: { text: v.reply.text }, needsNativeReview: v.needsNativeReview, browser };
}

/** One decision. A 404 means the feature is off or the conversation is gone ("unavailable"); a 429 asks the shopper to wait; anything odd is "failed". */
export async function sendDecision(kind: "confirm" | "cancel", proposalId: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<DecisionResult> {
  if (!PROPOSAL_ID.test(proposalId)) return { ok: false, reason: "failed" };
  let res: Response;
  try {
    res = await fetchImpl(kind === "confirm" ? CONFIRM_URL : CANCEL_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId }), ...(signal ? { signal } : {}) });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (res.status === 404) return { ok: false, reason: "unavailable" };
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (!res.ok) return { ok: false, reason: "failed" };
  const data = parseDecision(await res.json().catch(() => null));
  return data ? { ok: true, data } : { ok: false, reason: "failed" };
}

/** The panel is shown only when the feature is on. With it off, whatever arrived is ignored: no progress, no prompt, nothing that could be pressed. */
export const visibleBrowserPanel = (panel: BrowserPanelData | undefined, enabled: boolean): BrowserPanelData | undefined => (enabled && panel ? panel : undefined);
