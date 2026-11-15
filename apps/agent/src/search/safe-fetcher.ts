import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { isBlockedAddress, type Resolver } from "../security/url-policy";

/**
 * Retrieves ONE public web page for the research lane. This is deliberately NOT the VOLTA-only browser: a research answer may need any public site, so the rule is
 * "any public host except blocked ranges", enforced by this module alone and independent of every model, tool and page:
 *
 *  - http or https only; the default port of the scheme only (80 / 443); no credentials in the URL; no IP-literal hosts (the WHATWG parser has already turned
 *    decimal, octal and hex tricks like http://2130706433/ into 127.0.0.1, which is then refused as an IP literal);
 *  - the name is resolved HERE (injectable resolver), EVERY returned address must be public (private, loopback, link-local, cloud-metadata, carrier-grade NAT,
 *    IPv4-mapped / embedded forms are refused), and the connection is made to the validated address only (pinning: the socket never resolves the name again, so a
 *    DNS-rebinding answer cannot swap in a private address after the check);
 *  - every redirect hop is validated like the first address (at most 3 hops);
 *  - the body is read up to a size cap and cut off, only text/html, application/xhtml+xml and text/plain are accepted (PDF is refused: no safe extractor yet);
 *  - no cookies are sent or stored, no authorisation header, compression is not requested (no decompression bombs), the user agent says what it is, a total
 *    timeout applies, and an optional robots hook can veto a URL.
 *
 * Test-only relaxations (a loopback fixture server) exist ONLY through `createSafeFetcherForTests`; `createSafeFetcher` ignores any such option.
 */
export type FetchRefusal =
  | "bad_url"
  | "scheme"
  | "credentials"
  | "port"
  | "ip_literal"
  | "dns_failed"
  | "private_address"
  | "too_many_redirects"
  | "redirect_invalid"
  | "content_type"
  | "pdf_not_supported"
  | "http_error"
  | "timeout"
  | "aborted"
  | "robots"
  | "network";

export class FetchRefused extends Error {
  constructor(readonly reason: FetchRefusal, message = reason) {
    super(message);
    this.name = "FetchRefused";
  }
}

export interface FetchedPage {
  /** Where the content really came from, after redirects. */
  url: string;
  status: number;
  contentType: string;
  /** Raw decoded body (HTML or text), at most `maxBytes` bytes worth. */
  body: string;
  truncated: boolean;
  redirects: number;
  bytes: number;
}

export interface RobotsPolicy {
  allowed(url: URL): Promise<boolean>;
}

export interface SafeFetcherOptions {
  resolver?: Resolver;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  robots?: RobotsPolicy;
}

export interface FetcherTestOnly {
  /** Exact addresses treated as public (for example 127.0.0.1 for a fixture server). */
  treatAsPublic: readonly string[];
  /** Extra ports allowed (the fixture server's random port), and plain http on them. */
  allowPorts: readonly number[];
}

const TEST_TOKEN = Symbol("safe-fetcher-test-only");

export interface FetcherStats {
  fetched: number;
  refused: number;
  refusedReasons: Record<string, number>;
  resolverCalls: number;
  bytes: number;
}

const defaultResolver: Resolver = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const ALLOWED_TYPES = new Set(["text/html", "application/xhtml+xml", "text/plain"]);
const MAX_URL = 2_048;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

/** Resolves with the promise, or rejects as soon as the signal aborts. The losing promise's rejection is swallowed so it can never become an unhandled rejection. */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  work.catch(() => undefined);
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const onAbort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

interface Target {
  url: URL;
  address: string;
  family: 4 | 6;
}

export class SafeFetcher {
  private readonly resolver: Resolver;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;
  private readonly userAgent: string;
  private readonly robots: RobotsPolicy | undefined;
  private readonly testOnly: FetcherTestOnly | undefined;
  readonly stats: FetcherStats = { fetched: 0, refused: 0, refusedReasons: {}, resolverCalls: 0, bytes: 0 };

