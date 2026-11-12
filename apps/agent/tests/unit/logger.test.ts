import { describe, expect, it } from "vitest";
import { createLogger, type LogEvent } from "../../src/observability/logger";

describe("logger", () => {
  it("writes only allow-listed fields, even if a caller tries to add more", () => {
    const lines: string[] = [];
    const log = createLogger({ write: (l) => lines.push(l) }, () => 0);
    const evil = {
      requestId: "req_1",
      route: "/v1/chat",
      method: "POST",
      status: 200,
      latencyMs: 5,
      message: "CANARY customer text",
      authorization: "Bearer SECRET",
      cart: [{ productId: "p" }],
      phone: "+94771234567",
    } as unknown as LogEvent;
    log.log(evil);
    expect(lines).toHaveLength(1);
    const out = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["latencyMs", "method", "requestId", "route", "status", "ts"]);
    expect(lines[0]).not.toMatch(/CANARY|SECRET|94771234567|productId/);
  });

  it("includes optional diagnostic codes when given", () => {
    const lines: string[] = [];
    createLogger({ write: (l) => lines.push(l) }, () => 0).log({ requestId: "r", route: "/v1/chat", method: "POST", status: 401, latencyMs: 1, identityKind: "none", errorCode: "UNAUTHORIZED", authReason: "STALE" });
    expect(JSON.parse(lines[0]!)).toMatchObject({ errorCode: "UNAUTHORIZED", authReason: "STALE", identityKind: "none", ts: "1970-01-01T00:00:00.000Z" });
  });
});
