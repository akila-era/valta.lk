import { describe, expect, it } from "vitest";
import { signAgentRequest } from "@/lib/assistant/sign";
import { audioKindOf, looksLikeAudio, readBodyCapped, BodyTooLarge, signAgentBytes } from "@/lib/assistant/voice-agent";

describe("signAgentBytes", () => {
  it("produces exactly the same signature as the chat signer for the same text body (one canonical string)", () => {
    const common = { keyId: "web1", secret: "k".repeat(40), method: "POST", path: "/v1/voice/speak", identity: { kind: "guest" } as const, clientIp: "203.0.113.1", nowMs: 1_700_000_000_000, nonce: "n".repeat(32) };
    const body = '{"text":"hi","lang":"en"}';
    expect(signAgentBytes({ ...common, body: Buffer.from(body) })).toEqual(signAgentRequest({ ...common, body }));
  });
  it("signs binary bytes that are not valid UTF-8 without any string conversion", () => {
    const common = { keyId: "web1", secret: "k".repeat(40), method: "POST", path: "/v1/voice/transcribe", identity: { kind: "guest" } as const, clientIp: "203.0.113.1", nowMs: 1_700_000_000_000, nonce: "n".repeat(32) };
    const a = signAgentBytes({ ...common, body: Uint8Array.from([0xff, 0xfe, 0x00, 0x80]) });
    const b = signAgentBytes({ ...common, body: Uint8Array.from([0xff, 0xfe, 0x00, 0x81]) });
    expect(a["x-volta-signature"]).not.toBe(b["x-volta-signature"]);
  });
});

describe("first-bytes checks", () => {
  const ascii = (s: string, n = 24) => Buffer.concat([Buffer.from(s, "latin1"), Buffer.alloc(n)]);
  it("accepts the four container signatures and nothing else", () => {
    expect(looksLikeAudio(Buffer.concat([Buffer.from("RIFF\0\0\0\0WAVE", "latin1"), Buffer.alloc(8)]))).toBe(true);
    expect(looksLikeAudio(ascii("OggS"))).toBe(true);
    expect(looksLikeAudio(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(16)]))).toBe(true);
    expect(looksLikeAudio(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypM4A ", "latin1"), Buffer.alloc(8)]))).toBe(true);
    expect(looksLikeAudio(ascii("<html>"))).toBe(false);
    expect(looksLikeAudio(Buffer.from("PK\x03\x04", "latin1"))).toBe(false);
    expect(looksLikeAudio(Buffer.alloc(0))).toBe(false);
  });
  it("audioKindOf allows only wav and mp3 for replies", () => {
    expect(audioKindOf(Buffer.concat([Buffer.from("RIFF\0\0\0\0WAVE", "latin1"), Buffer.alloc(8)]))).toBe("audio/wav");
    expect(audioKindOf(Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.alloc(16)]))).toBe("audio/mpeg");
    expect(audioKindOf(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0]), Buffer.alloc(16)]))).toBe("audio/mpeg");
    expect(audioKindOf(ascii("OggS"))).toBeNull();
    expect(audioKindOf(ascii("<script>"))).toBeNull();
  });
});

describe("readBodyCapped", () => {
  it("stops reading once the cap is passed", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(1000)); } });
    const req = new Request("http://x/", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readBodyCapped(req, 5_000)).rejects.toBeInstanceOf(BodyTooLarge);
    expect(pulled).toBeLessThan(50); // it did not keep consuming an endless body
  });
});
