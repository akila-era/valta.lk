# English tool selection: real-model evaluation record (Qwen3 1.7B Q4_K_M)

Run 2026-11-12 on the AI server with the real model (option B: one bundled file in `/tmp`, run with `/opt/node/current/bin/node`, deleted afterwards; no package, config, port or firewall change; Ollama cloud stayed disabled; 0 OOM events, swap unused).

- 100 developer-authored English prompts (`english-prompts.ts`), labels fixed before the first run, mock catalogue (invented brands). Product ids are supplied to the model as context, as the pipeline does.
- Scoring: PASS = right tool and the listed arguments; ALT = a pre-declared acceptable alternative (for "tell me about X", `search_products` is acceptable); FAIL otherwise.
- Same author for prompts, router and pipeline: this is **not an independent evaluation**, and says nothing about Sinhala (Qwen never sees Sinhala), real shoppers or the real catalogue.

## Results

| Mode | PASS | ALT | FAIL | Tool correct (PASS+ALT) | Args correct when right tool | Proposals the server would accept | Latency |
|---|---|---|---|---|---|---|---|
| **A. Qwen only** (the specified design, first run) | 52 | 10 | 38 | **65 / 100** | 57 / 63 | 90 / 100 | p50 about 8 s, p95 about 22 to 25 s (retries), first call 38 s (cold) |
| **B. Deterministic router only**, same prompts (no model; before the `add` cue fix: 78, after: 81) | n/a | n/a | n/a | **81 / 100** | n/a | built valid by construction | about 1 ms |
| **C. Router-first, Qwen only when the router abstains** (`englishMode: "router-first"`) | 84 | 2 | 14 | **89 / 100** (router answered 76, Qwen 24) | 65 / 68 | 94 / 100 | p50 about 1 ms, p95 about 13.7 s |

Per category, Qwen only (PASS / ALT / FAIL): search 13/0/6, details 0/8/2, compare 2/0/6, stock 8/0/2, accessories 4/0/4, cart 11/0/1, cart view 2/0/1, delivery charge 0/0/3, signed-in order 2/0/2, guest order 1/0/1, small talk 7/0/1, injection 2/2/4, missing information 0/0/5.

## What the results show

- Qwen3 1.7B is good at cart proposals (11/12) and named-product stock checks (8/10). It is weak at comparing products (2/8), delivery-charge questions (0/3), "what accessories fit X" (4/8), and at saying nothing when information is missing (0/5).
- It tends to **invent arguments**: `category: "electronics"`, `brand: "volta"`, `productId: "unknown"`, `limit: 100`. The server rejects or blocks these (strict schemas, id allow-list, and the category/brand vocabulary guard added after this run), so they never reach a tool, but the shopper would only see a clarification.
- For a "tell me about X" question it prefers `search_products` over `get_product_details` even when the product id is supplied (all 8 of those are counted as ALT).
- In every wrong case the proposal was either rejected by the server or was a read-only search or cart *proposal*. No tool that creates an order, takes payment, applies a discount or changes a price exists to be chosen.
- Prompt injection: the 8 English injection prompts are all stopped by the safety pre-filter before any router or model (8/8). Qwen alone, with no pre-filter, called a harmless-but-useless `search_products` on 4 of them and proposed `add_to_cart` for "pretend the Nova X1 costs 100 rupees...", which is why the pre-filter is mandatory and why a "pretend ... costs N" pattern was added.

## Decision for the owner

M1-B implements what was specified (Qwen chooses English tools, `englishMode: "qwen"`, the default). On this evidence **router-first (mode C) is clearly better** on accuracy and latency, keeps Qwen as the fallback, and does not change the safety model. It is implemented, tested and **off by default**; switching it on is a one-line wiring choice that needs the owner's approval.

Caveats: C's router was developed on Sinhala/Singlish/mixed sets and was run on these 100 English prompts untuned (78/100 on first run); the Qwen-only prompt and tool descriptions were not tuned after the run, so a better prompt could narrow the gap.
