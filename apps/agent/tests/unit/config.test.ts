import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/config";

const SECRET = "s".repeat(40);
const base = { AGENT_HMAC_KEYS: `k1:${SECRET}` };

function issues(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (e) {
    if (e instanceof ConfigError) return [...e.issues];
    throw e;
  }
  return [];
}

describe("loadConfig", () => {
  it("loads safe defaults: loopback, assistant OFF, challenge off", () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ host: "127.0.0.1", port: 8787, ollamaUrl: "http://127.0.0.1:11434", assistantEnabled: false, challengeMode: "off" });
    expect(c.maxBodyBytes).toBe(20_000);
    expect(c.maxMessageChars).toBe(800);
    expect(c.queueMaxDepth).toBe(6);
    expect(c.hmacKeys.get("k1")).toBe(SECRET);
  });

  it("has no default for the signing secrets", () => {
    expect(issues({})).toEqual(["AGENT_HMAC_KEYS is required (no default exists)."]);
  });

  it("rejects short secrets, bad ids and duplicates, and never prints the secret", () => {
    const short = issues({ AGENT_HMAC_KEYS: "k1:tooshort-secret-value" });
    expect(short.join(" ")).toMatch(/at least 32 characters/);
    expect(short.join(" ")).not.toContain("tooshort-secret-value");
    expect(issues({ AGENT_HMAC_KEYS: `bad id:${SECRET}` }).join(" ")).toMatch(/keyId:secret/);
    expect(issues({ AGENT_HMAC_KEYS: `k1:${SECRET},k1:${"t".repeat(40)}` }).join(" ")).toMatch(/more than once/);
    expect(issues({ AGENT_HMAC_KEYS: [1, 2, 3, 4, 5].map((i) => `k${i}:${SECRET}`).join(",") }).join(" ")).toMatch(/at most 4/);
  });

  it("accepts two keys for rotation", () => {
    expect(loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET},k2:${"t".repeat(40)}` }).hmacKeys.size).toBe(2);
  });

  it("refuses a non-loopback bind address unless explicitly overridden", () => {
    expect(issues({ ...base, AGENT_HOST: "0.0.0.0" }).join(" ")).toMatch(/loopback/);
    expect(issues({ ...base, AGENT_HOST: "203.0.113.7" }).join(" ")).toMatch(/loopback/);
    expect(issues({ ...base, AGENT_HOST: "::1" })).toEqual([]);
    expect(issues({ ...base, AGENT_HOST: "0.0.0.0", AGENT_ALLOW_NON_LOOPBACK: "true" })).toEqual([]);
  });

  it("only talks to a loopback Ollama, without credentials", () => {
    expect(issues({ ...base, OLLAMA_URL: "http://10.0.0.5:11434" }).join(" ")).toMatch(/loopback/);
    expect(issues({ ...base, OLLAMA_URL: "https://ollama.com" }).join(" ")).toMatch(/loopback/);
    expect(issues({ ...base, OLLAMA_URL: "ftp://127.0.0.1" }).join(" ")).toMatch(/http or https/);
    expect(issues({ ...base, OLLAMA_URL: "http://user:pw@127.0.0.1:11434" }).join(" ")).toMatch(/credentials/);
    expect(issues({ ...base, OLLAMA_URL: "not a url" }).join(" ")).toMatch(/valid URL/);
    expect(loadConfig({ ...base, OLLAMA_URL: "http://localhost:11434/" }).ollamaUrl).toBe("http://localhost:11434");
  });

  it("supports challenge mode off and on-abuse only, and validates every rate limit", () => {
    expect(loadConfig({ ...base, AI_CHALLENGE_MODE: "on-abuse" }).challengeMode).toBe("on-abuse");
    expect(issues({ ...base, AI_CHALLENGE_MODE: "always" }).join(" ")).toMatch(/"off" or "on-abuse"/);
    expect(issues({ ...base, AI_CHALLENGE_MODE: "on_abuse" }).join(" ")).toMatch(/"off" or "on-abuse"/);
    expect(loadConfig({ ...base }).rate).toEqual({ ipPerMin: 40, sessionPerMin: 15, identityPerMin: 30, maxConcurrent: 2, newSessionsPerHour: 10, authFailPerMin: 20, cooldownAfter: 3, cooldownSec: 60 });
    expect(loadConfig({ ...base, AGENT_RATE_IP_PER_MIN: "5", AGENT_COOLDOWN_SEC: "120" }).rate).toMatchObject({ ipPerMin: 5, cooldownSec: 120 });
    for (const [k, v] of [["AGENT_RATE_IP_PER_MIN", "0"], ["AGENT_RATE_SESSION_PER_MIN", "-1"], ["AGENT_MAX_CONCURRENT_PER_IDENTITY", "99"], ["AGENT_COOLDOWN_SEC", "abc"], ["AGENT_NEW_SESSIONS_PER_HOUR", "1.5"]] as const) {
      expect(issues({ ...base, [k]: v }).join(" "), k).toContain(k);
    }
  });

  it("validates the kill switch and numeric limits with bounds", () => {
    expect(loadConfig({ ...base, AI_ASSISTANT_ENABLED: "true" }).assistantEnabled).toBe(true);
    expect(issues({ ...base, AI_ASSISTANT_ENABLED: "yes" }).join(" ")).toMatch(/"true" or "false"/);
    expect(issues({ ...base, AGENT_MAX_MESSAGE_CHARS: "5000" }).join(" ")).toMatch(/AGENT_MAX_MESSAGE_CHARS/);
    expect(issues({ ...base, AGENT_QUEUE_MAX_DEPTH: "-1" }).join(" ")).toMatch(/AGENT_QUEUE_MAX_DEPTH/);
    expect(issues({ ...base, AGENT_PORT: "abc" }).join(" ")).toMatch(/AGENT_PORT/);
  });

  it("refuses any switch that would log, retain, consent to or train on customer messages", () => {
    for (const name of ["AGENT_LOG_MESSAGES", "AGENT_RETAIN_MESSAGES", "AI_RETENTION_ENABLED", "AI_CONSENT_COLLECTION", "AI_TRAIN_ON_CHATS", "AGENT_RETAIN"]) {
      expect(issues({ ...base, [name]: "true" }).join(" ")).toMatch(/not supported/);
    }
    // An explicit false is harmless; an unrelated variable is ignored.
    expect(issues({ ...base, AGENT_LOG_MESSAGES: "false", SOMETHING_ELSE: "1" })).toEqual([]);
  });

  it("reports every problem at once", () => {
    expect(issues({ AGENT_HOST: "0.0.0.0", AGENT_PORT: "x" }).length).toBeGreaterThanOrEqual(3);
  });
});

describe("AGENT_ENGLISH_MODE", () => {
  it("defaults to router-first, accepts qwen, and rejects anything else", () => {
    expect(loadConfig({ ...base }).englishMode).toBe("router-first");
    expect(loadConfig({ ...base, AGENT_ENGLISH_MODE: "qwen" }).englishMode).toBe("qwen");
    expect(loadConfig({ ...base, AGENT_ENGLISH_MODE: "router-first" }).englishMode).toBe("router-first");
    expect(issues({ ...base, AGENT_ENGLISH_MODE: "model-only" }).join(" ")).toMatch(/AGENT_ENGLISH_MODE/);
  });
});
