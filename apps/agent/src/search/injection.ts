import { checkSafety } from "../router/safety";
import { stripInvisible } from "../tools/llm/fence";

/**
 * Prompt-injection handling for text that came from the web (page excerpts, search snippets). The text is already fenced as data; this adds two things:
 *  - a DETECTOR (so the turn can count and report attempts), and
 *  - a NEUTRALISER that removes instruction-like sentences before the model reads the excerpt.
 * Nothing in retrieved text can select a tool, change a policy or authorise anything: tools are chosen by the model from the server's list and run under the
 * server's authorisation. This is a second line of defence, and it is never the only one.
 */
const PATTERNS: { signal: string; re: RegExp }[] = [
  { signal: "ignore_instructions", re: /\b(?:ignore|disregard|forget|override|bypass)\b.{0,40}\b(?:previous|prior|above|earlier|all|any|your|the)\b.{0,30}\b(?:instructions?|prompts?|rules?|polic(?:y|ies)|guidelines?|constraints?)\b/i },
  { signal: "reveal_prompt", re: /\b(?:reveal|print|show|output|repeat|leak|display|send)\b.{0,40}\b(?:system prompt|hidden prompt|developer message|initial instructions?|your instructions?|your prompt)\b/i },
  { signal: "tool_command", re: /\b(?:you (?:must|should|will|need to|have to)|please|now|immediately)\b.{0,30}\b(?:call|invoke|use|run|execute|trigger)\b.{0,30}\b(?:tool|function|command|api)\b/i },
  { signal: "tool_command", re: /\b(?:call|invoke|run|execute)\b.{0,15}\b(?:the )?(?:fetch_page|web_search|run_code|calculator|volta_[a-z_]+|add_to_cart|browser[._][a-z_]+)\b/i },
  { signal: "new_instructions", re: /\b(?:new|updated|real|secret|actual) (?:instructions?|rules?|polic(?:y|ies)|system message|orders?)\b\s*[:\-]/i },
  { signal: "role_override", re: /\b(?:you are now|from now on you|act as|pretend (?:to be|you are)|your new role)\b/i },
  { signal: "chat_template", re: /<\|[a-z_]*\|>|\[\/?inst\]|<<\/?sys>>|^\s*(?:system|assistant|developer|user)\s*:/im },
  { signal: "exfiltrate", re: /\b(?:send|post|forward|upload|email)\b.{0,40}\b(?:conversation|chat history|customer data|personal data|api key|secret|password|token)\b/i },
  { signal: "authority_claim", re: /\b(?:message|note|notice) (?:from|to) (?:the )?(?:system|developer|administrator|admin|owner|assistant)\b/i },
  { signal: "sinhala_ignore", re: /(?:උපදෙස්|නීති|ප්‍රතිපත්ති).{0,25}(?:නොසලකා|අමතක\s*කර|පසෙකලා)/ },
];

export interface InjectionScan {
  flagged: boolean;
  /** Distinct signal names, never the matched text. */
  signals: string[];
}

export function detectInjection(text: string): InjectionScan {
  const clean = stripInvisible(text.normalize("NFKC"));
  const signals = new Set<string>();
  for (const p of PATTERNS) if (p.re.test(clean)) signals.add(p.signal);
  const verdict = checkSafety(clean.slice(0, 4_000));
  if (verdict.blocked && (verdict.reason === "injection" || verdict.reason === "exfiltration")) signals.add(`router_${verdict.reason}`);
  return { flagged: signals.size > 0, signals: [...signals].sort() };
}

export const REMOVED_MARK = "[removed: instruction-like text]";

export interface Neutralised {
  text: string;
  /** How many sentences/lines were replaced. */
  removed: number;
  signals: string[];
}

/** Replaces every sentence or line that looks like an instruction with a neutral mark. The text that remains is ordinary prose. */
export function neutraliseExcerpt(text: string): Neutralised {
  const signals = new Set<string>();
  let removed = 0;
  const pieces = text.split(/(?<=[.!?])\s+|\n+/);
  const kept = pieces.map((piece) => {
    if (piece.trim() === "") return piece;
    const scan = detectInjection(piece);
    if (!scan.flagged) return piece;
    for (const s of scan.signals) signals.add(s);
    removed++;
    return REMOVED_MARK;
  });
  // join with newlines: the original separators are not preserved, only the order, which is all a reader of an excerpt needs.
  return { text: kept.filter((p) => p.trim() !== "").join("\n"), removed, signals: [...signals].sort() };
}
