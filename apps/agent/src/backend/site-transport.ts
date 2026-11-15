import { z } from "zod";
import { isLoopbackHost } from "../config";
import { signRequest } from "../auth/hmac";
import { ErpUnavailableError, type ErpTransport } from "./transport";
import { CataloguePage, RawProduct, RawSettings, type RawOrder } from "./wire";

/** The website's published specification rows, as the relay returns them. Strictly shaped and capped: it is untrusted input. */
const ContentRows = z.object({
  items: z
    .array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), specs: z.array(z.object({ name: z.string().min(1).max(60), value: z.string().min(1).max(200) })).max(24) }))
    .max(5000),
});

export interface SiteTransportOptions {
  /** The website, for example https://valta.hexalyte.com (https only; http is accepted for a loopback test double). */
  siteUrl: string;
  /** Key id and secret the website's catalogue relay expects (its own pair, not the chat key). */
  keyId: string;
  secret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const RELAY = "/api/internal/ai/erp";
/** The website is untrusted input: no answer may be larger than this (a full page of 100 products is a few hundred KB). */
const MAX_BODY_BYTES = 3_000_000;

/** Reads a response body but stops and fails as soon as it exceeds the cap, so a hostile or broken website cannot make the Agent hold a huge string. */
async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new ErpUnavailableError("BAD_RESPONSE", "The catalogue answer is too large.");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new ErpUnavailableError("BAD_RESPONSE", "The catalogue answer is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;
/** The relay carries only public catalogue data, so the signed identity is always the anonymous guest. */
const CLIENT_IP = "127.0.0.1";

/**
 * Read-only catalogue access THROUGH the website: the website holds the ERP credential, the Agent holds only a signing key for
 * three GET routes (settings, product list, one product). Order data is never requested: getOrder always answers "not found", so
 * no customer or order information can reach the Agent through this path.
 */
export class SiteErpTransport implements ErpTransport {
  readonly origin: string;
  private readonly base: string;
  private readonly keyId: string;
  private readonly secret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: SiteTransportOptions) {
    const u = new URL(opts.siteUrl);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopbackHost(u.hostname))) throw new Error("The catalogue site must use https (http only for a loopback test).");
    if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) throw new Error("The catalogue site must be a plain origin.");
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(opts.keyId)) throw new Error("The catalogue key id has an unexpected format.");
    if (opts.secret.length < 32) throw new Error("The catalogue secret must be at least 32 characters.");
    this.origin = u.origin;
    this.base = u.origin + RELAY;
    this.keyId = opts.keyId;
    this.secret = opts.secret;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  private async get<S extends z.ZodType>(path: string, schema: S, signal?: AbortSignal, notFoundIsNull = false): Promise<z.infer<S> | null> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const full = RELAY + path;
    let res: Response;
    try {
      res = await this.fetchImpl(this.origin + full, {
        method: "GET",
        headers: { Accept: "application/json", ...signRequest({ keyId: this.keyId, secret: this.secret, method: "GET", path: full, identity: { kind: "guest" }, clientIp: CLIENT_IP }) },
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      throw new ErpUnavailableError(timeout.aborted ? "TIMEOUT" : "UNREACHABLE", "The catalogue did not answer.");
    }
    const text = await readCapped(res, MAX_BODY_BYTES);
    if (res.status === 404 && notFoundIsNull) {
      // The relay answers 404 for "unknown product" with an error body, and also (indistinguishably) when it is off or the signature is wrong.
      // Only a body that says PRODUCT_NOT_FOUND counts as "no such product"; anything else is a failure, never a silent empty answer.
      try {
        if ((JSON.parse(text) as { error?: { code?: string } }).error?.code === "PRODUCT_NOT_FOUND") return null;
      } catch {
        /* fall through */
      }
      throw new ErpUnavailableError("UNAUTHORIZED", "The catalogue rejected the request.");
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) throw new ErpUnavailableError("UNAUTHORIZED", "The catalogue rejected the request.");
    if (!res.ok) throw new ErpUnavailableError("BAD_RESPONSE", `The catalogue answered HTTP ${res.status}.`);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ErpUnavailableError("BAD_RESPONSE", "The catalogue sent a body that is not JSON.");
    }
    const data = json && typeof json === "object" ? (json as { data?: unknown }).data : undefined;
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ErpUnavailableError("BAD_RESPONSE", "The catalogue response did not match the contract.");
    return parsed.data;
  }

  async listProducts(signal?: AbortSignal): Promise<RawProduct[]> {
    const items: RawProduct[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({ limit: String(PAGE_LIMIT), ...(cursor ? { cursor } : {}) });
      const data = (await this.get(`/catalogue/products?${q}`, CataloguePage, signal))!;
      items.push(...data.items);
      if (!data.nextCursor) break;
      cursor = data.nextCursor;
    }
    return items;
  }

  getProduct(id: string, signal?: AbortSignal): Promise<RawProduct | null> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return Promise.resolve(null);
    return this.get(`/catalogue/products/${encodeURIComponent(id)}`, RawProduct, signal, true);
  }

  async getSettings(signal?: AbortSignal): Promise<RawSettings> {
    return (await this.get("/settings", RawSettings, signal))!;
  }

  /** Published specification rows entered by staff on the website (read-only). Rows for unknown ids are simply never used. */
  async getContent(signal?: AbortSignal): Promise<Record<string, { specs: { name: string; value: string }[] }>> {
    const data = (await this.get("/content", ContentRows, signal))!;
    const out: Record<string, { specs: { name: string; value: string }[] }> = {};
    for (const i of data.items) if (i.specs.length > 0) out[i.id] = { specs: i.specs };
    return out;
  }

  /** Orders belong to customers: this transport never asks for them. */
  getOrder(_ref: string): Promise<RawOrder | null> {
    return Promise.resolve(null);
  }
}
