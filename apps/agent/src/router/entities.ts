import { parseAmounts, toPriceBounds } from "./amounts";
import { anyPhrase, compilePhrase, makeHaystack, phraseMatches, type Haystack } from "./cues";
import { COLORS, CONCEPTS, NUMBER_WORDS, ON_SALE, REFERENT_PLURAL, REFERENT_SINGLE, SORT_CHEAP, SORT_EXPENSIVE, SORT_NEWEST, STOPWORDS } from "./lexicon/concepts";
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

function matchBrand(h: Haystack, vocab: Vocabulary): string | undefined {
  for (const brand of vocab.brands) {
    const b = normalizeMatch(brand);
    if (b && h.tokens.some((t) => fuzzyEqual(t, b))) return brand;
  }
  return undefined;
}

function resolveCategory(catalogueWords: string[], vocab: Vocabulary): string | undefined {
  for (const c of vocab.categories) {
    const name = c.name.toLowerCase();
    if (catalogueWords.some((w) => name.includes(w))) return c.slug;
  }
  return undefined;
}

function unknownTerms(display: string, h: Haystack, vocab: Vocabulary, brand: string | undefined, hasProduct: boolean): string[] {
  if (brand || hasProduct) return [];
  const known = new Set<string>();
  for (const p of vocab.products) for (const t of tokenize(normalizeMatch(p.name))) known.add(t);
  for (const b of vocab.brands) known.add(normalizeMatch(b));
  const out: string[] = [];
  for (const raw of display.split(/\s+/)) {
    const word = raw.replace(/[^A-Za-z0-9]/g, "");
    if (word.length < 3 || /^\d+$/.test(word)) continue;
    const lower = word.toLowerCase();
    if (STOPWORDS.has(lower) || known.has(lower) || h.tokenSet.has(lower) === false) continue;
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

  // Specific concept first (charger before phone). A concept resolves to a category only if the catalogue really has one.
  let categorySlug: string | undefined;
  let queryWord: string | undefined;
  for (const c of CONCEPTS) {
    if (c.words.some((w) => phraseMatches(h, compilePhrase(w)))) {
      categorySlug = resolveCategory(c.catalogueWords, vocab);
      if (c.queryWord) queryWord = c.queryWord;
      break;
    }
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

  const { products, ambiguous } = matchProducts(h, vocab);
  const brand = matchBrand(h, vocab);

  const plural = anyPhrase(h, REFERENT_PLURAL);
  const single = !plural && anyPhrase(h, REFERENT_SINGLE);

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
    ...(brand ? { brand } : {}),
    products,
    productAmbiguous: ambiguous,
    ...(plural ? { referent: "plural" as const } : single ? { referent: "single" as const } : {}),
    ...(ref ? { orderRef: ref[0].toUpperCase() } : {}),
    ...(sort ? { sort } : {}),
    ...(onSale ? { onSale: true } : {}),
    unknownTerms: unknownTerms(display, h, vocab, brand, products.length > 0),
  };
}
