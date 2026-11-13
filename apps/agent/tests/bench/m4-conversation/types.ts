import type { ConversationIntent } from "../../../src/router/conversation";

/**
 * Conversation-intent cases (M4). Written by an engineer, NOT by a native Sinhala speaker and not reviewed: Sinhala and Singlish labels
 * are provisional like every other Sinhala text in this project. `history` are earlier user messages replayed in the same session
 * before `text`, so the case measures how the previous turns change the meaning of the last one.
 */
export type ConvLang = "si" | "singlish" | "en" | "mixed";

export interface ConvCase {
  id: string;
  text: string;
  lang: ConvLang;
  expected: ConversationIntent;
  history?: string[];
}
