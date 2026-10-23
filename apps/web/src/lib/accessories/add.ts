import { lineKey } from "../utils/cart-math";

/** Accessories the customer ticked. Already-in-cart lines are skipped so a second add does not raise the quantity. */
export function planAccessoryAdds<T extends { productId: string; variantKey: string; canAdd: boolean }>(
  selected: T[],
  existing: { productId: string; variantKey: string }[],
): { add: T[]; already: T[] } {
  const have = new Set(existing.map((line) => lineKey(line)));
  const seen = new Set<string>();
  const add: T[] = [];
  const already: T[] = [];
  for (const item of selected) {
    if (!item.canAdd) continue;
    const key = lineKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    (have.has(key) ? already : add).push(item);
  }
  return { add, already };
}
