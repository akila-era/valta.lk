"use client";

import { useSyncExternalStore } from "react";
import type { Msg } from "@/components/assistant/use-ai-chat";

/**
 * VOLTA AI state that must survive page changes: the conversation (kept for the browser session) and how the
 * assistant is shown. "modal" is the centred window, "dock" a small panel in the corner that leaves the page usable.
 */
export type AiMode = "closed" | "modal" | "dock";
interface AiState {
  msgs: Msg[];
  mode: AiMode;
  /** Start listening as soon as the window opens (the home-page face sets this). */
  listen: boolean;
}

const KEY = "valta.ai.v1";
const MAX_MSGS = 30;
const SERVER: AiState = { msgs: [], mode: "closed", listen: false };

let state: AiState = SERVER;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as Partial<AiState> | null;
    if (raw && Array.isArray(raw.msgs)) {
      state = { msgs: raw.msgs.slice(-MAX_MSGS), mode: raw.mode === "dock" || raw.mode === "modal" ? raw.mode : "closed", listen: false };
    }
  } catch {
    /* unreadable: start fresh */
  }
}

function set(next: Partial<AiState>) {
  state = { ...state, ...next };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ msgs: state.msgs.slice(-MAX_MSGS), mode: state.mode }));
  } catch {
    /* storage full or unavailable: the chat still works for this page view */
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  load();
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const getSnapshot = () => {
  load();
  return state;
};

export const aiActions = {
  setMsgs: (update: Msg[] | ((m: Msg[]) => Msg[])) => set({ msgs: typeof update === "function" ? update(getSnapshot().msgs) : update }),
  open: (listen = false) => set({ mode: "modal", listen }),
  dock: () => set({ mode: "dock", listen: false }),
  close: () => set({ mode: "closed", listen: false }),
  consumeListen: () => state.listen && set({ listen: false }),
  get: () => getSnapshot(),
};

export function useAiStore(): AiState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER);
}
