/**
 * Negation around a word (R0). "don't recommend Samsung", "no Apple", "without Samsung", "anything but Samsung", "I don't want X", "Samsung epa",
 * "Samsung nathuwa", "Samsung එපා": the shopper excludes something. One mechanism for every wording: look at the few words just before and just after the
 * word, in MATCH form (lower-case, apostrophes turned into spaces, so "don't" is "don t"). Nothing here builds a reply or a fact; it only says "this word is
 * negated". PROVISIONAL like every lexicon here: the Sinhala and Singlish cues are engineer-written, not native-reviewed.
 *
 * It is deliberately narrow: "not sure about Samsung", "no budget, Samsung phones" and "Samsung but cheaper" do NOT negate Samsung, because the negation word
 * must stand right before the word (only a few fillers such as "the", "any", "recommend" may sit between them). A bare "no" followed by an article is an
 * answer to the assistant, not an exclusion ("no, a laptop" asks for a laptop). A list shares one negation: "not Samsung or Apple", "except Samsung and Kite".
 */
const NEG_WORD = String.raw`(?:no|not|without|except|avoid|avoiding|exclude|excluding|excluded|never|hate|dislike|skip|dont|don t|do not|dont want|don t want|other than|instead of|rather than|stop showing|no more|ban)`;
const FILLER = String.raw`(?: (?:the|any|a|an|recommend|recommending|recommended|show|showing|suggest|suggesting|want|like|buy|get|from|of|me|my|i|you|to|be|those|these|that|this|more|see|use|need))*`;
const PRE_NEGATION = new RegExp(`(?:^| )${NEG_WORD}${FILLER}$`);
/** "anything but Samsung", "all brands but Apple": "but" negates only after an "everything" word. */
const PRE_BUT = /(?:^| )(?:anything|everything|all|any|every|brands?|phones?|laptops?|else) but$/;
/** "no, a laptop", "no the cheaper one": a bare "no" before an article answers the assistant; it does not exclude what follows. */
const BARE_NO_ARTICLE = /(?:^| )no (?:a|an|the|my|some|one)$/;

const POST_WORD = String.raw`(?:epa|epaa|nathuwa|nethuwa|nathi|nati|nathnam|thora|baha|bahaa|(?:ona|oni|onee|one) (?:naha|nane|nehe|na)|wenna epa|එපා|එපාම|නැතුව|නැති|හැර|බැහැ|ඕන නෑ|ඕනේ නෑ|ඕන නැහැ)`;
const POST_EXTRA = String.raw`(?:(?:is|are|was) not (?:what i (?:want|need|like|wanted)|for me|my (?:type|choice)|ok|okay|ideal)|(?:eka |ekak )?naha)`;
const POST_NEGATION = new RegExp(`^(?:(?:eka|ekak|ewa|ones?|brand|brands|eken|ekata|phones?|laptops?|hari|ma|nam) )*${POST_WORD}(?: |$)|^walin (?:pissu|pissa)(?: |$)|^${POST_EXTRA}`);

const LIST_JOINER = new Set(["or", "and", "nor"]);

/** True when the tokens [start, end) are negated by the words around them. */
export function isNegatedAt(tokens: readonly string[], start: number, end: number): boolean {
  // A list ("not samsung or apple", "samsung or kite epa") shares the negation of the item it starts from: step over "or X" / "and X" pairs both ways.
  let s = start;
  while (s >= 2 && LIST_JOINER.has(tokens[s - 1]!)) s -= 2;
  let e = end;
  while (e + 1 < tokens.length && LIST_JOINER.has(tokens[e]!)) e += 2;

  const pre = tokens.slice(Math.max(0, s - 5), s).join(" ");
  if (pre !== "" && !BARE_NO_ARTICLE.test(pre) && (PRE_NEGATION.test(pre) || PRE_BUT.test(pre))) return true;
  const post = tokens.slice(e, e + 6).join(" ");
  return post !== "" && POST_NEGATION.test(post);
}
