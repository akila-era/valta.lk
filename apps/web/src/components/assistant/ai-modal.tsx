"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Check, Maximize2, Minimize2, RotateCcw, ShoppingCart, Volume2, VolumeX, X } from "lucide-react";
import { AiLottie } from "./ai-lottie";
import { Wave } from "./level-wave";
import { AI_OPEN_EVENT } from "./ai-open";
import { aiActions, useAiStore } from "@/store/ai";
import type { FaceState } from "./robot-face";
import { useAiChat } from "./use-ai-chat";
import { stopLive } from "./gemini-live";
import { CatalogueImage } from "@/components/products/catalogue-image";
import { formatLkr } from "@/lib/utils/money";
import type { AiCompareItem, AiProduct } from "@/app/api/store/ai/route";

const SUGGESTIONS = ["Best earbuds under 10,000 rupees", "Compare the two cheapest power banks", "Show me today's deals", "Open my cart"];

/** Small avatar next to a message or in the header: the robot face, animated only when `state` says so. */
function Orb({ size = "md" }: { size?: "sm" | "md"; state?: FaceState }) {
  return (
    <span className={`relative flex shrink-0 items-end justify-center ${size === "md" ? "h-11 w-11" : "h-9 w-9"}`} aria-hidden>
      <AiLottie className="h-full w-full" />
    </span>
  );
}

function Typing() {
  return (
    <div className="flex items-end gap-2 animate-ai-rise" role="status" aria-label="VOLTA AI is thinking">
      <Orb size="sm" state="thinking" />
      <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted animate-ai-dot" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
    </div>
  );
}


/** The robot face is the voice button: tap it to talk. It listens, thinks and speaks with the conversation. */
function VoiceRobot({ state, onClick, className }: { state: FaceState; onClick: () => void; className: string }) {
  const listening = state === "listening";
  return (
    <button type="button" onClick={onClick} aria-label={listening ? "Stop listening" : "Tap to speak"} aria-pressed={listening} className={`relative shrink-0 transition-transform duration-200 hover:scale-105 active:scale-95 ${className}`}>
      {state !== "idle" && <span aria-hidden className="absolute inset-[-12%] animate-ai-glow rounded-full bg-cyan-300/40 blur-xl" />}
      <AiLottie className="relative h-full w-full drop-shadow-[0_8px_12px_rgb(0_0_0/0.25)]" />
    </button>
  );
}

