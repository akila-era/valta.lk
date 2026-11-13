# Real catalogue audit

Date: 2026-11-14 (data read 2026-11-13 18:30 UTC). Written for: the project owner.

Status: **read-only.** The catalogue was read through the website's signed, read-only relay (`/api/internal/ai/erp/*`) from inside the website container, plus three read-only counts in the website database. Nothing was written, changed or deleted anywhere. The raw dump is kept outside the repository. Nothing below is invented: where a field is missing it is reported as missing.

## 1. What the shop's catalogue holds today

**7 products** (the ERP store API at `api.shop.hexalyte.com`, saved in the admin on 2026-11-13). Store settings: currency LKR, delivery charge 0.00, orders and reservations on, COD and online payment on.

| # | Name | Brand | Category (as filed) | Model | Price | Stock | Variants |
|---|---|---|---|---|---|---|---|
| 1 | 11 pro | Apple | apple | iPhone | 1,000.00 | in stock (14) | 128GB Black (14), 128GB Blue (7), both 1,000.00 |
| 2 | 11 pro | Apple | apple | iPhone | 1,000.00 | in stock (7) | 128GB Black (7) at 1,000.00; 128GB Blue at **2,000.00**, **out of stock** |
| 3 | 12 prp | Apple | jhhj | none | 1,200.00 | **out of stock** | none |
| 4 | 13 | Apple | apple | none | 1,000.00 | in stock (17) | 128GB Black (13), 128GB Gold (17) |
| 5 | watch | Apple | **Cables** | none | 17,000.00 | in stock (5) | none |
| 6 | redmi | Xiaomi | Mobile Phones (sub-category "Lite") | Xiaomi | 1,000.00 | **out of stock** | 256GB White, 128GB Black (both out) |
| 7 | watch2 | Samsung | watch | none | 12,500.00 | in stock (14) | none |

## 2. Field by field

| Field | Available | Verdict |
|---|---|---|
| Brand | 7 of 7 (Apple 5, Xiaomi 1, Samsung 1) | **Reliable** |
| Category | 7 of 7 present, but filed inconsistently: "apple" (3), "jhhj" (1, gibberish), "Cables" (a watch), "Mobile Phones" (1), "watch" (1) | **Unreliable.** Only one product (out of stock) is in a category that says "phone"; the iPhones are not |
| Price | 7 of 7 | Present, but six prices are 1,000 to 1,200: placeholder-looking values, including for iPhones. **Cannot be treated as real prices** |
| Sale price / discount | 0 of 7 active | Nothing to test |
| Stock availability | 7 of 7 (availability and purchasable quantity), live on each read | **Reliable as a field.** Two products are out of stock |
| Storage | 4 of 7, only inside variants (128GB, 256GB) | Partial; not a product-level field |
| Colour | 4 of 7, only inside variants | Partial |
| RAM | **0 of 7** | **Missing** |
| Camera specification | **0 of 7** | **Missing** |
| Battery capacity | **0 of 7** | **Missing** |
| Processor | **0 of 7** | **Missing** |
| Compatibility | **0 accessory links** in the website database; no compatibility field in the catalogue | **Missing** |
| Description | 4 of 7 present; all look like placeholder text ("fdgdsg", "asdsa", "GFDGSDFG"); none contains a number or a feature | **Unusable** as a source of specifications |
| Warranty | 7 of 7: 12 months for five, 0 for the two watches | Present, plausible |
| Condition | BRAND_NEW for all | Present |
| Images | 3 of 7 | Partial |
| Model | 3 of 7 ("iPhone" twice, "Xiaomi") | Partial |

Website content: the website database holds 57 product-content rows, 56 of them with published specification rows, but **only one of the seven current products has a row, and its specification list is empty**. The 56 rows belong to products that are no longer in the catalogue. There are **0 accessory links** and **0 promotions**.

## 3. Missing, conflicting and unreliable

- **Missing:** RAM, camera, battery, processor and compatibility for every product. Storage and colour exist only as variant labels.
- **Conflicting:** "11 pro" is listed **twice** with the same variant keys but different data (the Blue variant is 1,000 in stock in one record and 2,000 out of stock in the other; the list-level stock figure is the largest variant, not a total).
- **Unreliable:** categories (see above); the product named "13" has no "phone", "iPhone" or model word anywhere, so nothing marks it as a phone; "12 prp" is a typo; prices and descriptions look like test values.
- **Consequence:** the catalogue as it stands cannot support recommendations by camera, battery, memory or processor, and its category field cannot be trusted to find "phones". It can support brand, budget (if the prices were real), stock, warranty and storage-variant questions.

## 4. How the assistant behaves on this data (executed locally on a snapshot, no network)

The reasoning layer was run on a snapshot of exactly these 7 records, parsed with the Agent's strict wire schema. The probe found three real defects, **all fixed and covered by tests with invented products**:

1. "show me phones" said "no results" because the iPhones are filed under "apple". Now, when a category holds nothing in stock, the Agent looks for the same kind of product by name or model (never returning accessories). It finds the two "11 pro" records. The "13" and the out-of-stock "12 prp" remain unfound because nothing in their data says "phone": a data problem, not a code one.
2. "laptop for programming under 300000" showed iPhones and watches because the shop has no laptop category. Now a named kind with no category is searched by that word, and the answer is "no matching products".
3. "iphone ekak oni" was not understood. A word that is the model of catalogue products is now searched.

A fourth fix: "under 500" was ignored as a budget (a bare number below 1,000 was never read as a price), so over-budget products were shown without comment. A price word beside the number now makes it a budget.

Current behaviour on the snapshot (examples, all from the run): "phones under 50000" gives the two 11 pro with within-budget and warranty reasons; "I want a phone with a good camera" gives them with the trade-off "no camera details listed" and a reply saying the product data does not allow ranking for that; "Samsung hodaida?" gives the Samsung watch with brand-advice wording; "a phone for under 500" gives close alternatives marked above budget; "laptop for office work" and "do you have a charger" say there are none; "compare 11 pro and 13" asks which products, because "11 pro" is ambiguous. Every price on every card equals the catalogue value.

## 5. Recommendations (for you to decide)

1. **Fix the data before judging the assistant.** Real prices, one record per product, consistent categories (a "Phones" category), real names ("iPhone 11 Pro"), and a model or description that says what each item is.
2. **Decide where specifications live.** Either staff enter specification rows in the website content (the Agent can read them once the website passes them through the relay: **not built**), or the ERP gains specification fields. Until then usage-based ranking will correctly say it cannot rank.
3. Enter **accessory links** if you want "what fits this phone" answers.
4. Re-run this audit after the data is cleaned; the probe tool is `apps/agent/tests/bench/m6-real/probe.test.ts` (needs a snapshot path, evaluation only).

## 6. Limits of this audit

Seven records are too few to judge field coverage statistically; this is a statement about the catalogue on that day. The website's content specs were not wired into the Agent on the real path (the real-data Agent has no website content at all), which is a separate gap from the empty data.
