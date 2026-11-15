# M8 conversation and reasoning improvements: benchmark report

Date: 2026-11-14. Written for: the project owner and the next engineer. **Local work only: nothing was committed, pushed, merged or deployed, and no server or model was used.** The router-first path needs no model, so none of the numbers below involve Qwen.

Labels: **Implemented / Tested locally** unless stated. **Blocked:** native Sinhala review, real shopper data. **Pending approval:** the pipeline wiring in section 7, any deployment.

## 1. What this report is and is not

- A NEW multi-turn scenario set (**M8 DEV: 97 scenarios, 145 turns**; Sinhala 14, Singlish 29, English 42, mixed 8, wording variety 4) was written first, with expectations taken from the fixture numbers and the intended behaviour, then the unchanged Agent was run on it (the baseline), then the failures were fixed with small general rules.
- **It is a tuned-on set.** Its after-numbers are NOT held-out evidence, and nothing here says how the Agent will do on real shoppers. The only held-out numbers that exist are the first-run numbers of the frozen sets (M4 HOLDOUT, M5 EVAL) recorded in earlier reports.
- The catalogue is the invented fixture (`tests/fixtures/rich-catalogue.ts`), not VOLTA data. Scenarios are author-written, not native-reviewed.
- Metrics are kept separate; no blended score exists.

## 2. Baseline vs after (M8 DEV, tuned on)

| Metric | Baseline (unchanged Agent) | After |
|---|---|---|
| Intent | 33/37 = 89.2% | 37/37 = 100% |
| Context (profile memory) | 20/24 = 83.3% | 24/24 = 100% |
| Reference resolution ("the second one", "mulinma kiyapu eka", cart) | 23/30 = 76.7% | 30/30 = 100% |
| Relevance (cards, category, budget, "cheaper", "not again") | 76/94 = 80.9% | 94/94 = 100% |
| Follow-up questions (asked, not repeated) | 13/14 = 92.9% | 14/14 = 100% |
| Recommendation (top product, fit codes) | 21/23 = 91.3% | 23/23 = 100% |
| Tools | 17/18 = 94.4% | 18/18 = 100% |
| Hallucination (re-derived independently from the fixture) | 145/145 = 100% | 145/145 = 100% |
| Language | 145/145 (not comparable, see 4) | 145/145 |
| **Wording variety** (consecutive replies differ) | **0/6** | **0/6: not fixed, needs pipeline wiring (section 7)** |

## 3. Failure clusters found and what fixed them

| Cluster (baseline) | Cause | Fix (all general rules; no phrase lists copied from the set) |
|---|---|---|
| "actually make it 60000", "I can go up to 100000", "naa 60000 ta adu karanna", "100000 ta adu, camera ekata" ignored | The amount rule only accepted a message of fillers | An amount with change words or usage words around it is a budget follow-up (`router/followups.ts`) |
| "something cheaper", "poddak adu ekak", "a bit cheaper" gave nothing | No relative-price meaning | Cheaper/pricier is relative to the product on top of what was shown; the tool resolves its price from the catalogue (`cheaperThanId`, `pricierThanId`) |
| "show me more", "thawa pennanna" repeated the same cards; "meka epa", "I don't like this one" offered it again | No memory of what was shown | The search runs again without the products just shown (`excludeIds`) |
| "the second one", "and the last one", "Lumen P1" (a bare name) started searches or asked "what do you mean" | Bare pointers scored as searches or nothing | A pointer or a name on its own means that product's details |
| "mulinma kiyapu eka" (the first mentioned) unknown | No such reference | Earliest discussed product |
| "compare the first and the last one" asked "which two" | Only one position was read | All positions named are read; "compare it with X" uses the product just shown |
| "battery eka kohomada" answered as "how are you" | "kohomada" is a greeting cue | A spec question about the one product in front of the shopper is its details |
| "is the Lumen P2 Pro good for gaming?" unknown | Opinion rule needed "this/it" | Opinion question about a named product gives its details (reply states it cannot judge) |
| "I want to buy a phone" asked "which product?" | "buy" was a cart cue | Buying a kind of thing is a search; a cart needs a named product, a pointer or a cart word |
| "I need a charger for my phone" asked "which product should it fit?" | No product named but "for" counted as compatibility | A generic device ("my phone", "mage phone ekata") is not a named product: search for the item (no compatibility claim) |
| "do you have the Pixel 9", "I want a Sony camera" unknown | Abstained | A name the catalogue does not know is searched by name (shopper hears "none" plus alternatives). Also fixes the one M5 DEV miss |
| "no budget", "not sure", "budget ekak nane" after the budget question got "I'm not sure what you want" | Not understood as an answer | A no-preference answer proceeds with what is known; the question is not asked again |
| A third question (brand) after budget and use were both given | Policy | No brand question once budget and usage are both known |
| Typos "gamming", "batary", "photograpy" lost the use | Exact matching | One-letter tolerance on long usage words only |
| "phones between 50000 and 100000" unknown | Category plus amount scored nothing | Category plus amount is a search |
| "bohoma sthuthiyi" answered as a greeting; "meka cart ekata damanna", "X ekata wada hondada" unknown | Missing Singlish cues | Added to the cue lexicon |
| **English requests answered in Sinhala** ("tell me about the third one", "show me another phone") | The language detector counted the English words "one", "me", "ok", "ah" as Singlish markers | Removed them; added missing common Singlish words ("bohoma", "sthuthiyi", "gahanawa", "wadiyenma", ...) |

