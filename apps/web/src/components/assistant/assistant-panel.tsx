"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SendHorizontal, Sparkles, X } from "lucide-react";
import { cartActions, useCart } from "@/store/cart";
import { lineKey } from "@/lib/utils/cart-math";
import type { AgentAction, AgentCard, PublicChatResponse } from "@/lib/assistant/schema";
import { AssistantCards, AssistantError, AssistantLoading, CartProposalConfirm } from "./cards";
import { labels } from "./labels";
import type { AssistantLang, CartAction, ProductCardData } from "./types";

/**
 * The AI shopping assistant: a separate floating panel (bottom left; the store's WhatsApp chat stays bottom right). It talks only to
 * /api/assistant/chat on this site. Cards (products, comparison, stock, accessories, cart) come from the Agent and are shown as
 * received; cart changes are proposals that are applied to the browser cart only after the shopper presses Confirm, once each.
 * The conversation lives in this page's memory only: nothing is stored, and closing the tab forgets it.
 */
type Entry =
  | { id: number; role: "you"; text: string }
  | { id: number; role: "assistant"; text: string; cards: AgentCard[]; actions: AgentAction[]; names: Record<string, string>; suggestions: string[]; lang: AssistantLang; review: boolean }
  | { id: number; role: "error"; text: string; retry?: string };

const STARTERS = ["Show me phones under 150000 rupees", "Compare two products for me", "What accessories fit the Zen Book 14?", "Is the Atlas Smartwatch in stock?"];

const pageOf = (path: string): "home" | "listing" | "product" | "cart" | "checkout" | "track" | "other" =>
  path === "/" ? "home" : path.startsWith("/products/") ? "product" : path.startsWith("/cart") ? "cart" : path.startsWith("/checkout") ? "checkout" : path.startsWith("/track-order") ? "track" : /^\/(categories|search|brands)/.test(path) ? "listing" : "other";

export function AssistantPanel({ demo = true }: { demo?: boolean }) {
  const path = usePathname();
  const { lines: cartLines } = useCart();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<AssistantLang>("en");
  const catalogue = useRef(new Map<string, ProductCardData>());
  const applied = useRef(new Set<string>());
  const next = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [entries, busy]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
      setBusy(true);
      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: m, cart: cartLines.map((l) => ({ productId: l.productId, variantKey: l.variantKey, quantity: l.quantity })).slice(0, 20), page: pageOf(path) }),
        });
        const data = (await res.json().catch(() => null)) as (PublicChatResponse & { error?: { message?: string } }) | null;
        if (!res.ok || !data || !("reply" in data)) {
          setEntries((e) => [...e, { id: next.current++, role: "error", text: data?.error?.message ?? "Something went wrong. Please try again.", retry: m }]);
          return;
        }
        remember(data.cards);
        const l: AssistantLang = data.language === "en" ? "en" : "si";
        setLang(l);
        setEntries((e) => [...e, { id: next.current++, role: "assistant", text: data.reply.text, cards: data.cards, actions: data.actions, names: Object.fromEntries(data.actions.flatMap((a) => (a.type === "navigate" ? [] : [[a.productId, catalogue.current.get(a.productId)?.name ?? "this item"]]))), suggestions: data.suggestions ?? [], lang: l, review: data.needsNativeReview }]);
      } catch {
        setEntries((e) => [...e, { id: next.current++, role: "error", text: "Could not reach the assistant. Please try again.", retry: m }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, cartLines, path],
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

  const note = (message: string) => message && setEntries((e) => [...e, { id: next.current++, role: "assistant", text: message, cards: [], actions: [], names: {}, suggestions: [], lang: "en", review: false }]);

  return (
    <>
      {open ? (
        <section role="dialog" aria-label="Shopping assistant" className="fixed inset-x-2 bottom-20 z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[24rem]" data-testid="assistant-panel">
          <header className="flex items-center gap-3 bg-[#2563EB] px-4 py-3 text-white">
            <Sparkles className="h-5 w-5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Shopping assistant</p>
              <p className="text-xs text-blue-100">{demo ? "Beta, demo data" : "Beta"}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-full p-1.5 hover:bg-white/15">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3" aria-live="polite">
            {entries.length === 0 ? (
              <div className="space-y-2">
                <p className="rounded-xl bg-white p-3 text-sm text-slate-800 shadow-sm">
                  Hi! I can help you find products, compare them, check stock and see compatible accessories. {demo ? "While I am in testing, the products I show are demo data, not live VOLTA.LK stock." : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-blue-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {entries.map((e, index) =>
              e.role === "you" ? (
                <div key={e.id} className="flex justify-end">
                  <p className="max-w-[85%] break-words rounded-2xl rounded-br-sm bg-[#2563EB] px-3 py-2 text-sm text-white">{e.text}</p>
                </div>
              ) : e.role === "error" ? (
                <div key={e.id} className="space-y-1">
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-slate-800">{e.text}</p>
                  {e.retry ? (
                    <button type="button" className="text-xs font-semibold text-[#2563EB] underline" onClick={() => void send(e.retry!)}>
                      {labels("en").retry}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div key={e.id} className="space-y-2">
                  <p className="max-w-[90%] break-words rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-slate-900 shadow-sm">{e.text}</p>
                  {e.review ? <p className="text-[11px] text-slate-500">Sinhala text is provisional and awaiting native review.</p> : null}
                  {e.cards.length ? <AssistantCards cards={e.cards as never} lang={e.lang} demo={demo} /> : null}
                  {e.actions.map((a) =>
                    a.type === "navigate" ? (
                      <Link key={a.actionId} href={a.href} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-lg border border-[#2563EB] px-4 text-sm font-semibold text-[#2563EB] hover:bg-blue-50">
                        {a.href === "/checkout" ? "Go to checkout" : a.href === "/cart" ? "View cart" : a.href.startsWith("/track-order") ? "Track an order" : "Open product page"}
                      </Link>
                    ) : (
                      <CartProposalConfirm
                        key={a.actionId}
                        action={a as CartAction}
                        productName={e.names[a.productId] ?? "this item"}
                        lang={e.lang}
                        onConfirm={(action) => note(applyConfirmed(action))}
                        onCancel={() => {}}
                      />
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
              ),
            )}
            {busy ? <AssistantLoading lang={lang} /> : null}
          </div>

          <form
            className="flex items-end gap-2 border-t border-slate-200 bg-white p-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void send(text);
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              Message the shopping assistant
            </label>
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
              placeholder="Ask about products, stock, accessories"
              className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-[#2563EB] focus:outline-none"
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white disabled:opacity-50">
              <SendHorizontal className="h-5 w-5" aria-hidden />
            </button>
          </form>
          <p className="px-3 pb-2 text-center text-[11px] text-slate-500">Prices and stock come from the store. Cart changes need your confirmation.</p>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close shopping assistant" : "Open shopping assistant"}
        aria-expanded={open}
        data-testid="assistant-launcher"
        className="fixed bottom-20 left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-lg transition hover:bg-[#1d4ed8] sm:bottom-6 sm:left-6"
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <Sparkles className="h-6 w-6" aria-hidden />}
      </button>
    </>
  );
}

export { AssistantError };
