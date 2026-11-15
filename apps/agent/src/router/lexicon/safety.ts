/**
 * Patterns for the safety pre-filter. They run on the raw message BEFORE any model sees it, in every language, and they are
 * matched against both the lower-cased original and the normalised form. PROVISIONAL: the Sinhala and Singlish lines need
 * native-speaker review (blocker B5). A pattern is a regular expression source, matched case-insensitively.
 *
 * They are deliberately narrow: "free delivery?" or "any discounts?" are ordinary shopping questions and must not match.
 */
/**
 * Harmless role-play wishes ("pretend you are my friend and recommend a phone", "act as my shopping assistant"): a persona that is itself no
 * instruction override. Used only to narrow the "pretend / act as" patterns below; a persona with "no rules" is still refused (see the last pattern).
 */
const BENIGN_PERSONA = String.raw`(?!\s+(?:(?:my|a|an|the|our)\s+)*(?:friend|buddy|helpful|shopping|shop|sales|salesperson|salesman|tech|expert|assistant|advisor|adviser|guide)\b)`;

export const INJECTION_PATTERNS: string[] = [
  // direct instruction override
  String.raw`\bignore\b.{0,25}\b(previous|prior|above|earlier|all|any|your|the)\b.{0,25}\b(instructions?|rules?|prompts?|guidelines?|polic(?:y|ies))\b`,
  String.raw`\bdisregard\b.{0,40}\b(instructions?|rules?|prompts?)\b`,
  String.raw`\bforget\b.{0,20}\b(everything|all|your|the)\b.{0,20}\b(instructions?|rules?|above|before)\b`,
  String.raw`\b(system|developer|hidden|secret|initial)\s+(prompt|message|instructions?)\b`,
  String.raw`\b(reveal|print|show|repeat|output|leak|display)\b.{0,25}\b(your|the)\b.{0,15}\b(prompt|instructions?|rules)\b`,
  String.raw`\byou are now\b`,
  String.raw`\bact as\b` + BENIGN_PERSONA,
  String.raw`\bpretend\b.{0,15}\b(to be|you are|you're)\b` + BENIGN_PERSONA,
  // a persona is never a way around the rules, however friendly it sounds
  String.raw`\b(pretend|act|roleplay|role-play|behave|respond|answer)\b.{0,60}\b(no|without|free of|zero)\s+(?:any\s+)?(rules|restrictions|limits|limitations|filters|guidelines|boundaries|censorship)\b`,
  String.raw`\b(developer|admin|debug|jailbreak|dan|god)\s+mode\b`,
  String.raw`\bnew\s+(rules?|instructions?)\s*:`,
  String.raw`\b(bypass|override|disable|turn off)\b.{0,25}\b(rules?|filters?|safety|restrictions?|checks?|guardrails?)\b`,
  // structural / role / tool injection
  String.raw`<\|im_(start|end)\|>`,
  String.raw`\[\s*/?\s*(system|inst|assistant|tool)\s*\]`,
  String.raw`(^|\n)\s*(system|assistant|developer|tool)\s*:`,
  String.raw`</?\s*(script|system|assistant|tool|function)\b`,
  String.raw`\b(call|invoke|execute|use)\b.{0,12}\b(the\s+)?(tool|function)\b`,
  String.raw`\b(run|execute)\b.{0,12}\b(this|the|a)?\s*(command|script|code|sql|query|shell)\b`,
  String.raw`\b(drop|truncate|delete)\s+(table|database)\b`,
  String.raw`\brm\s+-rf\b`,
  // Sinhala (provisional)
  "ඉහත උපදෙස්",
  "පෙර උපදෙස්",
  "උපදෙස් නොසලකා",
  "උපදෙස් අමතක",
  "ඔබේ උපදෙස්",
  "පද්ධති උපදෙස්",
  "රහස් කේතය",
  // Singlish (provisional)
  String.raw`\b(previous|mulin|pera)\s+(instructions?|upades\w*)\b.{0,15}\bignore\b`,
  String.raw`\bignore\s+karala\b`,
  String.raw`\bignore\s+karanna\b`,
  String.raw`\bsystem\s+prompt\b`,
];

