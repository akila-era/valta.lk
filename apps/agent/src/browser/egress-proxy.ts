import { randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { connect as netConnect, isIP, type AddressInfo, type Socket } from "node:net";
import { checkUrl, isBlockedAddress, type Resolver, type UrlPolicy } from "../security/url-policy";

/**
 * The network-level egress filter for the real browser. Chromium is started with this proxy as its ONLY way out, so the rule does not
 * depend on page code, on Playwright interception, or on what a model asked for:
 *   - only hostnames in the URL policy are served (exact match, https, port 443, no IP literals, no credentials);
 *   - the proxy resolves DNS itself, requires EVERY returned address to be public, and connects to the resolved address (pinned for a short
 *     time), so a DNS answer that changes after the check (rebinding) is never used and the browser never resolves a name itself;
 *   - loopback, private, link-local (cloud metadata), carrier NAT, multicast, IPv4-mapped and unique-local IPv6 results are refused;
 *   - every new connection is checked again, which re-validates each redirect hop (a redirect is a new connection to a new host).
 * The proxy listens on 127.0.0.1 only and requires a random per-instance credential, so another local process cannot borrow it.
 * It never logs URLs, paths or headers: only counters and reason codes.
 */
export interface EgressStats {
  allowed: number;
  refused: number;
  refusedReasons: Record<string, number>;
  resolverCalls: number;
  openTunnels: number;
}

/** Test-only relaxations. A production driver never receives these (see `createPlaywrightDriver`). */
export interface EgressTestOnly {
  /** Exact IPs treated as public (for example 127.0.0.1 for a local fixture server). */
  treatAsPublic?: readonly string[];
  /** Plain http and this exact port are allowed for hosts in the policy (fixture servers listen on a random port). */
  fixturePort?: number;
}

export interface EgressProxyOptions {
  policy: UrlPolicy;
  resolver?: Resolver;
  /** How long a validated name->address answer is pinned. After it expires the name is resolved and validated again. */
  pinTtlMs?: number;
  maxTunnels?: number;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
  testOnly?: EgressTestOnly;
}

const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

type Target = { ok: true; host: string; port: number } | { ok: false; reason: string };

export class EgressProxy {
  private server: Server | null = null;
  private readonly resolver: Resolver;
  private readonly pins = new Map<string, { addresses: string[]; expiresAt: number }>();
  private readonly tunnels = new Set<Socket>();
  /** CONNECTs that passed the cap check and are still resolving or connecting. Counted with the open tunnels so a burst cannot exceed the cap. */
  private pendingTunnels = 0;
  readonly credential = randomBytes(24).toString("hex");
  private readonly stats: EgressStats = { allowed: 0, refused: 0, refusedReasons: {}, resolverCalls: 0, openTunnels: 0 };

  constructor(private readonly opts: EgressProxyOptions) {
    this.resolver = opts.resolver ?? defaultResolver;
  }

  get port(): number {
    const a = this.server?.address() as AddressInfo | null | undefined;
    if (!a) throw new Error("egress proxy is not listening");
    return a.port;
  }

  snapshotStats(): EgressStats {
    return { ...this.stats, refusedReasons: { ...this.stats.refusedReasons }, openTunnels: this.tunnels.size };
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = createServer((req, res) => void this.onPlainRequest(req, res));
    server.on("connect", (req, socket, head) => void this.onConnect(req, socket as Socket, head));
    server.on("clientError", (_e, socket) => socket.destroy());
    server.headersTimeout = 10_000;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    this.server = server;
  }

  async stop(): Promise<void> {
    const s = this.server;
    this.server = null;
    for (const t of this.tunnels) t.destroy();
    this.tunnels.clear();
    this.pins.clear();
    if (s) await new Promise<void>((r) => s.close(() => r()));
  }

  private refuse(reason: string): void {
    this.stats.refused++;
    this.stats.refusedReasons[reason] = (this.stats.refusedReasons[reason] ?? 0) + 1;
  }

  private authorised(header: string | string[] | undefined): boolean {
    if (typeof header !== "string" || !header.toLowerCase().startsWith("basic ")) return false;
    const given = Buffer.from(Buffer.from(header.slice(6), "base64").toString("utf8").split(":").slice(1).join(":"));
    const want = Buffer.from(this.credential);
    return given.length === want.length && timingSafeEqual(given, want);
  }

  /** Is this host and port something the policy would let the browser open? Same rule as checkUrl, plus the test-only fixture port. */
  private checkTarget(host: string, port: number, scheme: "https" | "http"): Target {
    const lower = host.toLowerCase().replace(/^\[|\]$/g, "");
    const fixture = this.opts.testOnly?.fixturePort;
    if (fixture !== undefined && port === fixture) {
      if (isIP(lower) !== 0) return { ok: false, reason: "ip_literal" };
      return this.opts.policy.hosts.includes(lower) ? { ok: true, host: lower, port } : { ok: false, reason: "host_not_allowed" };
    }
    if (scheme !== "https" || port !== 443) return { ok: false, reason: "port_not_allowed" };
    const c = checkUrl(`https://${isIP(lower) === 6 ? `[${lower}]` : lower}/`, this.opts.policy);
    return c.ok ? { ok: true, host: lower, port } : { ok: false, reason: c.reason };
  }

  private async connectPinned(addresses: string[], port: number): Promise<Socket> {
    let lastError: unknown;
    for (const address of addresses) {
      try {
        return await new Promise<Socket>((resolve, reject) => {
          const s = netConnect({ host: address, port });
          const timer = setTimeout(() => {
            s.destroy();
            reject(new Error("connect timeout"));
          }, this.opts.connectTimeoutMs ?? 10_000);
          s.once("connect", () => {
            clearTimeout(timer);
            resolve(s);
          });
          s.once("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
        });
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new Error("no address");
  }

  private track(...sockets: Socket[]): void {
    for (const s of sockets) {
      this.tunnels.add(s);
      s.setTimeout(this.opts.idleTimeoutMs ?? 30_000, () => s.destroy());
      s.on("close", () => this.tunnels.delete(s));
      s.on("error", () => s.destroy());
    }
  }

  private async onConnect(req: IncomingMessage, client: Socket, head: Buffer): Promise<void> {
    const deny = (code: number, reason: string): void => {
      this.refuse(reason);
      const challenge = code === 407 ? 'proxy-authenticate: Basic realm="volta"\r\n' : "";
      client.end(`HTTP/1.1 ${code} Refused\r\n${challenge}connection: close\r\ncontent-length: 0\r\n\r\n`);
    };
    client.on("error", () => client.destroy());
    if (!this.authorised(req.headers["proxy-authorization"])) return deny(407, "proxy_auth");
    // The cap counts open tunnels AND those still being set up, and the slot is taken before the first await: a burst of simultaneous
    // CONNECTs cannot all pass the check.
    if ((this.tunnels.size >> 1) + this.pendingTunnels >= (this.opts.maxTunnels ?? 100)) return deny(503, "too_many_tunnels");
    this.pendingTunnels++;
    let upstream: Socket;
    try {
      const m = /^(\[[0-9a-f:.%]+\]|[^:\s]+):(\d{1,5})$/i.exec(req.url ?? "");
      if (!m) return deny(400, "bad_target");
      const port = Number(m[2]);
      const target = this.checkTarget(m[1]!, port, "https");
      if (!target.ok) return deny(403, target.reason);
      const resolved = await this.resolvePinnedSafe(target.host);
      if (!resolved.ok) return deny(403, resolved.reason);
      try {
        upstream = await this.connectPinned(resolved.addresses, target.port);
      } catch {
        return deny(502, "connect_failed");
      }
      // Counted as an open tunnel before the slot is released, so the two counts never both miss it.
      this.track(client, upstream);
    } finally {
      this.pendingTunnels--;
    }
    this.stats.allowed++;
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) upstream.write(head);
    upstream.pipe(client);
    client.pipe(upstream);
  }

  /** Resolve once, require EVERY answer to be public, pin the answer for a short time; the caller connects to the pinned addresses only. */
  private async resolvePinnedSafe(host: string): Promise<{ ok: true; addresses: string[] } | { ok: false; reason: string }> {
    const now = Date.now();
    const hit = this.pins.get(host);
    if (hit && hit.expiresAt > now) return { ok: true, addresses: hit.addresses };
    this.stats.resolverCalls++;
    const allowed = new Set(this.opts.testOnly?.treatAsPublic ?? []);
    let answers: string[];
    try {
      answers = await this.resolver(host);
    } catch {
      return { ok: false, reason: "dns_failed" };
    }
    if (answers.length === 0) return { ok: false, reason: "dns_failed" };
    if (answers.some((a) => !allowed.has(a) && isBlockedAddress(a))) return { ok: false, reason: "private_address" };
    if (this.pins.size >= 256) this.pins.clear();
    this.pins.set(host, { addresses: answers, expiresAt: now + (this.opts.pinTtlMs ?? 30_000) });
    return { ok: true, addresses: answers };
  }

  /** Plain http proxying exists ONLY for the test fixture port. In production every plain-http request is refused. */
  private async onPlainRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const deny = (code: number, reason: string): void => {
      this.refuse(reason);
      res.writeHead(code, { "content-length": "0", connection: "close", ...(code === 407 ? { "proxy-authenticate": 'Basic realm="volta"' } : {}) });
      res.end();
    };
    if (!this.authorised(req.headers["proxy-authorization"])) return deny(407, "proxy_auth");
    let url: URL;
    try {
      url = new URL(req.url ?? "");
    } catch {
      return deny(400, "bad_target");
    }
    if (url.protocol !== "http:" || this.opts.testOnly?.fixturePort === undefined) return deny(403, "plain_http_refused");
    const port = Number(url.port || 80);
    const target = this.checkTarget(url.hostname, port, "http");
    if (!target.ok) return deny(403, target.reason);
    const resolved = await this.resolvePinnedSafe(target.host);
    if (!resolved.ok) return deny(403, resolved.reason);
    const headers = { ...req.headers };
    for (const h of ["proxy-authorization", "proxy-connection", "connection", "keep-alive"]) delete headers[h];
    this.stats.allowed++;
    const up = httpRequest({ host: resolved.addresses[0]!, port: target.port, method: req.method, path: `${url.pathname}${url.search}`, headers, timeout: this.opts.connectTimeoutMs ?? 10_000 }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => deny(502, "connect_failed"));
    up.on("timeout", () => up.destroy());
    req.pipe(up);
  }
}
