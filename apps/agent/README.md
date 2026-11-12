# @valta/agent: VOLTA.LK AI Agent API (M1, mock only)

**Status: M1-B (routing and tool selection).** Not deployed, not connected to anything. Registered as an npm workspace in the root.
See `docs/AI_M1_PLAN.md`, `docs/AI_AGENT_ARCHITECTURE.md` and `docs/AI_M0_DECISION_RECORD.md`.

## What exists

| Area | Where | Notes |
|---|---|---|
| Contract (Zod) | `src/contract/schemas.ts` | Every Sinhala/Singlish/mixed response **must** carry `needsNativeReview: true` or it fails validation |
| Config, auth, HTTP/SSE server | `src/config.ts`, `src/auth/`, `src/http/` | M1-A foundation; off by default, loopback only, HMAC-signed requests |
| Ollama, scheduler, session | `src/ollama/`, `src/queue/`, `src/session/` | Two allow-listed models, one slot, in-memory sessions |
| **Safety pre-filter** | `src/router/safety.ts`, `lexicon/safety.ts` | Runs before any model or tool, in every language: injection, price manipulation, data exfiltration, shared secrets (Luhn card numbers, OTP, passwords, NIC) |
| **Sinhala routing (deterministic)** | `src/router/` | Normaliser, script/Singlish detection, amount parser, provisional lexicon, entity extraction against the catalogue vocabulary, weighted intent scoring that **abstains and asks** below a score/margin limit |
| **Tool definitions** | `src/tools/definitions.ts` | Ten strict tools with a permission matrix; no tool creates an order, takes payment, applies a discount or changes a price |
| **English path** | `src/pipeline/english-planner.ts` | Qwen3 only chooses tools; its free text is never shown; one retry; ids, categories and brands are checked against the catalogue |
| **SinhalaLLM polisher** | `src/pipeline/polisher.ts` | Optional, off by default, rewords only fact-free templates, output accepted only if it adds nothing new |
| **Pipeline** | `src/pipeline/routing-pipeline.ts` | Safety, then routing, then validated tool run, then a **fixed template** reply (no model-written facts) |

## Rules that hold in every mode

- Sinhala, Singlish and mixed text is routed by the deterministic router and **never reaches Qwen**.
- SinhalaLLM never chooses a tool and never sees data. All replies are fixed templates (or a guarded rewording of one).
- Facts (prices, stock, specifications, warranty, delivery charge) come only from backend tool results. Cards are built from them in M1-C.
- Every Sinhala string and lexicon entry is provisional and tagged `needsNativeReview`; `isSinhalaProductionReady()` is false.
- Mock ERP data only. No retention or consent collection. Customer text is never logged.

## Commands

```bash
npm test -w @valta/agent            # vitest, uses a fake Ollama; no network, no server
npm run typecheck -w @valta/agent   # tsc --noEmit
```

## Evaluation records (developer-authored, in-sample, NOT evidence of Sinhala readiness)

- `tests/eval/FIRST_RUN_RECORD.md`: Sinhala routing first-run numbers before tuning (SET_B 98 %, SET_A 98 %, SET_C 63 %).
- `tests/eval/ENGLISH_EVAL_RECORD.md`: real-Qwen tool selection on 100 English prompts (Qwen only 65/100, router only 81/100, router-first 89/100).

## Real-model runs (not part of `npm test`)

`tests/real/*.ts` are bundled into one file with the repo's `esbuild`, copied to `/tmp` on the AI server, run with `/opt/node/current/bin/node`, then deleted. Nothing is installed or configured on the server.

## M1-C: mock backend (mock data only)

- **ERP wire contract** (read-only, GET only, loopback-only transport `src/backend/transport.ts`): `{success,data}` envelope, `Authorization: Bearer hxs_<id>.<secret>`, decimal-string money converted to integer cents (`src/backend/wire.ts`), `/catalogue/products` (cursor paging), `/catalogue/products/{id}`, `/settings` (`deliveryCharge`, `ordersEnabled`), `/orders/{ref}`. A contract test runs it against the repo's real mock ERP server (`apps/web/tests/mock-erp/server.ts`).
- **Website-owned mock data** (`src/mock/site-data.ts`): accessory links, promotions, content specs, customer-to-order links. Order lookups require a signed customer identity and ownership; guests get a `/track-order` hand-off and the ERP is not asked.
- **In-memory fixture** (`src/mock/erp-fixture.ts`, `src/mock/stack.ts`) serves the same wire format with controls for price, stock, outage and hostile text. `src/main.ts` never imports `src/mock` (enforced by a test).
- **Cart** tools only produce browser-side `ClientAction` proposals, always `confirm: "ask"` (forced in the pipeline). No checkout, order creation, payment or discount execution exists.
- **Facts** appear only in cards built from tool results; replies are fixed, digit-free templates; Sinhala/mixed output keeps `needsNativeReview`.
- `AGENT_ENGLISH_MODE=router-first` (default) or `qwen` (evaluation); the safety pre-filter runs in both.
