# Staging end-to-end report

Date: 2026-11-14. Written for: the project owner and QA. **These are end-to-end tests of the LOCAL stack** (browser, website code, real Agent code, invented fixture catalogue). **No end-to-end test was run against a private staging environment on the servers**, because none exists and creating one needs approval. A mock Agent was not substituted for the real Agent in the real-Agent suite.

## Results (executed)

| Suite | Config | Result |
|---|---|---|
| Real Agent, 12 tests | `apps/web/playwright.real-agent.config.ts` | **12 passed** in each of three runs (1.6, 1.6, 2.1 minutes); the last after the Agent review fixes |
| Fake-Agent assistant specs | original config | **30 passed** after the web changes (widget, voice, mobile keyboard; desktop and phone) |

## Real-Agent suite cases

Sinhala greeting (Sinhala reply, no cards, internal review flag present); Singlish greeting; English greeting; multi-turn shopping (budget question, then usage question, then a recommendation with "highest camera spec listed" and "within your budget" chips and no further question); budget kept for "show me the cheapest"; "the second one" resolves to the second card shown; live stock label and price, out-of-stock item never shown; no match shows alternatives with the "above your budget" chip; Singlish budget follow-up keeps topic and language; explicit language choice overrides Auto in both directions; a failed request shows a plain message and "Try again" without an internal code, and retry works; a phone-sized session with a card and chips.

## Not covered (needs work or approval)

- Comparison and cart-confirm flows against the real Agent in the browser (covered with the fake Agent and by Agent integration tests).
- Visual quality: no screenshots were captured or reviewed. Fit chip layout on narrow phones, long Sinhala wording, and dark/contrast checks are unverified.
- Voice, checkout, store chat, accessibility audit.
- The dev server (not a production build) was used; a production-build run of the new spec was not made.
- Anything against the real catalogue in a browser (the real data has placeholder values; the fixture was used for repeatable expectations).
- Private staging on the servers (blocked; see `VOLTA_PRIVATE_STAGING_ARCHITECTURE.md`).

## Honest reading

The suite shows the wiring and the behaviour work end to end on the local stack. It is not evidence that production behaves the same: production differs by the tunnel, the real catalogue, the model runtime and real traffic.
