import { containsSensitive } from "../router/safety";
import { checkRedirect, checkUrl, type UrlPolicy } from "../security/url-policy";
import { ConfirmationStore } from "./confirmations";
import { DriverError, type BrowserDriver, type DriverElement, type DriverPage } from "./driver";
import { MODEL_TEXT_CHARS, actionHash, buildSearchPath, classifyElement, fieldRefusal, looksLikeInjection, sanitizeText, wrapUntrusted } from "./policy";
import { SessionError, cleanAudit, sessionRef, type AuditSink, type BrowserSessionManager, type SessionOwner } from "./sessions";
import { BROWSER_TOOL_NAMES, TOOL_ARGS, TRANSIENT_FAILURES, type BrowserFailure, type BrowserToolName, type BrowserToolResult, type ElementView, type PageView, type ToolArgs } from "./tools";

/**
 * The browser tool layer. Every call goes through the same steps, in this order, and a failure at any step stops the call:
 *   1 validate the tool name and arguments (strict)   2 check session ownership, expiry and step budget
 *   3 validate the target (URL policy) and the element (policy, confirmation)   4 execute through the driver
 *   5 re-check where the browser ended up, and verify the effect by comparing the page before and after   6 return structured output
 * The service holds no cookies, tokens or credentials, and the driver interface has no way to give it any.
 */
export interface BrowserServiceDeps {
  driver: BrowserDriver;
  sessions: BrowserSessionManager;
  confirmations: ConfirmationStore;
  policy: UrlPolicy;
  now?: () => number;
  audit?: AuditSink;
}

const SEARCH_ROLES = new Set(["textbox", "searchbox", "combobox"]);

function fail(tool: BrowserToolName | "unknown", reason: BrowserFailure, extra: { sessionId?: string; proposal?: Extract<BrowserToolResult, { ok: false }>["proposal"] } = {}): BrowserToolResult {
  return { ok: false, tool, reason, retryable: TRANSIENT_FAILURES.has(reason), ...(extra.sessionId ? { sessionId: extra.sessionId } : {}), ...(extra.proposal ? { proposal: extra.proposal } : {}) };
}

/** A page "changed" when its address, text, element list or cart count differs. Used to verify clicks and scrolls instead of assuming. */
export function pageChanged(a: DriverPage, b: DriverPage): boolean {
  return a.url !== b.url || a.text !== b.text || a.elements.length !== b.elements.length || a.cartCount !== b.cartCount || a.title !== b.title || a.scrollY !== b.scrollY;
}

export class BrowserToolService {
  private readonly pages = new Map<string, DriverPage>();
  private readonly now: () => number;
  private readonly audit: AuditSink;

  constructor(private readonly deps: BrowserServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.audit = deps.audit ?? (() => {});
  }

  /** The latest verified snapshot of a session, for the action loop's expectations. Not exposed to models. */
  lastPage(sessionId: string): DriverPage | undefined {
    return this.pages.get(sessionId);
  }

  async call(owner: SessionOwner, tool: string, rawArgs: unknown): Promise<BrowserToolResult> {
    const t0 = this.now();
    let result: BrowserToolResult;
    if (!Object.hasOwn(TOOL_ARGS, tool)) {
      result = fail("unknown", "unknown_tool");
    } else {
      const name = tool as BrowserToolName;
      const parsed = TOOL_ARGS[name].safeParse(rawArgs);
      if (!parsed.success) result = fail(name, "invalid_arguments");
      else {
        try {
          result = await this.dispatch(owner, name, parsed.data);
        } catch (e) {
          result = this.mapError(name, e);
        }
      }
    }
    this.audit(cleanAudit({ at: this.now(), type: "tool_call", tool, outcome: result.ok ? "ok" : "failed", ...(result.ok ? {} : { code: result.reason }), ms: this.now() - t0, ...(result.sessionId ? { sessionRef: sessionRef(result.sessionId) } : {}) }));
    return result;
  }

  private mapError(tool: BrowserToolName, e: unknown): BrowserToolResult {
    if (e instanceof SessionError) return fail(tool, e.code);
    if (e instanceof DriverError) {
      const map: Record<DriverError["code"], BrowserFailure> = { timeout: "timeout", unknown_element: "unknown_element", blocked_request: "blocked_resource", page_error: "page_error", closed: "session_expired" };
      return fail(tool, map[e.code]);
    }
    return fail(tool, "driver_error");
  }

