import { anyPhrase, makeHaystack } from "./cues";
import { normalizeMatch } from "./normalize";

/**
 * Conversation preferences (R0): short instructions about HOW the assistant should talk in this conversation: "reply in Sinhala", "English walin kiyanna",
 * "keep it short", "stop asking questions", "don't ask my budget". They are held for this conversation only (in memory, with the rest of the session state) and
 * honoured by the reply language and by the question policy. There is NO owner or admin channel here: an instruction from the shop owner that should apply to
 * every conversation needs a separate, authenticated mechanism that does not exist yet (see the audit, section 9). PROVISIONAL Sinhala/Singlish cues.
 */
export interface PrefsUpdate {
  replyLang?: "en" | "si";
  short?: boolean;
  noQuestions?: boolean;
  noBudgetQuestion?: boolean;
}

const LANG_SI = [
  "reply in sinhala", "answer in sinhala", "respond in sinhala", "write in sinhala", "speak in sinhala", "speak sinhala", "talk in sinhala", "talk sinhala", "only in sinhala",
  "sinhalen kiyanna", "sinhalen katha karanna", "sinhalen reply karanna", "sinhalen pilithuru denna", "sinhalen witharak", "sinhalen pamanak",
  "සිංහලෙන් කියන්න", "සිංහලෙන් පිළිතුරු දෙන්න", "සිංහලෙන් කතා කරන්න", "සිංහලෙන් පමණක්",
];
const LANG_EN = [
  "reply in english", "answer in english", "respond in english", "write in english", "speak in english", "speak english", "talk in english", "talk english", "only in english",
  "english walin kiyanna", "english walin katha karanna", "english walin reply karanna", "english walin pilithuru denna", "englishen kiyanna", "englishen katha karanna",
  "ඉංග්‍රීසියෙන් කියන්න", "ඉංග්‍රීසියෙන් කතා කරන්න", "ඉංග්‍රීසියෙන් පමණක්",
];
const SHORT = ["short answers", "short answer", "keep it short", "keep answers short", "be brief", "be short", "brief answers", "shorter answers", "kotin kiyanna", "kotin pilithuru denna", "kotin", "short ekak", "කෙටියෙන් කියන්න", "කෙටි පිළිතුරු", "කෙටියෙන්"];
const NO_QUESTIONS = [
  "stop asking questions", "stop asking me questions", "don t ask questions", "dont ask questions", "do not ask questions", "no more questions", "stop asking", "just show me", "don t ask me", "dont ask me anything", "never ask me", "never ask questions",
  "prashna asanna epa", "prashna ahanna epa", "ask karanna epa", "ප්‍රශ්න අහන්න එපා", "ප්‍රශ්න අහන එක නවත්තන්න", "අහන්න එපා",
];
const NO_BUDGET = [
  "don t ask my budget", "dont ask my budget", "don t ask about my budget", "don t ask about budget", "dont ask about budget", "no budget question", "stop asking about budget", "stop asking my budget",
  "budget eka asanna epa", "budget ekak asanna epa", "budget eka ahanna epa", "budget ahanna epa", "බජට් එක අහන්න එපා", "බජට් අහන්න එපා",
];
/** A question about whether the assistant CAN do something ("sinhalen katha karanna puluwanda?") is not an instruction: it is answered by the language-support reply. */
const CAPABILITY_QUESTION = ["puluwan", "puluwanda", "can you", "could you", "do you", "will you", "is it possible", "පුළුවන්ද", "පුළුවන්"];
const QUESTION_WORDS = ["questions", "question", "prashna", "ප්‍රශ්න"];

/** The conversation preferences a message asks for, or null. */
export function detectPreferences(raw: string): PrefsUpdate | null {
  if (raw.length > 300) return null;
  const h = makeHaystack(normalizeMatch(raw));
  const update: PrefsUpdate = {};
  if (!anyPhrase(h, CAPABILITY_QUESTION)) {
    if (anyPhrase(h, LANG_SI)) update.replyLang = "si";
    else if (anyPhrase(h, LANG_EN)) update.replyLang = "en";
  }
  if (anyPhrase(h, SHORT)) update.short = true;
  const noBudget = anyPhrase(h, NO_BUDGET);
  if (noBudget) update.noBudgetQuestion = true;
  // "stop asking about budget" mentions "stop asking" but is only about the budget question.
  if (anyPhrase(h, NO_QUESTIONS) && (!noBudget || anyPhrase(h, QUESTION_WORDS))) update.noQuestions = true;
  return Object.keys(update).length > 0 ? update : null;
}

/** The fixed acknowledgement for the first preference in an update (one reply says one thing). */
export function acknowledgementFor(update: PrefsUpdate): "pref_lang_si" | "pref_lang_en" | "pref_short" | "pref_no_questions" | "pref_no_budget" {
  if (update.replyLang === "si") return "pref_lang_si";
  if (update.replyLang === "en") return "pref_lang_en";
  if (update.noQuestions) return "pref_no_questions";
  if (update.noBudgetQuestion) return "pref_no_budget";
  return "pref_short";
}
