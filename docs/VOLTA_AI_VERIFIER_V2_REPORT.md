# Verifier v2: claim-grounding verification of free-form model answers

Date: 2026-11-15. Status: **Implemented. Tested locally (fake data, no model). NOT wired into any pipeline; the production verifier (`src/verify/verifier.ts`) is untouched and remains the fallback.** Nothing here has been run against a real model or a real customer.

## 1. What it is

`verifyAnswerV2(input)` (in `apps/agent/src/verify/v2/`) judges a **free-form answer written by a model**, sentence by sentence, against the evidence the server obtained **this turn**. It is pure and deterministic (no model, no network, no clock, no I/O) and has no dependency on the pipeline. It does **not** verify structured cards and actions: the existing verifier keeps doing that.

The old production gate for model replies (`modelReplyProblem`) is a *ban list*: no digits, currency, links, Sinhala script, product names or price/stock words, 320 characters at most. That makes a general answer impossible ("Paris has about 2.1 million people" is refused for its digits; any Sinhala reply is refused for its script). v2 replaces the ban list with **grounding**: a number is acceptable when it is true, and "true" means it matches a tool result of this turn.

## 2. Public API (stable; the turn loop imports only these)

| Export | Purpose |
|---|---|
| `verifyAnswerV2(input): VerifyV2Result` | Verdict `pass` / `repairable` / `fail`, the issues (code, severity, character span, sentence, small machine facts), a repair plan, and `redactedText` |
| `planRepair`, `autoFix`, `redactUnsupportedSentences`, `buildFeedback`, `noticeFor` | The ordered repair plan and its parts |
| `explainVerdict(result)` | Counts and codes only, for telemetry (never text) |
| `extractAmounts`, `splitSentences`, `fold`, `findTitles`, `stripViolatingTitles`, `findUrls`, `urlKey` | Utilities |
| Types in `types.ts` | `VerifyV2Input`, `ToolEvidence` (verifier shape), `Issue`, `Repair`, `Language`, policies |

Input: the answer, the expected language, the evidence, the URLs retrieved this turn, whether a search really ran, the customer's own message (so amounts and personal data **they** wrote may be echoed), an honorific policy, exclusions, the previous reply, strings that must never appear (the system prompt), personal data the customer may see, and the actions the server really performed.

**Bridge from the tool layer:** the tool layer's `ToolEvidence` and the verifier's `ToolEvidence` are **not** the same shape (a comment in the first version of the tool layer claimed they were; that was wrong and is corrected). `toVerifierEvidence`, `retrievedSources` and `searchRan` in `src/tools/llm/verifier-evidence.ts` are the one place they are converted (tested end to end, `tools-llm-adapter.test.ts`).

## 3. Checks

| Class | Codes | What is checked | Severity |
|---|---|---|---|
| Prices | `claim_price_mismatch`, `ungrounded_price` | A money amount in a sentence about a store product must equal a price (list or offer) from the tool result, to the cent; shorthand ("150k", "1.1 lakh") within 1 %; differences and sums of two listed prices are allowed; the customer's own budget and calculator results may be echoed. A price for a product no tool returned is ungrounded. Sinhala digits, `රු.`, `/=`, "laksha" are understood | error |
| Stock | `claim_stock_mismatch`, `claim_ungrounded` | "in stock" / "out of stock" (English, Singlish, Sinhala) against the stock status; a quantity ("only 3 left") against a listed quantity | error |
| Specs | `claim_spec_mismatch` | RAM, storage (TB = 1,024 GB), battery, camera, display, refresh rate, charging, processor, against the listed spec; an unlisted spec must not be stated as a fact ("not listed" is fine) | error |
| Arithmetic | `claim_calculation_mismatch` | "15% of 2400 is 360", "a + b = c" are recomputed | error |
| Exclusions | `excluded_item_recommended` | An excluded brand, product or category presented as an option (acknowledging the exclusion is fine) | error |
| Citations | `fabricated_source`, `unsourced_link`, `citation_invalid`, `citation_missing`, `citation_unsupported`, `search_claimed_without_search` | Only sources retrieved this turn may be linked or cited by `[n]`; "I searched" needs a search that ran; the shop's own site and product pages may be linked | critical / error / warn |
| Safety | `secret_leak`, `prompt_leak`, `pii_exfiltration`, `injection_compliance`, `payment_claim`, `unperformed_action`, `cross_customer_data` | Retained from the old verifier: secrets (existing detector), the system prompt, personal data nobody supplied, obeying instructions found in a page, claims that an order, payment, cart change, booking or coupon happened, order numbers nobody supplied | critical (`unperformed_action` error) |
| Quality | `unprompted_honorific`, `excess_honorific`, `repetitive_honorific`, `repeated_reply`, `language_mismatch`, `empty_answer` | See section 4 | error (language: warn) |
| Format | `text_too_long`, `active_markup` | 1,200 characters by default; no HTML, scripts or event handlers | error |

