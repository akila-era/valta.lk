import "server-only";
import { z } from "zod";

const schema = z.object({
  HX_API_BASE: z.url().refine((u) => !u.endsWith("/"), "HX_API_BASE must not end with a slash"),
  HX_STORE_CREDENTIAL: z.string().regex(/^hxs_[^.\s]+\.\S+$/, "Expected format hxs_<keyId>.<secret>"),
});

export type ErpEnv = z.infer<typeof schema>;

/** Returns validated ERP env, or null when missing/invalid. Never throws and never echoes values. */
export function getErpEnv(): ErpEnv | null {
  const parsed = schema.safeParse({
    HX_API_BASE: process.env.HX_API_BASE?.trim().replace(/\/+$/, ""),
    HX_STORE_CREDENTIAL: process.env.HX_STORE_CREDENTIAL?.trim(),
  });
  return parsed.success ? parsed.data : null;
}
