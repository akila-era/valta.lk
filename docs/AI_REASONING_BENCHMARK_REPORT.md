# Customer reasoning and personalised shopping: report (local implementation, not deployed)

Date: 2026-11-13. Written for: the project owner and the reviewers of this change.

Status: **implemented and tested locally. Nothing is committed, pushed, merged or deployed.** The old AI server, the website tunnel, DNS, live traffic, the production model and the model registry were not touched. No fake catalogue data is used by production code: the benchmark uses an invented **test fixture** (`apps/agent/tests/fixtures/rich-catalogue.ts`, clearly marked, never imported by production code).

## 1. Current architecture assessment

What exists, and what it means for this brief:

| Piece | Today | Consequence |
|---|---|---|
| Router | Deterministic, router-first; scores cue phrases and co-occurrence frames, resolves entities against the catalogue vocabulary, abstains when unsure | Good at intent and entities; it had no memory of what the shopper wanted |
| Session | In memory, 30 minutes: language, last intent, slots, last shown ids | Slots were written and (until the previous task) never read |
| Replies | **Fixed templates only.** The verifier refuses any reply text that is not a template, and refuses a model-written reply that travels with cards, digits, product names or claims | A free-form "dynamic" reply from a model would break the project's central safety property (no invented facts) |
| Facts | Only in cards, built from tool results and re-verified field by field | Reasons for a recommendation must also be verifiable facts |
| Catalogue data | Name, brand, category, price, variants and stock from the ERP; **specifications only if staff entered them** in the website database (the real-catalogue path currently supplies none), plus an optional plain-text description | Ranking "for camera" can use only what is actually listed; when nothing is listed the assistant must say so |
| Model | Qwen is used for tool planning on unknown English text and for small-talk or general chat replies (no cards) | Model reasoning stays in those lanes; it is not given product facts |

So "dynamic, customer-centric" is delivered **without weakening the verifier**: the assistant reasons in code about the shopper's profile and the verified catalogue, composes a reply from fact-free fixed fragments (an intro chosen for the situation, plus at most one follow-up question), and carries the reasons as **codes on the cards** that the website words in the shopper's language. It does not produce free-form product advice, because that cannot be verified.

## 2. Implementation plan and what was built

Customer message → language (explicit page choice wins; Auto follows the message) → context retrieval (profile, last results, products discussed) → intent and requirement understanding → reasoning → tool selection → verified data → reply composition → verification → response.

- **Requirement profile** (`src/reasoning/profile.ts`, `usage.ts`): category, brand, a free search word, budget (min/max), and usage (camera, gaming, battery, office, programming, design, student, general), built from the shopper's own words in English, Singlish and Sinhala. A new category or search word starts a new topic and clears the old budget, brand and usage.
- **Spec facts** (`facts.ts`): camera MP, battery mAh and memory read from specification rows first, then the product description; each fact records where it came from; a missing number stays missing.
- **Ranking and reasons** (`ranking.ts`): products are ranked for this shopper (stated budget, brand, usage numbers); reasons and trade-offs are **codes** derived in code (`within_budget`, `best_camera`, `over_budget`, `no_camera_data`, ...). Price only counts against a stated budget: with nothing stated the cheapest leads, never the dearest. The 30 best candidates are fetched and ranked, and the best three to five are shown.
- **Follow-up questions** (`questions.ts`): one question at a time, only for missing information that changes the recommendation (budget, then usage, then brand for phones and laptops; the device for accessories), never repeated, never more than two replies in a row, never when three or fewer products match, never when the shopper chose the order ("cheapest").
- **Answering a question**: a short reply (a usage, a brand, a product name) is read as the answer to the question just asked, and "camera" or "gaming" right after a search narrows it.
- **Conversation memory**: profile, questions asked, pending question, products discussed, products selected (cart proposals), and the last result list in display order. Resolves "meka", "eka", "ara eka", "the second one", "palaweni/deweni eka", "kalin kiyapu eka", "is it worth it?" to real product ids.
- **Advice about a brand** ("Samsung hodaida?", "is Samsung good?"): searched inside what the shopper already said (category, budget); the fixed reply says it cannot judge a brand; the cards carry the facts and fit codes.
- **No exact match**: the same category without the brand or word that found nothing (budget kept first, then dropped, with `over_budget` shown), with a fixed "I couldn't find exactly that, but these are close options" reply.
- **Contract 1.2**: product cards may carry `fit` (codes only). Clients older than 1.2 never receive it. The verifier **recomputes every fit claim** from the same sources and refuses a changed one; replies made of two fixed templates are accepted only when they are exactly those two.
- **Website**: accepts contract 1.2, shows the fit codes as small labelled chips in English and Sinhala (fixed wording written in the website, never taken from the Agent).
- **General questions**: definitional questions ("what is RAM", "explain AMOLED versus LCD") are routed to the general lane, not to product search; the chat prompt now says to admit uncertainty.

