"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SendHorizontal, Sparkles, X } from "lucide-react";
import { cartActions, useCart } from "@/store/cart";
import { lineKey } from "@/lib/utils/cart-math";
import { realVoiceApi, type VoiceApi } from "@/lib/assistant/voice-client";
import type { AgentAction, AgentCard, PublicChatResponse } from "@/lib/assistant/schema";
import { AssistantCards, CartProposalConfirm } from "./cards";
import { labels } from "./labels";
import { BrandMark, ClearConfirm, LanguageSelector, PanelHeader, SpokenReply, TypingIndicator, Welcome, type Locale } from "./panel-parts";
import type { AssistantLang, CartAction, ProductCardData } from "./types";
import { useVoiceRecorder, type RecorderDeps } from "./voice/use-voice-recorder";
import { VoiceComposer, MicButton } from "./voice/voice-ui";

/**
 * VOLTA AI: the shopping assistant modal (bottom left on desktop, full screen on a phone; the store's WhatsApp chat stays bottom
 * right). It talks only to /api/assistant/chat on this site. Cards (products, comparison, stock, accessories, cart) come from the
 * Agent and are shown as received; cart changes are proposals applied to the browser cart only after the shopper presses Confirm,
 * once each. The conversation lives in this page's memory only: nothing is stored, and closing the tab forgets it.
 *
 * Voice is optional and OFF unless the server says the voice routes exist: the microphone button then records, sends the audio to the
 * transcription route, and puts the recognised text in an editable box; only text the shopper confirms goes to the chat route.
 * Spoken replies use the text-to-speech route. When voice is not available the buttons stay visible and say so.
 */
type Entry =
  | { id: number; role: "you"; text: string }
  | { id: number; role: "assistant"; text: string; cards: AgentCard[]; actions: AgentAction[]; names: Record<string, string>; suggestions: string[]; lang: AssistantLang; review: boolean; spoken: boolean }
  | { id: number; role: "error"; text: string; retry?: string };

const STARTERS = ["Show me phones", "Show me laptops", "What is on sale?", "Show my cart"];

const pageOf = (path: string): "home" | "listing" | "product" | "cart" | "checkout" | "track" | "other" =>
  path === "/" ? "home" : path.startsWith("/products/") ? "product" : path.startsWith("/cart") ? "cart" : path.startsWith("/checkout") ? "checkout" : path.startsWith("/track-order") ? "track" : /^\/(categories|search|brands)/.test(path) ? "listing" : "other";

export interface AssistantPanelProps {
  demo?: boolean;
  /** Which voice routes exist (from the server). Both false by default: voice shows as not available yet. */
  voice?: { stt: boolean; tts: boolean };
  /** Test seams only: the real voice client and browser recorder are used when these are not given. */
  voiceApi?: VoiceApi;
  recorderDeps?: RecorderDeps;
}

