"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceError } from "@/lib/assistant/voice-client";

/**
 * Plays one spoken reply. The audio is fetched only when asked for (when voice output is on for the latest reply, or when the shopper
 * presses Listen), kept in memory as an object URL and released on unmount. Browsers may refuse to start sound by themselves; in that
 * case the player simply waits in "ready" for the shopper to press play.
 */
export type PlayerPhase = "idle" | "loading" | "ready" | "playing" | "paused" | "ended" | "error";

export interface PlayerDeps {
  createAudio?: (url: string) => HTMLAudioElement;
}

export function useAudioPlayer(fetchAudio: () => Promise<Blob>, deps?: PlayerDeps) {
  const [phase, setPhase] = useState<PlayerPhase>("idle");
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<VoiceError["code"] | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      audio.current?.pause();
      audio.current = null;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
    };
  }, []);

  const attach = useCallback(
    (blob: Blob): HTMLAudioElement => {
      url.current = URL.createObjectURL(blob);
      const el = deps?.createAudio ? deps.createAudio(url.current) : new Audio(url.current);
      el.muted = false;
      el.onplay = () => setPhase("playing");
      el.onpause = () => setPhase((p) => (p === "ended" || p === "error" ? p : "paused"));
      el.onended = () => {
        setProgress(1);
        setPhase("ended");
      };
      el.ontimeupdate = () => setProgress(el.duration > 0 ? el.currentTime / el.duration : 0);
      el.onerror = () => setPhase("error");
      audio.current = el;
      return el;
    },
    [deps],
  );

  /** Fetches the audio (once) and tries to start it. */
  const load = useCallback(async () => {
    if (audio.current || phase === "loading") return;
    setPhase("loading");
    setFailure(null);
    try {
      const blob = await fetchAudio();
      if (!alive.current) return;
      const el = attach(blob);
      setPhase("ready");
      await el.play().catch(() => undefined); // refused autoplay: stay "ready"
    } catch (e) {
      if (!alive.current) return;
      setFailure(e instanceof VoiceError ? e.code : "failed");
      setPhase("error");
    }
  }, [attach, fetchAudio, phase]);

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return void load();
    if (el.paused) void el.play().catch(() => setPhase("error"));
    else el.pause();
  }, [load]);

  const replay = useCallback(() => {
    const el = audio.current;
    if (!el) return void load();
    el.currentTime = 0;
    void el.play().catch(() => setPhase("error"));
  }, [load]);

  const toggleMute = useCallback(() => {
    const el = audio.current;
    setMuted((m) => {
      if (el) el.muted = !m;
      return !m;
    });
  }, []);

  return { phase, muted, progress, failure, load, toggle, replay, toggleMute };
}
