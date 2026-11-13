# M3-B report: Sinhala, Singlish and mixed-language intent understanding

Status: implemented and tested locally in `apps/agent`. **Not committed, not deployed, not pushed.** Nothing here is a quality claim for Sinhala: no native speaker has reviewed any of it (see `AI_M3B_NATIVE_REVIEW_PACK.md`).

Written for: the project owner.

## 1. Baseline and goal

Starting point (the M3-A set, 98 messages): Sinhala 78%, Singlish 74%, English 95%, mixed 100%. Those numbers came from messages the same project wrote while building the router, so they were optimistic. The first job was a fresh benchmark; the second was improvements that generalise instead of memorising a set.

## 2. Datasets, and how contamination was handled

| Set | n | Purpose | Rule |
|---|---|---|---|
| DEV | 124 | Find gaps, tune | Used freely |
| TEST | 124 | Frozen check | Run once before changes (baseline), once after. Its failures were **not** looked at to write rules |
| HOLDOUT | 70 | Final estimate | Written **after** the rules were frozen, run once, never tuned on. Includes tricky boundaries (a general sentence with a shopping anchor, and the reverse) |

Each language group (Sinhala script, Singlish, English, mixed) has the same spread of 18 labels: the shopping intents, policy questions, small talk, and three scope labels (general request, external website, too vague).

**Contamination disclosure (important).** All sets were written by the same AI assistant that wrote the router, not by native speakers. In addition, while writing the first version of the frames I found I had typed several words that mirrored sentences in the frozen TEST set (for example "ගෙදරටම", "dunnoth", "ලැබෙයිද", "තුනක්", "time to pay"). I removed every one I could identify, but I cannot prove none remain, and I wrote the scope vocabulary knowing the test topics. **TEST is therefore an upper-biased estimate, and DEV is tuned.** HOLDOUT is the best available estimate, and it is still same-author.

## 3. What changed

| Change | Where | Why it generalises |
|---|---|---|
| Doubled-vowel collapse for Singlish ("laabama", "keeyada", "onee") and joining of a split question particle ("puluwan da") | `src/router/normalize.ts` | Handles spelling variation without listing each spelling. Consonant variants (th/t, w/v) were tried and **rejected**: they corrupt number words such as "thousand" |
| **Co-occurrence frames**: a message matches when it holds a word from each of two concept sets (an order word and a where/when/arrive word; a cart word and an add word) and none from an exclusion set | `src/router/lexicon/frames.ts` (new), `router.ts` | Covers many paraphrases at once, in all three scripts |
| **Scope guard** with two new intents | `src/router/scope.ts` (new), `router.ts`, `types.ts` | `external_site` (another website, Google, Daraz, Amazon and similar): polite fixed refusal, no tool. `general` (writing, explanation, coding with no product, brand, category, amount or "this one"): kept away from the shopping tools, same clarify path as before. Names inside products ("Google Pixel") stay products |
| New fixed reply `external_site_refused` (English and provisional Sinhala), with suggestion chips | `src/router/templates.ts` | No digits, links or facts; Sinhala flagged `needsNativeReview` by the existing pipeline rule |
| A quantity-change phrase without the word "cart" counts only when the cart has items | `router.ts`, `frames.ts` | Keeps the existing safety property that a cart change needs cart evidence |

Nothing in `src/pipeline`, the verifier, HMAC, rate limits or the tool layer was edited.

## 4. Results (measured locally, deterministic router, mock vocabulary)

Overall correct (the router chose the expected intent; "ambiguous" counts asking a question as correct; policy questions accept `store_info`):

| Set | Baseline | After | Notes |
|---|---|---|---|
| DEV (tuned) | 54.8% (68/124) | 99.2% (123/124) | In-sample by construction |
| TEST (frozen, contaminated risk) | 46.8% (58/124) | 85.5% (106/124) | Upper-biased |
| **HOLDOUT (written after freezing)** | **41.4% (29/70)** | **64.3% (45/70)** | Best estimate |
| Earlier M3-A author set (not tuned on) | 86.7% | 97.3% | Shopping intents only |

Per language group:

| Group | DEV | TEST | **HOLDOUT** | Earlier M3-A set |
|---|---|---|---|---|
| Sinhala script | 51.6% → 100% | 45.2% → 96.8% | **40.0% → 60.0%** (6→9 of 15) | 77.8% → 88.9% |
| Singlish | 48.4% → 100% | 41.9% → 61.3% | **47.1% → 70.6%** (8→12 of 17) | 73.7% → 100% |
| English | 45.2% → 96.8% | 41.9% → 90.3% | **33.3% → 61.9%** (7→13 of 21) | 94.7% → 100% |
| Mixed | 74.2% → 100% | 58.1% → 93.5% | **47.1% → 64.7%** (8→11 of 17) | 100% → 100% |

