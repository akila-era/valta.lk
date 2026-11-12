export const ERROR_CODES = [
  "INVALID_REQUEST",
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "RATE_LIMITED",
  "CHALLENGE_REQUIRED",
  "AI_UNAVAILABLE",
  "AI_DISABLED",
  "QUEUE_FULL",
  "TIMEOUT",
  "UPSTREAM_ERROR",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  RATE_LIMITED: 429,
  CHALLENGE_REQUIRED: 429,
  AI_UNAVAILABLE: 503,
  AI_DISABLED: 503,
  QUEUE_FULL: 503,
  TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
  INTERNAL: 500,
};

/** An error that is safe to show to the caller: the message never contains request content. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryAfterSec?: number;
  readonly fields?: Record<string, string>;

  constructor(code: ErrorCode, message: string, opts: { retryAfterSec?: number; fields?: Record<string, string> } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    if (opts.retryAfterSec !== undefined) this.retryAfterSec = opts.retryAfterSec;
    if (opts.fields !== undefined) this.fields = opts.fields;
  }
}
