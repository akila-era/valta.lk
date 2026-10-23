import { z } from "zod";
import { toCents } from "../utils/money";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const promotionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.number().finite().positive(),
    minSubtotal: z.number().finite().nonnegative().max(10_000_000).default(0),
    maxDiscount: z.number().finite().positive().max(10_000_000).nullable().default(null),
    startsAt: z.string().refine((s) => Number.isFinite(Date.parse(s)), "Enter a start date."),
    endsAt: z.union([z.string(), z.null()]).default(null),
    usageLimit: z.number().int().positive().max(1_000_000).nullable().default(null),
    perCustomerLimit: z.number().int().positive().max(100).nullable().default(null),
    stackable: z.boolean().default(false),
    active: z.boolean().default(false),
    productIds: z.array(id).max(50).default([]),
    categoryNames: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    bundleAccessoryId: id.nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.type === "PERCENT" && (!Number.isInteger(v.value) || v.value < 1 || v.value > 100)) {
      ctx.addIssue({ code: "custom", message: "Percentage must be a whole number from 1 to 100.", path: ["value"] });
    }
    if (v.endsAt != null && !Number.isFinite(Date.parse(v.endsAt))) {
      ctx.addIssue({ code: "custom", message: "Enter an end date.", path: ["endsAt"] });
    }
    if (v.endsAt != null && Number.isFinite(Date.parse(v.endsAt)) && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) {
      ctx.addIssue({ code: "custom", message: "The end must be after the start.", path: ["endsAt"] });
    }
  });

export type PromotionInput = z.infer<typeof promotionInputSchema>;

export function promotionData(input: PromotionInput) {
  return {
    name: input.name,
    type: input.type,
    value: input.type === "FIXED" ? toCents(input.value) : input.value,
    minSubtotalCents: toCents(input.minSubtotal),
    maxDiscountCents: input.maxDiscount == null ? null : toCents(input.maxDiscount),
    startsAt: new Date(input.startsAt),
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    usageLimit: input.usageLimit,
    perCustomerLimit: input.perCustomerLimit,
    stackable: input.stackable,
    active: input.active,
    productIds: input.productIds,
    categoryNames: input.categoryNames,
    bundleAccessoryId: input.bundleAccessoryId,
  };
}
