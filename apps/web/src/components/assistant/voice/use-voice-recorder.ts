"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { realVoiceApi, VoiceError, type VoiceApi } from "@/lib/assistant/voice-client";
import { initialRecorder, MAX_RECORD_SECONDS, MIN_RECORD_SECONDS, recorderReducer, type VoiceErrorCode } from "./recorder-state";

/**
 * Records the shopper's voice in the browser and sends it, only when they press stop, to the transcription route. The microphone is
 * requested when they press the button (never earlier), every track is stopped on stop, cancel, error and unmount, and nothing is
 * stored: the audio lives in memory until it is sent or discarded. The text that comes back is only a suggestion for the text box.
 */
export const WAVE_BARS = 24;

export interface RecorderDeps {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createRecorder?: (stream: MediaStream, mimeType?: string) => MediaRecorder;
  createAnalyser?: (stream: MediaStream) => { read(): number[]; close(): void } | null;
  now?: () => number;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function defaultAnalyser(stream: MediaStream): { read(): number[]; close(): void } | null {
  const Ctx = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctx) return null;
  try {
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    return {
      read() {
        analyser.getByteFrequencyData(data);
        return Array.from({ length: WAVE_BARS }, (_, i) => (data[Math.min(data.length - 1, Math.floor((i / WAVE_BARS) * data.length))] ?? 0) / 255);
      },
      close() {
        void ctx.close().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}

export const recordingSupported = (): boolean => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

export function useVoiceRecorder(opts: { lang: "auto" | "en" | "si"; api?: VoiceApi; deps?: RecorderDeps }) {
  const api = opts.api ?? realVoiceApi;
  const deps = opts.deps;
  const [state, dispatch] = useReducer(recorderReducer, initialRecorder);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: WAVE_BARS }, () => 0));
  const stateRef = useRef(state);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const meter = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyser = useRef<{ read(): number[]; close(): void } | null>(null);
  const startedAt = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const discard = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const releaseDevice = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    if (meter.current) clearInterval(meter.current);
    ticker.current = null;
    meter.current = null;
    analyser.current?.close();
    analyser.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setLevels(Array.from({ length: WAVE_BARS }, () => 0));
  }, []);

  const fail = useCallback(
    (code: VoiceErrorCode) => {
      releaseDevice();
      dispatch({ type: "failed", code });
    },
    [releaseDevice],
  );

  useEffect(
    () => () => {
      discard.current = true;
      abort.current?.abort();
      try {
        if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      } catch {
        /* already stopped */
      }
      releaseDevice();
    },
    [releaseDevice],
  );

  const transcribeNow = useCallback(
    async (blob: Blob) => {
      const controller = new AbortController();
      abort.current = controller;
      try {
        const { text } = await api.transcribe(blob, opts.lang, controller.signal);
        if (!controller.signal.aborted) dispatch({ type: "transcribed", text });
      } catch (e) {
        if (controller.signal.aborted) return;
        dispatch({ type: "failed", code: e instanceof VoiceError ? e.code : "failed" });
      }
    },
    [api, opts.lang],
  );

  const stop = useCallback(() => {
    const rec = recorder.current;
    if (stateRef.current.phase !== "recording" || !rec) return;
    dispatch({ type: "stop" });
    const seconds = ((deps?.now ?? Date.now)() - startedAt.current) / 1000;
    rec.onstop = () => {
      const type = rec.mimeType || "audio/webm";
      const blob = new Blob(chunks.current, { type });
      chunks.current = [];
      releaseDevice();
      if (discard.current) return;
      if (seconds < MIN_RECORD_SECONDS || blob.size === 0) return dispatch({ type: "failed", code: "too_short" });
      void transcribeNow(blob);
    };
    try {
      rec.stop();
    } catch {
      fail("failed");
    }
  }, [deps, fail, releaseDevice, transcribeNow]);

  const start = useCallback(async () => {
    if (stateRef.current.phase === "requesting" || stateRef.current.phase === "recording" || stateRef.current.phase === "transcribing") return;
    discard.current = false;
    dispatch({ type: "request" });
    const getMedia = deps?.getUserMedia ?? (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia ? (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c) : undefined);
    const hasRecorder = deps?.createRecorder !== undefined || typeof MediaRecorder !== "undefined";
    if (!getMedia || !hasRecorder) return fail("unsupported");
    let media: MediaStream;
    try {
      media = await getMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      return fail(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "no_device" : "failed");
    }
    if (discard.current) {
      media.getTracks().forEach((t) => t.stop()); // cancelled while the permission prompt was open
      return;
    }
    stream.current = media;
    try {
      const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported ? MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) : undefined;
      const rec = deps?.createRecorder ? deps.createRecorder(media, mime) : new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.current.push(ev.data);
      };
      recorder.current = rec;
      rec.start(250);
    } catch {
      return fail("unsupported");
    }
    startedAt.current = (deps?.now ?? Date.now)();
    dispatch({ type: "granted" });
    analyser.current = (deps?.createAnalyser ?? defaultAnalyser)(media);
    meter.current = setInterval(() => {
      const next = analyser.current?.read();
      if (next) setLevels(next);
    }, 70);
    ticker.current = setInterval(() => {
      const seconds = ((deps?.now ?? Date.now)() - startedAt.current) / 1000;
      dispatch({ type: "tick", seconds });
      if (seconds >= MAX_RECORD_SECONDS) stop();
    }, 250);
  }, [deps, fail, stop]);

  const cancel = useCallback(() => {
    discard.current = true;
    abort.current?.abort();
    const rec = recorder.current;
    try {
      if (rec && rec.state !== "inactive") rec.stop();
    } catch {
      /* already stopped */
    }
    recorder.current = null;
    chunks.current = [];
    releaseDevice();
    dispatch({ type: "cancel" });
  }, [releaseDevice]);

  const edit = useCallback((text: string) => dispatch({ type: "edit", text }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return { state, levels, start, stop, cancel, edit, reset };
}
