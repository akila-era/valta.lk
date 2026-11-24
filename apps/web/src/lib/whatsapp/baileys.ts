import "server-only";
import { getDb } from "../db";
import { decryptSecret, encryptionConfigured, encryptSecret } from "../erp/connection";

/**
 * QR linking ("Linked devices") through Baileys, an UNOFFICIAL open-source WhatsApp Web client. WhatsApp does not
 * allow unofficial clients: the linked number can be restricted or banned. It is offered for small volumes and
 * testing; production should use the Cloud API mode.
 *
 * One connection per server process (kept on globalThis). The session is stored encrypted in the WhatsAppAuth table,
 * so a server restart reconnects without a new QR scan (see instrumentation.ts). When the connection drops it
 * reconnects by itself with a growing delay; when the phone unlinks the device, the session is deleted.
 */
export type WaStatus = "disconnected" | "connecting" | "qr" | "connected";

type Sock = {
  user?: { id: string; lid?: string };
  ev: { on: (event: string, cb: (arg: never) => void) => void };
  sendMessage: (jid: string, content: { text: string }) => Promise<{ key: { id?: string | null } } | undefined>;
  onWhatsApp: (...jids: string[]) => Promise<{ jid: string; exists: boolean }[] | undefined>;
  signalRepository?: { lidMapping?: { getPNForLID?: (lid: string) => Promise<string | null> } };
  logout: () => Promise<void>;
  end: (err?: Error) => void;
};

