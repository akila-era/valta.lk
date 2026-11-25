import { describe, expect, it } from "vitest";
import { DEFAULT_HOT_DEALS, hotDealsSchema, MAX_HOT_PRODUCTS } from "@/lib/hot-deals";

describe("hot deals settings", () => {
  it("accepts the defaults and a full configuration", () => {
    expect(hotDealsSchema.safeParse(DEFAULT_HOT_DEALS).success).toBe(true);
    expect(hotDealsSchema.safeParse({ ...DEFAULT_HOT_DEALS, mode: "chosen", productIds: ["a", "b"], endsAt: "2030-01-01T00:00:00.000Z", subtitle: "This week only" }).success).toBe(true);
  });

  it("rejects an unknown mode, a missing title and too many products", () => {
    expect(hotDealsSchema.safeParse({ ...DEFAULT_HOT_DEALS, mode: "random" }).success).toBe(false);
    expect(hotDealsSchema.safeParse({ ...DEFAULT_HOT_DEALS, title: "" }).success).toBe(false);
    expect(hotDealsSchema.safeParse({ ...DEFAULT_HOT_DEALS, productIds: Array.from({ length: MAX_HOT_PRODUCTS + 1 }, (_, i) => `p${i}`) }).success).toBe(false);
  });
});
