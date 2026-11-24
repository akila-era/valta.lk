import { afterEach, describe, expect, it, vi } from "vitest";
import { readVoiceCapabilities } from "@/lib/assistant/voice-config";
import { MAX_AUDIO_BYTES, MAX_TRANSCRIPT_CHARS, realVoiceApi, SPEAK_URL, TRANSCRIBE_URL, VoiceError } from "@/lib/assistant/voice-client";
import { formatDuration, initialRecorder, MAX_RECORD_SECONDS, recorderReducer, type RecorderEvent, type RecorderState } from "@/components/assistant/voice/recorder-state";

const run = (events: RecorderEvent[], from: RecorderState = initialRecorder) => events.reduce(recorderReducer, from);

describe("recording state machine", () => {
  it("goes idle, requesting, recording, transcribing, preview", () => {
    expect(run([{ type: "request" }]).phase).toBe("requesting");
    expect(run([{ type: "request" }, { type: "granted" }])).toEqual({ phase: "recording", seconds: 0 });
    expect(run([{ type: "request" }, { type: "granted" }, { type: "tick", seconds: 7.4 }])).toEqual({ phase: "recording", seconds: 7.4 });
    expect(run([{ type: "request" }, { type: "granted" }, { type: "stop" }]).phase).toBe("transcribing");
    expect(run([{ type: "request" }, { type: "granted" }, { type: "stop" }, { type: "transcribed", text: "show me phones" }])).toEqual({ phase: "preview", text: "show me phones" });
  });

  it("lets the shopper edit the recognised text, and bounds it", () => {
    const preview: RecorderState = { phase: "preview", text: "show me phones" };
    expect(run([{ type: "edit", text: "show me laptops" }], preview)).toEqual({ phase: "preview", text: "show me laptops" });
    expect((run([{ type: "edit", text: "x".repeat(2000) }], preview) as { text: string }).text).toHaveLength(800);
  });

  it("cancels from requesting, recording and transcribing, back to idle", () => {
    for (const events of [[{ type: "request" }], [{ type: "request" }, { type: "granted" }], [{ type: "request" }, { type: "granted" }, { type: "stop" }]] as RecorderEvent[][]) {
      expect(run([...events, { type: "cancel" }]).phase).toBe("idle");
    }
  });

  it("does not let a cancel discard a preview the shopper is editing", () => {
    expect(run([{ type: "cancel" }], { phase: "preview", text: "hello" })).toEqual({ phase: "preview", text: "hello" });
  });

  it("clamps the timer at the maximum length", () => {
    expect(run([{ type: "request" }, { type: "granted" }, { type: "tick", seconds: 999 }])).toEqual({ phase: "recording", seconds: MAX_RECORD_SECONDS });
  });

  it("treats an empty transcription as a failure, never a blank preview", () => {
    const s = run([{ type: "request" }, { type: "granted" }, { type: "stop" }, { type: "transcribed", text: "   " }]);
    expect(s).toEqual({ phase: "error", code: "failed" });
  });

  it("moves to an error from any active state, and an error can be retried or reset", () => {
    for (const code of ["unsupported", "denied", "no_device", "too_short", "unavailable", "too_large", "rate_limited", "failed"] as const) {
      expect(run([{ type: "request" }, { type: "failed", code }])).toEqual({ phase: "error", code });
    }
    expect(run([{ type: "request" }, { type: "failed", code: "denied" }, { type: "request" }]).phase).toBe("requesting");
    expect(run([{ type: "request" }, { type: "failed", code: "denied" }, { type: "reset" }]).phase).toBe("idle");
  });

  it("ignores events that do not fit the current state", () => {
    expect(run([{ type: "granted" }])).toEqual(initialRecorder);
    expect(run([{ type: "stop" }])).toEqual(initialRecorder);
    expect(run([{ type: "transcribed", text: "x" }])).toEqual(initialRecorder);
    expect(run([{ type: "failed", code: "failed" }])).toEqual(initialRecorder); // nothing to fail when idle
    expect(run([{ type: "request" }, { type: "request" }]).phase).toBe("requesting");
    expect(run([{ type: "tick", seconds: 3 }], { phase: "preview", text: "t" })).toEqual({ phase: "preview", text: "t" });
  });

  it("formats the timer as minutes and seconds", () => {
    expect([0, 7, 59, 60, 83.9].map(formatDuration)).toEqual(["0:00", "0:07", "0:59", "1:00", "1:23"]);
  });
});

