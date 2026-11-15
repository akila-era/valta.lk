import type { LlmHistoryConfig } from "./config";

/**
 * Short-term conversation history for the model, IN MEMORY ONLY. It is OFF by default (config.enabled=false: every call is a no-op and no text is kept).
 * Nothing is written to disk, to a log or to a metric; a restart forgets everything; one conversation's history can never be read with another's key.
 * Persistent customer history needs an approved privacy design and customer notice and is NOT implemented here.
 */
export interface HistoryTurn {
  user: string;
  assistant: string;
  at: number;
}

export class ConversationHistory {
  private readonly sessions = new Map<string, HistoryTurn[]>();

  constructor(
    private readonly config: LlmHistoryConfig,
    private readonly now: () => number = Date.now,
  ) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  /** Records one completed exchange. Text is cut to the per-message limit; only the newest `maxTurns` exchanges are kept. */
  append(key: string, turn: { user: string; assistant: string }): void {
    if (!this.config.enabled) return;
    const t = this.now();
    this.expire(t);
    const list = this.sessions.get(key) ?? [];
    list.push({ user: cut(turn.user, this.config.maxCharsPerMessage), assistant: cut(turn.assistant, this.config.maxCharsPerMessage), at: t });
    while (list.length > this.config.maxTurns) list.shift();
    // Re-insert so that the most recently used conversation is last (LRU order).
    this.sessions.delete(key);
    this.sessions.set(key, list);
    while (this.sessions.size > this.config.maxSessions) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
  }

  /** The newest exchanges of this conversation, oldest first. Empty when disabled, unknown or expired. */
  window(key: string, maxTurns: number = this.config.maxTurns): HistoryTurn[] {
    if (!this.config.enabled) return [];
    const t = this.now();
    const list = this.sessions.get(key);
    if (!list) return [];
    const fresh = list.filter((x) => t - x.at <= this.config.ttlMs);
    if (fresh.length === 0) {
      this.sessions.delete(key);
      return [];
    }
    if (fresh.length !== list.length) this.sessions.set(key, fresh);
    return fresh.slice(-Math.max(0, maxTurns)).map((x) => ({ ...x }));
  }

  /** The assistant's last reply (for the repetition check), or undefined. */
  lastAssistant(key: string): string | undefined {
    const w = this.window(key, 1);
    return w[0]?.assistant;
  }

  clear(key: string): void {
    this.sessions.delete(key);
  }

  size(): number {
    return this.sessions.size;
  }

  private expire(t: number): void {
    for (const [k, list] of this.sessions) {
      const last = list[list.length - 1];
      if (!last || t - last.at > this.config.ttlMs) this.sessions.delete(k);
    }
  }
}

function cut(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
