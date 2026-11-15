import { anyPhrase, makeHaystack } from "../router/cues";
import { editDistanceAtMost, normalizeMatch, tokenize } from "../router/normalize";

/**
 * What the shopper wants to use the product for. Extracted from their own words (English, Singlish, Sinhala script); nothing is
 * assumed from the product. PROVISIONAL like every lexicon here: engineer-written, not native-reviewed.
 */
export const USAGES = ["camera", "gaming", "battery", "office", "programming", "design", "student", "general"] as const;
export type Usage = (typeof USAGES)[number];

const USAGE_PHRASES: Record<Usage, string[]> = {
  camera: ["camera", "cameras", "photo", "photos", "photography", "selfie", "selfies", "pics", "pictures", "video quality", "කැමරා", "කැමරාව", "ෆොටෝ", "ඡායාරූප", "සෙල්ෆි"],
  gaming: ["gaming", "gamer", "game", "games", "pubg", "free fire", "gta", "ගේම්", "ගේම්ස්", "ගේමිං"],
  battery: ["battery", "battery life", "long lasting", "lasts long", "බැටරි", "බැටරිය", "charge eka", "batary"],
  office: ["office", "office work", "work from home", "business", "documents", "excel", "ඔෆිස්", "කාර්යාල", "ඔෆිස් වැඩ"],
  programming: ["programming", "coding", "developer", "development", "software", "කෝඩින්", "ක්‍රමලේඛන"],
  design: ["design", "designing", "editing", "video editing", "photoshop", "graphic", "graphics", "ඩිසයින්", "එඩිටින්"],
  student: ["student", "school", "study", "studies", "university", "uni", "assignments", "සිසු", "ඉගෙනීම", "පාසල්", "ඉස්කෝලේ"],
  general: ["daily use", "everyday", "everyday use", "normal use", "general use", "casual", "basic use", "daily", "dawasa", "sadharana", "සාමාන්‍ය", "දෛනික", "සාමාන්‍ය පාවිච්චි"],
};

/** Every single Latin word that appears in a usage phrase ("battery", "life", "work"): the words of a message that is only a usage answer. */
export const USAGE_TOKENS: ReadonlySet<string> = new Set(
  Object.values(USAGE_PHRASES)
    .flat()
    .flatMap((p) => tokenize(normalizeMatch(p)))
    .filter((t) => /^[a-z]+$/.test(t)),
);

/** One-word usage phrases a misspelling is matched against ("gamming", "batary", "photograpy"): long enough that one wrong letter cannot make another word. */
const FUZZY_WORDS: [Usage, string[]][] = USAGES.map((u) => [u, USAGE_PHRASES[u].filter((p) => /^[a-z]{6,}$/.test(p))]);

/** The usages a message mentions, in the order of USAGES. Latin phrases match whole words, Sinhala phrases as substrings (see cues.ts); a word one letter off a long usage word counts too. */
export function extractUsages(message: string): Usage[] {
  const text = normalizeMatch(message);
  const h = makeHaystack(text);
  const found = new Set(USAGES.filter((u) => anyPhrase(h, USAGE_PHRASES[u])));
  for (const t of h.tokens) {
    if (t.length < 6 || !/^[a-z]+$/.test(t)) continue;
    for (const [u, words] of FUZZY_WORDS) if (!found.has(u) && words.some((w) => w !== t && editDistanceAtMost(t, w, 1))) found.add(u);
  }
  return USAGES.filter((u) => found.has(u));
}
