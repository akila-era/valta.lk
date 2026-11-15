/**
 * The gateway's error taxonomy. A GatewayError carries a kind, a retry hint and (for HTTP failures) the status number. It NEVER carries
 * provider text: the message is a fixed code, so nothing a provider (or a page it quoted) says can reach a customer or a log.
 */
export type ErrorKind =
  | "auth"
  | "quota"
  | "rate_limit"
  | "timeout"
  | "unavailable"
  | "bad_request"
  | "safety_blocked"
  | "budget_exceeded"
  | "disabled"
  | "not_configured"
  | "circuit_open"
  | "internal";

const RETRYABLE: ReadonlySet<ErrorKind> = new Set(["rate_limit", "timeout", "unavailable"]);

export interface GatewayErrorInit {
  status?: number;
  retryAfterMs?: number;
  /** Fixed, non-provider detail such as "input_too_large". Never free text from a provider. */
  code?: string;
  /** True when the outcome of the call is unknown (it may have been billed): a timeout, a dropped connection. */
  outcomeUnknown?: boolean;
  retryable?: boolean;
}

export class GatewayError extends Error {
  readonly kind: ErrorKind;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly code: string;
  readonly retryable: boolean;
  readonly outcomeUnknown: boolean;

  constructor(kind: ErrorKind, init: GatewayErrorInit = {}) {
    super(`gateway:${kind}${init.code ? `:${init.code}` : ""}`);
    this.name = "GatewayError";
    this.kind = kind;
    this.status = init.status;
    this.retryAfterMs = init.retryAfterMs;
    this.code = init.code ?? kind;
    this.retryable = init.retryable ?? RETRYABLE.has(kind);
    this.outcomeUnknown = init.outcomeUnknown ?? (kind === "timeout");
  }

  toJSON(): { kind: ErrorKind; code: string; status?: number } {
    return { kind: this.kind, code: this.code, ...(this.status !== undefined ? { status: this.status } : {}) };
  }
}

export const isGatewayError = (e: unknown): e is GatewayError => e instanceof GatewayError;

/** Maps an HTTP failure of the provider to a kind. Only the status number and a short machine code from the body are used. */
export function classifyHttpFailure(status: number, bodyCode?: string): GatewayError {
  const code = (bodyCode ?? "").toLowerCase();
  if (status === 400 && /safety|jailbreak|prohibited|blocklist/.test(code)) return new GatewayError("safety_blocked", { status, code: "provider_block" });
  if (status === 400 || status === 404 || status === 413 || status === 422) return new GatewayError("bad_request", { status });
  if (status === 401 || status === 403) return new GatewayError("auth", { status });
  if (status === 402) return new GatewayError("quota", { status, code: "payment_required" });
  if (status === 408) return new GatewayError("timeout", { status });
  if (status === 429) return new GatewayError("rate_limit", { status });
  if (status === 500 || status === 502 || status === 503 || status === 504) return new GatewayError("unavailable", { status });
  return new GatewayError("internal", { status, retryable: false });
}

/** What a customer may be told. Sinhala wording is provisional and needs native review. */
export interface UserMessage {
  en: string;
  si: string;
  needsNativeReview: true;
}

const MESSAGES: Record<ErrorKind, { en: string; si: string }> = {
  auth: { en: "The assistant is temporarily unavailable. Please try again later.", si: "සහායකයා දැනට ලබා ගත නොහැක. කරුණාකර පසුව නැවත උත්සාහ කරන්න." },
  quota: { en: "The assistant is temporarily unavailable. Please try again later.", si: "සහායකයා දැනට ලබා ගත නොහැක. කරුණාකර පසුව නැවත උත්සාහ කරන්න." },
  rate_limit: { en: "The assistant is busy right now. Please try again in a moment.", si: "සහායකයා දැන් කාර්යබහුලයි. කරුණාකර මොහොතකින් නැවත උත්සාහ කරන්න." },
  timeout: { en: "The assistant took too long to answer. Please try again.", si: "පිළිතුර ලබා දීමට සහායකයාට වැඩි කාලයක් ගියා. කරුණාකර නැවත උත්සාහ කරන්න." },
  unavailable: { en: "The assistant is temporarily unavailable. Please try again later.", si: "සහායකයා දැනට ලබා ගත නොහැක. කරුණාකර පසුව නැවත උත්සාහ කරන්න." },
  bad_request: { en: "I could not process that message. Please try rephrasing it.", si: "ඒ පණිවිඩය සැකසීමට නොහැකි විය. කරුණාකර වෙනත් ආකාරයකින් ලියා බලන්න." },
  safety_blocked: { en: "I can't help with that request.", si: "ඒ ඉල්ලීමට මට උදව් කළ නොහැක." },
  budget_exceeded: { en: "The assistant is temporarily unavailable. Please try again later.", si: "සහායකයා දැනට ලබා ගත නොහැක. කරුණාකර පසුව නැවත උත්සාහ කරන්න." },
  disabled: { en: "The assistant is not available right now.", si: "සහායකයා දැනට ක්‍රියාත්මක නැත." },
  not_configured: { en: "The assistant is not available right now.", si: "සහායකයා දැනට ක්‍රියාත්මක නැත." },
  circuit_open: { en: "The assistant is temporarily unavailable. Please try again later.", si: "සහායකයා දැනට ලබා ගත නොහැක. කරුණාකර පසුව නැවත උත්සාහ කරන්න." },
  internal: { en: "Something went wrong. Please try again.", si: "යම් දෝෂයක් සිදු විය. කරුණාකර නැවත උත්සාහ කරන්න." },
};

/** User-safe wording for an error kind. Fixed text only: never provider output. Failures are never worded as if an answer had been generated. */
export function userMessage(kind: ErrorKind): UserMessage {
  const m = MESSAGES[kind];
  return { en: m.en, si: m.si, needsNativeReview: true };
}
