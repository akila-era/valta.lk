# VOLTA.LK category normalisation proposal

Date: 2026-11-14. Written for: the project owner, then engineers.
Status: proposal only. **Nothing is reclassified by this document**, and nothing may be reclassified automatically on a weak assumption. Every row marked "human decision" needs a person's answer first.

## 1. What exists today (measured)

The 7-product snapshot (2026-11-13) uses these category strings: `apple` (3 products), `jhhj` (1), `Cables` (1), `Mobile Phones` (1, with sub-category `Lite`), `watch` (1). The strings are free text coming from the ERP. The Agent turns them into slugs without any controlled list (`slugify` in `apps/agent/src/backend/catalogue.ts`), so every spelling becomes its own category. The audit showed what that costs: "show me phones" found nothing because the iPhones are filed under "apple".

If a larger catalogue exists (the brief said about 7,000), its categories are unknown. This proposal is built to be filled in from that catalogue after an audit; the mapping table below covers only the 5 strings that exist in the 7 records.

## 2. Design principles

1. **A category names a kind of product, never a brand, a model line or a store promotion.** "apple" and "Lite" are not categories.
2. **One primary category per product** (a leaf node). Extra search words (gaming, 5G) are tags, not categories.
3. **Controlled list.** Categories are nodes with a stable id and slug; staff pick from the list instead of typing free text.
4. **Each leaf carries a specification profile** (see `VOLTA_PRODUCT_SPECIFICATION_SCHEMA.md`), so a phone asks for RAM and a cable does not.
5. **Adding a category is data, not code.** A new node needs a name, slug, parent and profile only.
6. **Never move a product on a guess.** A mapping is proposed with a confidence level; only "exact" mappings may be applied without review, and only after the owner approves the tree.
7. **Keep the original string.** Whatever is applied, the original category text is kept (alias or history) so the change can be reversed.

## 3. Proposed tree (two levels, extensible to three)

Slugs are lowercase with hyphens. Level 2 are the selling categories; level 3 may be added later without changing level 2.

| Level 1 | Level 2 (leaf, gets a spec profile) | Notes |
|---|---|---|
| Phones and tablets | Mobile Phones (`mobile-phones`) | feature phones and smartphones: phone profile |
| | Tablets (`tablets`) | tablet profile |
| | Smart Watches (`smart-watches`) | watch profile |
| Computers | Laptops (`laptops`) | laptop profile |
| | Computer Accessories (`computer-accessories`) | mice, keyboards, hubs, stands, storage devices: accessory profile, with level 3 later (Keyboards, Mice, Storage) |
| Power and charging | Chargers (`chargers`) | wall chargers, car chargers, wireless chargers |
| | Power Banks (`power-banks`) | |
| | Cables (`cables`) | USB, Lightning, HDMI, adapters |
| Audio | Audio Devices (`audio-devices`) | earbuds, headphones, speakers; level 3 later (Earbuds, Headphones, Speakers) |
| Protection and accessories | Phone Accessories (`phone-accessories`) | back covers, screen protectors (matches the existing `AccessoryKind` list in the website schema) |
| Other | Uncategorised (`uncategorised`) | holding node for records no one has yet placed; never shown as a customer category |

"Other existing categories": no other strings exist in the 7-record snapshot. The website's `AccessoryKind` enum already names accessory kinds (back cover and others); the `Phone Accessories` node should be aligned with that enum by an engineer reading `apps/web/prisma/schema.prisma` before the tree is final.

## 4. Mapping from today's strings

Confidence: **Exact** = the string already means the proposed node. **Candidate** = a plausible node but evidence is weak. **None** = cannot be mapped.

| Today (as filed) | Products | Proposed node | Confidence | Evidence | Rule |
|---|---|---|---|---|---|
| `Mobile Phones` | #6 redmi (Xiaomi) | Mobile Phones | Exact | the string is the node name; brand Xiaomi, model "Xiaomi", variants carry storage | May be applied once the tree is approved |
| `watch` | #7 watch2 (Samsung) | Smart Watches | Candidate | the word says watch; brand Samsung; no specification, no description; "watch" could also mean a non-smart watch | Human decision |
| `Cables` | #5 watch (Apple) | Smart Watches or Cables | **Conflict** | the category says cable, the product name says watch, price 17,000 LKR is not a cable-like value, has an image | Human decision; do not apply either |
| `apple` | #1 and #2 "11 pro", #4 "13" | Mobile Phones (candidate) | Candidate for #1 and #2 (model field says "iPhone"); **None** for #4 (nothing in the record says phone) | `apple` is a brand, not a kind | Human decision per product; the brand must move to the brand field, which already holds Apple |
| `jhhj` | #3 "12 prp" | Uncategorised | None | gibberish, no model, no description | Human decision |
| sub-category `Lite` | #6 | no node | None | a product line, not a kind of product | Keep as a product-line attribute; human decision whether to drop it |

Summary: **1 of 7 can be mapped as exact. 6 of 7 need a human decision**, of which 1 (#5) is an outright conflict and 3 (#3, #4 and arguably #7) have too little evidence for any proposal beyond "Uncategorised".

Check by code (2026-11-14): the audit tool (`apps/agent/src/catalogue-intel/categories.ts`) encodes the tree and these rules. Run on the 7 records it reproduces this table exactly: 1 exact (`Mobile Phones`), 3 brand-as-category (`apple`; two with the candidate Mobile Phones from the model "iPhone", one with no candidate), 1 junk (`jhhj`, candidate Uncategorised), 1 conflict (`Cables` on a watch, candidate Smart Watches) and 1 weak candidate (`watch`, Smart Watches). Every row stays a human decision.

## 5. Decisions needed from a human

| # | Decision | Who | Options |
|---|---|---|---|
| C1 | Approve the tree (or amend it) | owner | accept / change level 2 names |
| C2 | Where is the controlled category list kept: in the ERP, or as a website alias table that maps ERP strings to nodes | owner and ERP owner | ERP-side change (cleanest, needs ERP access) or website alias (reversible, no ERP change) |
| C3 | #1, #2: are the "11 pro" records iPhones, and which single record is real (see duplicate audit) | catalogue staff | confirm Mobile Phones |
| C4 | #4 "13" and #3 "12 prp": what are they | catalogue staff | name them, then place |
| C5 | #5 filed under Cables but named "watch" | catalogue staff | Smart Watches, or a cable accessory with a wrong name |
| C6 | #7 "watch2": smart or ordinary watch | catalogue staff | Smart Watches or a new "Watches" node |
| C7 | Whether to keep sub-category "Lite" | owner | drop, or convert to a product-line attribute |
| C8 | Are there categories outside these 7 records (the 7,000 question) | owner | provide the real category list, then extend section 4 |

## 6. How to apply, when approved (not done here)

1. Export the current category (and sub-category) of every product to a file; this is the rollback source.
2. Create the tree.
3. Apply only the **Exact** mappings. Each applied mapping keeps the original string.
4. Put every Candidate and Conflict on a review list for staff, with the evidence column from section 4. Staff choose; nothing is applied silently.
5. After each batch, re-run the same audit and check no product lost a customer-visible category it had.

Rollback: restore the original strings from the export of step 1 (or remove the alias rows if the website alias option C2 is used). Because the original string is kept, no information is lost.

## 7. Effect on the Agent

Today the Agent finds a kind of product first by category and falls back to name or model words (fix described in the real audit). A clean category makes that fallback rarely needed; it does not replace it. The Agent code should keep treating an unknown or empty category as "unclassified", not as a failure.
