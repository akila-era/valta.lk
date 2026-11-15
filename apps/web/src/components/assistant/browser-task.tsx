"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { AlertTriangle, Check, Minus } from "lucide-react";
import { sendDecision, type DecisionResult } from "@/lib/assistant/browser-client";
import { labels, type LabelKey } from "./labels";
import type { AssistantLang, BrowserDecisionData, BrowserPanelData, BrowserProposalData, BrowserStepName } from "./types";

/**
 * Browser tasks in the assistant (contract 1.3), shown only when the server has AI_ASSISTANT_BROWSER=1 (the panel passes nothing here otherwise).
 *
 *  - BrowserProgressList: the steps of a page task with a clear status. The words come from OUR fixed labels chosen by the step name; the Agent's own label text
 *    and anything from the page are never shown here. A note says the page's own text is not a verified price or stock.
 *  - ApprovalPrompt / BrowserApproval: ONE approval for ONE action. It shows which page and which action, waits for an explicit Approve or Cancel, is disabled
 *    while the decision is being sent, counts down visibly, and is gone after one use. The Agent enforces the same rules (bound to the conversation and the
 *    action, single use, expiry); this component never presses anything on the page itself.
 */
const STEP_LABEL: Record<BrowserStepName, LabelKey> = { open: "stepOpen", read: "stepRead", find: "stepFind", act: "stepAct", verify: "stepVerify", close: "stepClose" };
const STATUS_LABEL = { done: "stepStatusDone", failed: "stepStatusFailed", skipped: "stepStatusSkipped" } as const;

const BLUE = "bg-[#2563EB] text-white hover:bg-[#1d4ed8] focus-visible:outline-[#2563EB] disabled:opacity-50";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2";
const SURFACE = "rounded-2xl border border-slate-200 bg-white shadow-sm";