export const PRICE_MANIPULATION_PATTERNS: string[] = [
  String.raw`\b(give|get|make|set|apply|offer|grant)\b.{0,12}\b(me|it|this|that)?\b.{0,22}(?:\b\d{1,3}\s?%|\b(?:\d{1,3}\s?percent|free(?!\s+(?:delivery|shipping|returns?))|discount|coupon|voucher|half price)\b)`,
  // "set the price filter to 50000", "price range", "price limit" and "sort by price" are instructions about how to LOOK, not attempts to change a price.
  String.raw`\b(change|lower|reduce|drop|cut|set|edit|modify)\b.{0,10}\b(the\s+)?(price|total|amount)\b(?!\s+(?:filter|filters|range|ranges|limit|limits|sort|sorting|order|ordering|slider|alert|alerts|band|bracket|cap|ceiling|max|maximum|min|minimum|bar)\b)`,
  String.raw`\b(pretend|assume|imagine|suppose|consider|say|claim)\b.{0,50}\b(costs?|price[ds]?|priced|worth|is only|is just)\b.{0,20}\b\d`,
  String.raw`\bfor\s+free\b`,
  String.raw`\bfree of charge\b`,
  String.raw`\bapply\b.{0,12}\bcoupon\b`,
  String.raw`\bmake\b.{0,15}\btotal\b.{0,10}\b(zero|0|free)\b`,
  // Sinhala
  "මිල අඩු කරන්න",
  "මිල වෙනස් කරන්න",
  "නොමිලේ දෙන්න",
  "වට්ටම දෙන්න",
  "වට්ටමක් දෙන්න",
  "වට්ටම් දෙන්න",
  "වට්ටමක් දාන්න",
  "වට්ටමක් දෙනවද",
  // Singlish
  String.raw`\b(discount|wattam)\s+(ekak\s+)?(denna|danna|denawada)\b`,
  String.raw`\bmila?\s+adu\s+karanna\b`,
  String.raw`\bfree\s+(denna|danna)\b`,
];

export const EXFILTRATION_PATTERNS: string[] = [
  String.raw`\b(show|list|give|tell|dump|export|leak|send)\b.{0,30}\b(all|every|other|another)\b.{0,15}\b(customers?|users?|orders?|emails?|phone numbers?|passwords?|addresses|accounts?)\b`,
  String.raw`\b(export|dump|download)\b.{0,15}\b(the\s+)?(user|customer|order)\s*(database|table|list)\b`,
  String.raw`\b(admin|root|database|db)\s+(password|credentials?|token|key)\b`,
  String.raw`\b(someone else'?s?|another (person|customer)'?s?)\s+(order|address|phone|account)\b`,
];

/**
 * What follows "my password is" when the shopper is describing a PROBLEM, not sharing the password ("my password is wrong", "my pin is not working"). A
 * shared secret is a value, never one of these words, so the patterns below skip them and everything else is still refused.
 */
const TROUBLE_WORD = String.raw`(?:wrong|incorrect|invalid|not|expired|forgotten|lost|locked|blocked|rejected|missing|failing|failed|being|still|always|never|too|very|working|accepted|correct|weak|saved|stored)\b`;

/** Messages that look like someone sharing a secret. They are refused and never retained, even with consent. */
export const SENSITIVE_VALUE_PATTERNS: string[] = [
  String.raw`\b(cvv|cvc|cvn|cid)\s*[:=]?\s*\d{3,4}\b`,
  String.raw`\b(otp|one[- ]time (pass)?code|verification code)\s*(is|[:=])?\s*\d{4,8}\b`,
  String.raw`\b(password|passcode|pin)\s*(is|[:=])\s*(?!` + TROUBLE_WORD + String.raw`)\S{3,}`,
  String.raw`\bmy\s+(password|passcode|pin)\s+is(?:\s+(?!` + TROUBLE_WORD + String.raw`)\S+|\s*$)`,
  String.raw`\b\d{9}[vx]\b`,
  String.raw`\b(19|20)\d{10}\b`,
  "මුරපදය\\s*(වන්නේ|[:=])\\s*\\S+",
  "(card|කාඩ්|කාඩ්පත්).{0,18}\\d{12,19}",
  // OTP, PIN or CVV followed shortly by its digits, in any wording ("otp eka is 559900")
  String.raw`\b(otp|pin|cvv|cvc)\b.{0,14}\b\d{3,8}\b`,
  String.raw`\b(password|passcode)\s+(eka\s+)?(is|[:=])\s*(?!` + TROUBLE_WORD + String.raw`)\S{3,}`,
  // API keys, authentication tokens and other secrets (M1-D)
  String.raw`\bbearer\s+[a-z0-9._~+/=-]{16,}`,
  String.raw`\beyj[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{4,}`,
  String.raw`\b(sk|pk|rk)[-_](live|test|proj|ant)?[-_]?[a-z0-9]{16,}`,
  String.raw`\bakia[0-9a-z]{16}\b`,
  String.raw`\bgh[pousr]_[a-z0-9]{20,}`,
  String.raw`\bxox[abprs]-[a-z0-9-]{10,}`,
  String.raw`\bhxs_[a-z0-9]+\.[a-z0-9]+`,
  String.raw`\bvalta_session\s*[:=]`,
  String.raw`-----begin [a-z ]*private key-----`,
  String.raw`\b(api[ _-]?key|secret|token|authorization|session[ _-]?(id|cookie)|credentials?|access[ _-]?key)\s*(is|[:=])\s*\S{8,}`,
  String.raw`\b[0-9a-f]{40,}\b`,
];
