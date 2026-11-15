import type { Profile, QuestionKey, ReasoningState, UndoSnapshot } from "./profile";

/**
 * "That's not what I asked" (R0): the previous turn's interpretation is dropped by restoring the conversation state as it was BEFORE that turn. Only ids, codes
 * and the requirement profile are in the snapshot, never message text. Exclusions and preferences are deliberately NOT restored: what the shopper explicitly
 * said they do not want, and how they asked the assistant to talk, still hold after a correction.
 */
interface SessionLike {
  lastIntent?: string | undefined;
  slots: { brand?: string; category?: string; budgetLkr?: number; query?: string };
  lastShownProductIds: string[];
  reasoning: ReasoningState;
}

const cloneProfile = (p: Profile): Profile => ({ ...p, usage: [...p.usage] });

export function takeSnapshot(s: SessionLike): UndoSnapshot {
  const r = s.reasoning;
  return {
    profile: cloneProfile(r.profile),
    asked: [...r.asked] as QuestionKey[],
    questionsInARow: r.questionsInARow,
    lastResultIds: [...r.lastResultIds],
    discussed: [...r.discussed],
    ...(r.pending ? { pending: r.pending } : {}),
    ...(s.lastIntent ? { lastIntent: s.lastIntent } : {}),
    slots: { ...s.slots },
    lastShownProductIds: [...s.lastShownProductIds],
  };
}

/** Puts the state back as the snapshot recorded it. With no snapshot (nothing was done yet) the shopping state is simply cleared. */
export function restoreSnapshot(s: SessionLike, snap: UndoSnapshot | undefined): void {
  const r = s.reasoning;
  r.profile = snap ? cloneProfile(snap.profile) : { usage: [] };
  r.asked = snap ? [...snap.asked] : [];
  r.questionsInARow = snap ? snap.questionsInARow : 0;
  r.lastResultIds = snap ? [...snap.lastResultIds] : [];
  r.discussed = snap ? [...snap.discussed] : [];
  r.pending = undefined;
  if (snap?.lastIntent) s.lastIntent = snap.lastIntent;
  else delete s.lastIntent;
  s.slots = snap ? { ...snap.slots } : {};
  s.lastShownProductIds = snap ? [...snap.lastShownProductIds] : [];
}