False shopping-tool calls (a tool was planned for something that needed none, or for the wrong purpose): DEV 4 → 0, TEST 6 → 0, HOLDOUT **9 → 6**. The scope labels (general, external website, too vague, policy) went from 0% to 72% on HOLDOUT, with **0** false tool calls among them.

Reading the numbers honestly:
- The realistic gain is about **+23 points** (HOLDOUT 41% → 64%), not the 99% on DEV.
- The honest headline: **the router is not good enough yet** at roughly two thirds on unseen phrasing, with all four groups between 60% and 71%. English is not better than Sinhala here, which says the weakness is phrasing coverage, not language.
- Singlish on TEST (61%) is the weakest signal of generalisation.
- Sample sizes are small (15 to 31 per group per set): differences of a few points are noise.

## 5. What the remaining holdout misses look like

Of the 25 misses, 17 are abstentions (the router asked a question), 2 are a different non-tool intent and 6 are false tool calls. The 6 false tool calls were all **read-only**: "empty my cart" planned a cart view (there is no clear-cart tool), and "change my order" planned an order lookup instead of a support hand-off. No cart change, order action or payment was ever planned wrongly: cart changes remain proposals the shopper confirms, and there is no tool for the rest. The misses fall into: still-uncovered paraphrases ("how do I follow my order", "is this still being sold"), indirect Sinhala phrasing, and general requests that mention a product ("tell me a story about a phone") which the anchor rule sends to shopping intents. These came from looking at HOLDOUT results to describe them; **no rule was written from them**, so HOLDOUT remains unspent for this round, but the next round should use a new holdout.

## 6. Regression evidence

- Agent suite: **1134 tests pass** (1080 at the start of M3-B), type check clean.
- Earlier router sets A, B, C, the English tool-selection comparison and the property tests (never plans an unknown product, cart change needs a cart word, valid by construction, no tool for hand-offs) all pass.
- Expectations deliberately changed (new taxonomy, same behaviour): "What's the weather today?" and "tell me a joke" are now labelled `general` (still a clarify, no tools) in `tests/eval/sinhala-sets.ts` and `tests/unit/router.test.ts`; `tests/unit/normalize.test.ts` now documents vowel collapse ("coool" becomes "cul", "onee" becomes "one").
- One defect found by the old tests and fixed: a Singlish "can I get a phone" was becoming a stock check; it now needs "this/that" or a time word.
- New tests (`tests/integration/m3b-scope.test.ts`, 47): refusal of external sites, products that contain a site name, the pipeline's fixed refusal with no card or action, general requests, anchored shopping sentences, a generated-sentence property check that external and general intents never carry tool calls, and 24 paraphrase examples.

## 7. Not done, and why

1. **No native review.** Sinhala labels, wording and the new Sinhala template are engineer-written. The review pack is ready; nobody has reviewed anything.
2. **Not deployed.** The live AI server still runs the previous router. Deploying needs a rebuild and your approval, and should follow native review of the new Sinhala template.
3. **General requests still get the old fallback** (a clarifying question, or a Qwen-written chat reply for Latin-script text). A real answer lane is M3-C.
4. **The gap to a good router remains.** Hand-written rules reach about two thirds on unseen phrasing. Options for the next round: (a) native-written data first, then (b) a small trained classifier as a second opinion for low-confidence cases (it needs that data and a CPU budget check on the 4 GB server), (c) more frames after each new holdout.
5. **Entity extraction was not improved** (storage, colour, brand paraphrases), beyond what the new intents needed.
6. **English is not the focus**; the English numbers above are the router alone. The live Agent uses router-first and falls back to Qwen when the router abstains, so real end-to-end English behaviour is better than these figures suggest.

## 8. Claims allowed and not allowed

Allowed: "On a new, English-and-Sinhala test set written by the engineering team, intent accuracy rose from about 41% to about 64% on unseen messages; external-website and general requests no longer reach shopping tools."

**Not allowed:** any statement that Sinhala or Singlish understanding is good, reliable, production-ready, or native-quality; any accuracy figure presented as customer-representative.

## 9. Changed files (uncommitted)

Modified: `apps/agent/src/router/{router,normalize,templates,types}.ts`, `apps/agent/src/router/lexicon/intents.ts` (type only), `apps/agent/tests/eval/sinhala-sets.ts`, `apps/agent/tests/unit/{normalize,router}.test.ts`.
New: `apps/agent/src/router/scope.ts`, `apps/agent/src/router/lexicon/frames.ts`, `apps/agent/tests/integration/m3b-scope.test.ts`, `apps/agent/tests/bench/m3b/{types,dev,test,holdout,eval,m3b-bench.test}.ts`, `apps/agent/tests/bench/m3b/compare.mjs`.
Data (kept for audit): `docs/m3b-raw/baseline/` (recorded before any router change), `docs/m3b-raw/baseline-holdout/` (old router on HOLDOUT), `docs/m3b-raw/after/`, `docs/m3b-raw/native-review/` (the two review CSVs), `docs/m3b-raw/work/` (scratch and an exact backup copy of the router used for the holdout baseline: can be deleted).
