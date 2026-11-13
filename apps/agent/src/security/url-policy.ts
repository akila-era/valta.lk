import { isIP } from "node:net";

/**
 * The single place that decides which web addresses VOLTA AI may touch. Pure functions, no network. The browser worker applies
 * them to every request and redirect, and the Agent applies them to any URL a tool receives, so the rule never depends on what a
 * model says. Exact hostname matching only: no wildcards, no subdomain guessing, no ports other than 443, https only.
 *
 * Production is fixed in code (one hostname). Staging and development are separate policies that start EMPTY and must be given
 * their hosts explicitly, so a development convenience can never widen production.
 */
export type Environment = "production" | "staging" | "development";

export interface UrlPolicy {
  readonly environment: Environment;
  /** Exact, lower-case hostnames. */
  readonly hosts: readonly string[];
  /** Development only: allow plain http to a loopback address, for local test fixtures. Ignored in other environments. */
  readonly allowLoopbackHttp: boolean;
  /** Path prefixes that are never opened, even on an allowed host. */
  readonly blockedPathPrefixes: readonly string[];
}

export const PRODUCTION_HOSTS = Object.freeze(["valta.hexalyte.com"]);

/** An anonymous browser has no business in the API, the admin area or the payment steps. */
export const BLOCKED_PATH_PREFIXES = Object.freeze(["/api", "/admin", "/checkout", "/order-confirmation"]);

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function createPolicy(opts: { environment: Environment; hosts?: readonly string[]; allowLoopbackHttp?: boolean }): UrlPolicy {
  const hosts = (opts.hosts ?? []).map((h) => h.trim().toLowerCase());
  for (const h of hosts) {
    if (!HOSTNAME.test(h) || isIP(h) !== 0) throw new Error(`Allowed host "${h}" must be an exact DNS hostname.`);
  }
  if (opts.environment === "production") {
    if (hosts.length !== PRODUCTION_HOSTS.length || hosts.some((h, i) => h !== PRODUCTION_HOSTS[i])) {
      throw new Error("The production allowlist is fixed in code and cannot be changed by configuration.");
    }
  }
  return Object.freeze({
    environment: opts.environment,
    hosts: Object.freeze([...hosts]),
    allowLoopbackHttp: opts.environment === "development" && opts.allowLoopbackHttp === true,
    blockedPathPrefixes: BLOCKED_PATH_PREFIXES,
  });
}

export const productionPolicy = (): UrlPolicy => createPolicy({ environment: "production", hosts: PRODUCTION_HOSTS });

export type UrlRefusal =
  | "not_a_url"
  | "too_long"
  | "control_characters"
  | "scheme_not_allowed"
  | "credentials_in_url"
  | "port_not_allowed"
  | "ip_literal"
  | "host_not_allowed"
  | "path_not_allowed";

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: UrlRefusal };

const MAX_URL_LENGTH = 2048;
// eslint-disable-next-line no-control-regex
const CONTROL_OR_SPACE = /[\u0000- \u007F-\u009F\\]/;

const stripBrackets = (h: string) => h.replace(/^\[|\]$/g, "");

/** True for 127.0.0.0/8 and ::1 (used only for the development loopback allowance). */
function isLoopbackLiteral(host: string): boolean {
  const h = stripBrackets(host);
  return h === "::1" || /^127(\.\d{1,3}){3}$/.test(h) || h === "localhost";
}

export function checkUrl(input: string, policy: UrlPolicy): UrlCheck {
  if (typeof input !== "string") return { ok: false, reason: "not_a_url" };
  if (input.length > MAX_URL_LENGTH) return { ok: false, reason: "too_long" };
  if (CONTROL_OR_SPACE.test(input)) return { ok: false, reason: "control_characters" };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "not_a_url" };
  }
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "credentials_in_url" };

  const loopbackDev = policy.allowLoopbackHttp && isLoopbackLiteral(url.hostname);
  if (loopbackDev) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "scheme_not_allowed" };
    return pathCheck(url, policy);
  }
  if (url.protocol !== "https:") return { ok: false, reason: "scheme_not_allowed" };
  if (url.port !== "") return { ok: false, reason: "port_not_allowed" }; // WHATWG URL drops the default 443
  // new URL() already normalised decimal, octal and hex IPv4 forms and IPv6 brackets, so a plain isIP check is enough.
  if (isIP(stripBrackets(url.hostname)) !== 0) return { ok: false, reason: "ip_literal" };
  if (!policy.hosts.includes(url.hostname)) return { ok: false, reason: "host_not_allowed" };
  return pathCheck(url, policy);
}

