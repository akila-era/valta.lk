"use client";

import { useSyncExternalStore } from "react";
import type { AiAction, AiCompareItem, AiProduct } from "@/app/api/store/ai/route";

/**
 * Real-time voice agent on Gemini Live. The microphone streams to Gemini over a WebSocket while the shopper talks; Gemini
 * hears the speech itself (English, Sinhala, Tamil...), answers with its own voice, can be interrupted mid-sentence, and
 * calls the shop tools (search, compare, cart, navigate) which run on our server via /api/store/ai/tool.
 *
 * One session lives at module level, so it keeps going while the AI window moves between the page and the corner chat.
 * The browser only ever holds a short-lived token minted by /api/store/ai/live; the real API key stays on the server.
 */
const WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const IN_RATE = 16_000; // what Gemini wants from the microphone
const OUT_RATE = 24_000; // what Gemini sends back
const IDLE_MS = 60_000; // nobody talking and nothing being said for this long: end the session (saves quota)

export interface LiveState {
  status: "idle" | "connecting" | "live";
  speaking: boolean;
  /** Microphone loudness, 0 to 1. */
  level: number;
}

export interface ToolOutcome {
  products: AiProduct[];
  compare: AiCompareItem[];
  actions: AiAction[];
}

export interface LiveOptions {
  path: string;
  getCart: () => { slug: string; name: string; quantity: number; unitPrice: number }[];
  onUserText: (chunk: string) => void;
  onModelText: (chunk: string) => void;
  onTurnEnd: () => void;
  onTool: (out: ToolOutcome) => void;
  onEnd: (reason: "user" | "idle" | "closed" | "error") => void;
}

export type StartResult = { ok: true } | { ok: false; reason: "denied" | "no-mic" | "busy" | "failed"; message: string };

let state: LiveState = { status: "idle", speaking: false, level: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<LiveState>) => {
  const next = { ...state, ...patch };
  if (next.status === state.status && next.speaking === state.speaking && next.level === state.level) return;
  state = next;
  listeners.forEach((l) => l());
};
export const useLiveState = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );

export const canLive = () =>
  typeof window !== "undefined" && window.isSecureContext && typeof WebSocket !== "undefined" && typeof AudioContext !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

interface Session {
  end: (reason: "user" | "idle" | "closed" | "error") => void;
  setMuted: (m: boolean) => void;
}
let session: Session | null = null;
let muted = false;

export const liveActive = () => session !== null;
export const stopLive = () => session?.end("user");
export const setLiveMuted = (m: boolean) => {
  muted = m;
  session?.setMuted(m);
};

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Microphone samples at the device rate -> 16 kHz 16-bit PCM (simple averaging, plenty for speech). */
function toPcm16(input: Float32Array, fromRate: number): Int16Array {
  const ratio = fromRate / IN_RATE;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.min(input.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = Math.max(-1, Math.min(1, sum / (b - a))) * 0x7fff;
  }
  return out;
}