describe("voice capabilities", () => {
  it("are all off unless listed, in any case and with spaces", () => {
    expect(readVoiceCapabilities({})).toEqual({ stt: false, tts: false });
    expect(readVoiceCapabilities({ AI_ASSISTANT_VOICE: "" })).toEqual({ stt: false, tts: false });
    expect(readVoiceCapabilities({ AI_ASSISTANT_VOICE: "stt" })).toEqual({ stt: true, tts: false });
    expect(readVoiceCapabilities({ AI_ASSISTANT_VOICE: "tts" })).toEqual({ stt: false, tts: true });
    expect(readVoiceCapabilities({ AI_ASSISTANT_VOICE: " STT , tts " })).toEqual({ stt: true, tts: true });
    expect(readVoiceCapabilities({ AI_ASSISTANT_VOICE: "true" })).toEqual({ stt: false, tts: false });
  });
});

describe("voice client (talks only to this site's two routes; nothing is faked)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const audio = (n = 1000, type = "audio/webm") => new Blob([new Uint8Array(n)], { type });
  const stub = (res: Response | Error) => {
    const fn = vi.fn(async () => {
      if (res instanceof Error) throw res;
      return res;
    });
    vi.stubGlobal("fetch", fn);
    return fn;
  };

  it("sends the recording to the transcription route as it is and returns bounded, single-spaced text", async () => {
    const fn = stub(new Response(JSON.stringify({ text: `  show   me\nphones ${"x".repeat(2000)}` }), { status: 200 }));
    const out = await realVoiceApi.transcribe(audio(), "auto");
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${TRANSCRIBE_URL}?lang=auto`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("audio/webm");
    expect(out.text.startsWith("show me phones")).toBe(true);
    expect(out.text.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS);
    expect(out.text).not.toMatch(/\n|\s{2}/);
  });

  it.each([
    [404, "unavailable"],
    [501, "unavailable"],
    [405, "unavailable"],
    [413, "too_large"],
    [429, "rate_limited"],
    [500, "failed"],
    [503, "failed"],
  ])("maps HTTP %i from the transcription route to %s", async (status, code) => {
    stub(new Response("{}", { status }));
    await expect(realVoiceApi.transcribe(audio(), "en")).rejects.toMatchObject({ code });
  });

  it("fails clearly on a network error, bad JSON or a wrong shape, and refuses empty or oversized audio before any request", async () => {
    stub(new Error("offline"));
    await expect(realVoiceApi.transcribe(audio(), "en")).rejects.toMatchObject({ code: "failed" });
    stub(new Response("not json", { status: 200 }));
    await expect(realVoiceApi.transcribe(audio(), "en")).rejects.toMatchObject({ code: "failed" });
    stub(new Response(JSON.stringify({ text: 42 }), { status: 200 }));
    await expect(realVoiceApi.transcribe(audio(), "en")).rejects.toBeInstanceOf(VoiceError);
    const fn = stub(new Response("{}", { status: 200 }));
    await expect(realVoiceApi.transcribe(audio(0), "en")).rejects.toMatchObject({ code: "too_large" });
    await expect(realVoiceApi.transcribe(audio(MAX_AUDIO_BYTES + 1), "en")).rejects.toMatchObject({ code: "too_large" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("asks the speech route for audio, and accepts only a real audio response", async () => {
    const fn = stub(new Response(new Uint8Array(100), { status: 200, headers: { "content-type": "audio/wav" } }));
    const blob = await realVoiceApi.speak("Hello there", "en");
    expect(blob.size).toBe(100);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SPEAK_URL);
    expect(JSON.parse(String(init.body))).toEqual({ text: "Hello there", lang: "en" });
    stub(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(realVoiceApi.speak("x", "en")).rejects.toMatchObject({ code: "failed" });
    stub(new Response(new Uint8Array(0), { status: 200, headers: { "content-type": "audio/wav" } }));
    await expect(realVoiceApi.speak("x", "en")).rejects.toMatchObject({ code: "failed" });
    stub(new Response("{}", { status: 404 }));
    await expect(realVoiceApi.speak("x", "si")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("never talks to any other address, and never sends credentials of its own", async () => {
    const fn = stub(new Response(JSON.stringify({ text: "hi" }), { status: 200 }));
    await realVoiceApi.transcribe(audio(), "si");
    stub(new Response(new Uint8Array(10), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    await realVoiceApi.speak("hi", "si");
    const all = [...fn.mock.calls].map((c) => String((c as unknown[])[0]));
    for (const u of all) expect(u.startsWith("/api/assistant/voice/")).toBe(true);
  });
});