## 3. Files changed

Agent (`apps/agent`): new `src/reasoning/{usage,facts,profile,ranking,questions,engine}.ts`; changed `src/pipeline/routing-pipeline.ts`, `src/router/{router,scope,entities,normalize,templates,types}.ts`, `src/router/lexicon/{intents,frames,concepts}.ts`, `src/verify/verifier.ts`, `src/contract/{schemas,compat}.ts`, `src/session/store.ts`, `src/tools/definitions.ts` (search limit up to 30), `src/pipeline/chat-responder.ts`; new tests `tests/integration/m5-reasoning.test.ts`, `tests/fixtures/rich-catalogue.ts`, `tests/bench/m5-reasoning/*`; existing tests updated where behaviour deliberately changed (contract 1.2, session keys, search limit, new intro texts, bare category/specific item).

Website (`apps/web`, worktree `feature/ai-widget`): `src/lib/assistant/schema.ts` (1.2, `fit`), `src/components/assistant/{cards.tsx,labels.ts,types.ts}`, `tests/unit/assistant-fit.test.ts`, fixture version updates.

## 4. Automated test results (actually executed)

- Agent: **1,259 passed, 2 skipped (the manual benchmark recorders)**, 57 test files. `tsc` is clean.
- Website unit and route tests: **270 passed**. `tsc` is clean. The Playwright e2e specs were **not** run.
- The new `m5-reasoning` tests (14) cover usage extraction, spec facts, topic reset, ranking (never promote the dearest), the missing-data case, the question policy, the composed reply, the contract 1.2 stripping for older clients, the verifier refusing a forged fit, and the benchmark floors.

## 5. Customer-conversation benchmark

**180 scenarios** (72 EVAL + 108 DEV), 253 turns, on the invented fixture catalogue (11 phones, 8 laptops, 8 accessories; specs entered two ways, one out-of-stock item, one sale, one phone with no numbers at all). Sinhala script 22, Singlish 47, English 97, mixed 14 scenarios; 61 scenarios have two or more turns (counted by script, not estimated). Expectations were derived from the fixture and the intended behaviour, not by running the system. Labels are engineer-written and **not native-reviewed**.

**EVAL** is the independent set: written before the layer was measured, frozen (SHA-256 recorded, a test fails if it changes), never tuned on. **DEV** is the set tuned on and was written after the first EVAL run (it covers the failure classes that run showed), so **EVAL's first run is the held-out number**.

| Metric | EVAL first run (held out) | EVAL after fixes (contaminated) | DEV (tuned on) |
|---|---|---|---|
| Intent accuracy | 88.6% (31/35) | 100% | 97.3% (36/37) |
| Context retention | 100% (31/31) | 100% | 100% |
| Response relevance | 92.8% (77/83) | 98.8% | 100% |
| Follow-up question quality | 97.1% (33/34) | 100% | 100% |
| Recommendation relevance | 83.3% (20/24) | 95.8% | 100% |
| Tool-selection accuracy | 93.3% (28/30) | 100% | 100% |
| Language consistency | 99.1% (107/108) | 99.1% | 100% |
| **Hallucination rate** | **0% (0/108 turns)** | 0% | **0% (0/145)** |

"Hallucination" is checked on every turn, independently of the system: every card exists in the fixture with the right name, brand, price and stock state; the reply is made only of fixed templates, with no digits or currency and no product name; and every fit claim (within budget, best camera, lowest price, on sale, ...) is re-derived from the fixture numbers.

### 6. Sinhala, Singlish, English and mixed-language breakdown

EVAL first run (held out):

| Language | Turns | Intent | Context | Relevance | Follow-up | Recommendation | Tools | Language | Hallucination |
|---|---|---|---|---|---|---|---|---|---|
| Sinhala script | 13 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 0% |
| Singlish | 29 | 90% | 100% | 91.7% | 100% | 100% | 85.7% | 100% | 0% |
| English | 58 | 80% | 100% | 91.3% | 94.4% | 76.5% | 94.1% | 98.3% | 0% |
| Mixed | 8 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 0% |

DEV (tuned on): 100% on every metric in Sinhala, Singlish and mixed; English intent 93.8% (one miss, below); everything else 100%. Sinhala and mixed samples are small (13 and 8 EVAL turns), so those percentages say little.

