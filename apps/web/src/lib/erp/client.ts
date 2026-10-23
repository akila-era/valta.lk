import "server-only";
import type { z } from "zod";
import { getActiveErpEnv } from "./connection";
import { authHeaders } from "./endpoints";
import { ErpError, type ErpFailureKind } from "./errors";
import { ERP_ERROR_CODES } from "./types";

export interface ErpRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Sent on every attempt so retries are safe (8-128 chars). Required for writes that should be retried. */
  idempotencyKey?: string;
  timeoutMs?: number;
  /** Max attempts for network errors / 5xx. POSTs only retry with an idempotencyKey or an explicit maxAttempts. */
  maxAttempts?: number;
  revalidate?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractCode(body: unknown): ErpFailureKind {
  const code = body && typeof body === "object" ? String((body as Record<string, unknown>).code ?? "") : "";
  return (ERP_ERROR_CODES as readonly string[]).includes(code) ? (code as ErpFailureKind) : "UNKNOWN";
}

/**
 * Low-level typed ERP request. Success bodies are `{success:true,data}`; `data` is validated with `schema`.
 * The credential never leaves this module and is never logged.
 */
export async function erpRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  opts: ErpRequestOptions = {},
): Promise<z.infer<S>> {
  const env = await getActiveErpEnv();
  if (!env) throw new ErpError("NOT_CONFIGURED", 503, "ERP is not configured");

  const method = opts.method ?? "GET";
  const canRetry = method === "GET" || Boolean(opts.idempotencyKey) || opts.maxAttempts !== undefined;
  const attempts = canRetry ? (opts.maxAttempts ?? 3) : 1;
  const timeoutMs = opts.timeoutMs ?? 8000;

  let last: ErpError = new ErpError("UNREACHABLE", 503, "ERP unreachable");
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let waitMs = 200 * 2 ** (attempt - 1);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(env.HX_API_BASE + path, {
        method,
        headers: {
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
          ...authHeaders(env.HX_STORE_CREDENTIAL),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        ...(method === "GET" && typeof opts.revalidate === "number"
          ? { next: { revalidate: opts.revalidate } }
          : { cache: "no-store" as const }),
      });

      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* non-JSON body */
      }

      if (res.ok) {
        const data = json && typeof json === "object" ? (json as Record<string, unknown>).data : undefined;
        const parsed = schema.safeParse(data);
        if (!parsed.success) throw new ErpError("BAD_RESPONSE", 502, "Unexpected ERP response shape");
        return parsed.data;
      }

      const code = extractCode(json);
      if (res.status === 401) throw new ErpError("UNAUTHORIZED", 401, "ERP rejected credentials");
      if (res.status === 429) {
        throw new ErpError("RATE_LIMITED", 429, "ERP rate limit", Number(res.headers.get("retry-after")) || undefined);
      }
      if (code === "IDEMPOTENCY_IN_PROGRESS" && attempt < attempts) {
        // The ERP is still processing the same request: wait 1 s and repeat it with the same key.
        last = new ErpError("IDEMPOTENCY_IN_PROGRESS", 409, "Request still processing");
        waitMs = 1000;
      } else if (res.status >= 500) {
        last = new ErpError("UNREACHABLE", res.status, `ERP error ${res.status}`);
      } else {
        // Other 4xx: never retried; the request must be corrected.
        throw new ErpError(code === "UNKNOWN" && res.status === 404 ? "NOT_FOUND" : code, res.status, `ERP rejected request (${res.status})`);
      }
      if (attempt < attempts) {
        clearTimeout(timer);
        await sleep(waitMs);
        continue;
      }
    } catch (e) {
      if (e instanceof ErpError) {
        if (e.kind !== "UNREACHABLE" && e.kind !== "TIMEOUT") throw e;
        last = e;
      } else if (e instanceof Error && e.name === "AbortError") {
        last = new ErpError("TIMEOUT", 504, "ERP timeout");
      } else {
        last = new ErpError("UNREACHABLE", 503, "ERP unreachable");
      }
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) await sleep(waitMs);
  }
  throw last;
}