interface State {
  status: WaStatus;
  qr: string | null;
  me: string | null;
  error: string | null;
  sock: Sock | null;
  /** True after Disconnect: no automatic reconnection until Connect is pressed again. */
  stopped: boolean;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const g = globalThis as unknown as { __wa?: State };
const state = (): State => (g.__wa ??= { status: "disconnected", qr: null, me: null, error: null, sock: null, stopped: true, attempts: 0, timer: null });

export function waState() {
  const s = state();
  return { status: s.status, qr: s.qr, me: s.me, error: s.error };
}

/** Handlers set by the relay (kept here as callbacks so this file does not import the relay). */
type Handlers = {
  onIncoming: (m: { id: string; jid: string; text: string; quotedId: string | null; allowed: boolean }) => Promise<void>;
  onStatus: (m: { id: string; status: "SENT" | "DELIVERED" | "READ" }) => Promise<void>;
};
const h = globalThis as unknown as { __waHandlers?: Handlers };
export function setWaHandlers(handlers: Handlers) {
  h.__waHandlers = handlers;
}

// ---------- session storage (encrypted, in the database) ----------

async function readKey(key: string): Promise<unknown> {
  const db = getDb();
  if (!db) return null;
  const row = await db.whatsAppAuth.findUnique({ where: { key } }).catch(() => null);
  if (!row) return null;
  const text = decryptSecret(row.value);
  if (!text) return null;
  const { BufferJSON } = await import("@whiskeysockets/baileys");
  return JSON.parse(text, BufferJSON.reviver);
}

async function writeKey(key: string, value: unknown) {
  const db = getDb();
  if (!db) return;
  const { BufferJSON } = await import("@whiskeysockets/baileys");
  const enc = encryptSecret(JSON.stringify(value, BufferJSON.replacer));
  await db.whatsAppAuth.upsert({ where: { key }, create: { key, value: enc }, update: { value: enc } });
}

async function deleteKey(key: string) {
  await getDb()?.whatsAppAuth.deleteMany({ where: { key } }).catch(() => undefined);
}

export async function hasSavedSession(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  return (await db.whatsAppAuth.count({ where: { key: "creds" } }).catch(() => 0)) > 0;
}

async function clearSession() {
  await getDb()?.whatsAppAuth.deleteMany({}).catch(() => undefined);
}

// ---------- connection ----------

const sleepFor = (attempt: number) => Math.min(60_000, 2_000 * 2 ** Math.min(attempt, 5));

export async function connectWhatsApp(): Promise<void> {
  const s = state();
  if (!encryptionConfigured()) {
    s.error = "SETTINGS_ENCRYPTION_KEY is not set on the server, so the WhatsApp session cannot be stored safely.";
    s.status = "disconnected";
    return;
  }
  if (s.sock && (s.status === "connected" || s.status === "connecting" || s.status === "qr")) return;
  s.stopped = false;
  s.error = null;
  s.status = "connecting";
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;

  try {
    const baileys = await import("@whiskeysockets/baileys");
    const makeWASocket = baileys.default;
    const { DisconnectReason, initAuthCreds, makeCacheableSignalKeyStore, proto, Browsers, fetchLatestBaileysVersion } = baileys;
    const pino = (await import("pino")).default;
    const logger = pino({ level: "silent" });

    const creds = ((await readKey("creds")) as ReturnType<typeof initAuthCreds> | null) ?? initAuthCreds();
    const keys = {
      get: async (type: string, ids: string[]) => {
        const out: Record<string, unknown> = {};
        await Promise.all(
          ids.map(async (id) => {
            let v = await readKey(`${type}-${id}`);
            if (type === "app-state-sync-key" && v) v = proto.Message.AppStateSyncKeyData.fromObject(v as object);
            out[id] = v ?? undefined;
          }),
        );
        return out;
      },
      set: async (data: Record<string, Record<string, unknown>>) => {
        const jobs: Promise<unknown>[] = [];
        for (const category of Object.keys(data)) {
          for (const id of Object.keys(data[category])) {
            const value = data[category][id];
            jobs.push(value ? writeKey(`${category}-${id}`, value) : deleteKey(`${category}-${id}`));
          }
        }
        await Promise.all(jobs);
      },
    };

    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const sock = makeWASocket({
      ...(version ? { version } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Baileys' own key store types
      auth: { creds, keys: makeCacheableSignalKeyStore(keys as any, logger) },
      logger,
      browser: Browsers.ubuntu("VOLTA.LK Support"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      printQRInTerminal: false,
    }) as unknown as Sock;
    s.sock = sock;

    sock.ev.on("creds.update", (() => {
      writeKey("creds", creds).catch(() => undefined);
    }) as never);

    sock.ev.on("connection.update", ((u: { connection?: string; qr?: string; lastDisconnect?: { error?: { output?: { statusCode?: number } } } }) => {
      if (u.qr) {
        s.status = "qr";
        s.qr = u.qr;
      }
      if (u.connection === "open") {
        s.status = "connected";
        s.qr = null;
        s.attempts = 0;
        s.error = null;
        s.me = sock.user?.id ?? null;
      }
      if (u.connection === "close") {
        s.sock = null;
        s.qr = null;
        const code = u.lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          // Unlinked from the phone: the saved session is useless now.
          s.status = "disconnected";
          s.me = null;
          s.error = "This device was unlinked from WhatsApp. Scan a new QR code to connect again.";
          s.stopped = true;
          clearSession();
          return;
        }
        if (s.stopped) {
          s.status = "disconnected";
          return;
        }
        // Dropped connection (network, server restart, WhatsApp asking for a restart): try again with a growing delay.
        s.status = "connecting";
        const wait = code === DisconnectReason.restartRequired ? 0 : sleepFor(s.attempts++);
        s.timer = setTimeout(() => {
          s.timer = null;
          if (!s.stopped) connectWhatsApp().catch(() => undefined);
        }, wait);
      }
    }) as never);

    type Content = { conversation?: string | null; extendedTextMessage?: { text?: string | null; contextInfo?: { stanzaId?: string | null } | null } | null; ephemeralMessage?: { message?: Content | null } | null; viewOnceMessage?: { message?: Content | null } | null; viewOnceMessageV2?: { message?: Content | null } | null };
    sock.ev.on("messages.upsert", ((u: { messages: { key: { id?: string | null; remoteJid?: string | null; remoteJidAlt?: string | null; fromMe?: boolean | null }; message?: Content | null }[] }) => {
      const handlers = h.__waHandlers;
      if (!handlers) return;
      for (const m of u.messages) {
        const id = m.key.id;
        const jid = m.key.remoteJid ?? "";
        if (!id || recentlySent().has(id)) continue; // a copy this server just sent, not a staff reply
        // Chats with disappearing messages (or view once) wrap the real message one level down.
        const c = m.message?.ephemeralMessage?.message ?? m.message?.viewOnceMessage?.message ?? m.message?.viewOnceMessageV2?.message ?? m.message ?? null;
        const text = (c?.conversation ?? c?.extendedTextMessage?.text ?? "").trim();
        if (!text) continue;
        const quotedId = c?.extendedTextMessage?.contextInfo?.stanzaId ?? null;
        // WhatsApp now often addresses chats by a private id (…@lid) instead of the phone number, so the staff chat
        // is recognised by the phone-number form too (sent along as remoteJidAlt, or looked up from the LID).
        const alt = m.key.remoteJidAlt ?? "";
        (async () => {
          let allowed = isStaffChat(jid) || (alt ? isStaffChat(alt) : false);
          if (!allowed && jid.endsWith("@lid")) {
            const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid).catch(() => null);
            if (pn) allowed = isStaffChat(pn);
          }
          await handlers.onIncoming({ id, jid, text, quotedId, allowed });
        })().catch(() => undefined);
      }
    }) as never);

    sock.ev.on("messages.update", ((updates: { key: { id?: string | null; fromMe?: boolean | null }; update: { status?: number | null } }[]) => {
      const handlers = h.__waHandlers;
      if (!handlers) return;
      for (const up of updates) {
        if (!up.key.id || !up.key.fromMe || up.update.status == null) continue;
        const st = up.update.status >= 4 ? "READ" : up.update.status === 3 ? "DELIVERED" : up.update.status === 2 ? "SENT" : null;
        if (st) handlers.onStatus({ id: up.key.id, status: st }).catch(() => undefined);
      }
    }) as never);
  } catch (e) {
    s.sock = null;
    s.status = "disconnected";
    s.error = e instanceof Error ? e.message.slice(0, 200) : "Could not start the WhatsApp connection.";
  }
}

/** Disconnect. `unlink` also logs the device out of WhatsApp and deletes the saved session (a new QR is needed). */
export async function disconnectWhatsApp(unlink: boolean) {
  const s = state();
  s.stopped = true;
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  const sock = s.sock;
  s.sock = null;
  s.qr = null;
  s.status = "disconnected";
  if (sock) {
    if (unlink) await sock.logout().catch(() => undefined);
    else sock.end(undefined);
  }
  if (unlink) {
    s.me = null;
    await clearSession();
  }
}

/** The chat where visitor messages go: the configured staff number, or the linked number's own chat. */
const t = globalThis as unknown as { __waNotify?: string; __waSent?: Set<string> };
export function setNotifyTarget(phoneDigits: string) {
  t.__waNotify = phoneDigits;
}
/** Ids of messages this server sent in the last minutes (they come back as "new" messages and must be skipped). */
function recentlySent(): Set<string> {
  return (t.__waSent ??= new Set());
}
function rememberSent(id: string) {
  const s = recentlySent();
  s.add(id);
  if (s.size > 500) s.delete(s.values().next().value as string);
}
function bare(jid: string) {
  return jid.replace(/:\d+(?=@)/, "");
}
function ownJids(): string[] {
  const u = state().sock?.user;
  return [u?.id, u?.lid].filter((x): x is string => Boolean(x)).map(bare);
}
function isStaffChat(jid: string): boolean {
  const j = bare(jid);
  const notifyTarget = t.__waNotify ?? "";
  if (notifyTarget) return j === `${notifyTarget}@s.whatsapp.net`;
  return ownJids().includes(j);
}

export async function sendViaLinkedDevice(text: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const s = state();
  if (!s.sock || s.status !== "connected") return { ok: false, error: "WhatsApp is not connected." };
  const notifyTarget = t.__waNotify ?? "";
  const to = notifyTarget ? `${notifyTarget}@s.whatsapp.net` : ownJids()[0];
  if (!to) return { ok: false, error: "WhatsApp is not connected." };
  try {
    const sent = await s.sock.sendMessage(to, { text });
    const id = sent?.key.id;
    if (id) rememberSent(id);
    return id ? { ok: true, id } : { ok: false, error: "WhatsApp did not accept the message." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "Sending failed." };
  }
}

/** Sends a message from the linked number to any WhatsApp number (digits in international form, e.g. 94771234567). */
export async function sendToNumberViaLinkedDevice(digits: string, text: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const s = state();
  if (!s.sock || s.status !== "connected") return { ok: false, error: "WhatsApp is not connected." };
  try {
    const found = await s.sock.onWhatsApp(`${digits}@s.whatsapp.net`).catch(() => undefined);
    const hit = found?.find((r) => r.exists);
    if (found && !hit) return { ok: false, error: "This phone number is not on WhatsApp." };
    const sent = await s.sock.sendMessage(hit?.jid ?? `${digits}@s.whatsapp.net`, { text });
    const id = sent?.key.id;
    if (id) rememberSent(id);
    return id ? { ok: true, id } : { ok: false, error: "WhatsApp did not accept the message." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "Sending failed." };
  }
}
