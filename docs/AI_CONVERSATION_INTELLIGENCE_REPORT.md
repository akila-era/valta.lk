# Conversation intelligence: report (local implementation, not deployed)

Date: 2026-11-13. Written for: the project owner and the reviewers of this change.

Status: **implemented and tested locally. Nothing is committed, pushed, merged or deployed.** The old AI server, the website tunnel, DNS, live traffic, the production model and the model registry approvals were not touched.

## 1. Root cause analysis

I reproduced the complaints on the mock catalogue before changing anything (`probe-before.txt`). The router is a deterministic, router-first pipeline with a scope guard, a Qwen fallback and verified fixed replies. It was not "turning everything into a product search"; it had these specific gaps:

| # | Cause | Evidence before the change |
|---|---|---|
| 1 | **Reply language policy.** Latin-script Singlish was answered with the English fixed text, so a Singlish conversation switched to English. Greetings, "how are you" and "can you help" all returned the same long English introduction | `kohomada oyata` returned "Hello! I'm the VOLTA.LK shopping assistant. I can help you find products, compare them..." |
| 2 | **No conversation memory in the router.** The session stored brand, category and budget but nothing ever read them. A bare budget was "unknown"; "100000 ta adu" after "Samsung phones" searched everything and returned accessories under 100000 | `200000` after "Show me laptops." returned the generic "I'm not sure what you'd like" |
| 3 | **Missing conversational utterances.** "ok", "hari hari", "oyata puluwanda udaw karanna", "monada product", and opinion questions ("eka hondada") had no cue and fell to the generic clarification | all four returned the generic text |
| 4 | **Spelling coverage.** "banak" (power bank), "nadd" (nadda, "isn't there?"), "monada" were not recognised | `power banak nadd` returned the generic text |
| 5 | **Brands the catalogue does not carry.** A lower-case brand word ("samsung phones") was ignored, so unrelated products would have been shown as if they were Samsung | |
| 6 | **Scope-guard precedence.** "write a poem about the sea" scored as a product-details question because of the loose cue "about the"; "what do you sell" was read as a general question | |
| 7 | **An internal flag shown to shoppers.** Every Sinhala reply carried "Sinhala text is provisional and awaiting native review." | |

The generic "I'm not sure what you'd like" text is still the catch-all for truly unrecognised input, but fewer messages reach it.

## 2. Files and modules changed

One router is used; no second intent router was added.

