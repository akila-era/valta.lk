# VOLTA.LK duplicate, variant and identifier audit

Date: 2026-11-14. Written for: the project owner, then engineers.
Status: read-only analysis of the 7-record snapshot (read 2026-11-13). Nothing was changed. Scope note: the catalogue held 7 products, not about 7,000; findings below are exactly what these 7 records show and must be re-run on a larger catalogue if one exists.

## 1. Summary

| Finding | Count | Severity |
|---|---|---|
| Duplicate product pair ("11 pro" x2) with conflicting data | 1 pair (2 of 7 products) | High |
| Variant keys and variant SKUs shared by two products | 2 variant keys, 2 variant SKUs (same pair) | High |
| Variant price/stock conflict across the pair | 2 variants (Black: stock 14 vs 7; Blue: price 1,000 vs 2,000 and stock 7 vs 0) | High |
| Variant price anomaly inside one product | 1 (redmi) | Medium |
| Identifier hygiene: placeholder-like SKUs, auto-suffixed SKU, SKU formats mixed | several, see section 4 | Medium |
| Name-level near-duplicates other than "11 pro" | 0 found (names "11 pro", "12 prp", "13", "watch", "redmi", "watch2" are distinct strings) | none |

Names alone can mislead: "12 prp" is probably a typo of "12 pro" but nothing in the data says so, and "watch" (Apple) and "watch2" (Samsung) are different brands. These are not treated as duplicates.

## 2. Duplicate pair: "11 pro"

| Attribute | Record A (id cmvtrhoym000t3rylzwffiza2) | Record B (id cmvtrinc1000z3rylihprdjpb) |
|---|---|---|
| Name, brand, category, model | 11 pro, Apple, apple, iPhone | identical |
| Description | "fdgdsg" | "fdgdsg" |
| Product SKU | 4535435 | 4535435-BRK9ILOZ |
| publishedAt | 2026-10-29T16:32:39.553Z | 2026-10-29T16:33:23.177Z (44 seconds later) |
| updatedAt | 2026-10-31T11:30:22.556Z (edited later) | 2026-10-29T16:33:23.178Z (never edited after creation) |
| Variant `wnor8ze` (128GB Black, SKU 546456) | 1,000.00, in stock, 14 | 1,000.00, in stock, 7 |
| Variant `0dt8avy` (128GB Blue, SKU 577567) | 1,000.00, in stock, 7 | **2,000.00, out of stock, 0** |
| Product-level price, stock | 1,000.00, in stock, 14 | 1,000.00, in stock, 7 |

Evidence reading (facts, then inference):

- Fact: both records have the same two variant keys and the same two variant SKUs. A variant SKU should identify one sellable item; here each is claimed by two products.
- Fact: Record B's SKU is Record A's SKU plus a suffix, and it was created 44 seconds after A. This pattern is what a "copy product" action would produce. **Inference, not proven**: B is a copy of A. Whether the ERP generates such suffixes is not in the evidence.
- Fact: stock figures differ for the same variant (Black: 14 vs 7; Blue: 7 vs 0) and the Blue price differs (1,000 vs 2,000).
- Fact: the list-level stock shown for each product is the largest variant, not the total (14 and 7), as the real audit noted.
- Not known: which record, if either, holds the true stock and price. Only a person with physical or ERP stock knowledge can say. Record A being edited later is a hint, not an answer.

Effect: a customer or the Agent searching "11 pro" gets two cards; "compare 11 pro and 13" must ask which record, because the name is ambiguous.

## 3. Variant conflicts inside single products

| Product | Evidence | Issue |
|---|---|---|
| #6 redmi (id cmvts2yex00313rylxnwwe21k) | variant 256GB White 1,000.00 out of stock; variant 128GB Black 2,000.00 out of stock | the larger storage is half the price of the smaller; possibly swapped values or test data; both variants out of stock |
| #4 "13" | 128GB Black 13 units, 128GB Gold 17 units, both 1,000.00 | consistent; no issue |
| #1, #2 | see section 2 | conflict is between records, not inside one |

Consistent facts worth keeping: storage text always uses the form "128GB" and colour hex codes are consistent for the same colour name (Black `#1a1a1a` in four products). These are good candidates for the canonical format.

## 4. Identifier inconsistencies