  /** `token` is private to this module: without it any `testOnly` option is ignored. */
  constructor(opts: SafeFetcherOptions & { testOnly?: FetcherTestOnly } = {}, token?: symbol) {
    this.resolver = opts.resolver ?? defaultResolver;
    this.maxBytes = Math.min(Math.max(opts.maxBytes ?? 1_000_000, 1_000), 2_000_000);
    this.timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 8_000, 500), 20_000);
    this.maxRedirects = Math.min(Math.max(opts.maxRedirects ?? 3, 0), 3);
    this.userAgent = opts.userAgent ?? "VOLTA-AI-Assistant/1.0 (public page reader; contact: valta.hexalyte.com)";
    this.robots = opts.robots;
    this.testOnly = token === TEST_TOKEN ? opts.testOnly : undefined;
  }

  private refuse(reason: FetchRefusal): never {
    this.stats.refused++;
    this.stats.refusedReasons[reason] = (this.stats.refusedReasons[reason] ?? 0) + 1;
    throw new FetchRefused(reason);
  }

  /** Every URL (the first and each redirect target) goes through exactly this. */
  private async validate(raw: string, signal: AbortSignal, external?: AbortSignal): Promise<Target> {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URL) return this.refuse("bad_url");
    // eslint-disable-next-line no-control-regex
    if (/[\u0000- \u007F-\u009F\\]/.test(raw)) return this.refuse("bad_url");
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return this.refuse("bad_url");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return this.refuse("scheme");
    if (url.username !== "" || url.password !== "") return this.refuse("credentials");
    const defaultPort = url.protocol === "https:" ? "443" : "80";
    const port = url.port === "" ? Number(defaultPort) : Number(url.port);
    const fixtureOk = this.testOnly?.allowPorts.includes(port) === true;
    if (!fixtureOk && url.port !== "") return this.refuse("port"); // WHATWG drops an explicit default port, so any remaining port is non-default
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (isIP(host) !== 0) return this.refuse("ip_literal");
    if (!HOSTNAME.test(host) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return this.refuse("bad_url");
    this.stats.resolverCalls++;
    let answers: string[];
    try {
      // The lookup counts against the same deadline as the transfer: a resolver that never answers cannot hold the turn open.
      answers = await raceAbort(this.resolver(host), signal);
    } catch {
      if (signal.aborted) return this.refuse(external?.aborted ? "aborted" : "timeout");
      return this.refuse("dns_failed");
    }
    if (!Array.isArray(answers) || answers.some((a) => typeof a !== "string")) return this.refuse("dns_failed");
    if (answers.length === 0) return this.refuse("dns_failed");
    const trusted = new Set(this.testOnly?.treatAsPublic ?? []);
    if (answers.some((a) => isBlockedAddress(a) && !trusted.has(a))) return this.refuse("private_address");
    const address = answers[0]!;
    const family = isIP(address);
    if (family !== 4 && family !== 6) return this.refuse("dns_failed");
    return { url, address, family };
  }

  async fetch(rawUrl: string, opts: { signal?: AbortSignal } = {}): Promise<FetchedPage> {
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
    let current = rawUrl;
    for (let hop = 0; ; hop++) {
      if (signal.aborted) return this.refuse(opts.signal?.aborted ? "aborted" : "timeout");
      const target = await this.validate(current, signal, opts.signal);
      if (this.robots && !(await this.robots.allowed(target.url))) return this.refuse("robots");
      const step = await this.once(target, signal, opts.signal);
      if (step.kind === "redirect") {
        if (hop >= this.maxRedirects) return this.refuse("too_many_redirects");
        let next: string;
        try {
          next = new URL(step.location, target.url).toString();
        } catch {
          return this.refuse("redirect_invalid");
        }
        current = next;
        continue;
      }
      this.stats.fetched++;
      this.stats.bytes += step.page.bytes;
      return { ...step.page, url: target.url.toString(), redirects: hop };
    }
  }

  private once(target: Target, signal: AbortSignal, external?: AbortSignal): Promise<{ kind: "redirect"; location: string } | { kind: "page"; page: Omit<FetchedPage, "url" | "redirects"> }> {
    const { url, address, family } = target;
    const secure = url.protocol === "https:";
    const mod = secure ? https : http;
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        fn();
      };
      const fail = (reason: FetchRefusal) => done(() => reject(this.safeRefusal(reason)));
      const req = mod.request(
        {
          protocol: url.protocol,
          hostname: url.hostname.replace(/^\[|\]$/g, ""),
          port: url.port === "" ? undefined : Number(url.port),
          path: `${url.pathname}${url.search}`,
          method: "GET",
          agent: false, // a fresh connection per hop: nothing is shared between requests
          // PINNING: the socket connects to the address validated above and never asks DNS again.
          lookup: ((_host: string, options: { all?: boolean }, cb: (err: Error | null, addr: unknown, fam?: number) => void) =>
            options?.all ? cb(null, [{ address, family }]) : cb(null, address, family)) as never,
          servername: secure ? url.hostname.replace(/^\[|\]$/g, "") : undefined,
          headers: { "user-agent": this.userAgent, accept: "text/html,application/xhtml+xml,text/plain;q=0.9", "accept-encoding": "identity", connection: "close" },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const loc = res.headers.location;
          if (REDIRECT_CODES.has(status) && typeof loc === "string" && loc !== "") {
            res.resume();
            res.destroy();
            return done(() => resolve({ kind: "redirect", location: loc }));
          }
          if (status < 200 || status >= 300) {
            res.resume();
            res.destroy();
            return fail("http_error");
          }
          const media = String(res.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
          if (media === "application/pdf") {
            res.destroy();
            return fail("pdf_not_supported");
          }
          if (!ALLOWED_TYPES.has(media)) {
            res.destroy();
            return fail("content_type");
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          let truncated = false;
          res.on("data", (chunk: Buffer) => {
            if (truncated) return;
            const room = this.maxBytes - bytes;
            if (chunk.length >= room) {
              chunks.push(chunk.subarray(0, room));
              bytes += room;
              truncated = true;
              res.destroy(); // stop reading: the rest is never buffered
              return finish();
            }
            chunks.push(chunk);
            bytes += chunk.length;
          });
          const finish = () =>
            done(() => {
              const charset = /charset=([\w-]+)/i.exec(String(res.headers["content-type"] ?? ""))?.[1]?.toLowerCase();
              let body: string;
              try {
                body = new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8", { fatal: false }).decode(Buffer.concat(chunks));
              } catch {
                body = Buffer.concat(chunks).toString("utf8");
              }
              resolve({ kind: "page", page: { status, contentType: media, body, truncated, bytes } });
            });
          res.on("end", finish);
          res.on("error", () => (truncated ? undefined : fail("network")));
          res.on("close", () => (settled ? undefined : fail("network")));
        },
      );
      const onAbort = () => {
        req.destroy();
        fail(external?.aborted ? "aborted" : "timeout");
      };
      signal.addEventListener("abort", onAbort, { once: true });
      req.on("error", () => fail("network"));
      req.end();
    });
  }

  /** An error object for a refusal that was found while running (already counted here). */
  private safeRefusal(reason: FetchRefusal): FetchRefused {
    this.stats.refused++;
    this.stats.refusedReasons[reason] = (this.stats.refusedReasons[reason] ?? 0) + 1;
    return new FetchRefused(reason);
  }
}

/** Production factory: any `testOnly` option is ignored. */
export function createSafeFetcher(opts: SafeFetcherOptions & { testOnly?: unknown } = {}): SafeFetcher {
  const { testOnly: _ignored, ...rest } = opts;
  void _ignored;
  return new SafeFetcher(rest);
}

/** Tests only: allows a loopback fixture server (named addresses treated as public, extra ports, plain http on them). */
export function createSafeFetcherForTests(opts: SafeFetcherOptions & { testOnly: FetcherTestOnly }): SafeFetcher {
  return new SafeFetcher(opts, TEST_TOKEN);
}
