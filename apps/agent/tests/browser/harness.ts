import { ConfirmationStore } from "../../src/browser/confirmations";
import { BrowserTaskRunner, type RunnerOptions } from "../../src/browser/loop";
import { BrowserToolService } from "../../src/browser/service";
import { BrowserSessionManager, DEFAULT_SESSION_LIMITS, type AuditEvent, type SessionLimits, type SessionOwner } from "../../src/browser/sessions";
import { productionPolicy } from "../../src/security/url-policy";
import { MockBrowserDriver } from "./mock-site";

export const HOME = "https://valta.hexalyte.com/";
export const ownerA: SessionOwner = { assistantSessionId: "sess_A", identityKey: "guest:A" };
export const ownerB: SessionOwner = { assistantSessionId: "sess_B", identityKey: "guest:B" };

export interface Stack {
  driver: MockBrowserDriver;
  sessions: BrowserSessionManager;
  confirmations: ConfirmationStore;
  service: BrowserToolService;
  runner: (opts?: RunnerOptions) => BrowserTaskRunner;
  audit: AuditEvent[];
  clock: { t: number };
}

export function makeStack(over: { enforceAllowlist?: boolean; limits?: Partial<SessionLimits>; slowMs?: number } = {}): Stack {
  const clock = { t: 1_000_000 };
  const now = () => clock.t;
  const audit: AuditEvent[] = [];
  const policy = productionPolicy();
  const driver = new MockBrowserDriver({ policy, ...(over.enforceAllowlist === false ? { enforceAllowlist: false } : {}), ...(over.slowMs ? { slowMs: over.slowMs } : {}) });
  const sessions = new BrowserSessionManager(driver, { ...DEFAULT_SESSION_LIMITS, maxConcurrent: 4, maxPerIdentity: 1, ...over.limits }, now, (e) => audit.push(e));
  const confirmations = new ConfirmationStore(now);
  const service = new BrowserToolService({ driver, sessions, confirmations, policy, now, audit: (e) => audit.push(e) });
  return { driver, sessions, confirmations, service, audit, clock, runner: (opts = {}) => new BrowserTaskRunner(service, sessions, { now, ...opts }) };
}

export async function openHome(s: Stack, owner = ownerA): Promise<string> {
  const r = await s.service.call(owner, "browser.open_page", { target: HOME });
  if (!r.ok) throw new Error(`open failed: ${r.reason}`);
  return r.sessionId;
}

/** Finds an element ref by role and name on the current page of a session. */
export async function refOf(s: Stack, owner: SessionOwner, sessionId: string, name: string, role?: string): Promise<string> {
  const r = await s.service.call(owner, "browser.find_elements", { sessionId, nameContains: name, ...(role ? { role } : {}) });
  if (!r.ok || !r.elements?.length) throw new Error(`no element "${name}"`);
  return r.elements[0]!.ref;
}
