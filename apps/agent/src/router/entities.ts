import { parseAmounts, toPriceBounds } from "./amounts";
import { anyPhrase, compilePhrase, makeHaystack, phraseMatches, type Haystack } from "./cues";
import { COLORS, CONCEPTS, FIRST_MENTION_REFS, NUMBER_WORDS, ON_SALE, ORDINALS, PREVIOUS_REFS, REFERENT_PLURAL, REFERENT_SINGLE, SORT_CHEAP, SORT_EXPENSIVE, SORT_NEWEST, STOPWORDS } from "./lexicon/concepts";
import { isNegatedAt } from "./negation";
import { editDistanceAtMost, normalizeDisplay, normalizeMatch, tokenize } from "./normalize";
import type { Entities, ProductMatch, Vocabulary, VocabProduct } from "./types";

/** Built from normalised text: the match form has Sinhala joiners stripped, so a literal containing one would never match. */
const QUANTITY_WORD = new RegExp(`(?:qty|quantity|${normalizeMatch("ප්‍රමාණය")})\\s*(?:to|:)?\\s*(\\d{1,2})\\b`);
/** Quantity phrasings, tried in order. Each captures the number in group 1. */
const QUANTITY_PATTERNS: RegExp[] = [
  /(?:^|\s)(\d{1,2})\s?(?:ක්|x|pcs|pieces|units)(?=\s|$|[^a-z])/,
  QUANTITY_WORD,
  /(\d{1,2})\s*(?:කරන්න|ක්\s*දාන්න)/,
  /(?:quantity|qty).{0,40}to\s+(\d{1,2})/,
  /(?:make it|set it to)\s+(\d{1,2})/,
];
const ORDER_REF = /\bVLK-\d{6}-[A-HJKMNP-TV-Z2-9]{10}\b/i;
/** Tokens in product names that do not identify a product on their own. */
const GENERIC_PRODUCT_TOKENS = new Set(["smartphone", "phone", "mobile", "the", "and", "with", "for", "of", "sold", "out"]);

/** Well-known brand names. A catalogue that does not carry one still gets an honest "not found" instead of unrelated products. */
const KNOWN_BRAND_WORDS = new Set(["samsung", "apple", "xiaomi", "huawei", "honor", "oppo", "vivo", "realme", "oneplus", "nokia", "motorola", "google", "sony", "lg", "lenovo", "dell", "hp", "asus", "acer", "msi", "microsoft", "anker", "jbl", "logitech", "tecno", "infinix", "itel", "zte", "nothing"]);

const fuzzyEqual = (a: string, b: string): boolean => a === b || (a.length >= 5 && b.length >= 5 && editDistanceAtMost(a, b, 1));

interface IndexedProduct {
  product: VocabProduct;
  tokens: string[];
  brandToken?: string;
}

const indexCache = new WeakMap<Vocabulary, IndexedProduct[]>();

function indexVocab(vocab: Vocabulary): IndexedProduct[] {
  const hit = indexCache.get(vocab);
  if (hit) return hit;
  const built = vocab.products.map((product) => {
    const tokens = [...new Set(tokenize(normalizeMatch(product.name)))].filter((t) => !GENERIC_PRODUCT_TOKENS.has(t) && t.length >= 1);
    const brandToken = product.brand ? normalizeMatch(product.brand) : undefined;
    return { product, tokens, ...(brandToken ? { brandToken } : {}) };
  });
  indexCache.set(vocab, built);
  return built;
}

/**
 * Finds the products a message names. A product matches when the message contains its brand and at least one more of its
 * distinguishing words, or all of them. When two products are matched by exactly the same words (for example "echo speaker"
 * names two different Echo speakers) the message is ambiguous and the router will ask which one.
 */
