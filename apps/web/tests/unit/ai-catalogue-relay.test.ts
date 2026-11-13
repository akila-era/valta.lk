import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAgentRequest } from "@/lib/assistant/sign";
import { resetCatalogueNonces } from "@/lib/assistant/catalogue-auth";
import { ErpError } from "@/lib/erp/errors";

const erpRequest = vi.fn();
vi.mock("@/lib/erp/client", () => ({ erpRequest: (...a: unknown[]) => erpRequest(...a) }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }) }));

import { GET } from "@/app/api/internal/ai/erp/[...path]/route";

const SECRET = "s".repeat(40);
const KEY = "agent1";
const ORIGIN = "https://valta.hexalyte.com";

function setEnv(on = true) {
  vi.stubEnv("AI_CATALOGUE_ENABLED", on ? "true" : "false");
  vi.stubEnv("AI_CATALOGUE_KEY_ID", KEY);
  vi.stubEnv("AI_CATALOGUE_SECRET", SECRET);
}

function call(pathWithQuery: string, over: { identity?: "guest" | "customer"; nowMs?: number; secret?: string; nonce?: string; unsigned?: boolean } = {}) {
  const headers = over.unsigned
    ? {}
    : signAgentRequest({
        keyId: KEY,
        secret: over.secret ?? SECRET,
        method: "GET",
        path: pathWithQuery,
        identity: over.identity === "customer" ? { kind: "customer", customerId: "c1" } : { kind: "guest" },
        clientIp: "203.0.113.5",
        ...(over.nowMs !== undefined ? { nowMs: over.nowMs } : {}),
        ...(over.nonce ? { nonce: over.nonce } : {}),
      });
  const u = new URL(ORIGIN + pathWithQuery);
  const parts = u.pathname.replace("/api/internal/ai/erp/", "").split("/");
  return GET(new Request(ORIGIN + pathWithQuery, { headers }), { params: Promise.resolve({ path: parts }) });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  setEnv();
  resetCatalogueNonces();
  erpRequest.mockReset();
  erpRequest.mockResolvedValue({ items: [], nextCursor: null });
});

describe("AI catalogue relay: access control", () => {
  it("is off (404) unless explicitly enabled", async () => {
    setEnv(false);
    expect((await call("/api/internal/ai/erp/settings")).status).toBe(404);
    expect(erpRequest).not.toHaveBeenCalled();
  });

  it("is off when the key is too short", async () => {
    vi.stubEnv("AI_CATALOGUE_SECRET", "short");
    expect((await call("/api/internal/ai/erp/settings")).status).toBe(404);
  });

  it("answers 404 to unsigned, wrong-key, stale, customer-identity and replayed requests, and never reaches the ERP", async () => {
    const p = "/api/internal/ai/erp/settings";
    expect((await call(p, { unsigned: true })).status).toBe(404);
    expect((await call(p, { secret: "x".repeat(40) })).status).toBe(404);
    expect((await call(p, { nowMs: Date.now() - 5 * 60_000 })).status).toBe(404);
    expect((await call(p, { identity: "customer" })).status).toBe(404);
    expect((await call(p, { nonce: "0123456789abcdef0123456789abcdef" })).status).toBe(200);
    expect((await call(p, { nonce: "0123456789abcdef0123456789abcdef" })).status).toBe(404);
    expect(erpRequest).toHaveBeenCalledTimes(1);
  });

  it("a signature for one path cannot be reused for another (the query is signed too)", async () => {
    const h = signAgentRequest({ keyId: KEY, secret: SECRET, method: "GET", path: "/api/internal/ai/erp/catalogue/products?limit=10", identity: { kind: "guest" }, clientIp: "203.0.113.5" });
    const res = await GET(new Request(ORIGIN + "/api/internal/ai/erp/catalogue/products?limit=100", { headers: h }), { params: Promise.resolve({ path: ["catalogue", "products"] }) });
    expect(res.status).toBe(404);
  });
});

describe("AI catalogue relay: only three read routes", () => {
  it("relays settings, the product list and one product in the ERP's own envelope", async () => {
    erpRequest.mockResolvedValue({ currency: "LKR", ordersEnabled: true, deliveryCharge: "350.00" });
    const s = await call("/api/internal/ai/erp/settings");
    expect(await s.json()).toEqual({ success: true, data: { currency: "LKR", ordersEnabled: true, deliveryCharge: "350.00" } });
    expect(erpRequest.mock.calls[0]![0]).toBe("/settings");

    await call("/api/internal/ai/erp/catalogue/products?limit=100&cursor=abc123");
    expect(erpRequest.mock.calls[1]![0]).toBe("/catalogue/products?limit=100&cursor=abc123");

    await call("/api/internal/ai/erp/catalogue/products/cm0item00000011");
    expect(erpRequest.mock.calls[2]![0]).toBe("/catalogue/products/cm0item00000011");
  });

  it("refuses orders, customers, writes-shaped paths, odd ids, extra query keys and bad limits", async () => {
    for (const p of [
      "/api/internal/ai/erp/orders/ABC123",
      "/api/internal/ai/erp/customers",
      "/api/internal/ai/erp/catalogue/products/..%2Forders",
      "/api/internal/ai/erp/catalogue",
      "/api/internal/ai/erp/catalogue/products/a/b",
    ]) {
      expect((await call(p)).status, p).toBe(404);
    }
    expect((await call("/api/internal/ai/erp/catalogue/products?limit=101")).status).toBe(400);
    expect((await call("/api/internal/ai/erp/catalogue/products?limit=10&updatedSince=2020")).status).toBe(400);
    expect((await call("/api/internal/ai/erp/catalogue/products/x?limit=1")).status).toBe(400);
    expect(erpRequest).not.toHaveBeenCalled();
  });

  it("maps ERP failures to fixed codes without leaking internals", async () => {
    erpRequest.mockRejectedValueOnce(new ErpError("NOT_FOUND", 404, "secret-detail"));
    const nf = await call("/api/internal/ai/erp/catalogue/products/zzz");
    expect(nf.status).toBe(404);
    expect((await nf.json()).error.code).toBe("PRODUCT_NOT_FOUND");
    erpRequest.mockRejectedValueOnce(new ErpError("UNREACHABLE", 503, "connect ECONNREFUSED 10.0.0.1"));
    const down = await call("/api/internal/ai/erp/settings");
    expect(down.status).toBe(503);
    expect(JSON.stringify(await down.json())).not.toMatch(/10\.0\.0\.1|ECONNREFUSED/);
    erpRequest.mockRejectedValueOnce(new ErpError("BAD_RESPONSE", 502, "Unexpected shape"));
    expect((await call("/api/internal/ai/erp/settings")).status).toBe(502);
  });
});
