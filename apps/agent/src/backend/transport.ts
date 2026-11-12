import { z } from "zod";
import { isLoopbackHost } from "../config";
import { CataloguePage, RawOrder, RawProduct, RawSettings } from "./wire";

/** The ERP could not answer (down, slow, rejected the credential, or sent something unexpected). The message is safe to log. */
export class ErpUnavailableError extends Error {
  readonly kind: "UNREACHABLE" | "TIMEOUT" | "BAD_RESPONSE" | "UNAUTHORIZED";
  constructor(kind: ErpUnavailableError["kind"], message: string) {
    super(message);
    this.name = "ErpUnavailableError";
    this.kind = kind;
  }
}

/** Read-only access to the ERP. Two implementations: in-memory wire fixtures and HTTP to a LOCAL mock ERP. */
export interface ErpTransport {
  /** Used to resolve relative image paths. */
  readonly origin: string;
  listProducts(signal?: AbortSignal): Promise<RawProduct[]>;
  /** null when the ERP does not have it. */
  getProduct(id: string, signal?: AbortSignal): Promise<RawProduct | null>;
  getSettings(signal?: AbortSignal): Promise<RawSettings>;
  getOrder(ref: string, signal?: AbortSignal): Promise<RawOrder | null>;
}

export interface HttpTransportOptions {
  /** For example http://127.0.0.1:4010/api/v1/store-api */
  baseUrl: string;
  /** Mock credential only (hxs_<keyId>.<secret>). Sent as a Bearer token, never logged, never returned. */
  credential: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

/**
 * Talks to the repo's local MOCK ERP over HTTP. It refuses any non-loopback address, so it cannot be pointed at a real or
 * production ERP in M1. Only GET requests are ever sent.
 */
export class HttpErpTransport implements ErpTransport {
  readonly origin: string;
  private readonly base: string;
  private readonly credential: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: HttpTransportOptions) {
    const u = new URL(opts.baseUrl);
    if (!isLoopbackHost(u.hostname)) throw new Error("HttpErpTransport accepts only a local (loopback) mock ERP in M1.");
    if (!/^hxs_[A-Za-z0-9]+\.[A-Za-z0-9]+$/.test(opts.credential)) throw new Error("The mock credential has an unexpected format.");
    this.origin = u.origin;
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.credential = opts.credential;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 5_000;
  }

  private async get<S extends z.ZodType>(path: string, schema: S, signal?: AbortSignal, notFoundIsNull = false): Promise<z.infer<S> | null> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${this.credential}` },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      throw new ErpUnavailableError(timeout.aborted ? "TIMEOUT" : "UNREACHABLE", "The ERP did not answer.");
    }
    const text = await res.text();
    if (res.status === 404 && notFoundIsNull) return null;
    if (res.status === 401 || res.status === 403) throw new ErpUnavailableError("UNAUTHORIZED", "The ERP rejected the request.");
    if (!res.ok) throw new ErpUnavailableError("BAD_RESPONSE", `The ERP answered HTTP ${res.status}.`);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ErpUnavailableError("BAD_RESPONSE", "The ERP sent a body that is not JSON.");
    }
    const data = json && typeof json === "object" ? (json as { data?: unknown }).data : undefined;
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ErpUnavailableError("BAD_RESPONSE", "The ERP response did not match the contract.");
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
    return this.get(`/catalogue/products/${encodeURIComponent(id)}`, RawProduct, signal, true);
  }

  async getSettings(signal?: AbortSignal): Promise<RawSettings> {
    return (await this.get("/settings", RawSettings, signal))!;
  }

  getOrder(ref: string, signal?: AbortSignal): Promise<RawOrder | null> {
    return this.get(`/orders/${encodeURIComponent(ref)}`, RawOrder, signal, true);
  }
}