| Observation | Evidence | Why it matters |
|---|---|---|
| `externalId` is null for all 7 products | all items | nothing links these records to another system, so duplicates cannot be reconciled by an external key |
| Product SKUs mix formats | numeric (4535435, 5646546, 5646562, 5646563), random letters ("gvhgbvh"), upper-case letters ("DFGDF"), suffixed ("4535435-BRK9ILOZ") | no single rule; letter-only SKUs look like test entries |
| Variant SKUs mix formats | numeric (546456, 577567, 435345346, 453455, 45565) and letters ("DFGSDF") | same |
| Variant SKUs repeated | 546456 and 577567 each appear in two products (#1 and #2) | breaks "one SKU, one item" |
| Variant keys repeated | `wnor8ze` and `0dt8avy` in two products | a key is only unique within a product in the data model seen; duplicated here by the copy |
| Product names do not carry a model | "13", "watch", "12 prp", "watch2" | cannot detect duplicates or typos by name |
| Model field repeats the brand | #6 model "Xiaomi", brand "Xiaomi" | model carries no information |
| Image paths refer to another product folder | #5 and #7 images are stored under `uploads/products/cmptrpjta0021s83ahm0qu2qd/`, which is not the id of either product; #6 image is stored without a product folder | suggests images were uploaded for, or copied from, another item; cannot be verified from this data |
| Same-brand SKU runs | 5646562 (#5 watch) and 5646563 (#7 watch2) are consecutive although brands differ (Apple, Samsung) | not an error; noted because sequential SKUs hint at how the data was typed in |

No two distinct products share a product-level SKU, and all 7 product ids are unique.

## 5. Proposed safe resolution rules (proposals; nothing applied)

1. **Never merge or delete automatically.** A duplicate is only ever reported.
2. **Detection** flags two products as a possible duplicate when at least one holds: same normalised name and brand; same variant key set with same variant SKUs; product SKU of one equals the other plus a suffix. Flag strength: all three present = strong (the "11 pro" pair); one only = weak.
3. **Strong duplicates** go to a human review list with the comparison table of section 2. The human picks the surviving record, or marks both as intentionally separate.
4. **The survivor decision rests on stock and price truth**, not on which record is newer. Staff check real stock first.
5. **Before any change to a duplicate pair**: export both records (ERP read-only snapshot or the website relay output). The changes themselves happen in the ERP, which owns products, price and stock; the website must not edit them.
6. **Retiring a duplicate** means hiding or unpublishing it, not deleting, so orders or reservations referring to its id remain valid. Check for orders or reservations on both ids first (not checked here: no access to orders in this task).
7. **Variant SKUs must be unique across the catalogue**: validate on entry; reject a copy that keeps the source's variant SKUs.
8. **Weak flags** (for example name collisions) never change data; they only appear in the review list.
9. **Price anomalies** (larger storage cheaper) are flagged for a person, never auto-corrected.
10. **SKU format**: pick one format by owner decision and validate new entries; do not rewrite existing SKUs, because other systems may refer to them.

Rollback for any approved change: the pre-change export of both records, plus the fact that retiring is hide-only; reversing is to re-show the record. Prices and stock are restored in the ERP from the export values.

## 6. Approvals needed

| # | Approval | From |
|---|---|---|
| D1 | Which "11 pro" record is real, or whether both are meant to exist, and the true price and stock of the Blue variant | catalogue staff with stock knowledge |
| D2 | Permission to hide (not delete) the duplicate once D1 is answered; check orders and reservations on both ids first | owner |
| D3 | The redmi 256GB at 1,000 and 128GB at 2,000: correct or swapped | catalogue staff |
| D4 | Whether "12 prp" is a typo of an iPhone 12 Pro and what "13" and the two watches really are | catalogue staff |
| D5 | The chosen SKU format and uniqueness rule | owner and ERP owner |
| D6 | Whether 7 products is the whole catalogue (the brief said about 7,000). If more exist, this audit must be repeated | owner |

## 7. Limits

- Based on 7 records; the share of duplicates in a bigger catalogue is unknown and must not be estimated from 1 pair in 7.
- Orders, reservations and the ERP's own history were not examined, so who relies on each duplicate record is unknown.
- The "copy product" explanation in section 2 is inference from timestamps and the SKU suffix.

## 6. Automated re-check (added 2026-11-14)

The detection rules of section 5 now exist as code (`apps/agent/src/catalogue-intel`, see `VOLTA_CATALOGUE_INTELLIGENCE_REPORT.md`). Run on the 7-record snapshot it reports exactly: 1 strong duplicate pair (all three signals), 2 variant conflicts (the Black stock difference and the Blue price and stock difference), 2 shared variant SKUs, 1 variant price inversion (redmi), 2 placeholder-like product SKUs, and no near-duplicate among the other five names. The summary row of section 1 originally counted one variant conflict; the section 2 table already showed two, and the table above was corrected to match.
