// Crockford-style alphabet without ambiguous characters.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const ORDER_REF_PATTERN = /^VLK-[0-9]{6}-[A-HJKMNP-TV-Z2-9]{10}$/;

/** Generates a website order reference. ~49 bits of randomness makes it unguessable enough to act as a tracking token. */
export function generateOrderRef(now = new Date()): string {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(10));
  let suffix = "";
  for (let i = 0; i < 10; i++) suffix += ALPHABET[bytes[i] % ALPHABET.length];
  return `VLK-${d}-${suffix}`;
}

export const isValidOrderRef = (ref: string) => ORDER_REF_PATTERN.test(ref);