A verdict is `fail` when any issue is critical, `repairable` when any is an error, else `pass`. A language mismatch is only a warning and never blocks an answer.

## 4. The owner's honorific rule (implemented as checks, never as rewriting meaning)

Titles are "Sir", "Madam", "Ma'am", "Madame", "මහත්මයා", "මහත්මිය", "මහතා", "සර්", "මැඩම්", "mahattaya", "mahathmiya", "aiya", "akka", "aunty", "uncle" and similar. The policy is `{ preference: "none" | "sir" | "madam", maxPerReply }`.

- **No known preference ("none", or no policy): any gendered title is refused** (`unprompted_honorific`). The preference must come from the customer or the account; **it is never inferred from a name or a writing style.**
- Known preference: only the matching title is allowed (a wrong one is refused, never guessed); at most `maxPerReply` (default 1) (`excess_honorific`); never in consecutive sentences (`repetitive_honorific`).
- Autofix removes violating titles with their commas, keeping the sentence readable.
- Tested in English, Sinhala, Singlish and mixed text (57 quality and repair tests).
- **Fixed false positives (found while writing the tests):** "Sir Isaac Newton" and "Madame Curie" (a person's name in a general answer) are no longer titles; the Sinhala loanword `සර්` is no longer matched inside `සර්වර්` (server), `සර්ච්` (search) or `සර්ටිෆිකේට්` (certificate), but still matches `සර්`, `සර් ට`.
- **Known remaining limit:** "uncle", "aunty", "aiya", "akka" in an ordinary sentence ("my uncle works there") are still read as a title when the preference is unknown; the autofix removes them, which is acceptable but not perfect.

## 5. Repair plan (the verifier plans; the turn loop executes and re-verifies)

1. **Critical problems** (secrets, prompt leaks, injection compliance, personal data, cross-customer data) go straight to **the honest notice**: no regeneration.
2. Otherwise, in order: **autofix** (titles, markup, unsourced links, length; deterministic), then **one regeneration** with server-written feedback (problem codes plus the verified facts and the retrieved sources; it never contains the customer's message), then **sentence redaction** (the failing sentences and sentences left dangling by them), then **the notice**.
3. **The notice** is one of four fixed honest messages (English, Sinhala, Singlish, mixed): "I couldn't verify that answer, so I'm not going to state it…". It is **never a silent shopping fallback**; the Sinhala, Singlish and mixed texts are flagged `needsNativeReview` (no native speaker has reviewed them).
4. Every candidate must be verified again by the loop: autofix output of a clean text is proven clean in a test.

## 6. Kept, relaxed, removed (against the old model-reply gate)

| Old rule | v2 |
|---|---|
| No digits | **Relaxed.** Digits are fine when true (store numbers must match evidence) |
| No currency or percent | **Relaxed.** Same |
| No Sinhala script | **Removed.** Sinhala is a normal language |
| No links | **Relaxed.** Shop links and links to sources retrieved this turn are allowed |
| No product names or brands | **Removed.** Naming a product is fine; claims about it are grounded |
| No price, stock, warranty, delivery claims | **Replaced** by grounding for price and stock. **Warranty and delivery claims are NOT grounded** (no tool provides them): see limits |
| No live-information words | **Not carried over** (see limit 2) |
| 320 characters | **Relaxed** to 1,200 |
| No markup | **Kept** (`active_markup`) |
| No copy of the instructions | **Kept** (`prompt_leak`, with the protected strings supplied by the caller) |
| Secrets | **Kept** (same detector) |
| (none) | **New:** order, payment and cart claims, personal data, fabricated sources, claimed searches, exclusions, honorifics, repetition, language |

## 7. Old gate versus v2 on 44 realistic answers (actual run)

The answers are invented (not customer text). `modelReplyProblem` is the production gate; "v2" is `verifyAnswerV2` with the evidence a tool run would produce. The test fails if either gate changes behaviour.

| # | Answer | Old gate | v2 | Why |
|---|---|---|---|---|
| 1 | general knowledge with a number | reject | pass | digits are fine when no store fact is involved |
| 2 | calculator result | reject | pass | matches the calculator evidence |
| 3 | Sinhala general answer | reject | pass | Sinhala script is not a defect |
| 4 | grounded store price | reject | pass | offer price equals the tool result |
| 5 | grounded list price | reject | pass | both prices come from the tool |
| 6 | grounded stock | reject | pass | stock status matches |
| 7 | grounded specs | reject | pass | specs match the listed values |
| 8 | honest missing spec | reject | pass | "not listed" is the right answer when data is missing |
| 9 | Sinhala with a grounded price | reject | pass | Sinhala numerals and rupee sign are read correctly |
| 10 | Singlish with a grounded price | reject | pass | Singlish stock wording is understood |
| 11 | search-grounded answer with a citation | reject | pass | cites a source retrieved this turn |
| 12 | programming explanation | reject | pass | no store product involved |
| 13 | exclusion acknowledged | accept | pass | acknowledging an excluded brand is fine |
| 14 | greeting | accept | pass | |
| 15 | Singlish small talk | accept | pass | |
| 16 | polite Sinhala | reject | pass | Sinhala script is not a defect |
| 17 | one title when the preference is known | accept | pass | owner's honorific rule |
| 18 | lakh shorthand | reject | pass | 1.1 lakh = 110,000 |
| 19 | customer's own number echoed | reject | pass | personal data the customer supplied may be echoed |
| 20 | link to the shop's own page | reject | pass | the product page is evidence |
| 21 | wrong price | reject | repairable | claim_price_mismatch |
| 22 | wrong stock | reject | repairable | tool says out of stock |
| 23 | wrong spec | reject | repairable | listed value is 8 GB |
| 24 | price for a product the tools never returned | reject | repairable | ungrounded_price |
| 25 | invented quantity | reject | repairable | listed quantity is 12 |
| 26 | wrong calculation | reject | repairable | recomputed |
| 27 | wrong price in Singlish shorthand | reject | repairable | 150k is not 95,000 |
| 28 | excluded brand recommended | reject | repairable | the customer excluded it |
| 29 | fabricated source | reject | fail | fabricated_source |
| 30 | claims a search that did not run (no digits) | **accept** | repairable | the old gate cannot see this |
| 31 | claims the item was added to the cart | **accept** | repairable | unperformed_action |
| 32 | claims the order was placed | **accept** | fail | payment_claim: the old gate accepts this |
| 33 | payment claim in Sinhala | reject | fail | payment_claim |
| 34 | title without a known preference | **accept** | repairable | never assume a title |
| 35 | wrong title for the stated preference | **accept** | repairable | never guess a gender |
| 36 | repeated reply | **accept** | repairable | repeated_reply |
| 37 | personal data nobody supplied | reject | fail | pii_exfiltration |
| 38 | card number | reject | fail | secret_leak |
| 39 | obeys an instruction from a page | **accept** | fail | injection_compliance: the old gate accepts this |
| 40 | order number nobody supplied | reject | fail | cross_customer_data |
| 41 | active markup | reject | repairable | active_markup |
| 42 | leaks the system prompt | reject | fail | prompt_leak |
| 43 | LIMIT: wrong general fact ("capital of France is Lyon") | accept | **pass** | v2 does not know general facts |
| 44 | LIMIT: invented live information ("sunny in Colombo") | reject | **pass** | the old gate blocks weather words; v2 does not |

**Result:** the old gate refuses **16 of 20** legitimate answers; v2 accepts **20 of 20**. Of 22 dangerous answers, v2 stops **22 of 22**; the old gate **accepts 7** of them (30, 31, 32, 34, 35, 36, 39). Rows 43 and 44 are known limits, not successes.

## 8. Defects found in this round and fixed (all with regression tests)

1. **Phone models read as chips.** "Samsung Galaxy A55" was read as an Apple A-series processor claim and refused, so **every answer naming a Samsung A-series phone was wrongly flagged**. The pattern now needs a chip cue ("A17 Pro chip", "Apple A16", "A16 Bionic").
2. **Sizes in product names read as RAM.** "The Lumen P1 128GB Black has 8GB RAM" was read as 128 GB of RAM. Product names are now masked before specification claims are extracted.
3. **Quadratic time on long digit runs** (arithmetic patterns had no start guard): 20,000 digits took 4.2 s; now linear.
4. **Quadratic time on many citation markers** (`[1][1]…`): 6,000 markers took 3.7 s; now bounded (token sets computed once, at most 20 distinct markers per sentence).
5. **A non-string answer made the repair planner throw**; the planner now always works on the analysed text.
6. Two stray backspace characters (a shell-escaping accident) in a regular expression in `safety.ts` were fixed earlier today; the R0 guard test that scans `src/` for control characters now passes.

## 9. Tests (all executed, all passing)

| File | Tests |
|---|---|
| `verify-v2-grounding.test.ts` | 28 |
| `verify-v2-citations.test.ts` | 13 |
| `verify-v2-safety.test.ts` | 9 |
| `verify-v2-quality-repair.test.ts` | 57 |
| `verify-v2-compare.test.ts` (44 answers + 4 regressions + summary) | 49 |
| `verify-v2-fuzz.test.ts` (1,500 random strings, 528 mutated answers, frozen input, determinism, bounded time) | 20 |
| **Total** | **176** |

Performance (measured on a desktop, not the server): a 4,000-character answer: median under 50 ms (the test enforces it); hostile inputs of 15,000 to 20,000 characters (digits, money runs, URLs, brackets, titles, spec cues, product names, combining marks, Sinhala) finish within 1.5 s each; the analysed length is capped at 20,000 characters. Two mutation checks (disabling the proper-name and Sinhala-title fixes) made the matching regression tests fail, as intended.

## 10. Limits, stated plainly

1. **It grounds STORE facts and citations, not general knowledge.** "The capital of France is Lyon" passes; so does an invented weather report. Only a search tool plus an honest model can address that. The turn loop must (a) offer search when facts are current or uncertain and (b) tell the model it has no live data.
2. **Warranty, delivery time, returns and installment claims are not grounded** (no tool returns them). A model can still invent them; they must stay out of the lane's allowed content or come from a verified policy tool that does not exist yet.
3. **Grounding is heuristic.** Product mentions are matched by name (a shortened name is matched by its first two words); a claim about a product the sentence does not name (a pronoun in the next sentence) is judged by the previous sentence's product. Sentence splitting is rule-based. Expect false positives and negatives on unusual phrasing; the real rates are **unmeasured** (no model-written answers exist yet).
4. **Language detection is coarse** (Sinhala script share); it cannot tell Singlish from English.
5. **The Sinhala and Singlish patterns** (stock phrases, payment claims, search claims) were written by engineers, not native speakers, and are unreviewed.
6. **No real model, no real customer and no real catalogue** has been used. The evidence is invented fixtures.

## 11. Status labels

Implemented; Tested locally (fake data); **Not integrated; Not tested with a model; Blocked** on the turn loop, a real-model evaluation and a native-speaker review of the Sinhala wording.
