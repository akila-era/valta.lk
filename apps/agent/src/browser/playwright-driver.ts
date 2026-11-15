import { randomBytes } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright-core";
import { checkSubresource, createPolicy, productionPolicy, type Resolver, type UrlPolicy } from "../security/url-policy";
import { DriverError, type BrowserDriver, type DriverElement, type DriverErrorCode, type DriverPage } from "./driver";
import { EgressProxy, type EgressStats, type EgressTestOnly } from "./egress-proxy";
import { GUARD_SOURCE, GUARD_WORLD } from "./page-script";

/**
 * The REAL browser behind the BrowserDriver seam: headless Chromium through Playwright, one isolated BrowserContext per session.
 *
 * Disabled unless the caller passes `enabled: true`; nothing starts at import time; the browser starts on the first `open`.
 * Safety does not rest on this class alone (the tool layer re-checks every address) and does not rest on page-level interception alone:
 *   1. Chromium can only reach the network through the egress proxy (egress-proxy.ts): allowlisted https hosts, own DNS, pinned addresses,
 *      no private/metadata/loopback targets. Chromium is also told to resolve nothing itself.
 *   2. Every request, redirect and sub-resource inside a page goes through `checkSubresource` and is aborted when refused (counted).
 *   3. Downloads, permission prompts, popups, dialogs, service workers, WebSockets and file:/data: documents are refused.
 *   4. Page state is read through an ISOLATED JavaScript world (page-script.ts), so a hostile page cannot forge the snapshot by patching
 *      built-ins. The model never supplies script. Cookies, storage and script have no accessor in this class.
 *   5. Every action re-reads the page; the result is the real state. Elements are NOT addressed by a page attribute: the isolated world keeps
 *      the element objects and a fingerprint per reference, the check and a click guard run there before any page handler, so a page that
 *      swaps, re-labels or covers an element after the snapshot (even during the click) never receives the action.
 *   6. Visible text only: text a shopper cannot see (transparent, off-screen, zero-size, clipped, same colour as its background) is left out
 *      of the snapshot and only counted. This is a mitigation, not proof (low-contrast and partly clipped text is still included).
 * What this class does NOT provide is operating-system isolation (separate user, network namespace, firewall): that is infrastructure.
 */
export interface PlaywrightDriverOptions {
  /** Must be true. There is no default: the real browser is never enabled by accident. */
  enabled: boolean;
  resolver?: Resolver;
  /** Hard cap on live sessions (contexts). */
  maxSessions?: number;
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
  /** A session older than this is destroyed whatever it is doing. */
  maxSessionLifetimeMs?: number;
  /** The browser process is closed this long after the last session closes, to give the memory back. 0 = keep. */
  idleBrowserCloseMs?: number;
  maxTextChars?: number;
  maxElements?: number;
  /** Screenshot store limits. */
  screenshots?: { maxBytes?: number; maxCount?: number; maxTotalBytes?: number; ttlMs?: number };
  /** Optional path of the Chromium executable (otherwise the Playwright-installed one). */
  executablePath?: string;
  /** Keep Chromium's own sandbox on. Turn it off only inside a container that provides equivalent isolation. */
  chromiumSandbox?: boolean;
  pinTtlMs?: number;
}

/** Test fixtures only. The public factory has no parameter for this and ignores it if smuggled in. */
export interface PlaywrightTestOnly {
  hosts: readonly string[];
  fixturePort: number;
  treatAsPublic: readonly string[];
}

interface ElementRecord {
  role: string;
  name: string;
  href?: string;
  inputType?: string;
}

interface Session {
  id: string;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  /** Execution context of the guard world per frame, from Runtime events. The main frame's one is used. */
  worlds: Map<string, number>;
  mainFrameId: string;
  records: Map<string, ElementRecord>;
  blocked: number;
  closed: boolean;
  createdAt: number;
  lifetimeTimer: NodeJS.Timeout;
  queue: Promise<unknown>;
}

interface ShotEntry {
  bytes: Buffer;
  sessionId: string;
  expiresAt: number;
}

/** DriverError's second constructor argument is typed as a code, so a free-text detail is set on the message afterwards. */
function derr(code: DriverErrorCode, detail: string): DriverError {
  const e = new DriverError(code);
  e.message = detail;
  return e;
}