export async function startLive(o: LiveOptions): Promise<StartResult> {
  if (session) return { ok: true };
  set({ status: "connecting", speaking: false, level: 0 });
  // Audio contexts are created right now, inside the tap, so the browser lets them play later.
  const inCtx = new AudioContext();
  const outCtx = new AudioContext({ sampleRate: OUT_RATE });
  void inCtx.resume();
  void outCtx.resume();
  let stream: MediaStream | undefined;
  let ws: WebSocket | undefined;
  // eslint-disable-next-line prefer-const -- assigned once the socket is ready, read by end() earlier
  let proc: ScriptProcessorNode | undefined;
  // eslint-disable-next-line prefer-const -- same
  let timer: ReturnType<typeof setInterval> | undefined;
  let ended = false;
  let ready = false;
  const gain = outCtx.createGain();
  gain.gain.value = muted ? 0 : 1;
  gain.connect(outCtx.destination);
  const playing = new Set<AudioBufferSourceNode>();
  let nextAt = 0;
  let lastActivity = Date.now();

  const end = (reason: "user" | "idle" | "closed" | "error") => {
    if (ended) return;
    ended = true;
    if (timer) clearInterval(timer);
    try {
      ws?.close();
    } catch {}
    proc?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    playing.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    void inCtx.close();
    void outCtx.close();
    session = null;
    set({ status: "idle", speaking: false, level: 0 });
    if (ready) o.onEnd(reason);
  };
  const fail = (reason: "denied" | "no-mic" | "busy" | "failed", message: string): StartResult => {
    end("error");
    return { ok: false, reason, message };
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === "NotAllowedError" || name === "SecurityError") return fail("denied", "The microphone is blocked. Click the lock icon in the address bar, allow the microphone, then tap the robot again.");
    if (name === "NotFoundError" || name === "OverconstrainedError") return fail("no-mic", "No microphone was found on this device.");
    return fail("failed", "The microphone could not be opened.");
  }

  let setup: { token: string; model: string; systemInstruction: string; tools: unknown };
  try {
    const res = await fetch("/api/store/ai/live", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const data = (await res.json()) as Partial<typeof setup> & { error?: { message?: string } };
    if (!res.ok || !data.token) return fail(res.status === 429 ? "busy" : "failed", data.error?.message ?? "The live voice assistant could not start just now.");
    setup = data as typeof setup;
  } catch {
    return fail("failed", "The live voice assistant could not start just now.");
  }
  if (ended) return { ok: false, reason: "failed", message: "" };

  const opened = new Promise<boolean>((resolve) => {
    const sock = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(setup.token)}`);
    ws = sock;
    const giveUp = setTimeout(() => resolve(false), 10_000);
    let queue: Promise<void> = Promise.resolve(); // messages are handled one after another, in order
    sock.onopen = () =>
      sock.send(
        JSON.stringify({
          setup: {
            model: setup.model,
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } },
            systemInstruction: { parts: [{ text: `${setup.systemInstruction}\n(The shopper is currently on page: ${o.path})` }] },
            tools: setup.tools,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            contextWindowCompression: { slidingWindow: {} }, // lets a long conversation run past the 15 minute audio limit
          },
        }),
      );
    sock.onmessage = (e) => {
      queue = queue.then(async () => {
        const raw = typeof e.data === "string" ? e.data : await (e.data as Blob).text();
        let d: ServerMessage;
        try {
          d = JSON.parse(raw) as ServerMessage;
        } catch {
          return;
        }
        if (d.setupComplete) {
          clearTimeout(giveUp);
          resolve(true);
          return;
        }
        handle(d);
      });
    };
    sock.onerror = () => resolve(false);
    sock.onclose = () => {
      clearTimeout(giveUp);
      resolve(false);
      end("closed");
    };
  });

  interface ServerMessage {
    setupComplete?: unknown;
    serverContent?: {
      modelTurn?: { parts?: { inlineData?: { data: string } }[] };
      inputTranscription?: { text?: string };
      outputTranscription?: { text?: string };
      interrupted?: boolean;
      turnComplete?: boolean;
    };
    toolCall?: { functionCalls?: { id: string; name: string; args?: Record<string, unknown> }[] };
  }

  const stopPlayback = () => {
    playing.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    playing.clear();
    nextAt = 0;
  };
  const play = (b64: string) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const buf = outCtx.createBuffer(1, pcm.length, OUT_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    const at = Math.max(nextAt, outCtx.currentTime + 0.03);
    src.start(at);
    nextAt = at + buf.duration;
    playing.add(src);
    src.onended = () => playing.delete(src);
  };

  const handle = (d: ServerMessage) => {
    const sc = d.serverContent;
    if (sc) {
      for (const p of sc.modelTurn?.parts ?? []) {
        if (p.inlineData?.data) {
          play(p.inlineData.data);
          lastActivity = Date.now();
        }
      }
      if (sc.inputTranscription?.text) {
        lastActivity = Date.now();
        o.onUserText(sc.inputTranscription.text);
      }
      if (sc.outputTranscription?.text) o.onModelText(sc.outputTranscription.text);
      if (sc.interrupted) {
        stopPlayback(); // the shopper spoke over the answer: stop talking at once
        o.onTurnEnd();
      }
      if (sc.turnComplete) o.onTurnEnd();
    }
    const calls = d.toolCall?.functionCalls;
    if (calls?.length) {
      lastActivity = Date.now();
      void Promise.all(
        calls.map(async (c) => {
          let result: unknown = { error: "Tool failed." };
          try {
            const res = await fetch("/api/store/ai/tool", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: c.name, args: c.args ?? {}, cart: o.getCart() }),
            });
            const out = (await res.json()) as Partial<ToolOutcome> & { result?: unknown };
            if (res.ok) {
              result = out.result;
              o.onTool({ products: out.products ?? [], compare: out.compare ?? [], actions: out.actions ?? [] });
            }
          } catch {}
          return { id: c.id, name: c.name, response: { result } };
        }),
      ).then((functionResponses) => {
        if (!ended && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
      });
    }
  };

  if (!(await opened)) return fail("failed", "I couldn't connect to the live voice assistant. Please try again.");
  if (ended) return { ok: false, reason: "failed", message: "" };

  // Microphone -> Gemini
  const src = inCtx.createMediaStreamSource(stream);
  proc = inCtx.createScriptProcessor(4096, 1, 1);
  const silent = inCtx.createGain();
  silent.gain.value = 0; // the processor must be connected to run, but must not play the mic back
  let lastLevel = 0;
  proc.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    if (ws?.readyState === WebSocket.OPEN) {
      const pcm = toPcm16(input, inCtx.sampleRate);
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: toBase64(new Uint8Array(pcm.buffer)), mimeType: `audio/pcm;rate=${IN_RATE}` } } }));
    }
    const now = performance.now();
    if (now - lastLevel > 60) {
      lastLevel = now;
      let sum = 0;
      for (let i = 0; i < input.length; i += 4) sum += input[i] * input[i];
      set({ level: Math.min(1, Math.sqrt(sum / (input.length / 4)) * 6) });
    }
  };
  src.connect(proc);
  proc.connect(silent);
  silent.connect(inCtx.destination);

  ready = true;
  lastActivity = Date.now();
  session = {
    end,
    setMuted: (m) => {
      gain.gain.value = m ? 0 : 1;
    },
  };
  timer = setInterval(() => {
    const speaking = nextAt - outCtx.currentTime > 0.05;
    set({ speaking });
    if (speaking) lastActivity = Date.now();
    else if (Date.now() - lastActivity > IDLE_MS) end("idle");
  }, 120);
  set({ status: "live" });
  return { ok: true };
}