  private block(tool: BrowserToolName, reason: BrowserFailure, code: string, host?: string): BrowserToolResult {
    this.audit(cleanAudit({ at: this.now(), type: "policy_block", tool, code, ...(host ? { host: host.slice(0, 100) } : {}) }));
    return fail(tool, reason);
  }

  private resolveTarget(target: string): string | null {
    const host = this.deps.policy.hosts[0];
    if (target.startsWith("/") && !target.startsWith("//") && !target.includes("\\")) return host ? `https://${host}${target}` : null;
    return target;
  }

  /** Re-checks where the browser really is, then builds the model-safe view. Off-site means the session is destroyed at once. */
  private async view(tool: BrowserToolName, sessionId: string, page: DriverPage, before?: DriverPage): Promise<{ page: DriverPage; view: PageView; verified: boolean } | BrowserToolResult> {
    const where = checkUrl(page.url, this.deps.policy);
    if (!where.ok) {
      await this.deps.sessions.close(sessionId);
      this.pages.delete(sessionId);
      let host = "";
      try {
        host = new URL(page.url).hostname;
      } catch {
        /* unparseable: leave empty */
      }
      return this.block(tool, "blocked_redirect", `landed_${where.reason}`, host);
    }
    this.pages.set(sessionId, page);
    const text = sanitizeText(page.text, MODEL_TEXT_CHARS);
    const view: PageView = {
      url: page.url,
      title: sanitizeText(page.title, 120),
      text: wrapUntrusted(text),
      untrusted: true,
      // Text the driver left out because a shopper cannot see it is never shown to the model, but if it reads like an instruction it raises the flag.
      injectionSuspected: looksLikeInjection(text) || (page.hiddenTextSample ? looksLikeInjection(sanitizeText(page.hiddenTextSample, 500)) : false),
      elementCount: page.elements.length,
      ...(page.cartCount !== undefined ? { cartCount: page.cartCount } : {}),
      blockedRequests: page.blockedRequests,
    };
    return { page, view, verified: before ? pageChanged(before, page) : page.ready };
  }

  private toElementView(el: DriverElement): ElementView {
    const c = classifyElement(el);
    return { ref: el.ref, role: el.role, name: sanitizeText(el.name, 120), enabled: el.enabled, actionClass: c.actionClass, needsConfirmation: c.needsConfirmation };
  }

  private async openAt(owner: SessionOwner, tool: "browser.open_page" | "browser.search", sessionId: string | undefined, url: string): Promise<BrowserToolResult> {
    const checked = checkUrl(url, this.deps.policy);
    if (!checked.ok) {
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch {
        /* not a URL */
      }
      return this.block(tool, "blocked_url", checked.reason, host);
    }
    const s = sessionId ? await this.deps.sessions.use(sessionId, owner) : await this.deps.sessions.create(owner);
    if (!sessionId) await this.deps.sessions.use(s.id, owner);
    const before = this.pages.get(s.id);
    let page: DriverPage;
    try {
      page = await this.deps.driver.goto(s.id, checked.url.toString());
    } catch (e) {
      if (!sessionId) await this.deps.sessions.close(s.id); // a session that never opened a page is not kept
      throw e;
    }
    const r = await this.view(tool, s.id, page, before);
    if ("ok" in r) return r;
    return { ok: true, tool, sessionId: s.id, verified: r.page.ready, page: r.view };
  }