Also implemented: a weak **storage tie-breaker** for uses with no deciding number (office, studies, everyday): it needs two products with a listed size, never changes the order when sizes are missing, and makes no fit claim (the `fit` reason and trade-off code set is unchanged, so contract 1.0 to 1.3 are untouched). **Processor** is not ranked: nothing in the data parses it and a tier table would be invented; this is stated, not hidden.

## 4. Evaluator and expectation problems found and corrected (not tuned around)

1. **The language metric was circular.** It derived the expected language from the same detector it measured, so the Sinhala-for-English bug scored as a pass. The M8 evaluator now uses its own per-message rule (Sinhala letters, or a word from an independently written list of common Singlish words; digits and fillers keep the previous language). The baseline language figure above used the old rule and is **not comparable**; I did not re-measure the baseline under the new rule, but at least two baseline turns visibly replied in the wrong language.
2. **The independent fit check ignored refinements.** After "something cheaper" the claimed "most memory" is among the cheaper matches, but the check derived the candidate set from budget only and flagged correct claims. The check now applies the refinement ("cheaper than the previous top", "not the products already shown") when re-deriving. This changes what a pass means for those turns; stated here because it affects the hallucination column.
3. **One expectation of mine was wrong** (m8-s26): for a gaming laptop up to 300,000 the fixture's most-memory laptop is lp06 (32 GB), not lp02/lp03. Corrected before tuning.

## 5. Regression checks (executed 2026-11-14)

| Check | Result |
|---|---|
| Agent `npm test` | **1,644 passed, 5 skipped** (the skipped are manual recorders/debug aids); `tsc --noEmit` clean |
| M4 DEV (tuned on) | 118/118 = 100%, identical before and after |
| M5 DEV (tuned on) | identical except intent 97.3% to 100% (the known "Sony camera" miss) |
| Frozen files | no file under `tests/bench` other than `m8-intelligence/` changed; the frozen-hash tests pass |
| **Regression guard only** (the frozen sets are no longer held-out) | M5 EVAL: intent 100%, context 100%, relevance 98.8%, follow-up 100%, recommendation 95.8%, tools 100%, language 99.1%, hallucination 100%. M4 HOLDOUT: 97.2% (si 100, singlish 92.3, en 100, mixed 100). I did not open their failure lists and made no change in response to them. Do not quote these as accuracy: the earlier first-run numbers (EVAL intent 88.6%, recommendation 83.3%, hallucination 0%) remain the only held-out evidence |

## 6. Behaviour change visible to the website

- **Contract: none.** No schema, version or field changed. New fixed reply keys exist (`greeting_again`, `thanks_again`, `recommend_intro_b/c`) but are not part of the contract and are unused until section 7 is wired (except `greeting_again`/`thanks_again`, which need `lastTemplate`).
- Shopper-visible: English messages that used to come back in Sinhala now come back in English; follow-ups ("cheaper", "more", "meka epa", a changed budget, bare positions) now return cards instead of "I'm not sure what you'd like"; "I want to buy a phone" now searches. All replies are still made of fixed templates; prices, names and stock still come only from the catalogue and are re-checked by the verifier.
- Tool schema shown to Qwen is **unchanged** (the three new search arguments are internal and removed from the model's tool list; a test asserts the exact property list).

## 7. Not done, needs the orchestrator (files outside my ownership)

**Wording variety** (0/6) needs the pipeline to tell the router and the reply picker what the previous reply was. The router and templates are ready (`RouteContext.lastTemplate`, `pickVariant`, `ReasoningState.replies`). Exact edits in `src/pipeline/routing-pipeline.ts` and the session type:
1. Add `lastTemplate?: string` to the session object; set `session.lastTemplate = templateKey` where the reply is composed and verified.
2. In the `RouteContext` literal (around line 177) add `lastTemplate: session.lastTemplate`.
3. At the recommendation branch (around line 389) replace `replyKey = "recommend_intro"` with `replyKey = pickVariant("recommend_intro", reasoning.replies ?? 0)` and increment `reasoning.replies = (reasoning.replies ?? 0) + 1` once per reply; import `pickVariant` from `../router/templates`.
Expected effect: the 6 variety turns pass; the verifier needs no change (it checks the exact text of the key it is given and every variant is registered). Not applied and therefore **not measured**.

## 8. Limits and honest unknowns

- DEV only, invented catalogue, author-written messages: real Singlish spelling is far more varied; real shoppers will find failures this set does not contain.
- **No native Sinhala review exists.** All Sinhala wording and the Singlish/Sinhala cue lists are provisional engineering text and keep `needsNativeReview`.
- The router is deterministic and keyword-based; the new rules extend it, they do not make it understand open language. Anything outside the rules still falls to "I'm not sure what you'd like" or to the Qwen planner for English.
- Accessory suggestions still depend on staff-entered compatibility links; the catalogue has none, so "any case for it?" answers honestly that none are linked.
- Ranking uses only listed camera, battery, memory (and now storage as a tie-break). With the real catalogue's missing specifications, recommendations stay limited (see the data readiness report).
- Fuzzy usage matching can in principle match a real English word one letter away from a usage word (for example "gazing" for "gaming"); the test set covers the words most likely to collide, not all.

## 9. Files

Source: `src/router/{followups.ts (new), router.ts, entities.ts, language.ts, templates.ts, types.ts, conversation.ts, lexicon/{concepts,frames,intents}.ts}`, `src/reasoning/{engine,profile,questions,ranking,usage}.ts`, `src/tools/definitions.ts`. Tests: `tests/bench/m8-intelligence/{types,dev-set,evaluate,run-set.test,debug.test}.ts` (the last two are manual tools, skipped normally), `tests/integration/m8-intelligence.test.ts` (20 tests). Record a run: `M8_OUT=file npx vitest run tests/bench/m8-intelligence/run-set.test.ts`.
