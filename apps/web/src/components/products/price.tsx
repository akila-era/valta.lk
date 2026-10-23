import { effectivePrice } from "@/lib/erp/product-utils";
import { formatLkr, fromCents, toCents } from "@/lib/utils/money";

export function Price({ price, salePrice, large, offerName }: { price: number; salePrice?: number | null; large?: boolean; offerName?: string | null }) {
  const current = effectivePrice({ price, salePrice });
  const onSale = current < price;
  const save = onSale ? fromCents(toCents(price) - toCents(current)) : 0;
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={large ? "text-3xl font-extrabold tracking-tight text-brand-600 tabular-nums" : "type-price"}>{formatLkr(current)}</span>
        {onSale && (
          <>
            <span className="sr-only">Regular price</span>
            <s className="text-sm text-muted">{formatLkr(price)}</s>
          </>
        )}
      </p>
      {onSale && (
        <p className="mt-1 text-sm text-success">
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