function pathCheck(url: URL, policy: UrlPolicy): UrlCheck {
  // Decode (repeatedly, so %2561 cannot hide an "a") and re-normalise before comparing; a path that cannot be decoded is refused.
  let path = url.pathname;
  for (let i = 0; i < 3 && path.includes("%"); i++) {
    try {
      path = decodeURIComponent(path);
    } catch {
      return { ok: false, reason: "path_not_allowed" };
    }
  }
  path = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
  const segments: string[] = [];
  for (const s of path.split("/")) {
    if (s === "..") segments.pop();
    else if (s !== "." && s !== "") segments.push(s);
  }
  const normal = `/${segments.join("/")}`;
  for (const prefix of policy.blockedPathPrefixes) {
    if (normal === prefix || normal.startsWith(`${prefix}/`)) return { ok: false, reason: "path_not_allowed" };
  }
  return { ok: true, url };
}

/** A redirect target (absolute or relative) must pass exactly the same rule as the first address. */
export function checkRedirect(from: string, location: string, policy: UrlPolicy): UrlCheck {
  let target: string;
  try {
    target = new URL(location, from).toString();
  } catch {
    return { ok: false, reason: "not_a_url" };
  }
  return checkUrl(target, policy);
}

export type ResourceType = "document" | "stylesheet" | "image" | "media" | "font" | "script" | "xhr" | "fetch" | "websocket" | "other" | string;

/**
 * Every sub-resource the page asks for (images, scripts, frames, XHR). Third-party hosts are refused. Inline data: addresses are
 * allowed only for images, fonts and media. Anything that is not http(s), data: or about:blank is refused.
 */
export function checkSubresource(input: string, type: ResourceType, policy: UrlPolicy): UrlCheck {
  if (input === "about:blank") return { ok: true, url: new URL("about:blank") };
  if (input.startsWith("data:")) {
    return ["image", "font", "media"].includes(type) && input.length <= 1_000_000 ? { ok: true, url: new URL("data:,") } : { ok: false, reason: "scheme_not_allowed" };
  }
  if (type === "websocket") return { ok: false, reason: "scheme_not_allowed" };
  return checkUrl(input, policy);
}

// ---- Resolved addresses (defence against DNS tricks and rebinding): the worker resolves the name itself and refuses non-public results.

function parseV4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

function parseV6(input: string): number[] | null {
  let s = stripBrackets(input).toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (isIP(s) !== 6) return null;
  let tailV4: number[] | null = null;
  const lastColon = s.lastIndexOf(":");
  if (s.includes(".")) {
    tailV4 = parseV4(s.slice(lastColon + 1));
    if (!tailV4) return null;
    s = `${s.slice(0, lastColon + 1)}0:0`;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const fill = s.includes("::") ? 8 - h.length - t.length : 0;
  if (fill < 0 || (!s.includes("::") && h.length !== 8)) return null;
  const groups = [...h, ...Array<string>(fill).fill("0"), ...t].map((g) => parseInt(g || "0", 16));
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g > 0xffff)) return null;
  if (tailV4) {
    groups[6] = (tailV4[0]! << 8) | tailV4[1]!;
    groups[7] = (tailV4[2]! << 8) | tailV4[3]!;
  }
  return groups;
}

function blockedV4(p: number[]): boolean {
  const [a, b] = [p[0]!, p[1]!];
  if (a === 0 || a === 10 || a === 127) return true; // this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 169 && b === 254) return true; // link-local, includes the 169.254.169.254 cloud metadata address
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && p[2] === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** True when the address is anything other than a normal public unicast address. Unparseable input counts as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseV4(stripBrackets(ip));
  if (v4) return blockedV4(v4);
  const g = parseV6(ip);
  if (!g) return true;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local (includes fd00:ec2::254, the AWS IPv6 metadata address)
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return blockedV4([g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255]); // IPv4-mapped
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true; // NAT64: could reach anything
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

export type Resolver = (hostname: string) => Promise<string[]>;

/**
 * Resolve the hostname and require EVERY address to be public. The caller must connect to one of the returned addresses (pinning),
 * not resolve again, otherwise a DNS rebinding answer could swap in a private address after this check.
 */
export async function resolvePublicAddresses(hostname: string, resolve: Resolver): Promise<{ ok: true; addresses: string[] } | { ok: false; reason: "dns_failed" | "private_address" }> {
  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch {
    return { ok: false, reason: "dns_failed" };
  }
  if (addresses.length === 0) return { ok: false, reason: "dns_failed" };
  if (addresses.some(isBlockedAddress)) return { ok: false, reason: "private_address" };
  return { ok: true, addresses };
}

/** Customer-facing wording for a refused address. Never echoes the address, so it cannot be used to probe. */
export const REFUSAL_TEXT_EN = "I can only open pages on the VOLTA.LK website, so I can't open that link.";
