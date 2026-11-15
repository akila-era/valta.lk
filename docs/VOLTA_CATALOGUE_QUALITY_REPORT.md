# VOLTA.LK catalogue quality report

Date: 2026-11-14. Written for: the project owner (plain language first, engineering notes after).
Status: read-only analysis. Nothing was written to any system.

## 1. The most important statement: this is 7 products, not 7,000

The project owner's brief spoke of about 7,000 products. The catalogue read through the website relay on 2026-11-13 contains **exactly 7 products** (`count: 7` in the snapshot, 7 entries in `items[]`). Two explanations are possible and this report cannot tell which is true: the real catalogue is small today, or the ERP source of the 7,000 is a different store or database than the one the website relay reads. **Someone with ERP access must resolve this.**

Consequences, stated plainly:

- Every score below describes **only these 7 records**. Nothing is extrapolated to a larger catalogue.
- If a catalogue of thousands exists, it must be **re-audited with the same method** (rubric in section 3; the same field checks in section 4). Seven records are far too few to estimate how common each problem is.
- The 7 records look like test data (placeholder descriptions such as "fdgdsg", random SKUs such as "gvhgbvh", prices of 1,000 to 1,200 LKR for iPhones). It is possible the real 7,000 are held elsewhere.

Sources: snapshot `real-catalogue.json` (read 2026-11-13, 7 items, settings: LKR), and `docs/AI_REAL_CATALOGUE_AUDIT.md`. Website database counts (measured read-only earlier): ProductContent 57 rows, 56 with published specs but for ids not in the current catalogue, only 1 of the 7 products has a row and its specs are empty; AccessoryLink 0 rows; Promotion 0 rows.

## 2. Result in one table

| # | Name (as filed) | Brand | Category (as filed) | Score /100 | Band |
|---|---|---|---|---|---|
| 1 | 11 pro (id ...ffiza2) | Apple | apple | 23.5 | Not fit |
| 2 | 11 pro (id ...hprdjpb) | Apple | apple | 23.5 | Not fit |
| 3 | 12 prp | Apple | jhhj | 23.0 | Not fit |
| 4 | 13 | Apple | apple | 28.0 | Not fit |
| 5 | watch | Apple | Cables | 34.0 | Not fit |
| 6 | redmi | Xiaomi | Mobile Phones | 49.5 | Weak |
| 7 | watch2 | Samsung | watch | 44.0 | Weak |

Average of the 7: **32.2 / 100**. No product reaches "Usable" (60). The best product (redmi) scores 49.5 and is out of stock.

Bands: 80-100 Ready to sell and recommend; 60-79 Usable with gaps; 40-59 Weak; below 40 Not fit (the assistant cannot safely recommend or compare it).

### Score per category (category string as filed today)

