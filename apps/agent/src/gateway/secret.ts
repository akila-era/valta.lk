import { inspect } from "node:util";

/**
 * Holds a credential so that it cannot reach a log, an error message, a JSON document or a console by accident. The value is only
 * reachable through reveal(), which only the provider adapter calls (to put it in a request header).
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  get length(): number {
    return this.#value.length;
  }

  toString(): string {
    return "[redacted]";
  }

  toJSON(): string {
    return "[redacted]";
  }

  [inspect.custom](): string {
    return "[redacted]";
  }
}

/** Shapes of Google API credentials. Used only to scrub text; they never decide whether a key is valid. */
const KEY_SHAPES: readonly RegExp[] = [/\bAIza[0-9A-Za-z_-]{30,}/g, /\bAQ\.[0-9A-Za-z_-]{20,}/g, /\bya29\.[0-9A-Za-z_-]{20,}/g];

/** Removes the given secret values and anything shaped like a Google credential from a text. Safe to call on any string. */
export function redactSecrets(text: string, secrets: readonly (Secret | string | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) {
    const v = s instanceof Secret ? s.reveal() : s;
    if (v && v.length >= 8) out = out.split(v).join("[redacted]");
  }
  for (const re of KEY_SHAPES) out = out.replace(re, "[redacted]");
  return out;
}
