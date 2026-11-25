import "server-only";
import { z } from "zod";
import { BUSINESS_TYPES, STATUSES, type WholesaleStatus } from "./wholesale-shared";

/** Wholesale applications live in the banner table under this placement (no schema change); the status is kept in `href`. */
export const WHOLESALE_PLACEMENT = "WHOLESALE";
export const applicationSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().min(5).max(120).email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9][0-9\s-]{6,19}$/, "Enter a valid phone number"),
  business: z.string().trim().min(2, "Enter your shop or company name").max(100),
  type: z.enum(BUSINESS_TYPES).optional(),
  district: z.string().trim().max(40).optional(),
  message: z.string().trim().max(1000).optional(),
  website: z.string().max(200).optional(), // honeypot: real visitors leave it empty
});
export type Application = Omit<z.infer<typeof applicationSchema>, "website">;

export const isStatus = (v: unknown): v is WholesaleStatus => typeof v === "string" && (STATUSES as readonly string[]).includes(v);

/** What a stored row holds, or null when it cannot be read. */
export function readApplication(row: { headline: string; text: string | null; href: string }): (Application & { status: WholesaleStatus }) | null {
  try {
    const raw = JSON.parse(row.text ?? "") as Record<string, unknown>;
    const parsed = applicationSchema.omit({ website: true }).safeParse({ ...raw, business: row.headline });
    if (!parsed.success) return null;
    return { ...parsed.data, status: isStatus(row.href) ? row.href : "new" };
  } catch {
    return null;
  }
}
