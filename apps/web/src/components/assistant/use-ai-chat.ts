"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { aiActions, useAiStore } from "@/store/ai";
import { cartActions, getCartLines } from "@/store/cart";
import { wishlistActions } from "@/store/wishlist";
import { lineKey } from "@/lib/utils/cart-math";
import { uiActions } from "@/store/ui";
import type { AiAction, AiCompareItem, AiProduct } from "@/app/api/store/ai/route";
import type { FaceState } from "./robot-face";

export interface Msg {
  role: "user" | "model";
  text: string;
  products?: AiProduct[];
  compare?: AiCompareItem[];
  notes?: string[];
  error?: boolean;
}

// Minimal typing for the browser speech API (Chrome/Edge/Safari expose it, Firefox does not).
interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};


const setMsgs = aiActions.setMsgs;

/** Short confirmation chip for an action the AI performed. */
const describe = (a: AiAction): string => {
  switch (a.type) {
    case "add_to_cart":
      return `Added ${a.line.name} to your cart`;
    case "open_cart":
      return "Opened your cart";
    case "remove_from_cart":
      return `Removed ${a.name} from your cart`;
    case "set_quantity":
      return `${a.name}: quantity ${a.quantity}`;
    case "clear_cart":
      return "Emptied your cart";
    case "add_to_wishlist":
      return `Saved ${a.item.name} to your wishlist`;
    case "back":
      return "Going back";
    case "scroll":
      return "Scrolling";
    default:
      return "Opening the page";
  }
};

/**
 * The whole AI conversation: messages, voice in (speech recognition), voice out (speech synthesis) and the page actions
 * the AI asks for. Shared by the chat popup and the face on the home page.
 */
