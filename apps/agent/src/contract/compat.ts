import { LEGACY_MAX_COMPARE_PRODUCTS, type Card, type ContractVersion, LEGACY_CONTRACT_VERSION, CONTRACT_VERSION } from "./schemas";
import { formatLkr } from "../backend/wire";

type ComparisonCard = Extract<Card, { type: "comparison" }>;

const distinctRow = (values: (string | null)[]) => {
  const distinct = new Set(values.filter((v): v is string => v !== null));
  return distinct.size > 1 || (distinct.size === 1 && values.some((v) => v === null));
};

/**
 * Contract 1.0 clients know comparisons of at most 3 products. For them, a larger comparison is cut to its first 3 products,
 * with every row and the price difference recomputed from what remains (nothing is guessed, nothing is shown that was cut).
 */
function downgradeComparison(card: ComparisonCard): ComparisonCard {
  if (card.products.length <= LEGACY_MAX_COMPARE_PRODUCTS) return card;
  const products = card.products.slice(0, LEGACY_MAX_COMPARE_PRODUCTS);
  const rows = card.rows.map((r) => {
    const values = r.values.slice(0, LEGACY_MAX_COMPARE_PRODUCTS);
    return { ...r, values, differs: distinctRow(values) };
  });
  const cents = products.map((p) => Math.round(p.price.amount * 100));
  const spread = Math.max(...cents) - Math.min(...cents);
  const { priceDelta: _dropped, ...rest } = card;
  void _dropped;
  return { ...rest, products, rows, ...(spread > 0 ? { priceDelta: { amount: spread / 100, text: formatLkr(spread) } } : {}) };
}

/** Shapes a card for the contract version the client asked for. Current-version clients get it unchanged. */
export function cardForVersion(card: Card, version: ContractVersion): Card {
  const current = version === CONTRACT_VERSION;
  const stripFit = <T extends { fit?: unknown }>(p: T): T => {
    if (current || p.fit === undefined) return p;
    const { fit: _fit, ...rest } = p;
    void _fit;
    return rest as T;
  };
  // Clients older than 1.2 never receive `fit` (their validators do not know the field).
  let out: Card = card;
  if (card.type === "product") out = stripFit(card);
  else if (card.type === "comparison") out = { ...card, products: card.products.map(stripFit) };
  else if (card.type === "accessory") out = { ...card, product: stripFit(card.product) };
  if (version === LEGACY_CONTRACT_VERSION && out.type === "comparison") return downgradeComparison(out);
  return out;
}
