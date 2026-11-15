import { afterEach, describe, expect, it } from "vitest";
import { signRequest } from "../../src/auth/hmac";
import { loadConfig } from "../../src/config";
import { createAgentServer, type RunningServer } from "../../src/http/server";
import { createMockStack } from "../../src/mock/stack";
import { VoiceService } from "../../src/voice";
import type { VoiceConfig } from "../../src/voice/config";
import { noSttProvider, noTtsProvider, type SttProvider } from "../../src/voice/providers";
import { wav } from "../unit/voice-fixtures";

/**
 * The voice routes mounted on the REAL Agent server (createAgentServer), not on a harness. Proves the wiring only: when no engine is configured the
 * routes do not exist, when one is they are signed, replay-protected and reach the provider, and chat is unaffected. The engine is a FAKE.
 */
const SECRET = "v".repeat(40);
let app: RunningServer | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const fakeStt: SttProvider = { name: "fake", async transcribe() { return { text: "mata laptop ekak oni", language: "si" }; } } as unknown as SttProvider;

async function start(withVoice: boolean) {
  const s = createMockStack({});
  const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true" });
  const vcfg: VoiceConfig = { stt: fakeStt, tts: noTtsProvider, maxSeconds: 30, maxBytes: 5_000_000, concurrency: 1, queueDepth: 1, limits: { sttPerMin: 5, sttPerHour: 100, ttsPerMin: 5 } };
  app = createAgentServer({ config, pipeline: s.pipeline, memory: async () => ({ availableMb: null, swapUsedMb: null }), ...(withVoice ? { voice: new VoiceService(vcfg) } : {}) });
  return `http://127.0.0.1:${(await app.listen()).port}`;
}

const audio = (): Buffer => Buffer.from(wav({ seconds: 1 }));
function sendAudio(url: string, o: { unsigned?: boolean; nonce?: string } = {}) {
  const body = audio();
  const path = "/v1/voice/transcribe";
  const headers = o.unsigned ? {} : signRequest({ keyId: "k1", secret: SECRET, method: "POST", path, identity: { kind: "guest" }, clientIp: "203.0.113.9", body, ...(o.nonce ? { nonce: o.nonce } : {}) });
  return fetch(`${url}${path}?lang=si`, { method: "POST", headers: { "content-type": "audio/wav", ...headers }, body });
}

describe("voice routes on the real Agent server", () => {
  it("do not exist when no engine is configured (404, like any unknown path)", async () => {
    const url = await start(false);
    expect((await sendAudio(url)).status).toBe(404);
  });

  it("refuse an unsigned request", async () => {
    const url = await start(true);
    expect((await sendAudio(url, { unsigned: true })).status).toBe(401);
  });

  it("serve a signed request and refuse its replay", async () => {
    const url = await start(true);
    const nonce = "ab12".repeat(8);
    const first = await sendAudio(url, { nonce });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { text?: string }).text).toBe("mata laptop ekak oni");
    expect((await sendAudio(url, { nonce })).status).toBe(401);
  });

  it("leave the chat route working", async () => {
    const url = await start(true);
    const raw = JSON.stringify({ sessionId: "sess_" + "a".repeat(32), message: "hi", contractVersion: "1.2" });
    const headers = signRequest({ keyId: "k1", secret: SECRET, method: "POST", path: "/v1/chat", identity: { kind: "guest" }, clientIp: "203.0.113.9", body: raw });
    const res = await fetch(`${url}/v1/chat`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw });
    expect(res.status).toBe(200);
  });

  it("keep unrelated unknown paths at 404", async () => {
    const url = await start(true);
    expect((await fetch(`${url}/v1/voice/other`)).status).toBe(404);
  });
});

void noSttProvider;
