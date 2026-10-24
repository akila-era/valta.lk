import { discountPercent, effectivePrice } from "@/lib/erp/product-utils";
import { formatLkr, fromCents, toCents } from "@/lib/utils/money";

export function Price({ price, salePrice, large, offerName }: { price: number; salePrice?: number | null; large?: boolean; offerName?: string | null }) {
  const current = effectivePrice({ price, salePrice });
  const onSale = current < price;
  const save = onSale ? fromCents(toCents(price) - toCents(current)) : 0;
  const pct = discountPercent({ price, salePrice });
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className={large ? "font-display text-[2.25rem] font-bold leading-none tracking-[-0.025em] text-ink tabular-nums" : "type-price"}>{formatLkr(current)}</span>
        {onSale && (
          <>
            <span className="sr-only">Regular price</span>
            <s className={large ? "text-base text-muted tabular-nums" : "text-sm text-muted"}>{formatLkr(price)}</s>
            {large && pct ? <span className="self-center rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-on-brand">-{pct}%</span> : null}
          </>
        )}
      </p>
      {onSale && (
        <p className="mt-2 text-sm text-success">
          {offerName ? `Offer: ${offerName}. ` : "Catalogue sale. "}
          You save {formatLkr(save)}.
        </p>
      )}
    </div>
  );
}

/** Per-unit note for a cart line whose live regular price is higher than the price charged. */
export function SaleNote({ listPrice, unitPrice, offerName }: { listPrice?: number | null; unitPrice: number; offerName?: string | null }) {
  if (listPrice == null || listPrice <= unitPrice) return null;
  const save = fromCents(toCents(listPrice) - toCents(unitPrice));
  return (
    <p className="mt-1 text-sm text-success">
      {offerName ? `Offer: ${offerName}. ` : "Catalogue sale. "}
      Regular price <s>{formatLkr(listPrice)}</s>. You save {formatLkr(save)} each.
    </p>
  );
}