**What the first EVAL run found, and what I did.** Real defects: definitional questions ("what is RAM") became product searches; a bare specific item ("power bank") asked instead of searching; "mekata case ekak" did not mean "a case for this"; "most expensive laptop" was not understood; the user's own spelling "hodaida" was not recognised as "hondada"; the "best camera" claim was judged only among the three shown cards; ranking only saw 8 of the matches. All were fixed generally and covered by DEV. Expectation errors in EVAL (left as recorded, not edited): `e16#1` assumed "show me accessories" lists products (the assistant asks which product the accessory is for, which is reasonable), `x07#1` assumed a phone that the ranking would not show, `x01#3` assumed English after "100000 ta adu" (debatable: the shopper wrote Singlish).

## 7. Product recommendation quality

On the fixture, the recommendation behaves as intended: for "a phone with a good camera under 150000" the top card is the 108 MP phone at 94,900, with the equal-camera 112,000 phone second and the 200 MP phones (over budget) excluded; "gaming laptop under 300000" gives the 32 GB model at 249,900 rather than the dearest; "office laptop under 150000" gives the cheapest fit; with no budget, "best camera" returns the 200 MP phones, the cheaper of equals first; phones whose camera, battery or memory is not listed carry a `no_*_data` trade-off; and when no product anywhere lists the number asked about, the reply says the product data does not allow ranking for that. 24 EVAL and 37 DEV turns check the top recommendation; all DEV turns pass and 20 of 24 EVAL turns passed on the first run (23 of 24 after the fixes; the remaining miss is an expectation error). This measures **ranking correctness against the fixture's numbers**, not whether a real shopper finds the picks useful; no shopper study was done.

## 8. Remaining limitations

- **Real catalogue data may not support usage ranking.** Specifications come only from staff-entered rows (the real-catalogue path currently supplies none) or the product description. If the real ERP descriptions carry no camera, battery or memory numbers, usage ranking cannot work and the assistant will say so; it will still use budget, brand and price. **This needs checking against the real catalogue before any claim of "recommendations".**
- Replies are composed from fixed fragments, not free text. That is what keeps hallucination at zero, but it is less conversational than a model-written reply. Explanations are limited to the code vocabulary (16 reasons and trade-offs).
- General knowledge answers still come only from the Qwen chat lane (Latin-script, no cards, only when `AGENT_CHAT_REPLIES` is on); their quality and uncertainty wording were **not** evaluated here (no model was run).
- Sinhala wording, including the new templates and fit labels, is engineer-written and provisional; every Sinhala reply keeps `needsNativeReview`. Usage lexicons in Sinhala and Singlish are small and unreviewed.
- Context is short-term and in memory (30 minutes, lost on restart). Ordinals refer to the last result list; "meka" with several products shown resolves to the first of the last list.
- Known open case: "I want a Sony camera" (a spec word competing with a search cue) is left unrecognised (DEV intent 36/37).
- The fixture is small and invented; scenario counts are enough for regression, not for a quality claim. Author-written labels have the usual bias.
- The ranking looks at up to 30 matches; a catalogue with more matches than that may hide a better product.
- Product images, the e2e browser flow and the visual layout of the new fit chips were **not tested** in a browser.
- Not done: evaluating a model-assisted explanation layer, learning from real conversations, personalisation across sessions.

## 9. Production readiness recommendation

**Not ready for production as is; ready for a private staging trial.** The safety properties hold in testing (zero hallucinations across 253 fixture turns, every fit claim re-verified, older clients unaffected). Before any production use:

1. Check what the real catalogue and descriptions actually contain (camera, battery, memory numbers). If they are absent, either have staff enter specification rows or accept budget- and brand-only recommendations, and say so to customers.
2. Native Sinhala review of the new templates, fit labels and usage words (the review flag stays on until then).
3. Run the Playwright e2e specs and look at the cards on a phone and a desktop.
4. Deploy in order: Agent first (it only sends `fit` to 1.2 clients), then the website; keep the Agent rollback bundle.
5. Re-measure on real, anonymised conversations after a staged rollout; the current numbers are on author-written scenarios.

Needs your approval: any commit, push or deploy (none done), and the decision on native review.

## 10. How to run

```
cd apps/agent && npx vitest run tests/integration/m5-reasoning.test.ts
M5_SET=eval M5_OUT=out.txt npx vitest run tests/bench/m5-reasoning/run-set.test.ts   # evaluation only: never tune on it
```
