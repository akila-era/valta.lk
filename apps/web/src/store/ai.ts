"use client";

import { useSyncExternalStore } from "react";
import type { Msg } from "@/components/assistant/use-ai-chat";

/**
 * VOLTA AI state that must survive page changes: the conversation (kept for the browser session) and how the
 * assistant is shown. "modal" is the centred window, "dock" a small panel in the corner that leaves the page usable.
 */
export type AiMode = "closed" | "modal" | "dock";
/** Language the shopper speaks to the assistant and wants answers in. Remembered on this device. */
export type AiLang = "en" | "si" | "ta";
interface AiState {
  msgs: Msg[];
  mode: AiMode;
  /** Start listening as soon as the window opens (the home-page face sets this). */
  listen: boolean;
  lang: AiLang;
  /** True (default): the language follows what the shopper writes or says. False once they pick one by hand. */
  langAuto: boolean;
}

const KEY = "valta.ai.v1";
const MAX_MSGS = 30;
const LANG_KEY = "valta.ai.lang";
const LANG_MODE_KEY = "valta.ai.langmode";
const SERVER: AiState = { msgs: [], mode: "closed", listen: false, lang: "en", langAuto: true };

/** Language of a piece of text from its script: Sinhala and Tamil have their own, everything else reads as English. */
export function scriptLang(text: string): AiLang | null {
  if (/[඀-෿]/.test(text)) return "si";
  if (/[஀-௿]/.test(text)) return "ta";
  return /[A-Za-z]{2}/.test(text) ? "en" : null;
}

/** First language the browser lists that the assistant speaks. */
function deviceLang(): AiLang {
  const list = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of list) {
    const base = (l ?? "").slice(0, 2).toLowerCase();
    if (base === "si" || base === "ta") return base;
    if (base === "en") return "en";
  }
  return "en";
}

let state: AiState = SERVER;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    const langAuto = window.localStorage.getItem(LANG_MODE_KEY) !== "manual";
    state = { ...state, langAuto, lang: saved === "en" || saved === "si" || saved === "ta" ? saved : deviceLang() };
  } catch {
    /* storage unavailable */
  }
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as Partial<AiState> | null;
    if (raw && Array.isArray(raw.msgs)) {
      state = { msgs: raw.msgs.slice(-MAX_MSGS), mode: raw.mode === "dock" || raw.mode === "modal" ? raw.mode : "closed", listen: false, lang: state.lang, langAuto: state.langAuto };
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
  /** The shopper picked a language by hand: stop following what they write. */
  setLang: (lang: AiLang) => {
    try {
      window.localStorage.setItem(LANG_KEY, lang);
      window.localStorage.setItem(LANG_MODE_KEY, "manual");
    } catch {
      /* storage unavailable: the choice still applies for this page view */
    }
    set({ lang, langAuto: false });
  },
  /** Back to following what the shopper writes or says. */
  setAuto: () => {
    try {
      window.localStorage.setItem(LANG_MODE_KEY, "auto");
    } catch {
      /* storage unavailable */
    }
    set({ langAuto: true });
  },
  /** Language to answer a message in. In auto mode this also switches (and remembers) the language to match the text. */
  langFor: (text: string): AiLang => {
    const cur = getSnapshot();
    if (!cur.langAuto) return cur.lang;
    const found = scriptLang(text);
    if (!found || found === cur.lang) return cur.lang;
    try {
      window.localStorage.setItem(LANG_KEY, found);
    } catch {
      /* storage unavailable */
    }
    set({ lang: found });
    return found;
  },
  open: (listen = false) => set({ mode: "modal", listen }),
  dock: () => set({ mode: "dock", listen: false }),
  close: () => set({ mode: "closed", listen: false }),
  /** Ask whichever assistant window is open to start listening (a conversation carrying on after a page change). */
  requestListen: () => set({ listen: true }),
  consumeListen: () => state.listen && set({ listen: false }),
  get: () => getSnapshot(),
};

export function useAiStore(): AiState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER);
}