  private async dispatch<T extends BrowserToolName>(owner: SessionOwner, tool: T, args: ToolArgs<T>): Promise<BrowserToolResult> {
    const a = args as never as Record<string, unknown>;
    switch (tool) {
      case "browser.open_page": {
        const x = a as ToolArgs<"browser.open_page">;
        const url = this.resolveTarget(x.target);
        if (url === null) return this.block(tool, "blocked_url", "no_base_host");
        return this.openAt(owner, tool, x.sessionId, url);
      }
      case "browser.search": {
        const x = a as ToolArgs<"browser.search">;
        const path = buildSearchPath(x);
        const url = this.resolveTarget(path);
        if (url === null) return this.block(tool, "blocked_url", "no_base_host");
        return this.openAt(owner, tool, x.sessionId, url);
      }
      case "browser.get_page_state": {
        const x = a as ToolArgs<"browser.get_page_state">;
        const s = await this.deps.sessions.use(x.sessionId, owner);
        const page = await this.deps.driver.snapshot(s.id);
        const r = await this.view(tool, s.id, page);
        return "ok" in r ? r : { ok: true, tool, sessionId: s.id, verified: r.page.ready, page: r.view };
      }
      case "browser.find_elements": {
        const x = a as ToolArgs<"browser.find_elements">;
        const s = await this.deps.sessions.use(x.sessionId, owner);
        const page = await this.deps.driver.snapshot(s.id);
        const r = await this.view(tool, s.id, page);
        if ("ok" in r) return r;
        const needle = x.nameContains?.toLowerCase();
        const found = page.elements
          .filter((e) => e.visible && (!x.role || e.role === x.role) && (!needle || e.name.toLowerCase().includes(needle)))
          .slice(0, x.limit)
          .map((e) => this.toElementView(e));
        return { ok: true, tool, sessionId: s.id, verified: true, elements: found };
      }
      case "browser.click":
        return this.click(owner, a as ToolArgs<"browser.click">);
      case "browser.type_text":
        return this.typeText(owner, a as ToolArgs<"browser.type_text">);
      case "browser.select":
        return this.selectOption(owner, a as ToolArgs<"browser.select">);
      case "browser.scroll":
      case "browser.go_back":
      case "browser.go_forward": {
        const x = a as { sessionId: string; direction?: "up" | "down" };
        const s = await this.deps.sessions.use(x.sessionId, owner);
        const before = this.pages.get(s.id);
        const page = tool === "browser.scroll" ? await this.deps.driver.scroll(s.id, x.direction!) : tool === "browser.go_back" ? await this.deps.driver.back(s.id) : await this.deps.driver.forward(s.id);
        const r = await this.view(tool, s.id, page, before);
        return "ok" in r ? r : { ok: true, tool, sessionId: s.id, verified: r.verified, page: r.view };
      }
      case "browser.take_screenshot": {
        const x = a as ToolArgs<"browser.take_screenshot">;
        const s = await this.deps.sessions.use(x.sessionId, owner);
        const shot = await this.deps.driver.screenshot(s.id);
        return { ok: true, tool, sessionId: s.id, verified: true, screenshotId: shot.id };
      }
      case "browser.close_session": {
        const x = a as ToolArgs<"browser.close_session">;
        const s = await this.deps.sessions.use(x.sessionId, owner); // ownership first: you cannot close a session that is not yours
        await this.deps.sessions.close(s.id);
        this.pages.delete(s.id);
        return { ok: true, tool, sessionId: s.id, verified: !this.deps.sessions.has(s.id) };
      }
      default:
        return fail("unknown", "unknown_tool");
    }
  }

  private async click(owner: SessionOwner, x: ToolArgs<"browser.click">): Promise<BrowserToolResult> {
    const tool = "browser.click" as const;
    const s = await this.deps.sessions.use(x.sessionId, owner);
    const before = this.pages.get(s.id);
    const el = before?.elements.find((e) => e.ref === x.ref);
    if (!before || !el) return fail(tool, "unknown_element", { sessionId: s.id });
    if (!el.enabled || !el.visible) return fail(tool, "element_disabled", { sessionId: s.id });

    // A link may not be clicked at all if it leads off-site or to a blocked path: the click never happens.
    if (el.href !== undefined) {
      const dest = checkRedirect(before.url, el.href, this.deps.policy);
      if (!dest.ok) {
        let host = "";
        try {
          host = new URL(el.href, before.url).hostname;
        } catch {
          /* ignore */
        }
        return this.block(tool, "blocked_url", `link_${dest.reason}`, host);
      }
    }

    const cls = classifyElement(el);
    if (cls.actionClass === "financial") return this.block(tool, "refused_financial", "financial");
    const hash = actionHash(tool, el, new URL(before.url).pathname);
    if (cls.needsConfirmation) {
      if (!x.confirmation) {
        return fail(tool, "confirmation_required", { sessionId: s.id, proposal: { actionHash: hash, description: `${cls.why === "cart_change" ? "Change your cart" : "Perform this action"}: "${sanitizeText(el.name, 80)}"`, actionClass: cls.actionClass as "reversible" | "sensitive" } });
      }
      if (this.deps.confirmations.consume(x.confirmation, s.id, hash) !== "ok") return this.block(tool, "confirmation_invalid", "confirmation_invalid");
      this.audit(cleanAudit({ at: this.now(), type: "confirmation_used", sessionRef: sessionRef(s.id), tool }));
    }
    const page = await this.deps.driver.click(s.id, x.ref);
    const r = await this.view(tool, s.id, page, before);
    return "ok" in r ? r : { ok: true, tool, sessionId: s.id, verified: r.verified, page: r.view };
  }

