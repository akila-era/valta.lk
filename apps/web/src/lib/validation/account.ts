import { z } from "zod";
import { normalizeLkPhone } from "./checkout";

export const emailSchema = z.string().trim().toLowerCase().max(200).pipe(z.email("Enter a valid email address"));

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use at most 128 characters")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Use letters and at least one number");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(100),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || normalizeLkPhone(v) !== null, "Enter a valid Sri Lankan phone number, e.g. 0771234567")
    .transform((v) => (v ? (normalizeLkPhone(v) as string) : "")),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{30,60}$/, "This reset link is not valid"),
  password: passwordSchema,
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(100),
  phone: registerSchema.shape.phone,
});
