import { z } from "zod";
import { ORDER_REF_PATTERN } from "../utils/order-ref";

export const DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha", "Hambantota",
  "Jaffna", "Kalutara", "Kandy", "Kegalle", "Kilinochchi", "Kurunegala", "Mannar", "Matale",
  "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya", "Polonnaruwa", "Puttalam", "Ratnapura",
  "Trincomalee", "Vavuniya",
] as const;

/** Normalises 07XXXXXXXX / +947XXXXXXXX / 947XXXXXXXX / 7XXXXXXXX mobiles and 0XXXXXXXXX landlines to +94 form. */
export function normalizeLkPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "");
  let national: string;
  if (/^\+94\d{9}$/.test(digits)) national = digits.slice(3);
  else if (/^94\d{9}$/.test(digits)) national = digits.slice(2);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{9}$/.test(digits)) national = digits;
  else return null;
  // Mobile 7[0-8]XXXXXXX, or landline area codes 11..9X
  if (/^7[0-8]\d{7}$/.test(national) || /^(1[1-9]|[2-9]\d)\d{7}$/.test(national)) return `+94${national}`;
  return null;
}

const trimmed = (max: number, min = 1, msg = "This field is required") =>
  z.string().trim().min(min, msg).max(max);

export const lineInputSchema = z.object({
  productId: trimmed(100),
  variantKey: z.string().trim().max(200).default(""),
  quantity: z.number().int().min(1).max(10),
});

export const customerSchema = z.object({
  name: trimmed(100, 2, "Please enter your full name"),
  phone: z
    .string()
    .trim()
    .refine((v) => normalizeLkPhone(v) !== null, "Enter a valid Sri Lankan phone number, e.g. 0771234567")
    .transform((v) => normalizeLkPhone(v) as string),
  email: z.union([z.literal(""), z.string().trim().max(200).pipe(z.email("Enter a valid email address"))]).default(""),
});

export const deliverySchema = z.object({
  address: trimmed(250, 5, "Please enter your delivery address"),
  city: trimmed(100, 2, "Please enter your city"),
  district: z.enum(DISTRICTS, { error: "Please select a district" }),
  postalCode: z
    .string()
    .trim()
    .regex(/^(\d{5})?$/, "Postal code must be 5 digits")
    .default(""),
  notes: z.string().trim().max(300).default(""),
});

export const placeOrderSchema = z.object({
  externalRef: z.string().regex(ORDER_REF_PATTERN, "Invalid order reference"),
  lines: z.array(lineInputSchema).min(1, "Your cart is empty").max(20),
  customer: customerSchema,
  delivery: deliverySchema,
  /** Total the customer saw. Used only to detect price changes; never used to price the order. */
  expectedTotal: z.number().nonnegative(),
  acceptTerms: z.literal(true, { error: "Please accept the terms to continue" }),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const availabilityRequestSchema = z.object({
  lines: z.array(lineInputSchema).min(1).max(20),
});

export const orderRefParamSchema = z.string().regex(ORDER_REF_PATTERN);
