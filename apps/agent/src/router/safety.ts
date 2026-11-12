import { EXFILTRATION_PATTERNS, INJECTION_PATTERNS, PRICE_MANIPULATION_PATTERNS, SENSITIVE_VALUE_PATTERNS } from "./lexicon/safety";
import { normalizeDisplay, normalizeMatch } from "./normalize";

export type SafetyReason = "injection" | "price_manipulation" | "exfiltration" | "sensitive_input";

export type SafetyVerdict = { blocked: false } | { blocked: true; reason: SafetyReason };

const compile = (sources: string[]) => sources.map((s) => new RegExp(s, "iu"));
const INJECTION = compile(INJECTION_PATTERNS);
const PRICE = compile(PRICE_MANIPULATION_PATTERNS);
const EXFIL = compile(EXFILTRATION_PATTERNS);
const SENSITIVE = compile(SENSITIVE_VALUE_PATTERNS);

/** Luhn check for card-like digit runs. */
export function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Digit runs of 13 to 19 digits, allowing single spaces or dashes between groups. */
function hasCardNumber(text: string): boolean {
  for (const m of text.matchAll(/\d(?:[ -]?\d){12,18}/g)) {
    if (luhnValid(m[0].replace(/[ -]/g, ""))) return true;
  }
  return false;
}

const anyMatch = (patterns: RegExp[], ...texts: string[]) => patterns.some((r) => texts.some((t) => r.test(t)));

/** True when the text looks like a card number, OTP, password, NIC, API key or authentication token. Also used on outgoing text. */
export function containsSensitive(text: string): boolean {
  const raw = text.normalize("NFKC").toLowerCase();
  return hasCardNumber(raw) || anyMatch(SENSITIVE, raw, normalizeDisplay(text).toLowerCase(), normalizeMatch(text));
}

/**
 * Runs before any model and before any tool, in every language. Order of precedence: a shared secret is the most urgent
 * (it must never be processed or kept), then instruction injection, then data exfiltration, then price manipulation.
 */
export function checkSafety(message: string): SafetyVerdict {
  // Raw lower-case keeps structural markers such as "<|im_start|>" and "[SYSTEM]" intact; the match form handles Sinhala and joiners.
  const raw = message.normalize("NFKC").toLowerCase();
  const display = normalizeDisplay(message).toLowerCase();
  const match = normalizeMatch(message);

  if (hasCardNumber(raw) || anyMatch(SENSITIVE, raw, display, match)) return { blocked: true, reason: "sensitive_input" };
  if (anyMatch(INJECTION, raw, display, match)) return { blocked: true, reason: "injection" };
  if (anyMatch(EXFIL, raw, display, match)) return { blocked: true, reason: "exfiltration" };
  if (anyMatch(PRICE, raw, display, match)) return { blocked: true, reason: "price_manipulation" };
  return { blocked: false };
}