  /** Chooses an option of a real dropdown. Same refusals as typing (secret, personal and discount fields) and the same confirmation rules as a click. */
  private async selectOption(owner: SessionOwner, x: ToolArgs<"browser.select">): Promise<BrowserToolResult> {
    const tool = "browser.select" as const;
    const s = await this.deps.sessions.use(x.sessionId, owner);
    const before = this.pages.get(s.id);
    const el = before?.elements.find((e) => e.ref === x.ref);
    if (!before || !el) return fail(tool, "unknown_element", { sessionId: s.id });
    if (el.tag !== "select") return fail(tool, "unknown_element", { sessionId: s.id });
    if (!el.enabled || !el.visible) return fail(tool, "element_disabled", { sessionId: s.id });
    if (fieldRefusal(el) !== null || containsSensitive(x.option)) return this.block(tool, "refused_sensitive_field", "sensitive_field");
    const cls = classifyElement(el);
    if (cls.actionClass === "financial") return this.block(tool, "refused_financial", "financial");
    // The confirmation is bound to the dropdown AND the chosen option: confirming one choice never allows another.
    const hash = actionHash(tool, el, new URL(before.url).pathname, x.option);
    if (cls.needsConfirmation) {
      if (!x.confirmation) {
        return fail(tool, "confirmation_required", { sessionId: s.id, proposal: { actionHash: hash, description: `Set "${sanitizeText(el.name, 60)}" to "${sanitizeText(x.option, 60)}"`, actionClass: cls.actionClass as "reversible" | "sensitive" } });
      }
      if (this.deps.confirmations.consume(x.confirmation, s.id, hash) !== "ok") return this.block(tool, "confirmation_invalid", "confirmation_invalid");
      this.audit(cleanAudit({ at: this.now(), type: "confirmation_used", sessionRef: sessionRef(s.id), tool }));
    }
    const page = await this.deps.driver.select(s.id, x.ref, x.option);
    const r = await this.view(tool, s.id, page, before);
    if ("ok" in r) return r;
    // Verified only when the live page now shows that option as the dropdown's value.
    const after = r.page.elements.find((e) => e.tag === "select" && e.name === el.name);
    const chosenOk = after?.value?.trim().toLowerCase() === x.option.trim().toLowerCase();
    return { ok: true, tool, sessionId: s.id, verified: chosenOk, page: r.view };
  }

  private async typeText(owner: SessionOwner, x: ToolArgs<"browser.type_text">): Promise<BrowserToolResult> {
    const tool = "browser.type_text" as const;
    const s = await this.deps.sessions.use(x.sessionId, owner);
    const before = this.pages.get(s.id);
    const el = before?.elements.find((e) => e.ref === x.ref);
    if (!before || !el) return fail(tool, "unknown_element", { sessionId: s.id });
    if (!el.enabled || !el.visible || !SEARCH_ROLES.has(el.role)) return fail(tool, "element_disabled", { sessionId: s.id });
    if (fieldRefusal(el) !== null || containsSensitive(x.text)) return this.block(tool, "refused_sensitive_field", "sensitive_field");
    const isSearch = el.role === "searchbox" || /search/i.test(el.name);
    if (x.submit && !isSearch) return fail(tool, "invalid_arguments", { sessionId: s.id }); // only a search box may be submitted by typing
    const page = await this.deps.driver.type(s.id, x.ref, x.text, x.submit);
    const r = await this.view(tool, s.id, page, before);
    if ("ok" in r) return r;
    const after = r.page.elements.find((e) => e.ref === x.ref) ?? r.page.elements.find((e) => e.name === el.name);
    const typedOk = x.submit ? r.verified : after?.value === x.text;
    return { ok: true, tool, sessionId: s.id, verified: typedOk, page: r.view };
  }
}
