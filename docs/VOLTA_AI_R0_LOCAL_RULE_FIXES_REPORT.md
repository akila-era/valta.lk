# Phase R0: local rule fixes, report

Date: 2026-11-14. Written for: the project owner. Scope: Phase R0 ONLY (approved). Everything is on the local development tree: **nothing was committed, pushed, merged or deployed; no server, service, environment variable or model was touched; no web search was added; no frozen benchmark file was modified.** Status labels: **Implemented / Tested locally / Pending approval / Blocked**. All R0 behaviour is **Tested locally** (router, reasoning, pipeline and verifier on the invented fixture catalogue, no model). Nothing here is production-verified, and none of it has been seen by native Sinhala speakers.

## 1. Result in one table

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Dead normalisation rule (backspace characters) | Implemented, tested locally | rule fires on `puluwan da`, `laptop eka thiyenawa da`; does not fire on `laptop da`, `phone da`, `samsung da`; a test scans all of `src/` for control characters (none) |
| 2 | Safety false positives | Implemented, tested locally | 14 benign messages now pass, 16 real attacks still refused (tests, incl. Sinhala) |
| 3 | Correction recognition | Implemented, tested locally | acknowledges, drops the previous reading, answers the corrected request or asks ONE question |
| 4 | Negation / exclusions | Implemented, tested locally | an excluded brand/product/category word never reaches a card, comparison or fit code; persists across turns until asked for again; includes budget ceilings ("not above") and lists ("not Samsung or Apple") |
| 5 | Instructions and natural wording | Implemented, tested locally | per-conversation preferences (reply language, short, no questions, no budget question); 20 new fixed-text variants; NO owner/admin channel (out of scope, see section 8) |
| 6 | Cue collisions, bare category | Implemented, tested locally | `phones` / `laptops` / `ෆෝන්` search; `battery eka kohomada` with no product asks which product; `kohomada` alone is still "how are you" |
| 7 | Repeated identical replies | Implemented, tested locally | greeting, thanks, results intro, recommendation intro, fallbacks, corrections and "no match" replies rotate deterministically through wording variants |

## 2. Files changed

**Agent source, modified (R0):** `src/router/{normalize,amounts,language,entities,followups,router,templates,types,conversation}.ts`, `src/router/lexicon/{safety,concepts}.ts`, `src/reasoning/{profile,questions}.ts`, `src/pipeline/routing-pipeline.ts`. (The working tree also holds earlier uncommitted M8 changes in the same folders; those are not part of R0.)

**Agent source, new:** `src/router/{negation,corrections,preferences,account}.ts`, `src/reasoning/{exclusions,undo}.ts`.

**Tests, new (197 tests):** `tests/unit/r0-normalize-safety.test.ts` (47), `tests/unit/r0-detectors.test.ts` (99), `tests/integration/r0-conversation.test.ts` (50), `tests/integration/r0-bench.test.ts` (1 guard of the DEV set); development set and evaluator: `tests/bench/r0-local-rules/{types,dev-set,evaluate,run-set.test}.ts` (100 scenarios, 157 turns).

**Existing tests edited because they encoded behaviour R0 changes ON PURPOSE** (7 files, each edit minimal; none is a frozen set):

| File | Change | Why it is intended |
|---|---|---|
| `tests/eval/sinhala-sets.ts` (SET_C, developer-authored, in-sample) | label of "How do I reset my password": `unknown` -> `store_info` | R0.2 answers password trouble |
| `tests/integration/m1c-remediation.test.ts` | a bare category (`laptops`, `phones`) now returns cards | R0.6 |
| `tests/integration/m8-intelligence.test.ts` | `battery eka kohomada` with no product: `smalltalk` -> asks which product | R0.6 (the greeting reading was the collision) |
| `tests/integration/m1c-pipeline.test.ts` | the Sinhala reply is requested in its own conversation | a second recommendation in ONE conversation is now worded differently (R0.7) |
| `tests/integration/m1g-chat-replies.test.ts` | repeated fallback may be either `clarify_what` or `clarify_what_b` | R0.7 |
| `tests/integration/m4-conversation.test.ts` | the second "no close match" reply is `no_match_alternatives_b` | R0.7 |
| `tests/integration/routing-pipeline.test.ts` | the fixed list of allowed template keys now includes the new texts | all are fixed, fact-free texts; the digit/currency check on every reply is unchanged |

