import http from "node:http";
import { connect, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ReplayCache, signRequest } from "../../src/auth/hmac";
import { AbuseGuard, DEFAULT_RATE_CONFIG } from "../../src/security/rate-limit";
import { isVoiceRoute, serveVoice, uploadsInProgress, VoiceService } from "../../src/voice";
import type { VoiceConfig } from "../../src/voice/config";
import { noTtsProvider, type SttProvider } from "../../src/voice/providers";
import { wav } from "../unit/voice-fixtures";

/**
 * VO-02 (voice bodies are read before the signature can be fully checked): the limits that bound what an unauthenticated caller can make
 * the server hold. Real sockets against `serveVoice` mounted on a small server; the engine is a fake. The body timeouts are shortened
 * through the test seams so the tests run in about a second each.
 */
const SECRET = "p".repeat(40);
const keys = new Map([["web1", SECRET]]);
const stt: SttProvider = { name: "fake", async transcribe() { return { text: "ok" }; } };
const cfg = (): VoiceConfig => ({ stt, tts: noTtsProvider, maxSeconds: 30, maxBytes: 5_000_000, concurrency: 1, queueDepth: 0, limits: { sttPerMin: 1000, sttPerHour: 10_000, ttsPerMin: 1000 } });

let server: http.Server;
let port = 0;
let svc: VoiceService;
let socks: Socket[] = [];
let idleMs = 300;
let deadlineMs = 5_000;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const route = new URL(req.url ?? "/", "http://x").pathname;
    if (!isVoiceRoute(route)) {
      res.writeHead(404).end();
      return;
    }
    // a fresh guard per request: the 20-failures-a-minute slow-down is not what these tests are about
    void serveVoice({ req, res, route, requestId: "req_t", voice: svc, keys, replay: new ReplayCache(), guard: new AbuseGuard(DEFAULT_RATE_CONFIG), now: Date.now, bodyIdleMs: idleMs, bodyDeadlineMs: deadlineMs });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => server.close());
