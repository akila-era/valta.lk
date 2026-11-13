import { effectiveCents, type ProductView } from "../backend/types";
import type { Fit } from "../contract/schemas";
import { specFacts, type SpecFacts } from "./facts";
import type { Profile } from "./profile";
import type { Usage } from "./usage";

type Reason = Fit["reasons"][number];
type Tradeoff = Fit["tradeoffs"][number];

export interface Ranked {
  product: ProductView;
  score: number;
  fit: Fit;
}

export type Metric = "cameraMp" | "batteryMah" | "memoryGb";

/** Which listed number says most about a usage. Usages with no such number (office, student, everyday) are ranked on budget and value only. */
export const METRIC_FOR: Partial<Record<Usage, Metric>> = { camera: "cameraMp", battery: "batteryMah", gaming: "memoryGb", programming: "memoryGb", design: "memoryGb" };
const REASON_FOR: Record<Metric, Reason> = { cameraMp: "best_camera", batteryMah: "best_battery", memoryGb: "most_memory" };
const NO_DATA_FOR: Record<Metric, Tradeoff> = { cameraMp: "no_camera_data", batteryMah: "no_battery_data", memoryGb: "no_memory_data" };

const REASON_ORDER: Reason[] = ["best_camera", "best_battery", "most_memory", "brand_match", "within_budget", "good_value", "lowest_price", "on_sale", "has_warranty", "in_stock"];
const TRADEOFF_ORDER: Tradeoff[] = ["over_budget", "out_of_stock", "no_camera_data", "no_battery_data", "no_memory_data", "different_brand"];

const sortBy = <T extends string>(codes: Set<T>, order: readonly T[], cap: number): T[] => order.filter((c) => codes.has(c)).slice(0, cap);

export interface RankingSummary {
  /** Usage metrics the shopper asked about for which NO product in the list has a listed number: the caller says so honestly. */
  metricsWithoutData: Metric[];
}

/**
 * Orders products by how well they fit what the shopper said, and says why in codes. Every reason is derived from the products' own
 * catalogue numbers and the shopper's stated budget, brand and usage; nothing is generated. The cheapest fit is preferred over the
 * most expensive one: price only counts against a stated budget, never as a sign of quality.
 */
export function rankProducts(items: readonly ProductView[], profile: Profile): { ranked: Ranked[]; summary: RankingSummary } {
  const facts = new Map<string, SpecFacts>(items.map((p) => [p.id, specFacts(p)]));
  const prices = items.map(effectiveCents).sort((a, b) => a - b);
  const minPrice = prices[0] ?? 0;
  const medianPrice = prices.length ? prices[Math.floor((prices.length - 1) / 2)]! : 0;

  const wanted = [...new Set(profile.usage.map((u) => METRIC_FOR[u]).filter((m): m is Metric => m !== undefined))];
  const range = new Map<Metric, { min: number; max: number; count: number }>();
  for (const m of wanted) {
    const vals = items.map((p) => facts.get(p.id)![m]).filter((v): v is number => v !== undefined);
    if (vals.length > 0) range.set(m, { min: Math.min(...vals), max: Math.max(...vals), count: vals.length });
  }

  const ranked = items.map((p): Ranked => {
    const f = facts.get(p.id)!;
    const price = effectiveCents(p);
    const reasons = new Set<Reason>();
    const tradeoffs = new Set<Tradeoff>();
    let score = 0;

    if (profile.budgetMaxLkr !== undefined) {
      if (price <= profile.budgetMaxLkr * 100) {
        reasons.add("within_budget");
        score += 3;
      } else {
        tradeoffs.add("over_budget");
        score -= 4;
      }
    }
    if (profile.brand) {
      if ((p.brand ?? "").toLowerCase() === profile.brand.toLowerCase()) {
        reasons.add("brand_match");
        score += 2;
      } else {
        tradeoffs.add("different_brand");
        score -= 1;
      }
    }
    let bestMetric = false;
    for (const m of wanted) {
      const r = range.get(m);
      const v = f[m];
      if (v === undefined) {
        tradeoffs.add(NO_DATA_FOR[m]);
        continue;
      }
      if (r && r.count >= 2 && r.max > r.min) {
        score += ((v - r.min) / (r.max - r.min)) * 2;
        if (v === r.max) {
          reasons.add(REASON_FOR[m]);
          bestMetric = true;
          score += 3;
        }
      }
    }
    if (items.length >= 2 && price === minPrice) {
      reasons.add("lowest_price");
      score += 1;
    }
    if (bestMetric && price <= medianPrice && items.length >= 3) reasons.add("good_value");
    if (p.saleCents !== null && p.saleCents < p.priceCents) {
      reasons.add("on_sale");
      score += 1;
    }
    if (p.specs.some((s) => s.name === "Warranty")) {
      reasons.add("has_warranty");
      score += 0.5;
    }
    if (p.available) reasons.add("in_stock");
    else {
      tradeoffs.add("out_of_stock");
      score -= 5;
    }
    return { product: p, score, fit: { reasons: sortBy(reasons, REASON_ORDER, 3), tradeoffs: sortBy(tradeoffs, TRADEOFF_ORDER, 2) } };
  });

  // Highest fit first; among equals the lower price, so the most expensive product is never promoted for being expensive.
  ranked.sort((a, b) => b.score - a.score || effectiveCents(a.product) - effectiveCents(b.product) || a.product.name.localeCompare(b.product.name));
  return { ranked, summary: { metricsWithoutData: wanted.filter((m) => !range.has(m)) } };
}
