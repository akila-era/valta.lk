"use client";

import { useReducer, useState, type ReactNode } from "react";
import { labels } from "./labels";
import { AssistantCards, AssistantEmpty, AssistantError, CartProposalConfirm, MockBadge } from "./cards";
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from "@/lib/assistant-demo/data";
import { MAX_COMPARE, MAX_QTY, MIN_COMPARE, DemoInputError, accessories, cartSummary, compare, details, initialState, productName, proposeCart, reduce, search, stock } from "@/lib/assistant-demo/controller";
import type { AssistantCard, CartAction } from "./types";

/**
 * LOCAL DEMO of the shopping assistant's cards. Everything runs in this browser tab over built-in demo data: there is no Agent,
 * no ERP, no network call, and the demo cart below is separate from the real VOLTA.LK cart. This is not the real assistant.
 */
interface Entry {
  id: number;
  title: string;
  cards: AssistantCard[];
}

const FIELD = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[#2563EB] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]";
const BTN2 = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </fieldset>
  );
}

export function AssistantDemoShell() {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [log, setLog] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const t = labels("en");
  const [productId, setProductId] = useState(DEMO_PRODUCTS[0]!.id);
  const [compareIds, setCompareIds] = useState<string[]>([DEMO_PRODUCTS[0]!.id, DEMO_PRODUCTS[1]!.id]);
  const [category, setCategory] = useState("");
  const [budget, setBudget] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [qty, setQty] = useState("1");

  const show = (title: string, fn: () => AssistantCard[]) => {
    try {
      const cards = fn(); // runs here, not inside the state updater, so a refused input is caught below
      setError(null);
      setLog((l) => [{ id: l.length + 1, title, cards }, ...l]);
    } catch (e) {
      setError(e instanceof DemoInputError ? e.message : "Something went wrong.");
    }
  };
  const propose = (kind: CartAction["type"]) => {
    try {
      setError(null);
      setNotice(null);
      dispatch({ type: "propose", action: proposeCart(kind, productId, Number(qty), state.cart) });
    } catch (e) {
      setError(e instanceof DemoInputError ? e.message : "Something went wrong.");
    }
  };
  const summary = cartSummary(state.cart);
  const toggleCompare = (id: string) => setCompareIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="mx-auto max-w-5xl bg-white text-slate-900" data-testid="assistant-demo">
      <div role="note" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-800">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          Local demo <MockBadge />
        </p>
        <p className="mt-1">
          This page runs only in your browser with built-in demo data. It is <strong>not</strong> the VOLTA.LK assistant, it is not connected to the ERP or any server, and the demo cart is separate from your real cart.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-4">
          <Section title="Search">
            <label className="text-sm">
              Category
              <select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Any</option>
                {DEMO_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Budget up to (Rs.)
              <input className={FIELD} inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 150000" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} /> In stock only
            </label>
            <button type="button" className={BTN} onClick={() => show("Search", () => search({ ...(category ? { category } : {}), ...(budget.trim() ? { maxPriceLkr: Number(budget) } : {}), inStockOnly, sort: "price-asc" }))}>
              Search
            </button>
          </Section>

          <Section title="One product">
            <label className="text-sm">
              Product
              <select className={FIELD} value={productId} onChange={(e) => setProductId(e.target.value)}>
                {DEMO_PRODUCTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={BTN2} onClick={() => show(`Details: ${productName(productId)}`, () => details(productId))}>
                Details
              </button>
              <button type="button" className={BTN2} onClick={() => show(`Stock: ${productName(productId)}`, () => stock(productId))}>
                Stock
              </button>
              <button type="button" className={BTN2} onClick={() => show(`Accessories: ${productName(productId)}`, () => accessories(productId))}>
                Fits
              </button>
            </div>
          </Section>

          <Section title={`Compare (${MIN_COMPARE} to ${MAX_COMPARE})`}>
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
              {DEMO_PRODUCTS.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={compareIds.includes(p.id)} onChange={() => toggleCompare(p.id)} /> {p.name}
                </label>
              ))}
            </div>
            <button type="button" className={BTN} onClick={() => show("Comparison", () => compare(compareIds))}>
              Compare {compareIds.length}
            </button>
          </Section>

          <Section title="Demo cart proposal">
            <label className="text-sm">
              Quantity (1 to {MAX_QTY})
              <input className={FIELD} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={BTN2} onClick={() => propose("cart.add")}>
                Add
              </button>
              <button type="button" className={BTN2} onClick={() => propose("cart.setQuantity")}>
                Set qty
              </button>
              <button type="button" className={BTN2} onClick={() => propose("cart.remove")}>
                Remove
              </button>
            </div>
            <p className="text-xs text-slate-500">These only propose a change. Nothing happens until you confirm.</p>
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {error ? <AssistantError onRetry={() => setError(null)} /> : null}
          {error ? <p role="status" className="text-sm text-slate-700">{error}</p> : null}

          {state.pending ? (
            <CartProposalConfirm
              key={state.pending.actionId}
              action={state.pending}
              productName={productName(state.pending.productId)}
              onConfirm={(a) => {
                dispatch({ type: "confirm", actionId: a.actionId });
                setNotice(t.done);
              }}
              onCancel={(a) => {
                dispatch({ type: "cancel", actionId: a.actionId });
                setNotice(t.dismissed);
              }}
            />
          ) : null}

          {notice ? (
            <p role="status" data-testid="demo-notice" className="text-sm font-medium text-slate-800">
              {notice}
            </p>
          ) : null}

          <section aria-label="Demo cart" className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="demo-cart">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              Demo cart <MockBadge />
            </h2>
            {summary.lines.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Empty. This cart exists only on this page.</p>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {summary.lines.map((l) => (
                    <li key={l.name} className="flex justify-between gap-3 py-1">
                      <span>
                        {l.name} × {l.quantity}
                      </span>
                      <span>{l.total.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm font-semibold">Demo subtotal: {summary.subtotal.text}</p>
              </>
            )}
          </section>

          {log.length === 0 ? (
            <p className="text-sm text-slate-600">Pick an action on the left to see the cards.</p>
          ) : (
            log.map((e) => (
              <section key={e.id} aria-label={e.title} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-slate-700">{e.title}</h2>
                {e.cards.length === 0 ? <AssistantEmpty /> : <AssistantCards cards={e.cards} />}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