export function useAiChat({ active = true, autoListen = false }: { active?: boolean; autoListen?: boolean } = {}) {
  const router = useRouter();
  const path = usePathname();
  // The conversation lives in a store, so it survives page changes and the AI window opening or docking.
  const { msgs } = useAiStore();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [canListen, setCanListen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState("");
  const rec = useRef<Recognition | null>(null);
  const abort = useRef<AbortController | null>(null);
  const speakTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setCanListen(!!recognitionCtor());
  }, []);
  useEffect(() => {
    if (active) return;
    rec.current?.stop();
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [active]);
  useEffect(
    () => () => {
      rec.current?.stop();
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      abort.current?.abort();
    },
    [],
  );

  useEffect(() => {
    // Opened from the home-page face: start listening straight away (the tap counts as the user gesture).
    if (autoListen && canListen) {
      aiActions.consumeListen();
      toggleMic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoListen, canListen]);

  const go = useCallback(
    (href: string) => {
      aiActions.dock(); // keep the chat with the shopper: it shrinks to a corner panel while the page changes
      router.push(href);
    },
    [router],
  );

  const run = useCallback(
    (a: AiAction) => {
      switch (a.type) {
        case "add_to_cart":
          cartActions.add(a.line);
          uiActions.openCart();
          break;
        case "open_cart":
          uiActions.openCart();
          break;
        case "navigate":
          go(a.href);
          break;
        case "back":
          aiActions.dock();
          router.back();
          break;
        case "scroll":
          if (a.direction === "top") window.scrollTo({ top: 0, behavior: "smooth" });
          else if (a.direction === "bottom") window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
          else window.scrollBy({ top: (a.direction === "down" ? 1 : -1) * window.innerHeight * 0.8, behavior: "smooth" });
          break;
        case "remove_from_cart":
        case "set_quantity": {
          const line = getCartLines().find((l) => l.slug === a.slug);
          if (!line) break;
          if (a.type === "remove_from_cart") cartActions.remove(lineKey(line));
          else cartActions.setQuantity(lineKey(line), a.quantity);
          uiActions.openCart();
          break;
        }
        case "clear_cart":
          cartActions.clear();
          break;
        case "add_to_wishlist":
          wishlistActions.add(a.item);
          break;
      }
    },
    [go, router],
  );

  const addCard = useCallback((p: AiProduct) => {
    cartActions.add({ productId: p.id, variantKey: "", slug: p.slug, name: p.name, sku: p.sku, image: p.image ?? undefined, unitPrice: p.price, quantity: 1 });
    uiActions.openCart();
  }, []);

  const send = useCallback(
    async (raw: string, viaVoice = false) => {
      const text = raw.trim();
      if (!text || busy) return;
      const next: Msg[] = [...msgs, { role: "user", text }];
      setMsgs(next);
      setInput("");
      setBusy(true);
      const ctl = new AbortController();
      abort.current = ctl;
      try {
        const res = await fetch("/api/store/ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: next.filter((m) => !m.error).slice(-10).map(({ role, text: t }) => ({ role, text: t })), path, cart: getCartLines().map((l) => ({ slug: l.slug, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice })) }),
          signal: ctl.signal,
        });
        const data = (await res.json()) as { reply?: string; products?: AiProduct[]; compare?: AiCompareItem[]; actions?: AiAction[]; error?: { message: string } };
        if (!res.ok) throw new Error(data.error?.message);
        const reply = data.reply ?? "Done.";
        const notes = (data.actions ?? []).map(describe);
        setMsgs((m) => [...m, { role: "model", text: reply, products: data.compare?.length ? undefined : data.products, compare: data.compare, notes }]);
        // Spoken replies only when the question was spoken; typed questions get a text reply.
        if (viaVoice && speak && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(reply);
          // Some browsers never fire onstart/onend reliably, so the mouth starts right away and a timer is the safety net.
          clearTimeout(speakTimer.current);
          const stop = () => {
            clearTimeout(speakTimer.current);
            setSpeaking(false);
          };
          u.onstart = () => setSpeaking(true);
          u.onend = stop;
          u.onerror = stop;
          setSpeaking(true);
          speakTimer.current = setTimeout(stop, reply.length * 90 + 2500);
          window.speechSynthesis.speak(u);
        }
        data.actions?.forEach(run);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setMsgs((m) => [...m, { role: "model", text: (e as Error).message || "Something went wrong. Please try again.", error: true }]);
      } finally {
        setBusy(false);
      }
    },
    [msgs, busy, path, speak, run],
  );

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  function toggleMic() {
    if (listening) return rec.current?.stop();
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    if (!window.isSecureContext) {
      // Browsers only allow the microphone on https pages or localhost (not on http://192.168.x.x).
      setMsgs((m) => [...m, { role: "model", text: "The microphone only works on a secure page. Open the site through https or http://localhost:3000.", error: true }]);
      return;
    }
    const r = new Ctor();
    // Chrome accepts any BCP-47 tag; use the page/browser language, English as the fallback.
    r.lang = document.documentElement.lang || navigator.language || "en-US";
    r.interimResults = true; // show what is being heard while the shopper speaks
    let lastHeard = "";
    let sent = false;
    r.onresult = (e) => {
      const text = Array.from(e.results, (x) => x[0].transcript).join(" ").trim();
      lastHeard = text;
      if (e.results[e.results.length - 1].isFinal) {
        sent = true;
        setHeard("");
        void sendRef.current(text, true);
      } else setHeard(text);
    };
    r.onend = () => {
      setListening(false);
      setHeard("");
      // Some browsers end without a "final" result: send what was heard rather than dropping it.
      if (!sent && lastHeard) void sendRef.current(lastHeard, true);
    };
    r.onerror = (e) => {
      sent = true; // an error means nothing usable was heard
      setListening(false);
      setHeard("");
      const why = e?.error;
      const text =
        why === "not-allowed" || why === "service-not-allowed"
          ? "The microphone is blocked. Click the lock icon in the address bar, allow the microphone, then tap the robot again."
          : why === "no-speech"
            ? "I didn't hear anything. Tap the robot and try again."
            : why === "audio-capture"
              ? "No microphone was found on this device."
              : why === "network"
                ? "Voice recognition needs an internet connection."
                : why === "aborted"
                  ? ""
                  : "Voice input didn't work. Please try again.";
      if (text) setMsgs((m) => [...m, { role: "model", text, error: true }]);
    };
    rec.current = r;
    setListening(true);
    r.start();
  }

  function reset() {
    abort.current?.abort();
    rec.current?.stop();
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setMsgs([]);
    setBusy(false);
    setInput("");
  }

  const faceState: FaceState = listening ? "listening" : speaking && speak ? "speaking" : busy ? "thinking" : "idle";

  return { msgs, input, setInput, busy, listening, speak, setSpeak, canListen, speaking, heard, go, addCard, send, toggleMic, reset, faceState };
}