export function BrowserProgressList({ panel, lang = "en" }: { panel: BrowserPanelData; lang?: AssistantLang }) {
  const t = labels(lang);
  if (panel.progress.length === 0) return null;
  return (
    <div className={`${SURFACE} p-3`} data-testid="browser-progress">
      <ol className="space-y-1.5 text-sm" aria-label={t.browserProgress}>
        {panel.progress.map((p, i) => (
          <li key={`${p.step}-${i}`} data-step={p.step} data-status={p.status} className={`flex items-center gap-2 ${p.status === "failed" ? "text-amber-800" : p.status === "skipped" ? "text-slate-500" : "text-slate-800"}`}>
            {p.status === "done" ? <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : p.status === "failed" ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden /> : <Minus className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
            <span className="min-w-0 break-words">{t[STEP_LABEL[p.step]]}</span>
            {/* The state is words, not only an icon or a colour. A finished step needs no extra text for sighted users but is read out for screen readers. */}
            <span className={p.status === "done" ? "sr-only" : "text-xs"}>: {t[STATUS_LABEL[p.status]]}</span>
          </li>
        ))}
      </ol>
      {panel.source === "page" ? <p className="mt-2 text-[11px] text-slate-500">{t.browserFromPage}</p> : null}
    </div>
  );
}

export type ApprovalPhase = "ready" | "sending" | "error" | "done" | "cancelled" | "failed" | "expired";

/** Presentational: everything it shows comes from its props, and it calls back only after a click. */
export function ApprovalPrompt({
  proposal,
  lang = "en",
  phase,
  secondsLeft,
  onApprove,
  onCancel,
  onRetry,
  headingId = "browser-approval-title",
  containerRef,
}: {
  proposal: BrowserProposalData;
  lang?: AssistantLang;
  phase: ApprovalPhase;
  secondsLeft: number;
  onApprove: () => void;
  onCancel: () => void;
  onRetry: () => void;
  headingId?: string;
  containerRef?: Ref<HTMLElement>;
}) {
  const t = labels(lang);
  if (phase === "done") return null; // the Agent's reply and the progress take over as a new message
  if (phase === "cancelled" || phase === "failed" || phase === "expired") {
    const text = phase === "cancelled" ? t.approvalCancelled : phase === "failed" ? t.approvalFailed : t.approvalExpired;
    return (
      <p role="status" className="text-sm text-slate-700" data-testid="browser-approval-result" data-phase={phase}>
        {text}
      </p>
    );
  }
  const sending = phase === "sending";
  return (
    <section ref={containerRef} tabIndex={-1} role="group" aria-labelledby={headingId} aria-busy={sending} data-testid="browser-approval" data-phase={phase} className={`${SURFACE} p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]`}>
      <h3 id={headingId} className="text-base font-semibold text-slate-900">
        {t.approvalTitle}
      </h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">{t.approvalAction}</dt>
        <dd className="break-words font-medium text-slate-900" data-testid="browser-approval-action">
          {proposal.description}
        </dd>
        <dt className="text-slate-500">{t.approvalPage}</dt>
        <dd className="break-all text-slate-900" data-testid="browser-approval-page">
          {proposal.page}
        </dd>
      </dl>
      <p className={`mt-2 text-xs ${proposal.actionClass === "sensitive" ? "font-medium text-amber-800" : "text-slate-600"}`}>{proposal.actionClass === "sensitive" ? t.approvalSensitive : t.approvalReversible}</p>
      <p className="mt-1 text-xs text-slate-500">{t.approvalNote}</p>
      <p className="mt-1 text-xs text-slate-500" data-testid="browser-approval-expiry">
        {t.approvalExpiresIn} {Math.max(0, secondsLeft)} {t.approvalSeconds}
      </p>
      {phase === "error" ? (
        <p role="alert" className="mt-2 text-sm text-amber-800" data-testid="browser-approval-error">
          {t.approvalError}
        </p>
      ) : null}
      {sending ? (
        <p role="status" className="mt-2 text-xs text-slate-600">
          {t.approvalSending}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" className={`${BTN} ${BLUE}`} disabled={sending} onClick={phase === "error" ? onRetry : onApprove} data-testid="browser-approve">
          {phase === "error" ? t.approvalRetry : t.approve}
        </button>
        <button type="button" className={`${BTN} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50`} disabled={sending} onClick={onCancel} data-testid="browser-cancel">
          {t.cancel}
        </button>
      </div>
    </section>
  );
}

/** What the prompt shows after the Agent answered or the call failed. A 404 means the feature is off or the conversation is gone: the approval cannot be used any more. */
export function phaseAfter(r: DecisionResult): ApprovalPhase {
  if (r.ok) return r.data.outcome;
  return r.reason === "unavailable" ? "expired" : "error";
}

/** One decision at a time, only while the prompt is waiting (or after a failed send), and never after it expired on screen. */
export function decisionGate(phase: ApprovalPhase, inFlight: boolean, now: number, expiresAt: number): "go" | "ignore" | "expired" {
  if (inFlight || (phase !== "ready" && phase !== "error")) return "ignore";
  return now >= expiresAt ? "expired" : "go";
}

/**
 * Stateful wrapper: counts down, sends the decision once (a second click while one is in flight does nothing), and reports the Agent's answer to the parent.
 * An approval that expired on the screen is never sent. `send` is a test seam.
 */
export function BrowserApproval({ proposal, lang = "en", onResolved, send = sendDecision }: { proposal: BrowserProposalData; lang?: AssistantLang; onResolved: (d: BrowserDecisionData) => void; send?: typeof sendDecision }) {
  const [phase, setPhase] = useState<ApprovalPhase>("ready");
  const [secondsLeft, setSecondsLeft] = useState(proposal.expiresInSec);
  const expiresAt = useRef(Date.now() + proposal.expiresInSec * 1000);
  const inFlight = useRef(false);
  const container = useRef<HTMLElement>(null);

  useEffect(() => {
    container.current?.focus();
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.ceil((expiresAt.current - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0 && !inFlight.current) setPhase((p) => (p === "ready" || p === "error" ? "expired" : p));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const decide = async (kind: "confirm" | "cancel") => {
    const gate = decisionGate(phase, inFlight.current, Date.now(), expiresAt.current);
    if (gate === "ignore") return;
    if (gate === "expired") {
      setPhase("expired");
      return;
    }
    inFlight.current = true;
    setPhase("sending");
    const r: DecisionResult = await send(kind, proposal.proposalId);
    inFlight.current = false;
    setPhase(phaseAfter(r));
    if (r.ok) onResolved(r.data);
  };

  return <ApprovalPrompt proposal={proposal} lang={lang} phase={phase} secondsLeft={secondsLeft} containerRef={container} onApprove={() => void decide("confirm")} onCancel={() => void decide("cancel")} onRetry={() => void decide("confirm")} />;
}

/** One browser task inside an assistant message: its progress and, when the Agent asked for approval, the approval prompt. */
export function BrowserTask({ panel, lang = "en", onResolved }: { panel: BrowserPanelData; lang?: AssistantLang; onResolved: (d: BrowserDecisionData) => void }) {
  return (
    <div className="flex flex-col gap-2" data-testid="browser-task">
      <BrowserProgressList panel={panel} lang={lang} />
      {panel.confirmation ? <BrowserApproval proposal={panel.confirmation} lang={lang} onResolved={onResolved} /> : null}
    </div>
  );
}
