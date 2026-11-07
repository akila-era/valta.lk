import "server-only";
import { z } from "zod";
import { getDb } from "../db";
import { decryptSecret, encryptionConfigured, encryptSecret } from "../erp/connection";

/**
 * How the website chat reaches WhatsApp (Admin, WhatsApp chat):
 * - "off": no chat widget (the plain WhatsApp link button is used when a number is set in Store details);
 * - "qr": a linked device (WhatsApp, Linked devices, Link a device). UNOFFICIAL WhatsApp Web protocol (Baileys): the
 *   number can be restricted or banned by WhatsApp. Use a separate number, not the main business number;
 * - "cloud": the official WhatsApp Business Platform (Cloud API). Supported and safe; needs a Meta app, a phone number
 *   id, an access token and the app secret.
 * Secrets (Cloud API access token and app secret) are stored encrypted and never returned to a browser.
 */
export type WaMode = "off" | "qr" | "cloud";
const KEY = "whatsapp-settings";
const TTL_MS = 10_000;

interface Stored {
  mode: WaMode;
  /** Where visitor messages are sent: "" = the linked number's own chat ("Message yourself"); otherwise a phone. */
  notifyTo: string;
  cloud: { phoneNumberId: string; verifyToken: string; accessToken?: string; appSecret?: string };
}

/** What the admin screen may see: no secrets, only whether they are set. */
export interface WaSettingsView {
  mode: WaMode;
  notifyTo: string;
  cloud: { phoneNumberId: string; verifyToken: string; hasAccessToken: boolean; hasAppSecret: boolean };
  encryption: boolean;
}

const g = globalThis as unknown as { __waSettings?: { at: number; value: Stored } };
const EMPTY: Stored = { mode: "off", notifyTo: "", cloud: { phoneNumberId: "", verifyToken: "" } };

async function load(): Promise<Stored> {
  const cur = g.__waSettings;
  if (cur && Date.now() - cur.at < TTL_MS) return cur.value;
  const db = getDb();
  const row = db ? await db.storeSetting.findUnique({ where: { key: KEY } }).catch(() => null) : null;
  const raw = (row?.value ?? {}) as Partial<Stored>;
  const value: Stored = {
    mode: raw.mode === "qr" || raw.mode === "cloud" ? raw.mode : "off",
    notifyTo: typeof raw.notifyTo === "string" ? raw.notifyTo : "",
    cloud: { ...EMPTY.cloud, ...(raw.cloud ?? {}) },
  };
  g.__waSettings = { at: Date.now(), value };
  return value;
}

export async function getWaSettings(): Promise<WaSettingsView> {
  const s = await load();
  return {
    mode: s.mode,
    notifyTo: s.notifyTo,
    cloud: { phoneNumberId: s.cloud.phoneNumberId, verifyToken: s.cloud.verifyToken, hasAccessToken: Boolean(s.cloud.accessToken), hasAppSecret: Boolean(s.cloud.appSecret) },
    encryption: encryptionConfigured(),
  };
}

/** Server only: the Cloud API secrets, decrypted. */
export async function getCloudSecrets(): Promise<{ phoneNumberId: string; verifyToken: string; accessToken: string; appSecret: string } | null> {
  const s = await load();
  const accessToken = s.cloud.accessToken ? decryptSecret(s.cloud.accessToken) : null;
  const appSecret = s.cloud.appSecret ? decryptSecret(s.cloud.appSecret) : null;
  if (!s.cloud.phoneNumberId || !accessToken || !appSecret) return null;
  return { phoneNumberId: s.cloud.phoneNumberId, verifyToken: s.cloud.verifyToken, accessToken, appSecret };
}

export const settingsInput = z.object({
  mode: z.enum(["off", "qr", "cloud"]),
  notifyTo: z.union([z.literal(""), z.string().trim().regex(/^\+?[\d\s-]{9,16}$/)]).default(""),
  cloud: z
    .object({
      phoneNumberId: z.union([z.literal(""), z.string().trim().regex(/^\d{5,25}$/)]).default(""),
      verifyToken: z.union([z.literal(""), z.string().trim().min(8).max(100)]).default(""),
      /** Empty keeps the saved value. */
      accessToken: z.string().trim().max(1000).default(""),
      appSecret: z.string().trim().max(200).default(""),
    })
    .default({ phoneNumberId: "", verifyToken: "", accessToken: "", appSecret: "" }),
});

export async function saveWaSettings(input: z.infer<typeof settingsInput>, by: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "The website database is not configured." };
  const cur = await load();
  if ((input.cloud.accessToken || input.cloud.appSecret) && !encryptionConfigured()) {
    return { ok: false, error: "SETTINGS_ENCRYPTION_KEY is not set on the server, so secrets cannot be stored safely." };
  }
  const next: Stored = {
    mode: input.mode,
    notifyTo: input.notifyTo.replace(/[^\d+]/g, ""),
    cloud: {
      phoneNumberId: input.cloud.phoneNumberId,
      verifyToken: input.cloud.verifyToken,
      accessToken: input.cloud.accessToken ? encryptSecret(input.cloud.accessToken) : cur.cloud.accessToken,
      appSecret: input.cloud.appSecret ? encryptSecret(input.cloud.appSecret) : cur.cloud.appSecret,
    },
  };
  if (next.mode === "cloud") {
    if (!next.cloud.phoneNumberId || !next.cloud.accessToken || !next.cloud.appSecret || !next.cloud.verifyToken) {
      return { ok: false, error: "For the Cloud API, fill in the phone number id, access token, app secret and verify token." };
    }
    if (!next.notifyTo) return { ok: false, error: "For the Cloud API, enter the staff WhatsApp number that receives the chats." };
  }
  const value = JSON.parse(JSON.stringify(next));
  await db.storeSetting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedBy: by }, update: { value, updatedBy: by } });
  g.__waSettings = undefined;
  return { ok: true };
}

/** Digits only, with a Sri Lankan local number (07...) turned into the international form (947...). */
export function toWaDigits(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = `94${d.slice(1)}`;
  return d;
}
