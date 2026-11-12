import { TtlLruStore } from "../session/store";

/**
 * Session id registry (M1-D). The session id is a conversation handle chosen by the website backend; it is NOT a credential.
 * Authority always comes from the signed identity. This registry adds three protections on top:
 *
 * - Ownership: an id first used by one identity (a guest, or one customer) can never be used by another. A shopper who logs
 *   in or out must get a new id (the website backend rotates it), which also removes session fixation: an id an attacker picked
 *   for a guest can never become the victim's logged-in session.
 * - Expiry: an id unused for the idle limit, or older than the absolute limit, is forgotten and starts a fresh conversation.
 * - New-session accounting: the caller can limit how many new ids one identity starts.
 *
 * Only ids and identity keys are held, in memory. No message text.
 */
export type SessionTouch = { status: "new" } | { status: "existing" } | { status: "conflict" };

interface Binding {
  identityKey: string;
  createdAt: number;
}

export class SessionRegistry {
  private readonly bindings: TtlLruStore<Binding>;
  private readonly now: () => number;

  constructor(private readonly opts: { idleMs?: number; maxAgeMs?: number; max?: number; now?: () => number } = {}) {
    this.now = opts.now ?? Date.now;
    this.bindings = new TtlLruStore<Binding>({ max: opts.max ?? 5_000, ttlMs: opts.idleMs ?? 30 * 60_000, ...(opts.now ? { now: opts.now } : {}) });
  }

  touch(identityKey: string, sessionId: string): SessionTouch {
    const t = this.now();
    const b = this.bindings.get(sessionId); // sliding idle expiry is handled by the store
    if (b && t - b.createdAt > (this.opts.maxAgeMs ?? 8 * 3_600_000)) {
      this.bindings.delete(sessionId); // absolute lifetime reached: start over
    } else if (b) {
      return b.identityKey === identityKey ? { status: "existing" } : { status: "conflict" };
    }
    this.bindings.set(sessionId, { identityKey, createdAt: t });
    return { status: "new" };
  }

  size(): number {
    return this.bindings.size();
  }
}
