"use client";

import { useState } from "react";
import { AlertTriangle, Check, PackageSearch } from "lucide-react";
import { labels } from "./labels";
import type { AccessoryCardData, AssistantCard, AssistantLang, CartAction, ComparisonCardData, ProductCardData, StockCardData } from "./types";

/**
 * Customer-facing cards for the AI shopping assistant: clean white surface, blue primary (#2563EB), mobile first.
 * These components only display what the Agent API returned. Every card is labelled as demo data while the assistant runs on the
 * mock catalogue, and the cart confirmation changes nothing itself: it calls back only after an explicit click.
 */
const BLUE = "bg-[#2563EB] text-white hover:bg-[#1d4ed8] focus-visible:outline-[#2563EB]";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2";
const SURFACE = "rounded-2xl border border-slate-200 bg-white shadow-sm";

export function MockBadge({ lang = "en" }: { lang?: AssistantLang }) {
  const t = labels(lang);
  return (
    <span title={t.mockNote} className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-[#2563EB]">
      {t.mock}
    </span>
  );
}

/** A neutral placeholder when the product has no image (or while mock images are not served). */
export function ImagePlaceholder({ name, lang = "en", compact = true }: { name: string; lang?: AssistantLang; compact?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div role="img" aria-label={`${labels(lang).noImage}: ${name}`} className={`flex w-full items-center justify-center rounded-xl bg-slate-100 text-2xl font-semibold text-slate-400 ${compact ? "aspect-square" : "h-24"}`}>
      {initials}
    </div>
  );
}

/** Product image that falls back to the placeholder when the file cannot be loaded (mock images are not served), and stays a modest size. */
function CardImage({ src, name, lang, compact }: { src?: string; name: string; lang: AssistantLang; compact: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <ImagePlaceholder name={name} lang={lang} compact={compact} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} className={`w-full rounded-xl object-cover ${compact ? "aspect-square" : "aspect-[4/3] max-h-44"}`} />
  );
}