export function matchProducts(h: Haystack, vocab: Vocabulary): { products: ProductMatch[]; ambiguous: boolean } {
  const userTokens = h.tokens.filter((t) => t.length >= 2 || /\d/.test(t));
  const candidates: { ip: IndexedProduct; matched: Set<string>; score: number }[] = [];
  for (const ip of indexVocab(vocab)) {
    const matched = new Set<string>();
    for (const t of ip.tokens) if (userTokens.some((u) => fuzzyEqual(u, t))) matched.add(t);
    if (matched.size === 0 || ip.tokens.length === 0) continue;
    const brandOk = ip.brandToken ? matched.has(ip.brandToken) : true;
    const enough = matched.size === ip.tokens.length || (brandOk && matched.size >= 2);
    if (!enough) continue;
    candidates.push({ ip, matched, score: matched.size / ip.tokens.length });
  }
  if (candidates.length === 0) return { products: [], ambiguous: false };

  candidates.sort((a, b) => b.score - a.score || a.ip.product.name.localeCompare(b.ip.product.name));

  // Drop products whose matched words are a strict subset of a better candidate's words ("nova x1" also hits fewer words of others).
  const kept = candidates.filter((c, i) => !candidates.slice(0, i).some((o) => o.score > c.score && [...c.matched].every((t) => o.matched.has(t))));

  const signature = (c: (typeof kept)[number]) => [...c.matched].sort().join("|");
  const groups = new Map<string, typeof kept>();
  for (const c of kept) groups.set(signature(c), [...(groups.get(signature(c)) ?? []), c]);
  const ambiguous = [...groups.values()].some((g) => g.length > 1);

  return {
    products: kept.slice(0, 4).map((c) => ({ id: c.ip.product.id, name: c.ip.product.name, score: Number(c.score.toFixed(2)) })),
    ambiguous,
  };
}

