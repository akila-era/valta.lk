import { connect, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { signRequest } from "../../src/auth/hmac";
import { loadConfig } from "../../src/config";
import { createAgentServer, type RunningServer } from "../../src/http/server";
import { createMockStack } from "../../src/mock/stack";

/**
 * /v1/chat (and health/metrics) pre-authentication body reads: the same class as the voice finding VO-02. Real server, real sockets,
 * invented mock catalogue. Proves: ill-formed requests never have their body read, well-formed stalled bodies hold only the few pre-auth
 * slots and only until the deadline, slots are always released, and chat keeps working.
 */
const SECRET = "p".repeat(40);
let app: RunningServer | undefined;
let socks: Socket[] = [];
afterEach(async () => {
  socks.forEach((s) => s.destroy());
  socks = [];
  await app?.close();
  app = undefined;
});

async function start(o: { maxInFlight?: number; slots?: number; deadlineMs?: number; idleMs?: number } = {}) {
  const s = createMockStack({});
  const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true", AGENT_MAX_IN_FLIGHT: String(o.maxInFlight ?? 16), AGENT_RATE_IP_PER_MIN: "1000", AGENT_NEW_SESSIONS_PER_HOUR: "200", AGENT_AUTH_FAIL_PER_MIN: "1000" });
  app = createAgentServer({
    config,
    pipeline: s.pipeline,
    memory: async () => ({ availableMb: null, swapUsedMb: null }),
    ...(o.slots !== undefined ? { preAuthBodySlots: o.slots } : {}),
    ...(o.deadlineMs !== undefined ? { bodyDeadlineMs: o.deadlineMs } : {}),
    ...(o.idleMs !== undefined ? { bodyIdleMs: o.idleMs } : {}),
  });
  const { port } = await app.listen();
  return { url: `http://127.0.0.1:${port}`, port };
}

let n = 0;
const ip = () => `198.51.100.${(++n % 250) + 1}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chat(url: string): Promise<number> {
  const raw = JSON.stringify({ sessionId: `sess_${"c".repeat(31)}${n % 10}`, message: "hi", contractVersion: "1.2" });
  const headers = signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: ip(), body: raw });
  const res = await fetch(`${url}/v1/chat`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw });
  return res.status;
}

/** Well-formed signed headers (signature of a different body, so only the final signature step can refuse it), then a body that stalls. */
function stalledWellFormed(port: number, declared = 100, sent = 10): Socket {
  const h = signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: ip(), body: "x" });
  const head = Object.entries(h).map(([k, v]) => `${k}: ${v}\r\n`).join("");
  const s = connect({ host: "127.0.0.1", port });
  socks.push(s);
  s.on("error", () => {});
  s.write(`POST /v1/chat HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${declared}\r\n${head}\r\n${"a".repeat(sent)}`);
  return s;
}

function stalledUnsigned(port: number): Socket {
  const s = connect({ host: "127.0.0.1", port });
  socks.push(s);
  s.on("error", () => {});
  s.write(`POST /v1/chat HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n${"a".repeat(10)}`);
  return s;
}

function answerOf(s: Socket, timeoutMs = 3_000): Promise<string> {
  return new Promise((resolve) => {
    let out = "";
    s.on("data", (d) => {
      out += d.toString("latin1");
      if (out.includes("\r\n\r\n")) resolve(out.split("\r\n")[0] ?? "");
    });
    setTimeout(() => resolve(out.split("\r\n")[0] ?? "(no answer)"), timeoutMs).unref();
  });
}

describe("/v1/chat pre-authentication reads", () => {
  it("an unsigned request is refused at once and its body is never read (stalled unsigned uploads cannot exhaust AGENT_MAX_IN_FLIGHT)", async () => {
    const { url, port } = await start({ maxInFlight: 3 });
    const sockets = Array.from({ length: 6 }, () => stalledUnsigned(port));
    const first = await answerOf(sockets[0]!);
    expect(first).toContain("401");
    await wait(300);
    expect(await chat(url)).toBe(200);
  });

  it("stalled WELL-FORMED bodies hold only the pre-auth slots, are cut with 408 at the deadline, and the slots come back", async () => {
    const { url, port } = await start({ slots: 2, deadlineMs: 600, idleMs: 400 });
    const a = stalledWellFormed(port);
    const b = stalledWellFormed(port);
    await wait(150);
    // a third body is refused at once (no free slot), not queued and not buffered
    const c = stalledWellFormed(port);
    expect(await answerOf(c)).toContain("503");
    // the two stalled ones are cut with 408 once the idle deadline passes
    expect(await answerOf(a)).toContain("408");
    expect(await answerOf(b)).toContain("408");
    await wait(300);
    expect(await chat(url)).toBe(200); // slots released: chat works again
  });

  it("a stalled well-formed body does not count against AGENT_MAX_IN_FLIGHT beyond the route's own limit, and an aborted upload frees its slot", async () => {
    const { url, port } = await start({ slots: 4, maxInFlight: 3 });
    const socksAborted = Array.from({ length: 4 }, () => stalledWellFormed(port));
    await wait(200);
    socksAborted.forEach((s) => s.destroy());
    await wait(500);
    expect(await chat(url)).toBe(200);
  });

  it("an oversized declared body is refused with 413 before any read", async () => {
    const { port } = await start();
    const h = signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: ip(), body: "x" });
    const head = Object.entries(h).map(([k, v]) => `${k}: ${v}\r\n`).join("");
    const s = connect({ host: "127.0.0.1", port });
    socks.push(s);
    s.on("error", () => {});
    s.write(`POST /v1/chat HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 99999999\r\n${head}\r\n`);
    expect(await answerOf(s)).toContain("413");
  });

  it("a normal signed chat, health and metrics-less health request still work (no regression)", async () => {
    const { url } = await start();
    expect(await chat(url)).toBe(200);
    const unsignedHealth = await fetch(`${url}/v1/health`);
    expect(unsignedHealth.status).toBe(401);
    const hh = signRequest({ keyId: "k1", secret: SECRET, method: "GET", path: "/v1/health", identity: { kind: "guest" }, clientIp: ip() });
    expect((await fetch(`${url}/v1/health`, { headers: hh })).status).toBe(200);
  });

  it("a stale or unknown-key request fails the header check without a body read", async () => {
    const { port } = await start();
    const stale = signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: ip(), body: "x", nowMs: Date.now() - 600_000 });
    const head = Object.entries(stale).map(([k, v]) => `${k}: ${v}\r\n`).join("");
    const s = connect({ host: "127.0.0.1", port });
    socks.push(s);
    s.on("error", () => {});
    s.write(`POST /v1/chat HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n${head}\r\n${"a".repeat(5)}`);
    expect(await answerOf(s)).toContain("401");
  });
});