| Category as filed | Products | Average score | Note |
|---|---|---|---|
| apple | 3 (#1, #2, #4) | 25.0 | a brand used as a category |
| jhhj | 1 (#3) | 23.0 | gibberish |
| Cables | 1 (#5) | 34.0 | contains a watch |
| Mobile Phones | 1 (#6) | 49.5 | only category that is a real kind of product and matches its product |
| watch | 1 (#7) | 44.0 | plausible kind, not a controlled value |

Each "category" has 1 to 3 products, so a category score is simply the average of very few records.

## 3. Scoring rubric (explicit, reproducible)

Each product gets up to 100 points over six dimensions. Scoring uses only the record itself; a missing value scores 0 and is never guessed.

| Dimension | Max | How points are given |
|---|---|---|
| Identity | 20 | Name (10): 10 = full real product name; 5 = recognisable but incomplete (e.g. "11 pro", "redmi"); 0 = typo, bare number or generic word ("13", "watch", "12 prp", "watch2"). Brand (5): 5 if present. Model (5): 5 specific model; 3 if only a product family or the brand repeated ("iPhone", "Xiaomi"); 0 empty |
| Classification | 20 | 20 = category names the right kind of product; 10 = right kind but non-standard wording; 5 = a brand used instead of a kind; 0 = wrong kind or gibberish |
| Price credibility | 15 | 15 = plausible and consistent; 8 = plausible but unverified; 0 = placeholder-looking (as judged in the real audit: 1,000 to 1,200 LKR) |
| Stock and variant integrity | 15 | 15 = consistent; 8 = anomaly (e.g. a larger storage priced below a smaller one); 0 = the record contradicts another record on the same variant key |
| Specifications | 20 | 20 x (category-relevant fields present / fields required for that kind). The kind is taken from category, else from the stated model field; if the data does not establish a kind, this scores 0. Required fields: phone 8 (RAM, storage, display, processor, camera, battery, connectivity, OS); smart watch 4 (display, battery, connectivity, phone compatibility) |
| Content | 10 | Meaningful description 4 (placeholder text scores 0); at least one image 3; warranty and condition recorded 3 |

### Worked scores

| # | Identity | Class. | Price | Stock/variants | Specs | Content | Total |
|---|---|---|---|---|---|---|---|
| 1 | 13 (name 5, brand 5, model 3) | 5 | 0 | 0 (conflicts with #2) | 2.5 (kind phone from model "iPhone"; storage 1 of 8) | 3 | 23.5 |
| 2 | 13 | 5 | 0 | 0 (conflicts with #1) | 2.5 | 3 | 23.5 |
| 3 | 5 (name 0, brand 5, model 0) | 0 | 0 | 15 | 0 (kind unknown) | 3 | 23.0 |
| 4 | 5 | 5 | 0 | 15 | 0 (kind unknown; nothing says phone) | 3 | 28.0 |
| 5 | 5 | 0 | 8 | 15 | 0 (category says Cables, name says watch: kind unknown) | 6 | 34.0 |
| 6 | 13 (name 5, brand 5, model 3) | 20 | 0 | 8 (256GB at 1,000 below 128GB at 2,000) | 2.5 (storage 1 of 8) | 6 | 49.5 |
| 7 | 5 | 10 | 8 | 15 | 0 (smart watch 0 of 4) | 6 | 44.0 |

Judgement calls, in the open: (a) "placeholder-looking price" is the real audit's judgement, not something measurable; (b) the watches' 17,000 and 12,500 LKR are scored "unverified", not "wrong"; (c) giving products 1 and 2 the phone profile relies on the staff-entered model "iPhone" and should be confirmed by a person; (d) the two out-of-stock products lose no points for being out of stock, stock level is a business state, not a data defect.

## 4. Field coverage across the 7 records (measured from the snapshot)

| Field | Present | Remark |
|---|---|---|
| Name, brand, SKU, price, availability, condition, warranty months | 7 of 7 | Present; see quality remarks |
| Brand split | Apple 5, Xiaomi 1, Samsung 1 | Reliable |
| Category | 7 of 7 present, 1 of 7 correct and clean | apple x3, jhhj, Cables, Mobile Phones, watch |
| Sub-category | 1 of 7 ("Lite" on redmi) | "Lite" is a product line, not a sub-category |
| Model | 3 of 7 | "iPhone" x2, "Xiaomi" |
| Variants | 4 of 7 products, 8 variants in total | all carry storage and colour and hex colour |
| Storage / colour | 4 of 7, variants only | no product-level value |
| RAM, camera, battery, processor, display, connectivity, OS | 0 of 7 | no field exists in the catalogue |
| Description | 4 of 7 present, 0 of 7 meaningful | "fdgdsg", "asdsa", "GFDGSDFG" |
| Images | 3 of 7 (#5, #6, #7) | |
| Sale price / active discount | 0 of 7 | |
| externalId | 0 of 7 (all null) | no link to a second source system |
| Warranty | 5 products 12 months, 2 watches 0 months | policy question: is 0 intended |
| Accessory compatibility | 0 AccessoryLink rows | |
| Website content (ProductContent) | 1 of 7 has a row, its specs empty | 56 other published-spec rows belong to ids no longer in the catalogue (orphans) |

## 5. Findings for the owner

1. **Size mismatch** (section 1) must be settled first.
2. **No product is ready**; the average is 32.2. The largest single loss is specifications (0 of 7 have any category-relevant spec beyond variant storage).
3. **Category is the least trustworthy field**: only 1 of 7 entries (Mobile Phones) is a clean, correct kind. A watch is filed under Cables. See `VOLTA_CATEGORY_NORMALIZATION_PROPOSAL.md`.
4. **A duplicate pair with conflicting data** ("11 pro" twice). See `VOLTA_DUPLICATE_VARIANT_AUDIT.md`.
5. **Specs have no home in use yet**: the website table exists but holds only orphan rows, and the real-data Agent path passes no website content at all (`apps/agent/tests/real/preview-agent.ts` passes an empty SiteData). Filling the table would not help the Agent until that is wired. See `VOLTA_PRODUCT_SPECIFICATION_SCHEMA.md`.

## 6. Limits

- Scores are a snapshot of 2026-11-13; the catalogue changes live.
- The rubric weights are a proposal; they should be agreed with the owner before being used for any decision or automated gate.
- The scoring was applied by hand to 7 records; if the method is automated for a larger catalogue, it must be tested on this 7-record set (expected outputs in section 3) and spot-checked by a person.

## 7. Automated re-check (added 2026-11-14)

A repeatable audit tool now exists (`apps/agent/src/catalogue-intel`, documented in `VOLTA_CATALOGUE_INTELLIGENCE_REPORT.md`). It does **not** reproduce the hand-scored 0 to 100 totals above: it reports separate dimensions and a verdict per product, because one combined number hides which part is broken. On the same 7 records it agrees with this report on the facts that can be measured (category correctness 1 of 7, the duplicate pair, the placeholder descriptions and SKUs, no specifications, 0 external ids, images on 3 of 7, warranty recorded on 7 of 7) and differs on judgement calls, listed in section 5 of the intelligence report. Differences that matter here: (a) the tool does not call "watch2" an unidentifying name (the hand scoring gave it 0 for name), and does not mark "11 pro" or "redmi" incomplete; (b) "placeholder-looking price" is flagged only where the kind of product is known (assumed price floors), so 3 of the 5 products priced 1,000 to 1,200 are flagged and the 2 whose kind is unknown ("12 prp", "13") are not; (c) five products, not six, are priced 1,000 to 1,200 (the 12,500 and 17,000 prices belong to the two watches).
