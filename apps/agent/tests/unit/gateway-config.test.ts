import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { checkBaseUrl, describeStatus, loadGatewayConfig } from "../../src/gateway/config";
import { Secret, redactSecrets } from "../../src/gateway/secret";
import { buildGateway } from "../../src/gateway/factory";
import { BASE_ENV, FAKE_KEY, installNoNetworkGuard, networkAttempts } from "./gateway-helpers";

installNoNetworkGuard();

describe("gateway config: Gemini is OFF unless explicitly enabled", () => {
  it("an empty environment is disabled", () => {
    expect(loadGatewayConfig({}).status).toEqual({ state: "disabled" });
  });
  it("GEMINI_ENABLED=false and any other value are disabled even with a key and a model set", () => {
    for (const v of ["false", "", "yes", "1", "TRUE_ISH"]) {
      expect(loadGatewayConfig({ ...BASE_ENV, GEMINI_ENABLED: v }).status.state).toBe("disabled");
    }
  });
  it("is case-insensitive for the word true", () => {
    expect(loadGatewayConfig({ ...BASE_ENV, GEMINI_ENABLED: "TRUE" }).status.state).toBe("ready");
  });
});

describe("gateway config: missing and invalid credentials", () => {
  it("enabled without a key and a model is not_configured and names the variables", () => {
    const l = loadGatewayConfig({ GEMINI_ENABLED: "true" });
    expect(l.status).toEqual({ state: "not_configured", missing: ["GEMINI_API_KEY", "GEMINI_MODEL"] });
    expect(l.config).toBeUndefined();
  });
  it("a blank key counts as missing", () => {
    expect(loadGatewayConfig({ ...BASE_ENV, GEMINI_API_KEY: "   " }).status).toEqual({ state: "not_configured", missing: ["GEMINI_API_KEY"] });
  });
  it("an implausible key is misconfigured and the message never contains the value", () => {
    const bad = "short key with spaces " + FAKE_KEY;
    const l = loadGatewayConfig({ ...BASE_ENV, GEMINI_API_KEY: bad });
    expect(l.status.state).toBe("misconfigured");
    const text = JSON.stringify(l.status);
    expect(text).toContain("GEMINI_API_KEY");
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain("short key");
  });
  it("a key with control characters is refused without echoing it", () => {
    const l = loadGatewayConfig({ ...BASE_ENV, GEMINI_API_KEY: "A".repeat(20) + "\u0007" + "B".repeat(20) });
    expect(l.status.state).toBe("misconfigured");
    expect(JSON.stringify(l.status)).not.toContain("AAAA");
  });
  it("a valid environment is ready; the fast and voice models fall back to the main model", () => {
    const l = loadGatewayConfig({ GEMINI_ENABLED: "true", GEMINI_API_KEY: FAKE_KEY, GEMINI_MODEL: "model-one" });
    expect(l.status).toEqual({ state: "ready" });
    expect(l.config!.models).toEqual({ chat: "model-one", fast: "model-one", voice: "model-one" });
  });
  it("model identifiers are validated", () => {
    for (const bad of ["../x", "a b", "x".repeat(81), "m;rm"]) {
      expect(loadGatewayConfig({ ...BASE_ENV, GEMINI_MODEL: bad }).status.state).toBe("misconfigured");
      expect(loadGatewayConfig({ ...BASE_ENV, GEMINI_FAST_MODEL: bad }).status.state).toBe("misconfigured");
      expect(loadGatewayConfig({ ...BASE_ENV, GEMINI_VOICE_MODEL: bad }).status.state).toBe("misconfigured");
    }
  });
});

describe("gateway config: the base URL", () => {
  const bad: [string, string][] = [
    ["http://generativelanguage.googleapis.com", "https"],
    ["https://user:pw@generativelanguage.googleapis.com", "credentials"],
    ["https://127.0.0.1", "IP"],
    ["https://[::1]", "IP"],
    ["https://localhost", "public host"],
    ["https://intranet", "public host"],
    ["https://generativelanguage.googleapis.com:8443", "port"],
    ["https://generativelanguage.googleapis.com/?key=x", "query"],
    ["https://evil.example.com", "googleapis.com"],
    ["https://googleapis.com.evil.example", "googleapis.com"],
    ["not a url", "valid URL"],
  ];
  for (const [url, rule] of bad) {
    it(`refuses ${url}`, () => {
      const r = checkBaseUrl(url, false);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.rule).toContain(rule);
    });
  }
  it("accepts a Google API host and strips a trailing slash", () => {
    expect(checkBaseUrl("https://generativelanguage.googleapis.com/", false)).toEqual({ ok: true, url: "https://generativelanguage.googleapis.com" });
  });
  it("a custom host needs the explicit flag, and even then must be https, credential-free and not an IP", () => {
    expect(loadGatewayConfig({ ...BASE_ENV, GEMINI_API_BASE_URL: "https://gateway.example.com" }).status.state).toBe("misconfigured");
    expect(loadGatewayConfig({ ...BASE_ENV, GEMINI_API_BASE_URL: "https://gateway.example.com", GEMINI_ALLOW_CUSTOM_API_HOST: "true" }).status.state).toBe("ready");
    expect(loadGatewayConfig({ ...BASE_ENV, GEMINI_API_BASE_URL: "http://gateway.example.com", GEMINI_ALLOW_CUSTOM_API_HOST: "true" }).status.state).toBe("misconfigured");
    expect(loadGatewayConfig({ ...BASE_ENV, GEMINI_API_BASE_URL: "https://10.0.0.5", GEMINI_ALLOW_CUSTOM_API_HOST: "true" }).status.state).toBe("misconfigured");
  });
});