/** Every catalogue brand the message names, with the token position of the mention (for the negation check). */
function brandMentions(h: Haystack, vocab: Vocabulary): { brand: string; start: number }[] {
  const out: { brand: string; start: number }[] = [];
  for (const brand of vocab.brands) {
    const b = normalizeMatch(brand);
    if (!b) continue;
    const at = h.tokens.findIndex((t) => fuzzyEqual(t, b));
    if (at >= 0) out.push({ brand, start: at });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The token positions [start, end) where a compiled concept phrase matches, or null. Sinhala phrases match inside a token. */
function phraseSpan(h: Haystack, phrase: ReturnType<typeof compilePhrase>): [number, number] | null {
  if (phrase.text === "") return null;
  if (phrase.sinhala) {
    const at = h.tokens.findIndex((t) => t.includes(phrase.text));
    return at < 0 ? null : [at, at + 1];
  }
  const words = phrase.text.split(" ");
  for (let i = 0; i + words.length <= h.tokens.length; i++) {
    const last = words.length - 1;
    const ok = words.every((w, k) => (k === last && phrase.prefix ? h.tokens[i + k]!.startsWith(w) : h.tokens[i + k] === w));
    if (ok) return [i, i + words.length];
  }
  return null;
}

/** The token positions a product's name words matched in the message. */
function productSpan(h: Haystack, vocab: Vocabulary, productId: string): [number, number] | null {
  const ip = indexVocab(vocab).find((x) => x.product.id === productId);
  if (!ip) return null;
  const hits = h.tokens.map((t, i) => (ip.tokens.some((p) => fuzzyEqual(t, p)) ? i : -1)).filter((i) => i >= 0);
  return hits.length === 0 ? null : [hits[0]!, hits[hits.length - 1]! + 1];
}

const CONCEPT_SEARCH_WORD: Record<string, string> = { phone: "phone", laptop: "laptop", tablet: "tablet" };

/** A catalogue model word of at least five letters ("iphone") that the message contains, lower-case. Short model codes are ignored. */
function matchModelWord(h: Haystack, vocab: Vocabulary): string | undefined {
  const models = new Set<string>();
  for (const p of vocab.products) for (const t of tokenize(normalizeMatch(p.model ?? ""))) if (t.length >= 5 && !STOPWORDS.has(t) && /^[a-z]+$/.test(t)) models.add(t);
  return h.tokens.find((t) => models.has(t));
}

function resolveCategory(catalogueWords: string[], vocab: Vocabulary): string | undefined {
  for (const c of vocab.categories) {
    const name = c.name.toLowerCase();
    if (catalogueWords.some((w) => name.includes(w))) return c.slug;
  }
  return undefined;
}

function unknownTerms(display: string, h: Haystack, vocab: Vocabulary, brand: string | undefined, hasProduct: boolean, negated: ReadonlySet<string> = new Set()): string[] {
  if (brand || hasProduct) return [];
  const known = new Set<string>();
  for (const p of vocab.products) for (const t of tokenize(normalizeMatch(p.name))) known.add(t);
  for (const b of vocab.brands) known.add(normalizeMatch(b));
  const out: string[] = [];
  for (const raw of display.split(/\s+/)) {
    const word = raw.replace(/[^A-Za-z0-9]/g, "");
    if (word.length < 3 || /^\d+$/.test(word)) continue;
    const lower = word.toLowerCase();
    if (STOPWORDS.has(lower) || known.has(lower) || h.tokenSet.has(lower) === false || negated.has(lower)) continue;
    if (KNOWN_BRAND_WORDS.has(lower)) {
      out.push(lower);
      continue;
    }
    // Brand-like: starts upper-case, or has an interior capital ("iPhone"). Plain lower-case words are ordinary vocabulary.
    if (/^[A-Z]/.test(word) || /[a-z][A-Z]/.test(word)) {
      if (CONCEPTS.some((c) => c.words.some((w) => normalizeMatch(w) === lower))) continue;
      out.push(lower);
    }
  }
  return [...new Set(out)].slice(0, 3); // brand-like words, not products
}

/** Extracts every entity the planner might need from one message, using only the given vocabulary. */
export function extractEntities(rawMessage: string, vocab: Vocabulary): Entities {
  const display = normalizeDisplay(rawMessage);
  const text = normalizeMatch(rawMessage);
  const h = makeHaystack(text);

  const { amounts, unparsedCue } = parseAmounts(text);
  const bounds = toPriceBounds(amounts);

  // What the shopper explicitly does NOT want ("no chargers", "don't recommend Samsung", "Lumen P1 epa"), collected while the entities are read.
  const excluded = { brands: [] as string[], categories: [] as string[], words: [] as string[], productIds: [] as string[] };
  const negatedWords = new Set<string>();

  // Specific concept first (charger before phone). A concept resolves to a category only if the catalogue really has one. A negated concept ("no cases")
  // is an exclusion, not the thing to search for, and the next concept is tried.
  let categorySlug: string | undefined;
  let queryWord: string | undefined;
  let conceptWord: string | undefined;
  for (const c of CONCEPTS) {
    const hit = c.words.map((w) => compilePhrase(w)).find((p) => phraseMatches(h, p));
    if (!hit) continue;
    const span = phraseSpan(h, hit);
    if (span && isNegatedAt(h.tokens, span[0], span[1])) {
      const slug = resolveCategory(c.catalogueWords, vocab);
      // A specific accessory word ("charger") is excluded by its word; a broad concept ("phone") by its category.
      if (c.queryWord) excluded.words.push(c.queryWord);
      else if (slug) excluded.categories.push(slug);
      else excluded.words.push(CONCEPT_SEARCH_WORD[c.id] ?? c.id);
      continue;
    }
    categorySlug = resolveCategory(c.catalogueWords, vocab);
    if (c.queryWord) queryWord = c.queryWord;
    conceptWord = c.queryWord ?? CONCEPT_SEARCH_WORD[c.id];
    break;
  }

  const colors = Object.entries(COLORS)
    .filter(([, words]) => words.some((w) => phraseMatches(h, compilePhrase(w))))
    .map(([name]) => name);
  const storages = [...text.matchAll(/(\d{2,4})\s?(gb|tb)\b/g)].map((m) => `${m[1]}${m[2]!.toUpperCase()}`);

  let quantity: number | undefined;
  let digitQty: RegExpExecArray | null = null;
  for (const re of QUANTITY_PATTERNS) {
    digitQty = re.exec(text);
    if (digitQty) break;
  }
  if (digitQty) quantity = Math.min(10, Math.max(1, Number(digitQty[1])));
  else {
    for (const [n, words] of Object.entries(NUMBER_WORDS)) {
      if (Number(n) > 1 && words.some((w) => phraseMatches(h, compilePhrase(w)))) quantity = Number(n);
    }
  }

  const matched = matchProducts(h, vocab);
  let products = matched.products;
  let ambiguous = matched.ambiguous;
  // "not the Lumen P1", "Lumen P1 epa": a negated product is excluded, never the one asked about.
  const keptProducts = products.filter((p) => {
    const span = productSpan(h, vocab, p.id);
    if (span && isNegatedAt(h.tokens, span[0], span[1])) {
      excluded.productIds.push(p.id);
      return false;
    }
    return true;
  });
  if (keptProducts.length !== products.length) {
    products = keptProducts;
    if (products.length === 0) ambiguous = false;
  }
  // A brand is excluded when the words around it negate it; the first brand that is NOT negated is the one asked for.
  const mentions = brandMentions(h, vocab);
  let brand: string | undefined;
  for (const m of mentions) {
    if (isNegatedAt(h.tokens, m.start, m.start + 1)) excluded.brands.push(m.brand.toLowerCase());
    else brand ??= m.brand;
  }
  // A well-known brand the catalogue does not carry ("Samsung" in a shop without it) can still be negated: it must not turn into a search by name.
  for (let i = 0; i < h.tokens.length; i++) {
    const t = h.tokens[i]!;
    if (KNOWN_BRAND_WORDS.has(t) && isNegatedAt(h.tokens, i, i + 1)) {
      negatedWords.add(t);
      if (!excluded.brands.includes(t)) excluded.brands.push(t);
    }
  }
  // A word that is the MODEL of catalogue products ("iphone") is what the shopper is looking for, even when no product name contains it.
  if (!queryWord && !brand && products.length === 0) {
    const model = matchModelWord(h, vocab);
    if (model) queryWord = model;
  }
  const ordinals = ORDINALS.filter((o) => anyPhrase(h, o.words)).map((o) => o.n);
  const ordinal = ordinals[0];
  const firstMention = anyPhrase(h, FIRST_MENTION_REFS);
  // "the first one I mentioned" is not the first position of the list; "the one I mentioned before" is the previous product.
  const previous = !firstMention && anyPhrase(h, PREVIOUS_REFS);
  const plural = anyPhrase(h, REFERENT_PLURAL);
  const single = !plural && (ordinal !== undefined || previous || firstMention || anyPhrase(h, REFERENT_SINGLE));

  const sort = anyPhrase(h, SORT_CHEAP) ? "price-asc" : anyPhrase(h, SORT_EXPENSIVE) ? "price-desc" : anyPhrase(h, SORT_NEWEST) ? "newest" : undefined;
  const onSale = anyPhrase(h, ON_SALE) && !/\b(give|apply|make)\b/.test(text);
  const ref = ORDER_REF.exec(rawMessage);

  return {
    amounts,
    ...bounds,
    ...(unparsedCue ? { unparsedAmount: true } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
    colors,
    storages,
    ...(categorySlug ? { categorySlug } : {}),
    ...(queryWord ? { queryWord } : {}),
    ...(conceptWord ? { conceptWord } : {}),
    ...(brand ? { brand } : {}),
    products,
    productAmbiguous: ambiguous,
    ...(plural ? { referent: "plural" as const } : single ? { referent: "single" as const } : {}),
    ...(ordinal !== undefined && !firstMention ? { ordinal, ordinals } : {}),
    ...(previous ? { previous: true } : {}),
    ...(firstMention ? { firstMention: true } : {}),
    ...(ref ? { orderRef: ref[0].toUpperCase() } : {}),
    ...(sort ? { sort } : {}),
    ...(onSale ? { onSale: true } : {}),
    unknownTerms: unknownTerms(display, h, vocab, brand, products.length > 0, negatedWords),
    ...(excluded.brands.length + excluded.categories.length + excluded.words.length + excluded.productIds.length > 0 ? { exclusions: excluded } : {}),
  };
}