afterEach(() => {
  socks.forEach((s) => s.destroy());
  socks = [];
});
const rebuild = () => {
  svc = new VoiceService(cfg());
  idleMs = 300;
  deadlineMs = 5_000;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Headers of a well-formed request whose signature does not belong to the body that follows: only the signature step can refuse it. */
const wellFormed = (): string =>
  Object.entries(signRequest({ keyId: "web1", secret: SECRET, method: "POST", path: "/v1/voice/transcribe", identity: { kind: "guest" }, clientIp: "203.0.113.9", body: Buffer.from("not the body") }))
    .map(([k, v]) => `${k}: ${v}\r\n`)
    .join("");

interface Raw {
  sock: Socket;
  out: () => string;
  closed: Promise<void>;
}
function raw(headers: string, declared: number, send: number): Raw {
  const sock = connect({ host: "127.0.0.1", port });
  sock.on("error", () => {});
  let out = "";
  sock.on("data", (d) => (out += d.toString("latin1")));
  const closed = new Promise<void>((r) => sock.on("close", () => r()));
  sock.write(`POST /v1/voice/transcribe HTTP/1.1\r\nHost: x\r\nContent-Type: audio/wav\r\nContent-Length: ${declared}\r\n${headers}\r\n`);
  if (send > 0) sock.write(Buffer.alloc(send, 0x41));
  socks.push(sock);
  return { sock, out: () => out, closed };
}
const status = (r: Raw): string => /^HTTP\/1\.1 (\d{3})/.exec(r.out())?.[1] ?? "";

describe("headers are checked before any body is read", () => {
  it("missing headers, an unknown key id and a stale timestamp are answered 401 at once, with the body never read and no slot used", async () => {
    rebuild();
    const stale = Object.entries(signRequest({ keyId: "web1", secret: SECRET, method: "POST", path: "/v1/voice/transcribe", identity: { kind: "guest" }, clientIp: "203.0.113.9", body: Buffer.from("x"), nowMs: Date.now() - 600_000 })).map(([k, v]) => `${k}: ${v}\r\n`).join("");
    const unknownKey = Object.entries(signRequest({ keyId: "nope", secret: SECRET, method: "POST", path: "/v1/voice/transcribe", identity: { kind: "guest" }, clientIp: "203.0.113.9", body: Buffer.from("x") })).map(([k, v]) => `${k}: ${v}\r\n`).join("");
    const attempts = [raw("", 4_900_000, 100_000), raw(stale, 4_900_000, 100_000), raw(unknownKey, 4_900_000, 100_000)];
    // Poll for the answers instead of sleeping a fixed time: under the load of the full suite 200 ms was not always enough.
    for (let i = 0; i < 100 && attempts.some((a) => status(a) === ""); i++) await wait(50);
    expect(attempts.map(status)).toEqual(["401", "401", "401"]);
    expect(uploadsInProgress(svc)).toBe(0);
  });
});

describe("only a few bodies are read at once, and a stalled one is cut off", () => {
  it("with capacity 1 + queue 0 the budget is 3: of 10 well-formed stalled uploads 3 are read, 7 get 503 at once, then the 3 get 408 and every slot comes back", async () => {
    rebuild();
    expect(svc.uploadBudget()).toBe(3);
    const ups = Array.from({ length: 10 }, () => raw(wellFormed(), 4_900_000, 1_000));
    await wait(150);
    expect(ups.filter((u) => status(u) === "503").length).toBe(7);
    expect(uploadsInProgress(svc)).toBe(3);
    await wait(idleMs + 400); // the idle timeout
    expect(ups.filter((u) => status(u) === "408").length).toBe(3);
    expect(uploadsInProgress(svc)).toBe(0);
  });

  it("a slow trickle that never goes idle still hits the overall deadline (408)", async () => {
    rebuild();
    idleMs = 5_000;
    deadlineMs = 500;
    const u = raw(wellFormed(), 4_900_000, 10);
    const iv = setInterval(() => u.sock.write("A"), 100);
    await wait(900);
    clearInterval(iv);
    expect(status(u)).toBe("408");
    expect(uploadsInProgress(svc)).toBe(0);
  });

  it("the slot is released on every path: aborted mid-way, too large, and a complete good request", async () => {
    rebuild();
    const aborted = raw(wellFormed(), 4_900_000, 1_000);
    await wait(100);
    expect(uploadsInProgress(svc)).toBe(1);
    aborted.sock.destroy();
    await wait(150);
    expect(uploadsInProgress(svc)).toBe(0);

    const tooLarge = raw(wellFormed(), 6_000_000, 0);
    await wait(150);
    expect(status(tooLarge)).toBe("413");
    expect(uploadsInProgress(svc)).toBe(0);

    const body = wav({ seconds: 1 });
    const res = await fetch(`http://127.0.0.1:${port}/v1/voice/transcribe`, { method: "POST", headers: { "content-type": "audio/wav", ...signRequest({ keyId: "web1", secret: SECRET, method: "POST", path: "/v1/voice/transcribe", identity: { kind: "guest" }, clientIp: "203.0.113.9", body }) }, body: new Uint8Array(body) });
    expect(res.status).toBe(200);
    expect(uploadsInProgress(svc)).toBe(0);
  });

  it("a valid signed upload still works while others are stalled (the budget has room)", async () => {
    rebuild();
    raw(wellFormed(), 4_900_000, 1_000);
    raw(wellFormed(), 4_900_000, 1_000);
    await wait(100);
    const body = wav({ seconds: 1 });
    const res = await fetch(`http://127.0.0.1:${port}/v1/voice/transcribe`, { method: "POST", headers: { "content-type": "audio/wav", ...signRequest({ keyId: "web1", secret: SECRET, method: "POST", path: "/v1/voice/transcribe", identity: { kind: "guest" }, clientIp: "203.0.113.9", body }) }, body: new Uint8Array(body) });
    expect(res.status).toBe(200);
  });
});