describe("gateway config: limits, budget and resilience values", () => {
  it("defaults match the brief's budget (LKR 3000 / 2400 / 2700 / 300)", () => {
    const c = loadGatewayConfig(BASE_ENV).config!;
    expect(c.budget).toMatchObject({ monthlyLkr: 3000, softLkr: 2400, hardLkr: 2700, reserveLkr: 300, allowUnverifiedPrices: true });
    expect(c.limits).toEqual({ maxInputTokens: 12_000, maxOutputTokens: 800, maxThinkingTokens: 0 });
  });
  it("the unverified-prices flag defaults to false", () => {
    const { GEMINI_ALLOW_UNVERIFIED_PRICES: _drop, ...rest } = BASE_ENV;
    expect(loadGatewayConfig(rest).config!.budget.allowUnverifiedPrices).toBe(false);
  });
  const badValues: [string, string][] = [
    ["GEMINI_MAX_INPUT_TOKENS", "10"],
    ["GEMINI_MAX_INPUT_TOKENS", "abc"],
    ["GEMINI_MAX_OUTPUT_TOKENS", "0"],
    ["GEMINI_MAX_THINKING_TOKENS", "-1"],
    ["GATEWAY_BUDGET_SOFT_LKR", "2800"], // soft above hard
    ["GATEWAY_BUDGET_HARD_LKR", "2900"], // hard + reserve above monthly
    ["GATEWAY_BUDGET_TZ", "Mars/Olympus"],
    ["GATEWAY_REQUEST_TIMEOUT_MS", "5"],
    ["GATEWAY_MAX_ATTEMPTS", "99"],
    ["GATEWAY_LKR_PER_USD", "0"],
    ["GEMINI_ALLOW_UNVERIFIED_PRICES", "maybe"],
  ];
  for (const [name, value] of badValues) {
    it(`${name}=${value} is misconfigured and names the variable`, () => {
      const l = loadGatewayConfig({ ...BASE_ENV, [name]: value });
      expect(l.status.state).toBe("misconfigured");
      expect(JSON.stringify(l.status)).toContain(name);
    });
  }
  it("the exchange rate is configurable", () => {
    expect(loadGatewayConfig({ ...BASE_ENV, GATEWAY_LKR_PER_USD: "310.5" }).config!.budget.lkrPerUsd).toBe(310.5);
  });
});

describe("secret handling", () => {
  it("the key is wrapped: string, JSON, template, inspect and spread never show it", () => {
    const c = loadGatewayConfig(BASE_ENV).config!;
    expect(String(c.apiKey)).toBe("[redacted]");
    expect(`${c.apiKey}`).toBe("[redacted]");
    expect(JSON.stringify(c)).not.toContain(FAKE_KEY);
    expect(inspect(c, { depth: 5 })).not.toContain(FAKE_KEY);
    expect(JSON.stringify({ ...c.apiKey })).toBe("{}");
    expect(c.apiKey.reveal()).toBe(FAKE_KEY);
  });
  it("describeStatus reports which variables are set, never values", () => {
    const l = loadGatewayConfig(BASE_ENV);
    const d = describeStatus(l, BASE_ENV);
    const text = JSON.stringify(d);
    expect(d.variablesSet.GEMINI_API_KEY).toBe(true);
    expect(d.variablesSet.GEMINI_API_BASE_URL).toBe(false);
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain(BASE_ENV.GEMINI_MODEL!);
  });
  it("redactSecrets removes known values and anything shaped like a Google credential", () => {
    const s = new Secret(FAKE_KEY);
    expect(redactSecrets(`oops ${FAKE_KEY} here`, [s])).toBe("oops [redacted] here");
    expect(redactSecrets("k=AIza" + "X".repeat(35))).toBe("k=[redacted]");
    expect(redactSecrets("k=AQ." + "Y".repeat(30))).toBe("k=[redacted]");
    expect(redactSecrets("nothing to hide")).toBe("nothing to hide");
  });
});

describe("disabled by default: zero side effects", () => {
  it("buildGateway with an empty environment makes no fetch call and creates no provider", async () => {
    const { gateway, loaded } = await buildGateway({});
    expect(loaded.status.state).toBe("disabled");
    const r = await gateway.generate({ messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("disabled");
    expect(networkAttempts.count).toBe(0);
  });
  it("the same for not_configured and misconfigured", async () => {
    for (const env of [{ GEMINI_ENABLED: "true" }, { ...BASE_ENV, GEMINI_API_BASE_URL: "http://x.example.com" }]) {
      const { gateway } = await buildGateway(env);
      const r = await gateway.generate({ messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("not_configured");
    }
    expect(networkAttempts.count).toBe(0);
  });
});

describe(".env.example", () => {
  const text = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
  it("lists the Gemini variables as empty placeholders and holds no credential", () => {
    for (const name of ["GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_FAST_MODEL", "GEMINI_VOICE_MODEL", "GEMINI_API_BASE_URL", "GEMINI_ENABLED", "GEMINI_MAX_INPUT_TOKENS", "GEMINI_MAX_OUTPUT_TOKENS", "GEMINI_MAX_THINKING_TOKENS"]) {
      expect(text).toMatch(new RegExp(`^${name}=`, "m"));
    }
    expect(text).toMatch(/^GEMINI_API_KEY=\s*$/m);
    expect(text).toMatch(/^GEMINI_ENABLED=false\s*$/m);
    expect(text).not.toMatch(/AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_-]{20,}/);
  });
});