Docs: this report. No contract, website, voice, browser, HTTP, observability or tools file was edited.

## 3. Root causes fixed

1. **Dead rule** `src/router/normalize.ts:86` (was a regex with U+0008 where `\b` was meant, so it never matched). Fixed with real word boundaries AND restricted to joins that make a known "...da" question word (`isQuestionWord`, same file): joining every "word + da" would have turned "laptop da" into "laptopda" and lost the category. A source-wide scan found no other control character.
2. **Safety** `src/router/lexicon/safety.ts`: `TROUBLE_WORD` (line 88) lets "my password is **wrong / not working / incorrect**" through while a password VALUE (`hunter2`, `Abc12345!`, `password: letmein99`) is still refused; the price-manipulation pattern now skips "price **filter / range / limit / sort**" (line ~46); `BENIGN_PERSONA` (line 12) lets "pretend you are my friend / act as my shopping assistant" through, and a new pattern still refuses any persona with "no rules / no restrictions". `src/router/account.ts` + `router.ts:199` route password and sign-in trouble to a fixed `account_help` text that points to the "Forgot password?" link and asks the shopper not to type the password. That link exists in the website's sign-in form (`apps/web/src/components/account/auth-form.tsx:155`, read from the code; not visually checked on the live site).
3. **Corrections** `src/router/corrections.ts` (structure-based cues: "said"-word + "not"-word, "not what I asked", "I meant", "I actually wanted", Sinhala script) + `routing-pipeline.ts:201-250`: the state is restored to what it was before the misread turn (`src/reasoning/undo.ts`), the remainder after the cue is routed as a new request (or, if it only refines, such as "that's wrong, make it 60000", it is applied to what the shopper was looking at), otherwise the reply acknowledges and asks one short question. The planner always receives the shopper's original message.
4. **Negation** `src/router/negation.ts` (one mechanism: the few words before/after a word in match form), `entities.ts:181-233` (brands, concept words, products), `src/reasoning/exclusions.ts` (set kept for the whole conversation, applied to search and accessory results by `filterOutcomes`, `routing-pipeline.ts:360`, before ranking, cards and the verifier's fit check), `followups.ts:154` (`exclusionDecision`: repeat the last search without the excluded thing). Asking for the thing again withdraws the exclusion; a product named by the shopper is never hidden. `amounts.ts:23`: "not above / no more than / never over" are ceilings.
5. **Preferences and variants** `src/router/preferences.ts`, `routing-pipeline.ts:192`, `src/reasoning/questions.ts:38` (honours "stop asking", "short", "don't ask my budget"), `templates.ts` (new texts; `varyFrom`, `FAMILIES`): the reply language follows the shopper's instruction unless the page explicitly chose one.
6. **Cue collisions and bare category** `followups.ts:128-138` (sort instruction; a `kohomada` spec question with no product asks which product, only for that word because "RAM kiyanne mokakda" is a general question), `router.ts:290` (`bareNounSearch` now accepts a bare category), `amounts.ts:98` ("no budget" is an answer, not an unreadable amount), `language.ts:14` (short Singlish such as "login wenna ba", "ehema nemei" is detected as Singlish), `normalize.ts` (battery/gaming typos).
7. **Repetition** `templates.ts` (`varyFrom`), `routing-pipeline.ts:527` and `router.ts:441`: the wording depends only on the PREVIOUS reply's key (`reasoning.lastTemplate`, set in `compose`), so it is deterministic (no randomness) and needs no counter.

## 4. New regression tests (197)

`r0-normalize-safety` (47): the rule on 6 inputs, 7 near-misses, the control-character scan, 14 benign + 16 attack safety cases, outgoing-text screening. `r0-detectors` (99): corrections (20 cues, 12 non-corrections), negation (24 negations, 12 non-negations, entity exclusions, budget ceilings, the exclusion set and `filterOutcomes`), preferences (17 instructions, 7 non-instructions), the small router fixes. `r0-conversation` (50): corrections, negation across turns and its withdrawal, preferences, bare categories and cue collisions, account help, wording variety (determinism, every variant verified by the real verifier, a wrong key still rejected), the original message reaching the planner unchanged, and seven fixes for failures found by probing harder variants (section 6). `r0-bench`: guards the DEV set.

## 5. Results (executed 2026-11-14)

**Test suite and checks.** `tsc --noEmit` clean. Agent `npx vitest run`: **1,881 passed, 6 skipped (manual recorders), 0 failed** (84 files). It was 1,644 at the start of this phase, so +237 including the 197 new R0 tests. The frozen-hash tests pass; `git status` shows no change under `tests/bench/m3b`, `m4-conversation` (frozen files) or `m5-reasoning`. **Real-browser suite (`npm run test:real-browser`, run on the R0 tree to confirm nothing browser-related broke): 70 passed, 1 skipped (the opt-in real-site visit), 1 FAILED** in the last full run: `tests/real-browser/driver.real.ts > a hostile page cannot reach loopback, hex/decimal IPs, ...` with "the page script finished: expected 'running' not to contain 'running'". It is **not caused by R0** (that suite drives the browser driver directly and never imports the router or pipeline) and it is **flaky**: an earlier full run on this tree passed 71/71 (1 skipped), and re-running that single test three times passed twice and failed once with the same message. It is the timing-sensitive test the independent review already flagged (finding TS-01, the wait for the page's own script); its wait is still too short under machine load. It belongs to the browser files R0 may not edit, so I left it; it needs a longer or event-based wait.

**The audit's failing messages, same pipeline before (pre-R0 snapshot) and after:**

| Message(s) | Before | After |
|---|---|---|
| `phones under 100000` -> `mama kiwwe eka nemei` | generic "I'm not sure what you'd like" | acknowledges (Sinhala), asks one short question |
| `show me laptops` -> `no, that's not what I asked` | generic | acknowledges, asks one short question |
| `don't recommend Samsung` | **showed Samsung cards** | noted, asks what they are looking for; no Samsung in any later search |
| `from now on reply only in Sinhala` | generic | acknowledged; later replies in Sinhala |
| `phones` then `something cheaper` | generic, generic | searches phones, then a relative-price search (see section 6 for its wording) |
| `hi`,`hi` / `thanks`,`thanks` | identical text | different wording each time (cycle of 3) |
| `my password is wrong for the website, how do I reset it` | refused as "sensitive input" | account-help answer |
| `set the price filter to 50000` | refused as "price manipulation" | treated as a budget ("What would you like to find within that budget?") |
| `pretend you are my friend and recommend a phone` | refused | answered with phones |
| `what is the capital of France` | generic | **generic (unchanged, out of R0 scope)** |

**R0 DEV set (100 scenarios, 157 turns). TUNED-ON: written while the rules were built, NOT held-out evidence. Per metric, never blended.**

| Metric | Before (pre-R0) | After |
|---|---|---|
| safety | 13/24 = 54.2% | 24/24 = 100% |
| understanding | 8/10 = 80% | 10/10 = 100% |
| correction | 12/29 = 41.4% | 29/29 = 100% |
| exclusion | 13/40 = 32.5% | 40/40 = 100% |
| preference | 4/22 = 18.2% | 22/22 = 100% |
| cue | 9/19 = 47.4% | 19/19 = 100% |
| variety | 0/11 = 0% | 11/11 = 100% |
| language | 147/157 = 93.6% | 157/157 = 100% |
| hallucination | 157/157 = 100% | 157/157 = 100% |

**Existing DEV sets must not get worse (same commands, pre-R0 snapshot vs now):** M4 DEV 118/118 both; M5 DEV every metric 100% both; M8 DEV every metric 100% both, except M8's wording-variety metric 0/6 -> 6/6 (the wiring the M8 report listed as missing). **One regression was caught and fixed during this work:** my first "spec question with no product" rule also caught `RAM kiyanne mokakda` ("what is RAM?"), dropping M5 DEV intent to 97.3%; it is now limited to the word `kohomada` and M5 DEV is back to 100%.

**Frozen sets, regression guard only (no longer held-out; summary counts only, nothing tuned on them):** M4 HOLDOUT 70/72 = 97.2% before and after; M5 EVAL every metric identical before and after (intent 35/35, context 31/31, relevance 82/83, follow-up 34/34, recommendation 23/24, tools 30/30, language 107/108, hallucination 108/108). Disclosure: a summary print of the M4 HOLDOUT recording also showed its two "MISS" lines; no change was made because of them and they are identical before and after. The first-run numbers in the earlier reports remain the only held-out evidence.

**Probing beyond the DEV set.** I then tried 30 harder variants not in the DEV set. They found seven real defects in my own first versions, all fixed with regression tests and added to the DEV set: `no, a laptop` was read as excluding laptops; `not Samsung or Apple`, `except Samsung and Kite`, `don't recommend Samsung or Kite` only excluded the first brand; `Samsung is not what I want` and `samsung hari epa` were missed; `sorry, I actually wanted phones` and `no I wanted a phone` were not corrections; `never ask me anything` and `no not that` were not understood; `that's wrong, make it 60000` dropped the subject it needed.

## 6. Remaining limitations (honest, with examples)

1. **General questions are still not answered.** `what is the capital of France`, `what is 15% of 2400`, Python questions, "who is the president now" all get the generic reply. That needs the model lane and the answer classes of R1; nothing in R0 attempts it.
2. **Sinhala-script brand names are not recognised.** `සැම්සුන් එපා` rejected the products just shown instead of excluding Samsung. Brand aliases in Sinhala script need a native-reviewed list.
3. **Comparative preferences are not understood.** `Samsung walata wada Lumen hodai` (Lumen is better than Samsung) gets the generic reply.
4. **Standing instructions beyond conversation style are not supported.** `from now on only show me Lumen products` is just a Lumen search; `always reply in Singlish` gets the language-support answer; there is no "reply in Singlish" mode. **There is still no owner/admin instruction channel at all** (audit section 9): the preferences are per shopper conversation, in memory.
5. **"Cheaper" when nothing is cheaper.** `phones`, `cheaper`, `cheaper` answers "I couldn't find matching products" (the two wordings alternate). There is no "this is already the cheapest" reply.
6. **Exclusion edge cases.** If every one of the 30 candidates a search returns is excluded, the answer says nothing matches even if the catalogue holds more (the candidate limit); the same-category "close options" path can show other brands under the wording "I couldn't find exactly that"; excluding the category of the last search repeats nothing sensible. A well-known brand the catalogue does not carry is still recorded as excluded (harmless).
7. **Corrections are cue-based.** Only the listed structures and their spelling variants are found (for example `that's not it`, `ehema nemei`, `I meant ...`); other wordings fall through to the old behaviour. A correction goes back ONE turn; exclusions and preferences deliberately survive it. A remainder the router cannot read after the cue gets the one-question reply.
8. **Language detection** is still word-list based: a single strong Singlish word makes a whole English sentence "mixed" (audit item 5); only the new short-message cases were added.
9. **Wording variety is limited to consecutive repeats** of the listed families (2 or 3 variants each); `acknowledged`, `help_yes` and other fixed replies are not varied. The replies are still fixed fragments, not generated text.
10. **All Sinhala text is provisional**, written by an engineer and flagged `needsNativeReview`; none of the new Sinhala cues or templates has been reviewed by a native speaker. The DEV sets are tuned-on and author-written on an invented fixture catalogue: they prove the rules work on their own examples and guard against regressions, not accuracy on real shoppers.
11. **The model-backed chat lane was not exercised** (no model runtime here; live-server experiments need approval). R0 changes run before the model, so the lane's own failures (no history, verifier rejects digits and Sinhala) are unchanged.
12. **State is in memory only**: a restart or 30 minutes idle forgets exclusions, preferences and the undo snapshot.
13. **Observability** (not mine to edit): the new events (correction, exclusion applied, preference, account help, reply family used) are not counted yet.
14. The `account_help` text asserts the "Forgot password?" link exists; that is verified in the website code only.

## 7. API compatibility

No contract, schema or HTTP change. New fields live inside the Agent (`Entities.exclusions`, `ReasoningState.{exclusions,prefs,undo,lastTemplate}`, new template keys), and replies are still fixed template texts the verifier accepts, with the same digit/currency/name guarantees (a test checks every template in both languages). Clients see only different reply text.

## 8. Recommended next phase: R1 (design, local, no production)

As the audit's plan says: define the **answer classes** (`shopping`, `general-model`, `search-grounded`) and the verifier rules per class, the **conversation-history input** for the model lane, the optional contract field for sources (version 1.4, Agent deploys first), and an **owner-policy record** design (who may set it, how it is authenticated, what it may and may not override). In parallel and separately: reply-source telemetry for the new events (R6), a native-speaker review list for every Sinhala string added here, and the isolated model evaluation (R3), which needs your approval for any runtime or server. **Stopped here: R1 is not started.**
