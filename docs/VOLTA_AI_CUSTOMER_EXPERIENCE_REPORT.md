# Customer experience report (Phase 8)

Date: 2026-11-14. Written for: the project owner. **No native Sinhala review has taken place, so no claim of natural, correct or trusted Sinhala is made here.** All Sinhala and Singlish wording, and every label, template and lexicon entry, was written by an engineer (an AI model) and is flagged `needsNativeReview` in every response.

## 1. What is evidenced (author-run tests, English reading by the engineers)

| Behaviour | Evidence |
|---|---|
| Greets naturally without starting a search (English, Singlish, Sinhala, mixed) | Browser tests (real Agent) and the intent sets; held-out first run: Sinhala 100%, English 80% intent (before fixes), Singlish 90% |
| Understands budget follow-ups, "the second one", "is it worth it?", brand questions ("Samsung hodaida?") | Multi-turn scenarios (180 scenarios, 253 turns); context retention 100% on 31 held-out checks |
| Asks at most one useful question at a time, never twice, never when three or fewer products match | Question policy tests |
| Never invents products, prices or stock | Hallucination 0% on every turn of 253, checked independently of the system |
| Says plainly when the data cannot support a claim ("the product data doesn't list the details") | Real-catalogue probe and tests |
| Keeps the conversation's language; an explicit page choice always wins | Browser test and unit tests |
| Shows why a product fits as short labelled chips | Browser test (English); Sinhala labels by unit test only |
| A plain error with "Try again" and no internal code | Browser test |

## 2. What a customer would experience today on the real catalogue

The assistant is polite and responsive, but the shop's data limits it: prices that look like placeholders (1,000 for an iPhone), a duplicate "11 pro", phones filed under "apple", no specifications. A shopper asking for "a phone with a good camera" is told, correctly, that the data does not allow ranking, and sees two identical-looking "11 pro" cards. That is honest but not yet a good customer experience. See `VOLTA_AI_DATA_READINESS_REPORT.md`.

## 3. What was NOT assessed

| Item the brief asks for | Status |
|---|---|
| Naturalness and grammar of Sinhala | **Not reviewed by a native speaker** |
| Singlish interpretation quality on real shoppers' messages | Only author-written messages were used; real conversations were never collected |
| Tone and customer trust | Not assessed |
| Follow-up quality as felt by customers | Only rule-level checks |
| Mobile layout and visual polish | One phone-sized functional test; no screenshots reviewed |
| Voice and vision | Not part of this work |
| Escalation to a human | The assistant hands off to the Track-order and checkout pages and states it cannot take orders or payment; there is **no live human escalation channel** in the assistant |

## 4. What the owner needs to arrange

1. Native Sinhala reviewers using the existing process: `AI_M3B_NATIVE_REVIEW_PACK.md` and `AI_M3B_REVIEWER_GUIDE.md`; the full list of fixed Sinhala strings can be exported from `allSinhalaTemplates()` in `apps/agent/src/router/templates.ts` and the website labels in `apps/web/src/components/assistant/labels.ts` (`FIT_LABELS` and the Sinhala column). The review flag is removed only when a named reviewer signs off.
2. A small, consented trial with the team before any customers, collecting real messages for a new independent evaluation set.
3. A decision on human escalation (for example a WhatsApp hand-off link), which the assistant does not have.

## 5. Conclusion

The conversational behaviour is sound on author-written tests; **customer-readiness of the Sinhala experience is unproven and customer-readiness of recommendations is blocked by data.**