Agent (`apps/agent`):
- `src/router/router.ts`: early rules (acknowledgement, bare-amount follow-up, "what do you sell", opinion question), search refinement from the previous search, smalltalk sub-topics (greeting, how are you, help, browse, capabilities).
- `src/router/conversation.ts` (new): `conversationIntent()` names a router decision with the 11 requested categories (plus `store_service` for orders, checkout and delivery); `isNeutralMessage()`; the filler word lists.
- `src/router/scope.ts`: creative, coding and translation requests are general unless anchored to the catalogue.
- `src/router/normalize.ts`, `lexicon/intents.ts`, `entities.ts`: spelling variants (`banak`, `nadd`, `monada`, `udav`, `helo`, ...), new cues, a list of well-known brands so a missing brand gives an honest "not found".
- `src/router/templates.ts`, `types.ts`: new fixed replies (`how_are_you`, `acknowledged`, `help_yes`, `browse_categories`, `clarify_budget_what`, `opinion_facts`), friendlier greeting and thanks, search-refinement chips.
- `src/pipeline/routing-pipeline.ts`: reply language (explicit page choice wins; Auto follows the message; neutral messages keep the conversation's language), context passed to the router, search subject remembered (replaced, never accumulated), `onDecision` hook, opinion reply.
- `src/session/store.ts`, `src/mock/stack.ts`: a `query` slot, the hook pass-through.
- Tests: `tests/integration/m4-conversation.test.ts` (new, 24 tests), `tests/bench/m4-conversation/*` (datasets, evaluator, freeze record), and updated expectations in `m1f-smalltalk.test.ts` and `routing-pipeline.test.ts` for the new language policy.

Website (`apps/web`, worktree `feature/ai-widget`):
- `src/components/assistant/assistant-panel.tsx`: the review note is no longer shown to shoppers. The message keeps `data-native-review="pending"`; the visible note appears only in non-production builds. The two e2e specs now assert the attribute.

## 3. Intent classification report

Intent = the conversation-level category of the **last** message, decided by the real pipeline on the mock catalogue (no model), after replaying any earlier turns. Labels are engineer-written and **not native-reviewed**.

| Set | Role | Cases | Before (old code) | After |
|---|---|---|---|---|
| DEV | tuned on | 118 | 77.1% (91/118) | 100% (118/118) |
| HOLDOUT | evaluation only, frozen (SHA-256 in `frozen-hashes.json`, a test fails if it changes) | 72 | 83.3% (60/72) | **95.8% (69/72)** on the first run |

Per language, HOLDOUT:

| Language | Cases | Before | After (first run) |
|---|---|---|---|
| Sinhala script | 12 | 100% | 100% |
| Singlish | 26 | 73.1% | 92.3% (24/26) |
| English | 28 | 82.1% | 96.4% (27/28) |
| Mixed | 6 | 100% | 100% |

Per language, DEV before: si 80%, Singlish 70.2%, en 82.2%, mixed 100%; after: 100% in each (it was tuned on, so this is not a quality claim).

**Honesty notes on the HOLDOUT.** HOLDOUT was written before tuning and run once: 95.8%. Its three misses were `what do you sell`, `mata udaw ekak karanna puluwanda`, `mokakda thiyenne`. I then fixed the one that was a precedence bug in a feature I had already built (the browse question being read as general knowledge). A re-run gives 97.2% (70/72), but that number is **contaminated** (I had seen the miss) and should not be quoted as held-out accuracy. The other two misses were deliberately left unfixed. The "before" figure uses the old router decision directly on each message (with the session's last-shown products), which is the same decision the old pipeline made. A regression test keeps a floor on HOLDOUT (85% overall, 75% per language) and DEV (95% per language); neither floor is a quality target.

## 4. Sinhala, Singlish, English and mixed behaviour

- Greetings, thanks, acknowledgements, help and "what do you sell" are answered conversationally with **no tool call and no cards** in all four forms (test: `m4-conversation.test.ts`, asserts the tool list is empty).
- Auto mode: Singlish and Sinhala script get the Sinhala-style reply (and `needsNativeReview: true`); plain English gets English; a neutral message such as "ok" or a bare amount keeps the language the conversation was in. An explicit English or Sinhala choice in the page always wins over what Auto detects.
- All Sinhala wording is **engineer-written and provisional**. Nothing here claims production-quality Sinhala; the internal flag is still sent with every such reply and the visible note is only hidden from shoppers, not removed. Native review is the gate for removing it.

## 5. Conversation-context results

| Conversation | Result |
|---|---|
| "Show me laptops." then "300000" | laptops only, every price at or below 300000 |
| "Samsung phones show me." then "100000 ta adu" | no Samsung in the catalogue: both turns say so; no unrelated products |
| "mata phone ekak oni" then "100000 ta adu" | smartphones at or below 100000; then "show me laptops" and "400000" gives laptops, not phones (the subject is replaced) |
| "150000" with nothing before it | asks what to look for in that budget; no search |
| "tell me about Orbit Pro" then "is this good?" | the product's details, plus a fixed line saying it cannot judge what is best; no opinion invented |
| "eka hondada" with no product in the conversation | asks which product |
| "show me laptops" then "show the cheapest" | laptops, cheapest first |

## 6. Before and after (mock catalogue, auto language)

| Message | Before | After |
|---|---|---|
| kohomada oyata | English capabilities blurb | "මට හොඳින් ඉන්නවා! 😊 ඔයාට කොහොමද? අද මොනවද හොයන්නේ?" |
| hi | "Hello! I'm the VOLTA.LK shopping assistant. I can help you find products, compare them, check stock..." | "Hi! Welcome to VOLTA.LK. How can I help you today?" |
| monada product | generic "I'm not sure what you'd like" | asks which kind of product or budget, no search |
| power banak nadd | generic "I'm not sure what you'd like" | searches, shows the power bank |
| oyata puluwanda udaw karanna | generic text | "ඔව්, අනිවාර්යයෙන්ම! ..." |
| hari hari / ok | generic text | acknowledgement |
| 200000 after "Show me laptops." | generic text | laptops within the budget |
| 100000 ta adu after "Samsung phones" | accessories under 100000 | "no matching products" (no Samsung in the catalogue) |
| meka hondada after a search | generic text | the product's details and "I can't judge what is best for you" |
| write a poem about the sea | "Which product do you mean?" | handled as a general request, no shopping tool |

## 7. Remaining limitations

- **Intent accuracy is not answer quality.** This measures the decision. General-knowledge answers still come from the Qwen chat reply (only when `AGENT_CHAT_REPLIES` is on, only for Latin-script messages); Sinhala-script general questions still get the fixed clarification. No model was run in these tests.
- The datasets are small, author-written and not native-reviewed. HOLDOUT has two open misses ("mokakda thiyenne", "mata udaw ekak karanna puluwanda") and the Singlish forms of "what is there" and "can you help" are only partly covered.
- Context is short-term and in memory (30 minutes, lost on restart): the last search's category, brand and free word, and the last shown product. "meka" with several products shown resolves to the most recent one, which can be wrong.
- Reply language follows the message, so a Singlish shopper now receives Sinhala-script text that has **not** been natively reviewed. If you prefer Singlish replies in Latin letters, the templates need a third set; that is a content decision.
- The brand list for "not in the catalogue" is a fixed list of well-known names.
- Opinion questions are answered with facts and a refusal to judge; the assistant does not recommend.
- Verified on the mock catalogue only. Real ERP categories differ (for example whether "power bank" sits under Accessories), so the live behaviour for those words needs a check after deployment.
- The web change was type-checked and unit-tested (233 tests); the Playwright e2e specs were updated but **not run**. The typing indicator already existed and was not changed.
- Deployment needs a rebuilt Agent bundle and a web build; neither was done.

## 8. How to run

```
cd apps/agent && npx vitest run tests/integration/m4-conversation.test.ts      # 24 tests
M4_SET=holdout M4_OUT=out.txt npx vitest run tests/bench/m4-conversation/run-holdout.test.ts   # evaluation only: do not tune on it
```
Full Agent suite: 1,225 tests pass (one timing-sensitive tool test is flaky under heavy parallel load and passes alone).
