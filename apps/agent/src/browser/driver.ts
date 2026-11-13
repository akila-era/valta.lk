/**
 * The seam between the tool layer (policy, ownership, verification: everything in this package) and a real browser. A Playwright
 * driver (M3-E) implements this interface; M3-A ships only a mock for tests. The tool layer never trusts the driver for safety: it
 * re-checks every URL the driver reports, so a buggy or leaky driver cannot widen what the assistant can reach.
 *
 * A real driver must (and the mock demonstrates): use an anonymous, throw-away context per session; intercept EVERY request and
 * redirect with `checkSubresource`/`checkRedirect` from `security/url-policy`; resolve DNS itself and refuse non-public addresses;
 * block downloads, permission prompts, popups to other hosts, `file:` and `data:` documents; expose no cookie, storage or script API.
 */
export interface DriverElement {
  /** Valid only for the page snapshot it came from. */
  ref: string;
  role: string;
  name: string;
  enabled: boolean;
  visible: boolean;
  href?: string;
  /** For form fields. Never the value of password-type fields. */
  inputType?: string;
  value?: string;
}

export interface DriverPage {
  /** The address the browser is actually on now, after any redirects. */
  url: string;
  title: string;
  /** Visible text, uncleaned: the tool layer sanitises, fences and caps it. */
  text: string;
  elements: DriverElement[];
  /** False while the page is still loading. */
  ready: boolean;
  /** Number of items in the (anonymous, sandbox) cart, if the page exposes it. */
  cartCount?: number;
  /** Requests the driver's own interception refused while loading this page. */
  blockedRequests: number;
}

export type DriverErrorCode = "timeout" | "unknown_element" | "blocked_request" | "page_error" | "closed";

export class DriverError extends Error {
  readonly code: DriverErrorCode;
  constructor(code: DriverErrorCode, message = code) {
    super(message);
    this.name = "DriverError";
    this.code = code;
  }
}

export interface BrowserDriver {
  open(sessionId: string): Promise<void>;
  goto(sessionId: string, url: string): Promise<DriverPage>;
  snapshot(sessionId: string): Promise<DriverPage>;
  click(sessionId: string, ref: string): Promise<DriverPage>;
  type(sessionId: string, ref: string, text: string, submit: boolean): Promise<DriverPage>;
  scroll(sessionId: string, direction: "up" | "down"): Promise<DriverPage>;
  back(sessionId: string): Promise<DriverPage>;
  forward(sessionId: string): Promise<DriverPage>;
  screenshot(sessionId: string): Promise<{ id: string }>;
  /** Destroys the whole context: pages, cookies, storage, cache. Must be safe to call twice. */
  close(sessionId: string): Promise<void>;
}
