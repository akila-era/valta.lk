import { z } from "zod";

/**
 * Typed browser tools (the model-facing surface). Every argument schema is strict: unknown fields are rejected. There is no tool and
 * no argument for running JavaScript, a shell command, a CSS or XPath selector, a cookie, a header, a download or a file upload.
 * Elements are named only by the `ref` a previous result returned.
 */
export const BROWSER_TOOL_NAMES = [
  "browser.open_page",
  "browser.get_page_state",
  "browser.find_elements",
  "browser.click",
  "browser.type_text",
  "browser.search",
  "browser.scroll",
  "browser.go_back",
  "browser.go_forward",
  "browser.take_screenshot",
  "browser.close_session",
] as const;
export type BrowserToolName = (typeof BROWSER_TOOL_NAMES)[number];

const SessionId = z.string().regex(/^bs_[A-Za-z0-9_-]{16,64}$/);
const Ref = z.string().regex(/^e[0-9]{1,5}$/);
const Confirmation = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
// eslint-disable-next-line no-control-regex
const Plain = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/);
const Lkr = z.number().int().min(0).max(100_000_000);

export const TOOL_ARGS = {
  /** `target` is an absolute https URL or a path such as "/products". Either way it is checked against the allowlist. */
  "browser.open_page": z.object({ sessionId: SessionId.optional(), target: z.string().trim().min(1).max(2048) }).strict(),
  "browser.get_page_state": z.object({ sessionId: SessionId }).strict(),
  "browser.find_elements": z
    .object({
      sessionId: SessionId,
      role: z.enum(["link", "button", "textbox", "searchbox", "combobox", "checkbox", "heading"]).optional(),
      nameContains: Plain(80).optional(),
      limit: z.number().int().min(1).max(30).default(15),
    })
    .strict(),
  "browser.click": z.object({ sessionId: SessionId, ref: Ref, confirmation: Confirmation.optional() }).strict(),
  "browser.type_text": z.object({ sessionId: SessionId, ref: Ref, text: Plain(200), submit: z.boolean().default(false) }).strict(),
  "browser.search": z
    .object({
      sessionId: SessionId.optional(),
      query: Plain(100).optional(),
      category: z.string().trim().max(100).regex(/^[a-z0-9-]+$/).optional(),
      minPriceLkr: Lkr.optional(),
      maxPriceLkr: Lkr.optional(),
      inStockOnly: z.boolean().optional(),
      sort: z.enum(["newest", "price-asc", "price-desc", "name"]).optional(),
    })
    .strict(),
  "browser.scroll": z.object({ sessionId: SessionId, direction: z.enum(["up", "down"]) }).strict(),
  "browser.go_back": z.object({ sessionId: SessionId }).strict(),
  "browser.go_forward": z.object({ sessionId: SessionId }).strict(),
  "browser.take_screenshot": z.object({ sessionId: SessionId }).strict(),
  "browser.close_session": z.object({ sessionId: SessionId }).strict(),
} as const satisfies Record<BrowserToolName, z.ZodType>;

export type ToolArgs<T extends BrowserToolName> = z.infer<(typeof TOOL_ARGS)[T]>;

/** Which tools change nothing on the page (safe to repeat). Everything else must never be repeated blindly. */
export const IDEMPOTENT_TOOLS: ReadonlySet<BrowserToolName> = new Set(["browser.open_page", "browser.get_page_state", "browser.find_elements", "browser.search", "browser.scroll", "browser.go_back", "browser.go_forward", "browser.take_screenshot", "browser.close_session"]);

export type BrowserFailure =
  | "invalid_arguments"
  | "unknown_tool"
  | "blocked_url"
  | "blocked_redirect"
  | "blocked_resource"
  | "not_your_session"
  | "session_expired"
  | "too_many_sessions"
  | "step_limit"
  | "unknown_element"
  | "element_disabled"
  | "confirmation_required"
  | "confirmation_invalid"
  | "refused_financial"
  | "refused_sensitive_field"
  | "timeout"
  | "page_error"
  | "driver_error";

/** Failures that may succeed if the same read-only step is tried once more. */
export const TRANSIENT_FAILURES: ReadonlySet<BrowserFailure> = new Set(["timeout", "page_error"]);

export interface PageView {
  /** Always an allowed address (re-checked by the tool layer). Query strings are kept so the model can see filters it applied. */
  url: string;
  title: string;
  /** Sanitised, capped and fenced. Untrusted data. */
  text: string;
  untrusted: true;
  /** The text resembled an instruction aimed at the assistant. It is still only data; this is a signal for audit and for the model prompt. */
  injectionSuspected: boolean;
  elementCount: number;
  cartCount?: number;
  blockedRequests: number;
}

export interface ElementView {
  ref: string;
  role: string;
  name: string;
  enabled: boolean;
  actionClass: "read" | "reversible" | "sensitive" | "financial";
  needsConfirmation: boolean;
}

export interface ConfirmationProposal {
  actionHash: string;
  /** Plain description for the shopper's confirmation card, built from the element, never from page instructions. */
  description: string;
  actionClass: "reversible" | "sensitive";
}

export type BrowserToolResult =
  | {
      ok: true;
      tool: BrowserToolName;
      sessionId: string;
      /** True only when the tool layer compared the page before and after and saw the expected kind of change. Never assumed. */
      verified: boolean;
      page?: PageView;
      elements?: ElementView[];
      screenshotId?: string;
    }
  | {
      ok: false;
      tool: BrowserToolName | "unknown";
      reason: BrowserFailure;
      retryable: boolean;
      sessionId?: string;
      proposal?: ConfirmationProposal;
    };
