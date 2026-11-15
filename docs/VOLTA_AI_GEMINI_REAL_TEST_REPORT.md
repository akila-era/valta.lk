# First real Gemini test (capped, invented prompts only)

Date: 2026-11-15. Written for: the project owner. **No customer data was used and nothing was changed on any server.** The test ran on the developer PC with the owner's key (the owner pasted it in chat and asked for it to be used; it is stored outside the repository with owner-only permissions, and it must still be revoked because it is exposed). It used the REAL gateway, the REAL Gemini adapter, the REAL turn loop and verifier v2, and the REAL shop tools on the INVENTED fixture catalogue. Model `gemini-3.5-flash-lite`, thinking level `minimal`, output cap 1,024 tokens. Hard budget limit LKR 80; total spent across all runs about LKR 18 (about USD 0.05).

## What was verified for the first time (real service, not a fake)

| Item | Result |
|---|---|
| The key is valid and the adapter's request shapes (URL, header, `systemInstruction`, `tools`, `toolConfig`, `generationConfig.thinkingConfig.thinkingLevel` lowercase, function results as a `user` `functionResponse` turn) are accepted by Google's live service | **Yes** (every call succeeded) |
| Function calling through the gateway (calculator, shop search, recall) | **Works**; tool arguments valid; results fed back correctly |
| Real usage metadata drives the budget ledger | **Works**; per-call cost LKR 0.14 (simple) to 0.55 (tool turn); average about LKR 0.35 per customer turn |
| Latency | 0.8 to 3 s per turn (up to 5.7 s with a repair), far below the local-model estimate (25 to 80 s) |
| Grounded prices | The Lumen P1 price was quoted exactly as the tool returned it (`Rs. 59,900`) |
| Negation across turns | "don't recommend Lumen" persisted into later turns through the history |
| Honesty when it cannot search | "I cannot check the web right now…" (after the prompt fix) |
| Calculator | `15% of 2400` through the tool: 360 |

## Defects the real test found (all fixed, with regression tests, commit 028ddb6)

1. **Verifier false positive:** the model echoed the customer's own number (`100000 wada adu` became `Rs. 100,000`); it was flagged as an ungrounded price and the harmless sentence was deleted. A number the customer typed is now accepted when no shop product is in the sentence or the sentence restates the budget; it is never accepted as a product's price (a pre-existing hole where "the Lumen P1 costs Rs. 100,000" would pass if the budget was 100,000 is closed too).
2. **Stray script:** a Bengali fragment appeared inside a Singlish word. New `unexpected_script` check.
3. **Repair message drift:** a regenerate request that did not restate the question produced an unrelated apology. It now restates the customer's message.
4. **Stale knowledge presented as current** ("the latest Android is 15"): the prompt now carries a knowledge-cutoff rule.
5. **Singlish answered in Sinhala script:** the prompt now says Latin letters.
6. Earlier (local run against a test double): every real tool request would have been rejected by the schema converter (`maxLength`); fixed in 80dfc86.

## Honest findings that are NOT fixed

- **Sinhala quality is imperfect.** In the final run the Sinhala answer about Python described it as a "ක්‍රෝධකරණ භාෂාව" (roughly "an anger-making language") where it should have said "ක්‍රමලේඛන". The same prompt gave the correct word in an earlier run. A greeting reply was grammatically odd. Singlish is understandable but sometimes clumsy (the "correction" case produced garbled wording and still needed a repair). **Gemini 3.5 Flash-Lite at minimal thinking cannot be called production-quality Sinhala without native-speaker review**; a stronger model or higher thinking level may help and would cost more.
- **The correction case** ("mama kiwwe eka nemei, mama kiwwe phone ekak") did not search for phones; it asked a clarifying question.
- **The verifier is heuristic:** in this run it caught an unsourced link, invented prices and a stray script, and it has false positives (now fewer). It cannot judge Sinhala correctness at all.
- The test set is small (14 invented prompts), one run each; it shows that the plumbing works, not how often answers are good.

## What this means for the shadow trial

The technical risk of the shadow trial is now low (shapes verified live, cost known, latency fine). The remaining blockers are not technical: confirmation that the key belongs to a BILLED project (free tier lets Google use prompts to improve its products), the owner's privacy approval and customer notice, the systemd change for the spend ledger, one Agent restart, and the decision to accept that Sinhala quality is unreviewed (shadow shows no Gemini text to customers, so it cannot harm them; it only counts). See `VOLTA_AI_GEMINI_SHADOW_ROLLOUT_PLAN.md`.