export function ProductCardView({ card, lang = "en", compact = false, demo = true }: { card: ProductCardData; lang?: AssistantLang; compact?: boolean; demo?: boolean }) {
  const t = labels(lang);
  return (
    <article className={`${SURFACE} flex ${compact ? "flex-row gap-3 p-3" : "flex-col gap-3 p-4"} sm:max-w-sm`} data-testid="product-card">
      <div className={compact ? "w-20 shrink-0" : "w-full"}>
        <CardImage src={card.imageUrl} name={card.name} lang={lang} compact={compact} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {card.brand ? <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.brand}</span> : null}
          {demo ? <MockBadge lang={lang} /> : null}
        </div>
        <h3 className="mt-1 break-words text-base font-semibold text-slate-900">
          <a href={card.url} className="hover:text-[#2563EB]">
            {card.name}
          </a>
        </h3>
        <p className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-bold text-slate-900">{card.price.text}</span>
          {card.listPrice ? <s className="text-sm text-slate-500">{card.listPrice.text}</s> : null}
          {card.offerName ? <span className="rounded bg-blue-50 px-1.5 text-xs font-medium text-[#2563EB]">{card.offerName}</span> : null}
        </p>
        <p className={`mt-1 text-sm font-medium ${card.available ? "text-emerald-700" : "text-slate-500"}`}>{card.available ? (demo ? t.inStock : t.inStockLive) : demo ? t.outOfStock : t.outOfStockLive}</p>
        {card.specs?.length ? (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm" aria-label={t.specs}>
            {card.specs.slice(0, 6).map((s) => (
              <div key={s.name} className="contents">
                <dt className="text-slate-500">{s.name}</dt>
                <dd className="break-words text-slate-900">{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </article>
  );
}

export function ComparisonView({ card, lang = "en", demo = true }: { card: ComparisonCardData; lang?: AssistantLang; demo?: boolean }) {
  const t = labels(lang);
  return (
    <section className={`${SURFACE} overflow-x-auto p-4`} aria-label={t.compare} data-testid="comparison-card">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">{t.compare}</h3>
        {demo ? <MockBadge lang={lang} /> : null}
      </div>
      <table className="w-full min-w-[20rem] border-collapse text-sm">
        <thead>
          <tr>
            <td className="w-28 p-2" />
            {card.products.map((p) => (
              <th key={p.id} scope="col" className="p-2 text-left font-semibold text-slate-900">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {card.rows.map((r) => (
            <tr key={r.label} className={r.differs ? "bg-blue-50/60" : ""}>
              <th scope="row" className="p-2 text-left font-normal text-slate-500">
                {r.label}
              </th>
              {r.values.map((v, i) => (
                <td key={i} className={`p-2 ${v === null ? "text-slate-400" : "text-slate-900"}`}>
                  {v ?? t.unavailable}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {card.priceDelta ? (
        <p className="mt-3 text-sm text-slate-700">
          {t.priceDifference}: <strong>{card.priceDelta.text}</strong>
        </p>
      ) : null}
    </section>
  );
}

export function AccessoryView({ card, lang = "en", demo = true }: { card: AccessoryCardData; lang?: AssistantLang; demo?: boolean }) {
  return (
    <div data-testid="accessory-card" className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-[#2563EB]">{card.kind.replace(/_/g, " ").toLowerCase()}</span>
      <ProductCardView card={card.product} lang={lang} compact demo={demo} />
    </div>
  );
}

export function StockView({ card, lang = "en", demo = true }: { card: StockCardData; lang?: AssistantLang; demo?: boolean }) {
  const t = labels(lang);
  return (
    <p data-testid="stock-card" className={`${SURFACE} inline-flex items-center gap-2 px-4 py-3 text-sm font-medium ${card.available ? "text-emerald-700" : "text-slate-600"}`}>
      {card.available ? (demo ? t.inStock : t.inStockLive) : demo ? t.outOfStock : t.outOfStockLive}
      {demo ? <MockBadge lang={lang} /> : null}
    </p>
  );
}

/**
 * Shows one cart proposal and applies nothing itself. `onConfirm` is called only after the shopper clicks Confirm, and the parent is
 * the only place that touches the browser cart. Without a click, or after Cancel, the cart is untouched.
 */
export function CartProposalConfirm({
  action,
  productName,
  lang = "en",
  onConfirm,
  onCancel,
}: {
  action: CartAction;
  productName: string;
  lang?: AssistantLang;
  onConfirm: (action: CartAction) => void;
  onCancel: (action: CartAction) => void;
}) {
  const t = labels(lang);
  const [state, setState] = useState<"pending" | "done" | "dismissed">("pending");
  const title = action.type === "cart.add" ? t.add : action.type === "cart.remove" ? t.remove : t.setQuantity;
  if (state === "done")
    return (
      <p role="status" className="text-sm font-medium text-emerald-700">
        <Check className="mr-1 inline h-4 w-4" aria-hidden />
        {t.done}
      </p>
    );
  if (state === "dismissed")
    return (
      <p role="status" className="text-sm text-slate-600">
        {t.dismissed}
      </p>
    );
  return (
    <section className={`${SURFACE} p-4`} role="group" aria-label={t.confirmTitle} data-testid="cart-confirm">
      <h3 className="text-base font-semibold text-slate-900">{t.confirmTitle}</h3>
      <p className="mt-2 break-words text-sm text-slate-800">
        {title}: <strong>{productName}</strong>
        {action.type !== "cart.remove" ? (
          <>
            {" "}
            · {t.quantity}: <strong>{action.quantity}</strong>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-xs text-slate-500">{t.confirmNote}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={`${BTN} ${BLUE}`}
          onClick={() => {
            setState("done");
            onConfirm(action);
          }}
        >
          {t.confirm}
        </button>
        <button
          type="button"
          className={`${BTN} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
          onClick={() => {
            setState("dismissed");
            onCancel(action);
          }}
        >
          {t.cancel}
        </button>
      </div>
    </section>
  );
}

export function AssistantLoading({ lang = "en" }: { lang?: AssistantLang }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={`${SURFACE} flex items-center gap-3 p-4 text-sm text-slate-600`}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#2563EB] border-r-transparent" aria-hidden />
      {labels(lang).loading}
    </div>
  );
}

export function AssistantEmpty({ lang = "en" }: { lang?: AssistantLang }) {
  const t = labels(lang);
  return (
    <div className={`${SURFACE} flex flex-col items-center p-6 text-center`} data-testid="assistant-empty">
      <PackageSearch className="h-8 w-8 text-slate-400" aria-hidden />
      <h3 className="mt-2 font-semibold text-slate-900">{t.emptyTitle}</h3>
      <p className="mt-1 text-sm text-slate-600">{t.emptyBody}</p>
    </div>
  );
}

export function AssistantError({ lang = "en", onRetry }: { lang?: AssistantLang; onRetry?: () => void }) {
  const t = labels(lang);
  return (
    <div role="alert" className={`${SURFACE} flex flex-col items-center border-amber-200 bg-amber-50 p-6 text-center`} data-testid="assistant-error">
      <AlertTriangle className="h-8 w-8 text-amber-600" aria-hidden />
      <h3 className="mt-2 font-semibold text-slate-900">{t.errorTitle}</h3>
      <p className="mt-1 text-sm text-slate-700">{t.errorBody}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={`${BTN} ${BLUE} mt-3`}>
          {t.retry}
        </button>
      ) : null}
    </div>
  );
}

/** Renders the cards of one assistant answer. Cart and order cards are left to the existing storefront components. */
export function AssistantCards({ cards, lang = "en", demo = true }: { cards: AssistantCard[]; lang?: AssistantLang; demo?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {cards.map((c, i) => {
        switch (c.type) {
          case "product":
            return <ProductCardView key={i} card={c as ProductCardData} lang={lang} demo={demo} />;
          case "comparison":
            return <ComparisonView key={i} card={c as ComparisonCardData} lang={lang} demo={demo} />;
          case "accessory":
            return <AccessoryView key={i} card={c as AccessoryCardData} lang={lang} demo={demo} />;
          case "stock":
            return <StockView key={i} card={c as StockCardData} lang={lang} demo={demo} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