const DEFAULTS = {
  maxSessions: 3,
  navigationTimeoutMs: 15_000,
  actionTimeoutMs: 5_000,
  maxSessionLifetimeMs: 5 * 60_000,
  idleBrowserCloseMs: 60_000,
  maxTextChars: 20_000,
  maxElements: 300,
};

export class PlaywrightDriver implements BrowserDriver {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private proxy: EgressProxy | null = null;
  private readonly sessions = new Map<string, Session>();
  /** Session ids whose open() is in progress. The cap and duplicate checks count them, so a burst of simultaneous opens cannot exceed the cap. */
  private readonly opening = new Set<string>();
  private readonly shots = new Map<string, ShotEntry>();
  private idleTimer: NodeJS.Timeout | null = null;
  private readonly cfg: typeof DEFAULTS;
  private readonly shotCfg: Required<NonNullable<PlaywrightDriverOptions["screenshots"]>>;

  constructor(
    private readonly opts: PlaywrightDriverOptions,
    private readonly policy: UrlPolicy,
    private readonly rewriteForPolicy: (url: string) => string = (u) => u,
    private readonly testOnly?: EgressTestOnly,
  ) {
    if (opts.enabled !== true) throw new Error("The real browser driver is disabled: pass enabled: true explicitly.");
    this.cfg = { ...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([k, v]) => k in DEFAULTS && typeof v === "number")) } as typeof DEFAULTS;
    this.shotCfg = { maxBytes: 2_000_000, maxCount: 20, maxTotalBytes: 12_000_000, ttlMs: 5 * 60_000, ...(opts.screenshots ?? {}) };
  }

  // ---- lifecycle

  private async ensureBrowser(): Promise<Browser> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      this.proxy ??= new EgressProxy({ policy: this.policy, ...(this.opts.resolver ? { resolver: this.opts.resolver } : {}), ...(this.opts.pinTtlMs ? { pinTtlMs: this.opts.pinTtlMs } : {}), ...(this.testOnly ? { testOnly: this.testOnly } : {}) });
      await this.proxy.start();
      const browser = await chromium.launch({
        headless: true,
        ...(this.opts.executablePath ? { executablePath: this.opts.executablePath } : {}),
        chromiumSandbox: this.opts.chromiumSandbox ?? true,
        proxy: { server: `http://127.0.0.1:${this.proxy.port}`, bypass: "<-loopback>", username: "volta", password: this.proxy.credential },
        timeout: 20_000,
        args: [
          // The browser resolves no names itself; the only address it may open directly is the loopback proxy.
          "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-sync",
          "--no-pings",
          "--disable-extensions",
          "--disable-features=Translate,MediaRouter,OptimizationHints,WebRtcHideLocalIpsWithMdns",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--js-flags=--max-old-space-size=256",
          ...(process.platform === "linux" ? ["--disable-dev-shm-usage"] : []),
        ],
      });
      browser.on("disconnected", () => {
        // A crash or kill: every session is gone. Later calls fail cleanly with "closed" and a new open() relaunches.
        if (this.browser === browser) this.browser = null;
        for (const s of [...this.sessions.values()]) this.markClosed(s);
      });
      this.browser = browser;
      return browser;
    })();
    try {
      return await this.launching;
    } catch (e) {
      await this.proxy?.stop().catch(() => {});
      this.proxy = null;
      throw derr("page_error", "browser_launch_failed");
    } finally {
      this.launching = null;
    }
  }

  private markClosed(s: Session): void {
    if (s.closed) return;
    s.closed = true;
    clearTimeout(s.lifetimeTimer);
    this.sessions.delete(s.id);
    for (const [id, e] of this.shots) if (e.sessionId === s.id) this.shots.delete(id);
  }

  private scheduleIdleClose(): void {
    const ms = this.cfg.idleBrowserCloseMs;
    if (ms <= 0 || this.sessions.size > 0 || !this.browser) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.sessions.size === 0) void this.shutdownBrowser();
    }, ms);
    this.idleTimer.unref();
  }

  private async shutdownBrowser(): Promise<void> {
    const b = this.browser;
    this.browser = null;
    if (b) await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 5_000))]);
    await this.proxy?.stop().catch(() => {});
    this.proxy = null;
  }

  /** Close everything: sessions, browser, proxy. Safe to call twice. */
  async shutdown(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    for (const s of [...this.sessions.values()]) this.markClosed(s);
    await this.shutdownBrowser();
    this.shots.clear();
  }

  // ---- diagnostics (never exposed to the model)

  liveSessionCount(): number {
    return this.sessions.size;
  }

  egressStats(): EgressStats | null {
    return this.proxy?.snapshotStats() ?? null;
  }

  /** The browser process id, read through the browser's own process list. Used by tests and by resource measurement. */
  async browserPid(): Promise<number | null> {
    if (!this.browser) return null;
    const cdp = await this.browser.newBrowserCDPSession();
    try {
      const info = (await cdp.send("SystemInfo.getProcessInfo")) as { processInfo: { type: string; id: number }[] };
      return info.processInfo.find((p) => p.type === "browser")?.id ?? null;
    } finally {
      await cdp.detach().catch(() => {});
    }
  }

  // ---- helpers

  private guard(url: string, type: string): boolean {
    return checkSubresource(this.rewriteForPolicy(url), type, this.policy).ok;
  }

  private get(sessionId: string): Session {
    const s = this.sessions.get(sessionId);
    if (!s || s.closed) throw new DriverError("closed");
    return s;
  }

  /** Operations on one session run one at a time, and none can hang: each has a hard deadline. */
  private async run<T>(s: Session, ms: number, fn: () => Promise<T>): Promise<T> {
    const prev = s.queue;
    let release!: () => void;
    s.queue = new Promise<void>((r) => (release = r));
    await prev.catch(() => {});
    try {
      if (s.closed) throw new DriverError("closed");
      let timer: NodeJS.Timeout;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DriverError("timeout")), ms);
      });
      try {
        return await Promise.race([fn(), deadline]);
      } finally {
        clearTimeout(timer!);
      }
    } catch (e) {
      throw this.classify(s, e);
    } finally {
      release();
    }
  }

  private classify(s: Session, e: unknown): DriverError {
    if (e instanceof DriverError) {
      if (e.code === "timeout") void this.destroy(s.id, true); // a stuck page is not kept: its whole context goes
      return e;
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (s.closed || /Target (page, context or browser )?has been closed|browser has been closed|Browser closed|Target closed|Session closed/i.test(msg)) return new DriverError("closed");
    if (/Timeout \d+ms exceeded/i.test(msg)) {
      void this.destroy(s.id, true);
      return new DriverError("timeout");
    }
    if (s.blocked > 0 && /ERR_(BLOCKED_BY_CLIENT|FAILED|TUNNEL_CONNECTION_FAILED|PROXY_CONNECTION_FAILED|NAME_NOT_RESOLVED|ABORTED|CONNECTION_REFUSED)/i.test(msg)) return new DriverError("blocked_request");
    if (/ERR_(TUNNEL_CONNECTION_FAILED|BLOCKED_BY_CLIENT|PROXY_CONNECTION_FAILED)/i.test(msg)) return new DriverError("blocked_request");
    if (/crash/i.test(msg)) {
      void this.destroy(s.id, true);
      return new DriverError("closed");
    }
    return new DriverError("page_error");
  }

  private async destroy(sessionId: string, force: boolean): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.markClosed(s);
    const closing = s.context.close().catch(() => {});
    await Promise.race([closing, new Promise((r) => setTimeout(r, 3_000))]);
    if (force) {
      // A page that will not let go (a hung renderer) must not hold memory or hide a leak: if the context is still there, restart the browser.
      const stillThere = this.browser?.contexts().includes(s.context);
      if (stillThere && this.browser) {
        const b = this.browser;
        this.browser = null;
        for (const other of [...this.sessions.values()]) this.markClosed(other);
        await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 3_000))]);
        await this.proxy?.stop().catch(() => {});
        this.proxy = null;
      }
    }
    this.scheduleIdleClose();
  }

  // ---- BrowserDriver

  async open(sessionId: string): Promise<void> {
    // Reserve the slot synchronously, before the first await: the checks and the reservation cannot be interleaved with another open().
    if (this.sessions.has(sessionId) || this.opening.has(sessionId)) throw derr("page_error", "session_exists");
    if (this.sessions.size + this.opening.size >= (this.opts.maxSessions ?? DEFAULTS.maxSessions)) throw derr("page_error", "session_limit");
    this.opening.add(sessionId);
    try {
      await this.openReserved(sessionId);
    } finally {
      this.opening.delete(sessionId);
    }
  }

  private async openReserved(sessionId: string): Promise<void> {
    const browser = await this.ensureBrowser();
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
      permissions: [],
      ignoreHTTPSErrors: false,
      bypassCSP: false,
      javaScriptEnabled: true,
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
      colorScheme: "light",
    });
    context.setDefaultTimeout(this.cfg.actionTimeoutMs);
    context.setDefaultNavigationTimeout(this.cfg.navigationTimeoutMs);
    let page: Page;
    let cdp: CDPSession;
    const worlds = new Map<string, number>();
    let mainFrameId = "";
    try {
      page = await context.newPage();
      cdp = await context.newCDPSession(page);
      await cdp.send("Page.enable");
      // Follow the guard world's execution contexts (one per frame and document) so the driver can address the one of the main frame.
      cdp.on("Runtime.executionContextCreated", (e: { context: { id: number; name?: string; auxData?: { frameId?: string; type?: string } } }) => {
        const c = e.context;
        if (c.name === GUARD_WORLD && c.auxData?.type === "isolated" && c.auxData.frameId) worlds.set(c.auxData.frameId, c.id);
      });
      cdp.on("Runtime.executionContextDestroyed", (e: { executionContextId: number }) => {
        for (const [f, id] of worlds) if (id === e.executionContextId) worlds.delete(f);
      });
      cdp.on("Runtime.executionContextsCleared", () => worlds.clear());
      cdp.on("Page.frameNavigated", (e: { frame: { id: string; parentId?: string } }) => {
        if (!e.frame.parentId) mainFrameId = e.frame.id;
      });
      await cdp.send("Runtime.enable");
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: GUARD_SOURCE, worldName: GUARD_WORLD });
      const tree = (await cdp.send("Page.getFrameTree")) as { frameTree: { frame: { id: string } } };
      mainFrameId = tree.frameTree.frame.id;
    } catch {
      await context.close().catch(() => {});
      throw derr("page_error", "context_failed");
    }
    const s: Session = {
      id: sessionId,
      context,
      page,
      cdp,
      worlds,
      get mainFrameId() {
        return mainFrameId;
      },
      records: new Map(),
      blocked: 0,
      closed: false,
      createdAt: Date.now(),
      lifetimeTimer: setTimeout(() => void this.destroy(sessionId, true), this.cfg.maxSessionLifetimeMs),
      queue: Promise.resolve(),
    };
    s.lifetimeTimer.unref();
    this.sessions.set(sessionId, s);

    // Every request and every redirect hop: refuse anything the policy refuses.
    await context.route("**/*", async (route) => {
      const req = route.request();
      if (this.guard(req.url(), req.resourceType())) {
        await route.continue().catch(() => {});
      } else {
        s.blocked++;
        await route.abort("blockedbyclient").catch(() => {});
      }
    });
    await context.routeWebSocket(/.*/, (ws) => {
      s.blocked++;
      void ws.close({ code: 1008, reason: "blocked" });
    });
    page.on("requestfailed", (r) => {
      if (/TUNNEL_CONNECTION_FAILED|PROXY_CONNECTION_FAILED/.test(r.failure()?.errorText ?? "")) s.blocked++;
    });
    context.on("page", (p) => {
      if (p !== s.page) {
        s.blocked++;
        void p.close().catch(() => {});
      }
    });
    page.on("dialog", (d) => void d.dismiss().catch(() => {}));
    page.on("download", (d) => void d.cancel().catch(() => {}));
    page.on("crash", () => void this.destroy(sessionId, true));
  }

  /** The execution context of the guard world in the main frame. If the page's document has none yet (a race), it is created and the guard installed late. */
  private async world(s: Session): Promise<number> {
    const known = s.worlds.get(s.mainFrameId);
    if (known !== undefined) return known;
    const tree = (await s.cdp.send("Page.getFrameTree")) as { frameTree: { frame: { id: string } } };
    const frameId = tree.frameTree.frame.id;
    const again = s.worlds.get(frameId);
    if (again !== undefined) return again;
    const made = (await s.cdp.send("Page.createIsolatedWorld", { frameId, worldName: GUARD_WORLD })) as { executionContextId: number };
    s.worlds.set(frameId, made.executionContextId);
    await s.cdp.send("Runtime.evaluate", { contextId: made.executionContextId, expression: GUARD_SOURCE, returnByValue: true });
    return made.executionContextId;
  }

  /** Calls a function of the guard world and parses its JSON answer. A context that no longer exists (the page navigated) gives null. */
  private async callWorld<T>(s: Session, expression: string): Promise<T | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const contextId = await this.world(s);
      try {
        const res = (await s.cdp.send("Runtime.evaluate", { contextId, expression, returnByValue: true })) as { result?: { value?: unknown }; exceptionDetails?: unknown };
        if (res.exceptionDetails) {
          // The world exists but the guard is missing (a late context): install it once and retry.
          await s.cdp.send("Runtime.evaluate", { contextId, expression: GUARD_SOURCE, returnByValue: true });
          continue;
        }
        return typeof res.result?.value === "string" ? (JSON.parse(res.result.value) as T) : null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/Cannot find context|context with specified id|Execution context was destroyed|Inspected target navigated/i.test(msg)) {
          for (const [f, id] of s.worlds) if (id === contextId) s.worlds.delete(f);
          if (attempt === 0) continue;
          return null;
        }
        throw e;
      }
    }
    return null;
  }

  private async read(s: Session): Promise<DriverPage> {
    const url = s.page.url();
    if (!this.guard(url, "document")) {
      // The browser is somewhere it must not be (or on an error page). Independent of the tool layer, the session is destroyed.
      await this.destroy(s.id, false);
      throw new DriverError("blocked_request");
    }
    const data = await this.callWorld<{ title: string; text: string; hiddenDropped: number; hiddenSample: string; ready: boolean; cartCount: number | null; scrollY: number; elements: (DriverElement & { tag?: string })[] }>(
      s,
      `__volta.collect(${this.cfg.maxTextChars}, ${this.opts.maxElements ?? this.cfg.maxElements})`,
    );
    if (!data || typeof data.text !== "string") throw derr("page_error", "read_failed");
    s.records.clear();
    const elements: DriverElement[] = [];
    for (const e of data.elements) {
      if (typeof e.ref !== "string" || typeof e.role !== "string" || typeof e.name !== "string") continue;
      const el: DriverElement = { ref: e.ref, role: e.role, name: e.name, enabled: e.enabled === true, visible: e.visible === true, ...(typeof e.tag === "string" ? { tag: e.tag } : {}), ...(typeof e.href === "string" ? { href: e.href } : {}), ...(typeof e.inputType === "string" ? { inputType: e.inputType } : {}), ...(typeof e.value === "string" && e.inputType !== "password" ? { value: e.value } : {}) };
      s.records.set(el.ref, { role: el.role, name: el.name, ...(el.href !== undefined ? { href: el.href } : {}), ...(el.inputType !== undefined ? { inputType: el.inputType } : {}) });
      elements.push(el);
    }
    // Final address again, after the read: the page may have navigated while we looked.
    const finalUrl = s.page.url();
    if (!this.guard(finalUrl, "document")) {
      await this.destroy(s.id, false);
      throw new DriverError("blocked_request");
    }
    return {
      url: finalUrl,
      title: data.title,
      text: data.text,
      elements,
      ready: data.ready,
      ...(data.cartCount !== null ? { cartCount: data.cartCount } : {}),
      ...(typeof data.scrollY === "number" ? { scrollY: data.scrollY } : {}),
      ...(data.hiddenDropped > 0 ? { hiddenTextDropped: data.hiddenDropped, hiddenTextSample: String(data.hiddenSample ?? "").slice(0, 500) } : {}),
      blockedRequests: s.blocked,
    };
  }

  private async settle(s: Session): Promise<void> {
    await s.page.waitForLoadState("load", { timeout: Math.min(this.cfg.navigationTimeoutMs, 5_000) }).catch(() => {});
    await s.page.waitForLoadState("networkidle", { timeout: 800 }).catch(() => {});
  }

  async goto(sessionId: string, url: string): Promise<DriverPage> {
    const s = this.get(sessionId);
    // The browser is never even asked to go to an address the policy refuses.
    if (!this.guard(url, "document")) throw derr("blocked_request", "url_refused");
    return this.run(s, this.cfg.navigationTimeoutMs + 3_000, async () => {
      try {
        await s.page.goto(url, { waitUntil: "load", timeout: this.cfg.navigationTimeoutMs });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (/ERR_ABORTED/.test(msg) && s.blocked > 0) throw new DriverError("blocked_request");
        throw e;
      }
      await this.settle(s);
      return this.read(s);
    });
  }

  async snapshot(sessionId: string): Promise<DriverPage> {
    const s = this.get(sessionId);
    return this.run(s, this.cfg.actionTimeoutMs + 3_000, () => this.read(s));
  }

  /** Why an in-page check refused, as a driver error. The page-script reasons are internal; the model only ever sees "unknown_element". */
  private refusal(why: string | undefined): DriverError {
    return derr("unknown_element", why ?? "unknown");
  }

  async click(sessionId: string, ref: string): Promise<DriverPage> {
    const s = this.get(sessionId);
    return this.run(s, this.cfg.navigationTimeoutMs + 3_000, async () => {
      if (!/^e[0-9]{1,6}-[0-9]{1,5}$/.test(ref) || !s.records.has(ref)) throw new DriverError("unknown_element");
      // 1. In the guard world: the registered element must still look exactly like the snapshot's, be on screen and not covered. This arms a
      //    capture-phase guard that cancels any pointer/mouse/click event not aimed at that very element, before any page handler runs.
      const armed = await this.callWorld<{ ok: boolean; why?: string; x?: number; y?: number }>(s, `__volta.arm(${JSON.stringify(ref)})`);
      if (!armed || !armed.ok || typeof armed.x !== "number" || typeof armed.y !== "number") throw this.refusal(armed?.why);
      // 2. A real (trusted) mouse click at that point.
      try {
        await s.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: armed.x, y: armed.y });
        await s.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: armed.x, y: armed.y, button: "left", clickCount: 1 });
        await s.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: armed.x, y: armed.y, button: "left", clickCount: 1 });
      } catch (e) {
        await this.callWorld(s, "__volta.disarm()").catch(() => null);
        throw e;
      }
      // 3. Did the guard cancel anything? (A page that navigated away destroys the world: then nothing was cancelled before it left.)
      const result = await this.callWorld<{ armed: boolean; violations: number; seen: number }>(s, "__volta.disarm()").catch(() => null);
      // `armed: false` (or no answer) means the click navigated the page away: the guard of the old document saw it first and cancelled nothing.
      if (result && result.armed && result.violations > 0) throw derr("unknown_element", "element_changed");
      if (result && result.armed && result.seen === 0) throw derr("unknown_element", "click_not_delivered");
      await this.settle(s);
      await s.page.waitForTimeout(250); // a popup opened by the click is reported asynchronously; let it be counted and closed first
      return this.read(s);
    });
  }

  async type(sessionId: string, ref: string, text: string, submit: boolean): Promise<DriverPage> {
    const s = this.get(sessionId);
    if (text.length > 500) throw derr("page_error", "text_too_long");
    return this.run(s, this.cfg.navigationTimeoutMs + 3_000, async () => {
      const record = s.records.get(ref);
      if (!record) throw new DriverError("unknown_element");
      if (record.inputType === "password" || record.inputType === "file" || record.inputType === "hidden") throw derr("blocked_request", "field_refused");
      // Check and action happen in one synchronous call inside the guard world: no page script can run between them.
      const r = await this.callWorld<{ ok: boolean; why?: string }>(s, `__volta.fill(${JSON.stringify(ref)}, ${JSON.stringify(text)}, ${submit ? "true" : "false"})`);
      if (!r || !r.ok) throw this.refusal(r?.why);
      if (submit) await this.settle(s);
      return this.read(s);
    });
  }

  async select(sessionId: string, ref: string, option: string): Promise<DriverPage> {
    const s = this.get(sessionId);
    if (option.length > 200) throw derr("page_error", "option_too_long");
    return this.run(s, this.cfg.navigationTimeoutMs + 3_000, async () => {
      if (!s.records.has(ref)) throw new DriverError("unknown_element");
      const r = await this.callWorld<{ ok: boolean; why?: string }>(s, `__volta.select(${JSON.stringify(ref)}, ${JSON.stringify(option)})`);
      if (!r || !r.ok) throw this.refusal(r?.why);
      await this.settle(s); // a change handler may navigate or reload part of the page
      return this.read(s);
    });
  }

  async scroll(sessionId: string, direction: "up" | "down"): Promise<DriverPage> {
    const s = this.get(sessionId);
    return this.run(s, this.cfg.actionTimeoutMs + 3_000, async () => {
      await s.page.mouse.wheel(0, direction === "down" ? 600 : -600);
      await s.page.waitForTimeout(150);
      return this.read(s);
    });
  }

  async back(sessionId: string): Promise<DriverPage> {
    const s = this.get(sessionId);
    return this.run(s, this.cfg.navigationTimeoutMs + 3_000, async () => {
      await s.page.goBack({ timeout: this.cfg.navigationTimeoutMs, waitUntil: "load" }).catch((e: unknown) => {
        if (e instanceof Error && /Timeout/i.test(e.message)) throw e;
      });
      await this.settle(s);
      return this.read(s);
    });
  }

  async forward(sessionId: string): Promise<DriverPage> {
    const s = this.get(sessionId);
    return this.run(s, this.cfg.navigationTimeoutMs + 3_000, async () => {
      await s.page.goForward({ timeout: this.cfg.navigationTimeoutMs, waitUntil: "load" }).catch((e: unknown) => {
        if (e instanceof Error && /Timeout/i.test(e.message)) throw e;
      });
      await this.settle(s);
      return this.read(s);
    });
  }

  async screenshot(sessionId: string): Promise<{ id: string }> {
    const s = this.get(sessionId);
    return this.run(s, this.cfg.actionTimeoutMs + 3_000, async () => {
      if (!this.guard(s.page.url(), "document")) throw new DriverError("blocked_request");
      const bytes = await s.page.screenshot({ type: "png", fullPage: false, timeout: this.cfg.actionTimeoutMs });
      if (bytes.length > this.shotCfg.maxBytes) throw derr("page_error", "screenshot_too_large");
      this.pruneShots(bytes.length);
      const id = `shot_${randomBytes(12).toString("hex")}`;
      this.shots.set(id, { bytes, sessionId, expiresAt: Date.now() + this.shotCfg.ttlMs });
      return { id };
    });
  }

  private pruneShots(incoming: number): void {
    const now = Date.now();
    for (const [id, e] of this.shots) if (e.expiresAt <= now) this.shots.delete(id);
    let total = incoming;
    for (const e of this.shots.values()) total += e.bytes.length;
    // Oldest first (Map keeps insertion order) until both the count and the byte budget fit.
    for (const id of [...this.shots.keys()]) {
      if (this.shots.size < this.shotCfg.maxCount && total <= this.shotCfg.maxTotalBytes) break;
      total -= this.shots.get(id)!.bytes.length;
      this.shots.delete(id);
    }
  }

  /** Screenshot bytes for the session that took them, until the time limit. Another session's id gives null. No file path ever exists. */
  getScreenshot(sessionId: string, shotId: string): Buffer | null {
    const e = this.shots.get(shotId);
    if (!e || e.sessionId !== sessionId || e.expiresAt <= Date.now()) return null;
    return e.bytes;
  }

  async close(sessionId: string): Promise<void> {
    await this.destroy(sessionId, false);
  }
}

