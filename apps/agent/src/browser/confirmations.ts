import { randomBytes } from "node:crypto";

/**
 * Single-use confirmations for browser actions that change something. A token exists only after the SHOPPER approved one exact
 * action in their own interface; it is bound to the browser session and to the hash of that action, expires quickly, and works once.
 * Page text, a model, or the loop itself can never mint one: only `issue` can, and `issue` is called by the approval endpoint.
 */
export const CONFIRMATION_TTL_MS = 120_000;

interface Entry {
  sessionId: string;
  actionHash: string;
  expiresAt: number;
}

export type ConsumeResult = "ok" | "invalid";

export class ConfirmationStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now, private readonly ttlMs: number = CONFIRMATION_TTL_MS) {}

  /** Called only by the approval path, after the shopper pressed Confirm on a card describing exactly this action. */
  issue(sessionId: string, actionHash: string): string {
    this.purge();
    const token = randomBytes(24).toString("base64url");
    this.entries.set(token, { sessionId, actionHash, expiresAt: this.now() + this.ttlMs });
    return token;
  }

  /** One use. Any mismatch (other session, other action, expired, unknown, already used) is just "invalid". */
  consume(token: string, sessionId: string, actionHash: string): ConsumeResult {
    this.purge();
    const e = this.entries.get(token);
    if (!e) return "invalid";
    this.entries.delete(token); // spent even if it does not match: a wrong guess burns the token
    return e.sessionId === sessionId && e.actionHash === actionHash && e.expiresAt > this.now() ? "ok" : "invalid";
  }

  get size(): number {
    return this.entries.size;
  }

  private purge() {
    const t = this.now();
    for (const [k, v] of this.entries) if (v.expiresAt <= t) this.entries.delete(k);
  }
}