export function AssistantPanel({ demo = true, voice = { stt: false, tts: false }, voiceApi, recorderDeps }: AssistantPanelProps) {
  const path = usePathname();
  const { lines: cartLines } = useCart();
  const api = voiceApi ?? realVoiceApi;
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyLang, setReplyLang] = useState<AssistantLang>("en");
  const [locale, setLocale] = useState<Locale>("auto");
  const [confirmClear, setConfirmClear] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [micNotice, setMicNotice] = useState(false);
  const catalogue = useRef(new Map<string, ProductCardData>());
  const applied = useRef(new Set<string>());
  const next = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const recorder = useVoiceRecorder({ lang: locale, api, ...(recorderDeps ? { deps: recorderDeps } : {}) });
  const { state: rec, cancel: cancelRecording } = recorder;

  // The words on the screen follow the language the shopper chose, or else the language of the last reply.
  const ui: AssistantLang = locale === "auto" ? replyLang : locale;
  const t = labels(ui);
  const voiceActive = rec.phase !== "idle";

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [entries, busy]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmClear) setConfirmClear(false);
      else if (rec.phase === "requesting" || rec.phase === "recording" || rec.phase === "transcribing") cancelRecording();
      else {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirmClear, rec.phase, cancelRecording]);

  const remember = (cards: AgentCard[]) => {
    for (const c of cards) {
      if (c.type === "product") catalogue.current.set(c.id, c as ProductCardData);
      else if (c.type === "comparison") for (const p of c.products) catalogue.current.set(p.id, p as ProductCardData);
      else if (c.type === "accessory") catalogue.current.set(c.product.id, c.product as ProductCardData);
    }
  };

  const send = useCallback(
    async (message: string) => {
      const m = message.trim();
      if (!m || busy) return;
      setEntries((e) => [...e, { id: next.current++, role: "you", text: m }]);
      setText("");
      setMicNotice(false);
      setBusy(true);
      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: m, locale, cart: cartLines.map((l) => ({ productId: l.productId, variantKey: l.variantKey, quantity: l.quantity })).slice(0, 20), page: pageOf(path) }),
        });
        const data = (await res.json().catch(() => null)) as (PublicChatResponse & { error?: { message?: string } }) | null;
        if (!res.ok || !data || !("reply" in data)) {
          setEntries((e) => [...e, { id: next.current++, role: "error", text: data?.error?.message ?? labels(locale === "auto" ? "en" : locale).errorGeneric, retry: m }]);
          return;
        }
        remember(data.cards);
        const l: AssistantLang = data.language === "en" ? "en" : "si";
        setReplyLang(l);
        setEntries((e) => [
          ...e,
          {
            id: next.current++,
            role: "assistant",
            text: data.reply.text,
            cards: data.cards,
            actions: data.actions,
            names: Object.fromEntries(data.actions.flatMap((a) => (a.type === "navigate" ? [] : [[a.productId, catalogue.current.get(a.productId)?.name ?? "this item"]]))),
            suggestions: data.suggestions ?? [],
            lang: l,
            review: data.needsNativeReview,
            spoken: true,
          },
        ]);
      } catch {
        setEntries((e) => [...e, { id: next.current++, role: "error", text: labels(locale === "auto" ? "en" : locale).errorNetwork, retry: m }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, cartLines, locale, path],
  );

  /** Applies one confirmed proposal to the browser cart, at most once per action id. Returns a short note for the transcript. */
  const applyConfirmed = (a: CartAction): string => {
    if (applied.current.has(a.actionId)) return "";
    applied.current.add(a.actionId);
    const key = lineKey({ productId: a.productId, variantKey: a.variantKey });
    if (a.type === "cart.remove") {
      cartActions.remove(key);
      return "Removed from your cart.";
    }
    if (a.type === "cart.setQuantity") {
      cartActions.setQuantity(key, a.quantity);
      return "Cart updated.";
    }
    const card = catalogue.current.get(a.productId);
    if (!card) return "Please open the product page to add it to your cart.";
    const variant = card.variants?.find((v) => v.key === a.variantKey);
    cartActions.add({
      productId: card.id,
      variantKey: a.variantKey,
      slug: card.url.replace("/products/", ""),
      name: card.name,
      ...(variant ? { variantLabel: variant.label } : {}),
      ...(card.imageUrl ? { image: card.imageUrl } : {}),
      unitPrice: variant ? variant.price.amount : card.price.amount,
      quantity: a.quantity,
    });
    return "Added to your cart.";
  };

  const note = (message: string) => message && setEntries((e) => [...e, { id: next.current++, role: "assistant", text: message, cards: [], actions: [], names: {}, suggestions: [], lang: "en", review: false, spoken: false }]);

  const clearAll = () => {
    cancelRecording();
    recorder.reset();
    setEntries([]);
    setText("");
    setMicNotice(false);
    setConfirmClear(false);
    inputRef.current?.focus();
  };

  const onMic = () => {
    if (!voice.stt) {
      setMicNotice(true); // clear unavailable state: no permission prompt, nothing recorded
      return;
    }
    setMicNotice(false);
    if (rec.phase === "idle" || rec.phase === "error") void recorder.start();
  };

  const lastAssistantId = [...entries].reverse().find((e) => e.role === "assistant" && e.spoken)?.id;

  return (
    <>
      {open ? (
        <section
          role="dialog"
          aria-label="VOLTA AI shopping assistant"
          className="fixed inset-x-0 top-0 z-50 flex h-dvh max-h-dvh flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:inset-x-auto sm:top-auto sm:bottom-6 sm:left-6 sm:h-[min(42rem,calc(100dvh-3rem))] sm:max-h-none sm:w-[26rem] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-slate-200 sm:pb-0 sm:pt-0 sm:shadow-2xl"
          data-testid="assistant-panel"
        >
          <PanelHeader lang={ui} demo={demo} ttsAvailable={voice.tts} voiceOutput={voiceOutput} canClear={entries.length > 0} onToggleVoiceOutput={() => setVoiceOutput((v) => !v)} onClear={() => setConfirmClear(true)} onClose={() => { setOpen(false); launcherRef.current?.focus(); }} />
          <LanguageSelector value={locale} lang={ui} onChange={setLocale} />

          <div ref={listRef} className="relative flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3" aria-live="polite" data-testid="assistant-messages">
            {entries.length === 0 ? <Welcome lang={ui} demo={demo} starters={STARTERS} onPick={(s) => void send(s)} /> : null}

            {entries.map((e, index) =>
              e.role === "you" ? (
                <div key={e.id} className="flex justify-end">
                  <p className="max-w-[85%] break-words rounded-2xl rounded-br-sm bg-[#2563EB] px-3.5 py-2 text-sm text-white shadow-sm">{e.text}</p>
                </div>
              ) : e.role === "error" ? (
                <div key={e.id} className="space-y-1" role="alert">
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800">{e.text}</p>
                  {e.retry ? (
                    <button type="button" className="text-xs font-semibold text-[#2563EB] underline" onClick={() => void send(e.retry!)}>
                      {t.retry}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div key={e.id} className="flex items-start gap-2">
                  <BrandMark className="mt-0.5 h-7 w-7" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="max-w-[92%] break-words rounded-2xl rounded-tl-sm bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm">{e.text}</p>
                    {e.review ? <p className="text-[11px] text-slate-500">Sinhala text is provisional and awaiting native review.</p> : null}
                    {voice.tts && e.spoken ? (
                      <SpokenReply
                        key={`${e.id}-${voiceOutput && e.id === lastAssistantId}`}
                        lang={ui}
                        auto={voiceOutput && e.id === lastAssistantId}
                        fetchAudio={() => api.speak(e.text, e.lang === "si" ? "si" : "en")}
                      />
                    ) : null}
                    {e.cards.length ? <AssistantCards cards={e.cards as never} lang={e.lang} demo={demo} /> : null}
                    {e.actions.map((a) =>
                      a.type === "navigate" ? (
                        <Link key={a.actionId} href={a.href} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-lg border border-[#2563EB] px-4 text-sm font-semibold text-[#2563EB] hover:bg-blue-50">
                          {a.href === "/checkout" ? "Go to checkout" : a.href === "/cart" ? "View cart" : a.href.startsWith("/track-order") ? "Track an order" : "Open product page"}
                        </Link>
                      ) : (
                        <CartProposalConfirm key={a.actionId} action={a as CartAction} productName={e.names[a.productId] ?? "this item"} lang={e.lang} onConfirm={(action) => note(applyConfirmed(action))} onCancel={() => {}} />
                      ),
                    )}
                    {e.suggestions.length > 0 && index === entries.length - 1 && !busy ? (
                      <div className="flex flex-wrap gap-2" data-testid="assistant-suggestions">
                        {e.suggestions.map((c) => (
                          <button key={c} type="button" onClick={() => void send(c)} className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-blue-50">
                            {c}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ),
            )}
            {busy ? <TypingIndicator lang={ui} /> : null}
            {confirmClear ? <ClearConfirm lang={ui} onConfirm={clearAll} onCancel={() => setConfirmClear(false)} /> : null}
          </div>

          <div className="border-t border-slate-200 bg-white">
            {micNotice && !voice.stt ? (
              <div role="status" className="flex items-start gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="voice-unavailable">
                <p className="flex-1">{t.voiceNotAvailableDetail}</p>
                <button type="button" onClick={() => setMicNotice(false)} aria-label={t.close} className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : null}

            {voiceActive ? (
              <VoiceComposer
                state={rec}
                levels={recorder.levels}
                lang={ui}
                onStop={recorder.stop}
                onCancel={cancelRecording}
                onEdit={recorder.edit}
                onSend={(v) => {
                  recorder.reset();
                  void send(v);
                }}
                onRetry={() => void recorder.start()}
                onDismiss={recorder.reset}
              />
            ) : (
              <form
                className="flex items-end gap-2 p-2"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  void send(text);
                }}
              >
                <label htmlFor="assistant-input" className="sr-only">
                  Message the shopping assistant
                </label>
                <MicButton available={voice.stt} active={false} lang={ui} onClick={onMic} />
                <textarea
                  id="assistant-input"
                  ref={inputRef}
                  rows={1}
                  maxLength={800}
                  value={text}
                  onChange={(ev) => setText(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" && !ev.shiftKey) {
                      ev.preventDefault();
                      void send(text);
                    }
                  }}
                  placeholder={t.placeholder}
                  className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-[#2563EB] focus:outline-none"
                />
                <button type="submit" disabled={busy || !text.trim()} aria-label={t.send} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white hover:bg-[#1d4ed8] disabled:opacity-50">
                  <SendHorizontal className="h-5 w-5" aria-hidden />
                </button>
              </form>
            )}
            <p className="px-3 pb-2 text-center text-[11px] text-slate-500">Prices and stock come from the store. Cart changes need your confirmation.</p>
          </div>
        </section>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close shopping assistant" : "Open shopping assistant"}
        aria-expanded={open}
        data-testid="assistant-launcher"
        className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-40 flex h-14 items-center justify-center gap-2 rounded-full bg-[#2563EB] text-white shadow-lg ring-4 ring-white/80 transition hover:bg-[#1d4ed8] sm:bottom-6 sm:left-6 sm:w-14 ${open ? "hidden sm:flex w-14" : "pl-4 pr-5"}`}
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <Sparkles className="h-6 w-6 shrink-0" aria-hidden />}
        {open ? null : <span className="text-sm font-semibold sm:hidden" aria-hidden>Ask AI</span>}
      </button>
    </>
  );
}
