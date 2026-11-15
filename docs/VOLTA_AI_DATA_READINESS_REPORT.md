# Data readiness report

Date: 2026-11-14. Written for: the project owner. Evidence: the 2026-11-13 read-only audit (`AI_REAL_CATALOGUE_AUDIT.md`, `VOLTA_CATALOGUE_QUALITY_REPORT.md`). **The audited catalogue holds 7 products, not about 7,000** as the brief says; everything below describes those 7 and must be re-measured on a larger catalogue with the same method.

## 1. Minimum quality thresholds (proposed for the owner to confirm)

| # | Requirement for a feature to be switched on | Threshold | Today (7 products) | Status |
|---|---|---|---|---|
| D1 | Prices are real | 100% of in-stock products have a price the shop confirms | Five of seven are 1,000 to 1,200 (placeholder-looking; the other two are 12,500 and 17,000); not confirmed. (Corrected from "six" after the catalogue audit tool re-counted the snapshot.) | **Fail** |
| D2 | One record per product | 0 duplicate names with conflicting variants | "11 pro" twice, conflicting Blue variant | **Fail** |
| D3 | Category is right | At least 95% of products in a category that matches their kind | 1 of 7 (and that one is out of stock) | **Fail** |
| D4 | Names identify the product | At least 95% | "13", "12 prp", "watch" (an Apple watch filed under "Cables") | **Fail** |
| D5 | Stock is live | Live read per request | Yes, by design | **Pass** |
| D6 | Specifications for the numbers the AI ranks on (phones: camera, battery, RAM; laptops: processor, RAM, storage) | At least 70% of in-stock products in the category | 0% | **Fail** |
| D7 | Accessory compatibility | At least 80% of accessories linked to at least one device | 0 links | **Fail** |
| D8 | Descriptions are real text | At least 80% | 4 of 7 present, all placeholder | **Fail** |
| D9 | Warranty present | 100% | 7 of 7 | **Pass** |
| D10 | Staff content reaches the Agent | Automatic, within a minute | Built locally (relay + background refresh), **not deployed**; no current product has specs | **Open** |

## 2. What the assistant can and cannot honestly do on this data

| Capability | Supported now | Why |
|---|---|---|
| Greetings, thanks, general questions, "what do you sell" | Yes | No catalogue dependence |
| Find products by brand or name; show real price, warranty, storage variant, stock | **Technically yes**, but price and category trustworthiness fail D1 to D4: a shopper could be shown 1,000 for an iPhone | Data |
| Budget-matched lists | Mechanically correct; meaningless while prices are placeholders | D1 |
| Ranking by camera, battery, memory, processor | **No.** The assistant says "the product data does not list the details" and shows a "no details" trade-off | D6 |
| "Which charger fits my phone" | **No** (no links) | D7 |
| Comparison | Only on fields that exist (price, brand, warranty, stock); duplicates make it ask which product | D2 |

## 3. Recommendation

**Limited feature launch is the most the data supports**: conversation, general help, store information, and brand/name lookup with live stock, **and only after the prices are real**. Spec-based recommendation, budget advice and compatibility must stay off (or be described to customers as unavailable) until D1 to D8 pass. A "launch" of the full recommendation experience on this data would produce confident-looking answers about placeholder values.

## 4. What the shop owner needs to do (no code)

1. Replace placeholder prices and descriptions; remove the duplicate record; correct names ("iPhone 11 Pro").
2. Adopt the category tree in `VOLTA_CATEGORY_NORMALIZATION_PROPOSAL.md` (a human decision per product; nothing is changed automatically).
3. Enter specification rows per `VOLTA_PRODUCT_SPECIFICATION_SCHEMA.md`, publish them, and link accessories to devices.
4. Ask for a re-audit (the method is repeatable: the relay dump and the probe in `apps/agent/tests/bench/m6-real`).

## 5. Limits of this report

Seven records; one day; no write access; thresholds are proposals, not measured business rules; "placeholder-looking" is a judgement from the values, not a confirmation from the shop.
