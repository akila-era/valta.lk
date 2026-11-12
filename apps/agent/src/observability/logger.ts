/**
 * The logger accepts ONLY the fields below. There is no free-text field, so message text, names, phone numbers,
 * addresses, cart contents, tokens and secrets cannot be logged by accident: the type system refuses them.
 */
export interface LogEvent {
  requestId: string;
  route: string;
  method: string;
  status: number;
  latencyMs: number;
  identityKind?: "guest" | "customer" | "none";
  errorCode?: string;
  /** Why authentication failed, as a code (never any header value). */
  authReason?: string;
  degraded?: boolean;
}

export interface LogSink {
  write(line: string): void;
}

export interface Logger {
  log(event: LogEvent): void;
}

const ALLOWED: readonly (keyof LogEvent)[] = ["requestId", "route", "method", "status", "latencyMs", "identityKind", "errorCode", "authReason", "degraded"];

export function createLogger(sink: LogSink, now: () => number = Date.now): Logger {
  return {
    log(event) {
      const out: Record<string, unknown> = { ts: new Date(now()).toISOString() };
      // Copy by allow-list so even an `as any` caller cannot add a field.
      for (const key of ALLOWED) if (event[key] !== undefined) out[key] = event[key];
      sink.write(JSON.stringify(out));
    },
  };
}

export const consoleSink: LogSink = { write: (line) => process.stdout.write(`${line}\n`) };
export const nullLogger: Logger = { log: () => {} };

/**
 * The callback to give the pipeline for `onVerifierFailure`: records that a response was rejected and why (a short code), and nothing
 * the rejected response contained.
 */
export function verifierFailureLogger(logger: Logger): (info: { requestId: string; code: string }) => void {
  return ({ requestId, code }) => logger.log({ requestId, route: "/v1/chat", method: "POST", status: 200, latencyMs: 0, errorCode: `VERIFIER_${code.toUpperCase()}` });
}
