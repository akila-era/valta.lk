import { lineKey } from "../utils/cart-math";
import { fromCents, toCents } from "../utils/money";

/**
 * Pure promotion checks. The payable unit price is always the HEXALYTE price (`erpPrice`).
 * A rule is advertised only when the discount it computes equals the catalogue savings already
 * on the eligible lines. Any other result is blocked and must not be shown as a price reduction,
 * because the ERP rejects orders whose prices differ from the catalogue.
 */

export interface PromotionRule {
  id: string;
  name: string;
  type: "PERCENT" | "FIXED";
  /** PERCENT: 1–100. FIXED: LKR amount. */
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: number;
  endsAt: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  used: number;
  usedByCustomer: number;
  stackable: boolean;
  active: boolean;
  productIds: string[];
  categoryNames: string[];
  bundleAccessoryId: string | null;
}

export interface PricedLine {
  productId: string;
  variantKey: string;
  quantity: number;
  listPrice: number;
  erpPrice: number;
  categoryName: string | null;
}

export interface LineAudit {
  productId: string;
  variantKey: string;
  quantity: number;
  listPrice: number;
  erpPrice: number;
  savings: number;
  offerName: string | null;
}

export interface PromotionDecision {
  id: string;
  name: string;
  status: "advertised" | "blocked";
  reason: string;
  computedDiscount: number;
}

export interface PriceQuote {
  lines: LineAudit[];
  /** What the customer pays for items (HEXALYTE prices). */
  subtotal: number;
  catalogueSavings: number;
  delivery: number;
  /** subtotal + delivery. Promotions never change this. */
  total: number;
  advertised: { id: string; name: string; discount: number }[];
  decisions: PromotionDecision[];
}

const REASON = {
  INACTIVE: "The promotion is inactive.",
  NOT_STARTED: "The promotion has not started.",
  EXPIRED: "The promotion has expired.",
  USAGE_LIMIT: "The promotion has reached its usage limit.",
  CUSTOMER_LIMIT: "This customer has reached the usage limit.",
  CUSTOMER_REQUIRED: "This offer is limited per customer, so it applies only to a signed-in customer.",
  MIN_SUBTOTAL: "The order is below the minimum value.",
  NOT_ELIGIBLE: "No items in the cart qualify.",
  BUNDLE_MISSING: "The required accessory is not in the cart.",
  ZERO: "The promotion does not reduce the price.",
  EXCEEDS: "The discount is above the item total or the configured maximum could not be applied.",
  ERP: "HEXALYTE charges the catalogue price, which does not match this discount, so it is not shown.",
  STACKING: "Another promotion already explains this saving.",
} as const;

export function lineSavings(line: Pick<PricedLine, "listPrice" | "erpPrice" | "quantity">): number {
  const each = toCents(line.listPrice) - toCents(line.erpPrice);
  return each > 0 ? fromCents(each * line.quantity) : 0;
}

function eligibleLines(rule: PromotionRule, lines: PricedLine[]): PricedLine[] {
  return lines.filter((l) => {
    if (rule.productIds.length && !rule.productIds.includes(l.productId)) return false;
    if (rule.categoryNames.length && !rule.categoryNames.includes(l.categoryName ?? "")) return false;
    return true;
  });
}

/** Discount in cents, or a block reason. Percentage is taken from the regular catalogue price. */
export function rawDiscountCents(rule: Pick<PromotionRule, "type" | "value" | "maxDiscount">, lines: PricedLine[]): number | "zero" | "exceeds" {
  const base = lines.reduce((sum, l) => sum + toCents(l.listPrice) * l.quantity, 0);
  if (base <= 0 || !Number.isFinite(rule.value) || rule.value <= 0) return "zero";
  let discount = rule.type === "PERCENT" ? Math.floor((base * rule.value) / 100) : toCents(rule.value);
  if (rule.maxDiscount != null) {
    const cap = toCents(rule.maxDiscount);
    if (cap <= 0) return "exceeds";
    discount = Math.min(discount, cap);
  }
  if (discount <= 0) return "zero";
  if (discount > base) return "exceeds";
  return discount;
}

function gate(rule: PromotionRule, lines: PricedLine[], now: number, customerId: string | null): string | null {
  if (!rule.active) return REASON.INACTIVE;
  if (now < rule.startsAt) return REASON.NOT_STARTED;
  if (rule.endsAt != null && now >= rule.endsAt) return REASON.EXPIRED;
  if (rule.usageLimit != null && rule.used >= rule.usageLimit) return REASON.USAGE_LIMIT;
  if (rule.perCustomerLimit != null && !customerId) return REASON.CUSTOMER_REQUIRED;
  if (rule.perCustomerLimit != null && rule.usedByCustomer >= rule.perCustomerLimit) return REASON.CUSTOMER_LIMIT;
  const payable = lines.reduce((sum, l) => sum + toCents(l.erpPrice) * l.quantity, 0);
  if (payable < toCents(rule.minSubtotal)) return REASON.MIN_SUBTOTAL;
  if (rule.bundleAccessoryId && !lines.some((l) => l.productId === rule.bundleAccessoryId && l.quantity > 0)) return REASON.BUNDLE_MISSING;
  return null;
}

