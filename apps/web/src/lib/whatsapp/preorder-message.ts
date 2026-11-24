import "server-only";
import { z } from "zod";
import { getDb } from "../db";
import { siteConfig } from "../site-config";
import { sendToNumberViaLinkedDevice } from "./baileys";
import { sendViaCloud } from "./cloud";
import { ensureLinkedDevice } from "./relay";
import { getCloudSecrets, getWaSettings, toWaDigits } from "./settings";

/**
 * The WhatsApp message a customer gets right after sending a pre-order, from the store's linked WhatsApp
 * (Admin, WhatsApp chat). Staff choose one of three templates (and can reword them) in Admin, Sales & Orders,
 * Pre-orders. Placeholders: {name} {ref} {product} {qty} {store}.
 *
 * Notes: with QR linking, messaging customers who never wrote to the number first adds to the risk of WhatsApp
 * restricting it. With the Cloud API, WhatsApp only delivers free-form text within 24 hours of the customer's last
 * message to the business; otherwise Meta requires an approved template, so such sends fail and are marked FAILED.
 */
const KEY = "preorder-whatsapp";

export const DEFAULT_TEMPLATES: [string, string, string] = [
  "Hi {name}, thank you for your pre-order at {store}!\n\nReference: {ref}\nProduct: {product}\nQuantity: {qty}\n\nWe will let you know as soon as it is in stock and confirm the payment with you here. Reply to this message if you have any questions.",
  "{store}: pre-order {ref} received for {qty} x {product}. We will contact you on WhatsApp to confirm the payment and delivery. Thank you, {name}!",
  "Dear {name},\n\nWe have received your pre-order {ref} for {qty} x {product}.\n\nNo payment has been taken yet. Our team will contact you to confirm the price, the payment method (cash on delivery or bank transfer) and the expected delivery date.\n\nThank you for shopping with {store}.",
];
export const TEMPLATE_NAMES = ["Friendly", "Short", "Formal"] as const;

export interface PreorderMessageSettings {
  enabled: boolean;
  /** 0, 1 or 2: the template in use. */
  selected: number;
  templates: [string, string, string];
}

const g = globalThis as unknown as { __preorderMsg?: { at: number; value: PreorderMessageSettings } };

export async function getPreorderMessageSettings(): Promise<PreorderMessageSettings> {
  const cur = g.__preorderMsg;
  if (cur && Date.now() - cur.at < 10_000) return cur.value;
  const db = getDb();
  const row = db ? await db.storeSetting.findUnique({ where: { key: KEY } }).catch(() => null) : null;
  const raw = (row?.value ?? {}) as Partial<PreorderMessageSettings>;
  const t = Array.isArray(raw.templates) ? raw.templates : [];
  const value: PreorderMessageSettings = {
    enabled: raw.enabled !== false,
    selected: raw.selected === 1 || raw.selected === 2 ? raw.selected : 0,
    templates: [0, 1, 2].map((i) => (typeof t[i] === "string" && t[i].trim() ? t[i] : DEFAULT_TEMPLATES[i])) as [string, string, string],
  };
  g.__preorderMsg = { at: Date.now(), value };
  return value;
}

export const preorderMessageInput = z.object({
  enabled: z.boolean(),
  selected: z.number().int().min(0).max(2),
  templates: z.tuple([z.string().trim().min(10).max(1000), z.string().trim().min(10).max(1000), z.string().trim().min(10).max(1000)]),
});

export async function savePreorderMessageSettings(v: z.infer<typeof preorderMessageInput>, by: string) {
  const db = getDb();
  if (!db) return false;
  const value = JSON.parse(JSON.stringify(v));
  await db.storeSetting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedBy: by }, update: { value, updatedBy: by } });
  g.__preorderMsg = undefined;
  return true;
}

export function renderTemplate(t: string, vars: { name: string; ref: string; product: string; qty: number }) {
  const map: Record<string, string> = { name: vars.name, ref: vars.ref, product: vars.product, qty: String(vars.qty), store: siteConfig.name };
  return t.replace(/\{(name|ref|product|qty|store)\}/g, (_, k: string) => map[k]).slice(0, 1500);
}

/** Sends the chosen template to the customer and records SENT / FAILED on the pre-order. Never throws. */
export async function sendPreorderMessage(preorderId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const p = await db.preOrderRequest.findUnique({ where: { id: preorderId } });
    if (!p) return;
    const settings = await getPreorderMessageSettings();
    const wa = await getWaSettings();
    if (!settings.enabled || wa.mode === "off") return; // nothing to send with: leave waStatus empty
    const text = renderTemplate(settings.templates[settings.selected], { name: p.name, ref: p.ref, product: p.productName, qty: p.quantity });
    const to = toWaDigits(p.phone);
    let result: { ok: true; id: string } | { ok: false; error: string };
    if (wa.mode === "qr") {
      await ensureLinkedDevice();
      result = await sendToNumberViaLinkedDevice(to, text);
    } else {
      const creds = await getCloudSecrets();
      result = creds ? await sendViaCloud(creds, to, text) : { ok: false, error: "The WhatsApp Cloud API is not set up." };
    }
    await db.preOrderRequest.update({ where: { id: p.id }, data: result.ok ? { waStatus: "SENT", waError: null } : { waStatus: "FAILED", waError: result.error.slice(0, 200) } });
  } catch {
    await db.preOrderRequest.update({ where: { id: preorderId }, data: { waStatus: "FAILED", waError: "Sending failed." } }).catch(() => undefined);
  }
}
