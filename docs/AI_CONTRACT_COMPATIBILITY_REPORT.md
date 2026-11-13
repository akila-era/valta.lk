# Contract compatibility report (1.0, 1.1, 1.2)

Date: 2026-11-14. Written for: the project owner and the reviewers.

Everything below was **executed** locally. Nothing was deployed. Test files: `apps/agent/tests/integration/m6-contract-compat.test.ts` (10 tests), `m5-reasoning.test.ts` (contract and verifier cases), `tests/unit/contract.test.ts`, `m1c-compare4.test.ts`; website `tests/unit/assistant-fit.test.ts`, `tests/integration/assistant-route.test.ts`.

## What changed in the contract

Contract 1.2 adds one optional field: a product card may carry `fit`, made of **codes only** (at most 3 reason codes from a fixed list of 10 and at most 2 trade-off codes from a fixed list of 6). It never carries text. Versions 1.0 and 1.1 are unchanged.

## Results

| Check | Result |
|---|---|
| A 1.2 client receives `fit` on product cards; the whole response validates against the 1.2 schema (JSON and streamed) | Pass |
| A 1.1 client, a 1.0 client that names `"1"`, and a client that names no version (treated as 1.0) never receive `fit` (checked on the raw JSON text, so nowhere in the response); responses validate; meta reports the version the client asked for | Pass |
| Streamed cards follow the same rule per version | Pass |
| The 1.0 rule (comparison cut to 3 products) and the 1.1 rule (4 products) still hold next to the new field; `fit` is stripped from comparison products and accessory products for older clients | Pass |
| An unknown version ("1.3", "2", "0.9", "") is refused with HTTP 422 `VALIDATION_FAILED` and no cards | Pass |
| The contract refuses an unknown reason code, more than 3 reasons, more than 2 trade-offs, and an extra field on `fit` | Pass (Agent and website schemas) |
| **Unknown codes fail safely, Agent side:** a pipeline that returns an unknown code never reaches the shopper; the server answers HTTP 500 `INTERNAL` with no detail and the code is absent from the body | Pass |
| **Unknown codes fail safely, website side:** an Agent response with an unknown code is refused as garbage (HTTP 502) and nothing from it reaches the browser; a known code passes through unchanged | Pass (new route test) |
| The verifier accepts the engine's own claims | Pass |
| The verifier refuses **every** reason code and every trade-off code that is put on a card where it does not hold (all 10 reasons and all 6 trade-offs tried one by one against a real ranking) | Pass |
| The verifier refuses a changed price, a changed name, and any `fit` sent without the context to recompute it | Pass |
| A reply made of two fixed templates is accepted only when it is exactly those two (a changed second sentence is refused) | Pass |
| The website sends 1.2 and its schema requires `contractVersion` 1.2 in the Agent response (a fixed literal) | By schema; the updated fixtures and route tests pass. A mismatched-version response was not tested separately |

## How the verifier recomputes factual claims

For each card the verifier re-derives from the same tool results: every field (id, name, brand, price, list price, offer, stock, variants, specifications), and, new in 1.2, the `fit` codes, by re-running the ranking over the candidate products with the shopper's stated profile and comparing the result with the card exactly. Reply texts must be exactly the named fixed templates. Cart actions must match a tool proposal and always ask for confirmation.

## Compatibility and deploy order

- The Agent only sends `fit` to clients that ask for 1.2, so **the Agent can be deployed first** without affecting the website that is live today (it asks for 1.1 and validates strictly).
- The website then moves to 1.2 and renders the codes with its own fixed wording in English and Sinhala (no wording comes from the Agent).
- Rollback: the Agent's previous bundle and the website's previous image keep working with each other in both directions.

## Limits

The verifier recomputes `fit` with the same ranking function the engine uses, so it guards against transport and assembly errors and tampering, but it is not an independent second implementation of the ranking rules. The benchmark's own hallucination check (an independent re-derivation from the fixture numbers) covers that gap on the test catalogue. Version negotiation was tested over a local HTTP server with signed requests, not through the live website and tunnel.