function ProductCard({ p, onOpen, onAdd }: { p: AiProduct; onOpen: () => void; onAdd: () => void }) {
  const canAdd = p.inStock && !p.hasVariants;
  return (
    <div className="group flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-bg transition-colors hover:border-ink sm:w-44">
      <button type="button" onClick={onOpen} className="block text-left" aria-label={`View ${p.name}`}>
        <span className="relative block aspect-square bg-surface">
          <CatalogueImage src={p.image ?? undefined} alt="" sizes="176px" />
          {p.was != null && <span className="absolute left-2 top-2 rounded-md bg-sale px-1.5 py-0.5 text-[10px] font-bold text-white">SALE</span>}
        </span>
        <span className="block space-y-0.5 px-2.5 pt-2.5">
          {p.brand && <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-muted">{p.brand}</span>}
          <span className="line-clamp-2 block min-h-[2.1rem] text-xs font-semibold leading-[1.05rem]">{p.name}</span>
          <span className="flex items-baseline gap-1.5 pt-0.5">
            <span className="text-sm font-extrabold tabular-nums">{formatLkr(p.price)}</span>
            {p.was != null && <span className="text-[11px] text-muted line-through tabular-nums">{formatLkr(p.was)}</span>}
          </span>
        </span>
      </button>
      <div className="mt-auto p-2.5">
        <button
          type="button"
          onClick={canAdd ? onAdd : onOpen}
          disabled={!p.inStock}
          className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-ink text-xs font-semibold text-white transition-colors hover:bg-brand-500 disabled:bg-surface disabled:text-muted"
        >
          {!p.inStock ? "Out of stock" : p.hasVariants ? <>Choose options <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></> : <><ShoppingCart className="h-3.5 w-3.5" aria-hidden /> Add to cart</>}
        </button>
      </div>
    </div>
  );
}

function CompareTable({ items, onOpen }: { items: AiCompareItem[]; onOpen: (slug: string) => void }) {
  const keys = [...new Set(items.flatMap((i) => Object.keys(i.specs)))].filter((k) => items.some((i) => i.specs[k])).slice(0, 8);
  const lowest = Math.min(...items.map((i) => i.product.price));
  const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted";
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-bg animate-ai-rise">
      <table className="w-full min-w-[20rem] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className={th} scope="col"><span className="sr-only">Feature</span></th>
            {items.map(({ product: p }) => (
              <th key={p.slug} scope="col" className="w-[8.5rem] px-3 py-3 text-left align-bottom">
                <button type="button" onClick={() => onOpen(p.slug)} className="block text-left">
                  <span className="relative mb-2 block h-16 w-16 overflow-hidden rounded-lg bg-surface"><CatalogueImage src={p.image ?? undefined} alt="" sizes="64px" padding="p-1" /></span>
                  <span className="line-clamp-2 block text-xs font-semibold leading-4 hover:underline">{p.name}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <th scope="row" className={th}>Price</th>
            {items.map(({ product: p }) => (
              <td key={p.slug} className="px-3 py-2 font-extrabold tabular-nums">
                {formatLkr(p.price)}
                {p.price === lowest && items.length > 1 && <span className="ml-1.5 rounded bg-brand-50 px-1 py-0.5 text-[10px] font-bold text-brand-600">Lowest</span>}
              </td>
            ))}
          </tr>
          <tr className="border-b border-border">
            <th scope="row" className={th}>Stock</th>
            {items.map(({ product: p }) => (
              <td key={p.slug} className={`px-3 py-2 font-medium ${p.inStock ? "text-success" : "text-muted"}`}>{p.inStock ? "In stock" : "Out of stock"}</td>
            ))}
          </tr>
          {keys.map((k) => (
            <tr key={k} className="border-b border-border last:border-0">
              <th scope="row" className={th}>{k}</th>
              {items.map(({ product: p, specs }) => (
                <td key={p.slug} className="px-3 py-2">{specs[k] || <span className="text-muted">-</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The chat itself: messages, product cards, comparison, mic, spoken replies. Used inside the modal and inline on the home page. */
export function AiChatPanel({
  onClose,
  onToggleSize,
  docked = false,
  className = "",
  active = true,
  heading = "VOLTA AI",
  suggestions = SUGGESTIONS,
  autoFocus = false,
  autoListen = false,
}: {
  autoListen?: boolean;
  onClose?: () => void;
  /** Switches between the centred window and the corner panel. */
  onToggleSize?: () => void;
  docked?: boolean;
  className?: string;
  active?: boolean;
  heading?: string;
  suggestions?: string[];
  autoFocus?: boolean;
}) {
  const chat = useAiChat({ active, autoListen });
  const { msgs, input, setInput, busy, listening, speak, setSpeak, canListen, speaking, heard, go, addCard, send, toggleMic, reset, faceState, replay, level, speakNote, live } = chat;
  const list = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Scroll only the message list, never the page, and not before the first message.
    const el = list.current;
    if (el && msgs.length) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);
  const iconBtn = "flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink";

  return (
    <div className={`flex flex-col overflow-hidden bg-bg text-ink ${className}`}>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <Orb state={faceState} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight">{heading}</h2>
          <p className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${faceState === "thinking" ? "bg-amber-500" : "bg-brand-400"}`} aria-hidden />
            {live && faceState === "idle" ? "Live conversation" : faceState === "listening" ? (live ? "Listening... (live)" : "Listening...") : faceState === "speaking" ? "Speaking..." : faceState === "thinking" ? "Thinking..." : "Ready to help"}
          </p>
        </div>
        {msgs.length > 0 && (
          <button type="button" onClick={reset} aria-label="Start a new chat" title="New chat" className={iconBtn}>
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setSpeak((s) => !s);
            window.speechSynthesis?.cancel();
          }}
          aria-label={speak ? "Mute spoken replies" : "Speak replies"}
          aria-pressed={speak}
          title={speak ? "Mute replies" : "Speak replies"}
          className={iconBtn}
        >
          {speak ? <Volume2 className="h-[18px] w-[18px]" aria-hidden /> : <VolumeX className="h-[18px] w-[18px]" aria-hidden />}
        </button>
        {onToggleSize && (
          <button type="button" onClick={onToggleSize} aria-label={docked ? "Expand the chat" : "Shrink the chat to the corner"} title={docked ? "Expand" : "Shrink to corner"} className={iconBtn}>
            {docked ? <Maximize2 className="h-4 w-4" aria-hidden /> : <Minimize2 className="h-4 w-4" aria-hidden />}
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className={iconBtn}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        )}
      </header>

      {speakNote && <p className="border-b border-border bg-surface px-4 py-1.5 text-xs text-muted">{speakNote}</p>}

      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-5" aria-live="polite">
        {msgs.length === 0 && (
          <div className="my-auto flex flex-col items-center gap-3 text-center animate-ai-rise">
            <VoiceRobot state={faceState} onClick={toggleMic} className="h-36 w-[6.9rem] sm:h-44 sm:w-[8.4rem]" />
            <div>
              <p className="text-2xl font-semibold tracking-tight">I am <span className="text-brand-600">VOLTA AI</span></p>
              <p className="mx-auto mt-1 flex min-h-5 max-w-xs items-center justify-center gap-2 text-sm text-muted">
                {listening ? (
                  <>
                    <Wave level={level} /> {heard || "Listening, go ahead..."}
                  </>
                ) : canListen ? (
                  "Tap me and speak, or type below."
                ) : (
                  "Your shopping assistant. Type what you need."
                )}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {suggestions.map((t) => (
                <button key={t} type="button" onClick={() => void send(t)} className="group inline-flex items-center gap-1 rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink hover:bg-surface">
                  {t}
                  <ArrowUpRight className="h-3 w-3 text-muted transition-colors group-hover:text-ink" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end animate-ai-rise">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm leading-6 text-white">{m.text}</p>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2 animate-ai-rise">
              <Orb size="sm" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex max-w-[92%] items-start gap-1">
                  <p className={`rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-6 ${m.error ? "bg-danger-bg text-danger" : "bg-surface"}`}>{m.text}</p>
                  {!m.error && (
                    <button type="button" onClick={() => replay(m.text)} aria-label="Play this answer aloud" title="Play aloud" className="mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink">
                      <Volume2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
                {m.notes && m.notes.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {m.notes.map((n, j) => (
                      <li key={j} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                        <Check className="h-3 w-3" aria-hidden /> {n}
                      </li>
                    ))}
                  </ul>
                )}
                {m.compare && m.compare.length > 1 && <CompareTable items={m.compare} onOpen={(slug) => go(`/products/${encodeURIComponent(slug)}`)} />}
                {m.products && m.products.length > 0 && (
                  <ul className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
                    {m.products.map((p) => (
                      <li key={p.slug} className="flex">
                        <ProductCard p={p} onOpen={() => go(`/products/${encodeURIComponent(p.slug)}`)} onAdd={() => addCard(p)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ),
        )}
        {busy && <Typing />}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className={`flex items-center gap-1.5 rounded-full border bg-bg p-1.5 transition-shadow focus-within:border-brand-500 focus-within:shadow-[0_0_0_3px_rgb(6_121_61/0.12)] ${listening ? "border-brand-500" : "border-border"}`}>
          {canListen && <VoiceRobot state={faceState} onClick={toggleMic} className="h-12 w-[2.3rem]" />}
          {listening ? (
            <div className="flex min-w-0 flex-1 items-center gap-3 px-2 text-sm">
              <Wave level={level} /> <span className="truncate text-muted">{heard || "Listening, go ahead..."}</span>
            </div>
          ) : (
            <input
              ref={inputRef}
              autoFocus={autoFocus}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={600}
              placeholder={speaking && speak ? "Speaking... or type here" : "Type a message…"}
              aria-label="Message"
              className="min-h-10 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted sm:text-sm"
            />
          )}
          <button type="submit" disabled={busy || listening || !input.trim()} aria-label="Send" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-on-brand transition-colors hover:bg-brand-400 disabled:bg-surface disabled:text-muted">
            <ArrowUp className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted">AI can make mistakes. Check prices and stock on the product page.</p>
      </form>
    </div>
  );
}

/**
 * The assistant, mounted once for the whole site. It is a centred window when opened, and shrinks into a corner panel
 * when the AI takes the shopper to another page, so the conversation never disappears and the page stays usable.
 */
const SHOW_LAUNCHER = true;

export function AiAssistant() {
  const { mode, listen } = useAiStore();
  const open = mode !== "closed";
  const docked = mode === "dock";

  // The home page has its own robot face; hide the floating one while that section is on screen so they never overlap.
  const path = usePathname();
  // Remember which page the "in view" reading belongs to, so it is ignored after navigating away from the home page.
  const [faceSeen, setFaceSeen] = useState({ path: "", visible: false });
  useEffect(() => {
    const section = document.getElementById("ai-chat-title")?.closest("section");
    if (!section) return;
    const io = new IntersectionObserver(([e]) => setFaceSeen({ path, visible: e.isIntersecting }), { threshold: 0.1 });
    io.observe(section);
    return () => io.disconnect();
  }, [path]);
  const faceInView = faceSeen.path === path && faceSeen.visible;

  useEffect(() => {
    const onOpen = (e: Event) => aiActions.open(!!(e as CustomEvent<{ listen?: boolean }>).detail?.listen);
    window.addEventListener(AI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(AI_OPEN_EVENT, onOpen);
  }, []);
  useEffect(() => {
    if (mode !== "modal") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") aiActions.dock();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  return (
    <>
      {/* The floating launcher uses the animated robot (public/ai/ai-chatbot.json). */}
      {SHOW_LAUNCHER && !open && !faceInView && (
        <button
          type="button"
          onClick={() => aiActions.open(false)}
          aria-label="Open VOLTA AI shopping assistant"
          title="Ask VOLTA AI"
          className="fixed bottom-16 right-0 z-40 h-32 w-32 transition-transform duration-200 hover:scale-110 active:scale-95 md:bottom-2 md:right-2 md:h-44 md:w-44"
        >
          <AiLottie className="h-full w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.35)]" />
        </button>
      )}

      {open && (
        <div
          className={docked ? "pointer-events-none fixed inset-0 z-[70]" : "fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"}
          onMouseDown={(e) => !docked && e.target === e.currentTarget && aiActions.dock()}
        >
          {/* One panel element for both layouts, so switching never restarts a listening or speaking assistant. */}
          <div
            role="dialog"
            aria-modal={!docked}
            aria-label="VOLTA AI shopping assistant"
            className={
              docked
                ? "pointer-events-auto absolute inset-x-3 bottom-3 flex h-[min(34rem,70dvh)] overflow-hidden rounded-2xl shadow-overlay ring-1 ring-black/10 animate-ai-rise sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[24rem]"
                : "flex h-[min(44rem,94dvh)] w-full max-w-xl overflow-hidden rounded-t-3xl shadow-overlay animate-ai-rise sm:rounded-3xl"
            }
          >
            <AiChatPanel autoFocus={!docked} autoListen={listen} docked={docked} onClose={() => {
                stopLive(); // closing the window also ends the voice conversation
                aiActions.close();
              }} onToggleSize={() => (docked ? aiActions.open(false) : aiActions.dock())} className="h-full w-full" />
          </div>
        </div>
      )}
    </>
  );
}