/**
 * The only way production code creates the real driver. Fixed policy: the production allowlist (one hostname), https only. There is
 * NO parameter that widens it: a `testOnly` property smuggled into the options is ignored on purpose.
 */
export function createPlaywrightDriver(opts: PlaywrightDriverOptions): PlaywrightDriver & BrowserDriver {
  if (opts?.enabled !== true) throw new Error("The real browser driver is disabled: pass enabled: true explicitly.");
  const clean: PlaywrightDriverOptions = { ...opts };
  delete (clean as { testOnly?: unknown }).testOnly;
  return new PlaywrightDriver(clean, productionPolicy());
}

/** Test fixtures only (imported by tests/real-browser, never by production code): a development policy for fake host names on a local port. */
export function createPlaywrightDriverForTests(opts: PlaywrightDriverOptions, t: PlaywrightTestOnly): PlaywrightDriver {
  const policy = createPolicy({ environment: "development", hosts: t.hosts });
  const origins = new Set(t.hosts.map((h) => `http://${h}:${t.fixturePort}`));
  // The fixture origin is mapped to its https twin so that every other rule (path prefixes, credentials, host match) is the production rule.
  const rewrite = (u: string): string => {
    try {
      const x = new URL(u);
      if (x.username || x.password) return u; // credentials in an address are never rewritten into an allowed one
      return origins.has(x.origin) ? `https://${x.host.replace(`:${t.fixturePort}`, "")}${x.pathname}${x.search}` : u;
    } catch {
      return u;
    }
  };
  return new PlaywrightDriver(opts, policy, rewrite, { treatAsPublic: t.treatAsPublic, fixturePort: t.fixturePort });
}