function specificity(rule: PromotionRule): number {
  return rule.productIds.length * 1000 + rule.categoryNames.length;
}

export function evaluatePromotions(
  lines: PricedLine[],
  rules: PromotionRule[],
  now: number,
  delivery = 0,
  customerId: string | null = null,
): PriceQuote {
  const decisions: PromotionDecision[] = [];
  const matching: { rule: PromotionRule; cents: number; keys: Set<string> }[] = [];

  for (const rule of rules) {
    const blocked = gate(rule, lines, now, customerId);
    if (blocked) {
      decisions.push({ id: rule.id, name: rule.name, status: "blocked", reason: blocked, computedDiscount: 0 });
      continue;
    }
    const eligible = eligibleLines(rule, lines);
    if (!eligible.length) {
      decisions.push({ id: rule.id, name: rule.name, status: "blocked", reason: REASON.NOT_ELIGIBLE, computedDiscount: 0 });
      continue;
    }
    const raw = rawDiscountCents(rule, eligible);
    if (raw === "zero") {
      decisions.push({ id: rule.id, name: rule.name, status: "blocked", reason: REASON.ZERO, computedDiscount: 0 });
      continue;
    }
    if (raw === "exceeds") {
      decisions.push({ id: rule.id, name: rule.name, status: "blocked", reason: REASON.EXCEEDS, computedDiscount: 0 });
      continue;
    }
    const save = eligible.reduce((sum, l) => sum + toCents(lineSavings(l)), 0);
    if (raw !== save) {
      decisions.push({ id: rule.id, name: rule.name, status: "blocked", reason: REASON.ERP, computedDiscount: fromCents(raw) });
      continue;
    }
    matching.push({ rule, cents: raw, keys: new Set(eligible.map((l) => lineKey(l))) });
  }

  const advertisedIds = new Set<string>();
  if (matching.length) {
    const nonStack = matching.filter((m) => !m.rule.stackable);
    const pool = nonStack.length ? nonStack : matching;
    const overlap = pool.some((a, i) => pool.slice(i + 1).some((b) => [...a.keys].some((k) => b.keys.has(k))));
    const ranked = [...pool].sort((a, b) => b.cents - a.cents || specificity(b.rule) - specificity(a.rule) || a.rule.name.localeCompare(b.rule.name));
    const chosen = nonStack.length || overlap ? ranked.slice(0, 1) : ranked;
    for (const m of chosen) advertisedIds.add(m.rule.id);
    for (const m of matching) {
      if (advertisedIds.has(m.rule.id)) {
        decisions.push({ id: m.rule.id, name: m.rule.name, status: "advertised", reason: "Matches the catalogue sale.", computedDiscount: fromCents(m.cents) });
      } else {
        decisions.push({ id: m.rule.id, name: m.rule.name, status: "blocked", reason: REASON.STACKING, computedDiscount: fromCents(m.cents) });
      }
    }
  }

  const offerByKey = new Map<string, string>();
  for (const m of matching) {
    if (!advertisedIds.has(m.rule.id)) continue;
    for (const key of m.keys) offerByKey.set(key, m.rule.name);
  }

  const audited: LineAudit[] = lines.map((l) => ({
    productId: l.productId,
    variantKey: l.variantKey,
    quantity: l.quantity,
    listPrice: l.listPrice,
    erpPrice: l.erpPrice,
    savings: lineSavings(l),
    offerName: offerByKey.get(lineKey(l)) ?? null,
  }));
  const subtotal = fromCents(lines.reduce((sum, l) => sum + toCents(l.erpPrice) * l.quantity, 0));
  const catalogueSavings = fromCents(audited.reduce((sum, l) => sum + toCents(l.savings), 0));
  const safeDelivery = Number.isFinite(delivery) && delivery > 0 ? fromCents(toCents(delivery)) : 0;
  return {
    lines: audited,
    subtotal,
    catalogueSavings,
    delivery: safeDelivery,
    total: fromCents(toCents(subtotal) + toCents(safeDelivery)),
    advertised: matching.filter((m) => advertisedIds.has(m.rule.id)).map((m) => ({ id: m.rule.id, name: m.rule.name, discount: fromCents(m.cents) })),
    decisions,
  };
}
