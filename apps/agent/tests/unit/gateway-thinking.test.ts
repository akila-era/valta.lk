import { describe, expect, it } from "vitest";
import { loadGatewayConfig } from "../../src/gateway/config";
import { BASE_ENV, installNoNetworkGuard, makeHarness, userText } from "./gateway-helpers";

installNoNetworkGuard();

/**
 * Thinking tokens are billed as output and count against the output cap, so the operator must control the thinking level. It is the documented control for
 * current models (generationConfig.thinkingConfig.thinkingLevel, lowercase). These tests use a fake provider only.
 */
describe("GEMINI_THINKING_LEVEL", () => {
  it("is unset by default: no level is imposed", () => {
    const c = loadGatewayConfig(BASE_ENV);
    expect(c.status.state).toBe("ready");
    expect(c.config?.limits.thinkingLevel).toBeUndefined();
  });

  it("accepts the four documented levels, in any letter case", () => {
    for (const v of ["minimal", "LOW", "Medium", "high"]) {
      const c = loadGatewayConfig({ ...BASE_ENV, GEMINI_THINKING_LEVEL: v });
      expect(c.status.state, v).toBe("ready");
      expect(c.config?.limits.thinkingLevel).toBe(v.toLowerCase());
    }
  });

  it("an invalid level is misconfigured, names the variable and never echoes the value", () => {
    const c = loadGatewayConfig({ ...BASE_ENV, GEMINI_THINKING_LEVEL: "TOP_SECRET_xyz" });
    expect(c.status.state).toBe("misconfigured");
    const dump = JSON.stringify(c.status);
    expect(dump).toContain("GEMINI_THINKING_LEVEL");
    expect(dump).not.toContain("TOP_SECRET_xyz");
  });

  it("the configured level reaches the provider request without the caller asking for it", async () => {
    const h = await makeHarness({ GEMINI_THINKING_LEVEL: "minimal" }, [{ kind: "reply", text: "ok", usage: { inputTokens: 10, outputTokens: 2 } }]);
    const r = await h.gateway.generate({ messages: [userText("hello")] }, { sessionId: "s1" });
    expect(r.ok).toBe(true);
    expect(h.provider.requests[0]!.thinkingLevel).toBe("minimal");
  });

  it("a level chosen by the caller wins over the configured one", async () => {
    const h = await makeHarness({ GEMINI_THINKING_LEVEL: "minimal" }, [{ kind: "reply", text: "ok", usage: { inputTokens: 10, outputTokens: 2 } }]);
    await h.gateway.generate({ messages: [userText("hello")], thinkingLevel: "high" }, { sessionId: "s1" });
    expect(h.provider.requests[0]!.thinkingLevel).toBe("high");
  });

  it("without a configured level the request carries none", async () => {
    const h = await makeHarness({}, [{ kind: "reply", text: "ok", usage: { inputTokens: 10, outputTokens: 2 } }]);
    await h.gateway.generate({ messages: [userText("hello")] }, { sessionId: "s1" });
    expect(h.provider.requests[0]!.thinkingLevel).toBeUndefined();
  });
});
