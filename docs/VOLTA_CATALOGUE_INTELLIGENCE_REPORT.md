# Catalogue intelligence: a repeatable audit tool

Date: 2026-11-14. Written for: the project owner, then the engineers who will run it. Wave 1, Catalogue Intelligence Agent, of `VOLTA_MASTER_AUDIT_AND_EXECUTION_PLAN.md`.

**Labels:** the tool is *Implemented* and *Tested locally* (86 tests, plus a run on the 7-product snapshot). It is *not integrated* into the Agent, *not run on any real full catalogue*, and nothing in it writes to a catalogue. Production verified: none. Pending approval: reading a full catalogue export; any correction it proposes.

## 1. The most important limit

The only real data audited is the 7-product snapshot of 2026-11-13. **Seven products are not a catalogue**: every statistic below describes those 7 records, and the brief's "about 7,000 products" is still unverified (the snapshot says `count: 7`; whether a larger catalogue exists somewhere else needs someone with ERP access). The tool was built and tested so that it runs unchanged on a full export; the measurements that matter (outliers, category shares, duplicates at scale) only become meaningful then.

## 2. What it is

A pure function `runAudit(input, options)` over a product snapshot, plus a command-line wrapper. It **reads** data and **returns** findings, per-product readiness, per-category statistics, recommendation gates and a human-readable report. It never writes to any catalogue, never contacts a server, never deletes or overwrites a file, and is deterministic (same input and options, same report).

| Part | File (apps/agent) |
|---|---|
| Input reading: tolerant, never throws; finds the product list in the shapes the relay and the ERP produce; flags records the Agent's strict listing schema would refuse | `src/catalogue-intel/input.ts` |
| Category tree and inference (the proposal's tree; evidence from name, model and sub-category only) | `categories.ts` |
| Specification profiles (the schema document, section 4) | `profiles.ts` |
| Checks: identity, duplicates, category, price, content, specifications, stock, accessories | `checks-*.ts` |
| Readiness dimensions, category statistics, feature gates | `readiness.ts` |
| Orchestrator and Markdown report | `audit.ts`, `render.ts` |
| Command line | `scripts/catalogue-audit.ts` |

## 3. The checks (stable codes; each finding has evidence and a PROPOSAL, never an applied fix)

| Area | Codes | What it looks at |
|---|---|---|
| Input and Agent compatibility | `input.record_invalid`, `input.duplicate_id`, `agent.wire_rejected`, `agent.not_cardable` | Unreadable records; repeated ids; a record the Agent's strict schema refuses (a price like "1,000.00", a missing `updatedAt`); an id or link the card contract refuses. **Why it matters:** the Agent's transport throws for the whole page of products when one record fails the schema, so one bad price can hide a page of the catalogue from the assistant |
| Identity | `name.empty`, `name.generic`, `name.typo_suspect`, `name.too_long`, `brand.missing`, `model.repeats_brand`, `sku.missing`, `sku.placeholder`, `sku.duplicate`, `variant.key_duplicate_in_product`, `variant.invalid`, `identity.no_external_id`, `text.hidden_characters` | Names that identify nothing (bare numbers, a kind of product), a word one letter from a model word ("prp"), random-looking SKUs, repeated SKUs, invisible characters |
| Duplicates | `dup.strong`, `dup.likely`, `dup.weak`, `dup.variant_conflict`, `sku.shared_variant_sku` | Three signals (same normalised name and brand; same variant keys and SKUs; a SKU that is another's plus a suffix): 3 = strong, 2 = likely, 1 = weak; near-identical names; spelling noise ("ayfon"); Sinhala names compared as written; conflicting price or stock for the same variant across two records. Compared inside small blocks so thousands of products stay fast; oversize blocks are skipped and reported |
| Category | `category.conflict`, `category.junk`, `category.brand_as_category`, `category.missing`, `category.not_in_tree`, `category.unmappable`, `category.subcategory_singleton` | The filed category against the proposed tree. Only a filed string that already names a node is "exact"; everything else is a candidate, a conflict or unmappable, always with a human decision |
| Price | `price.format`, `price.nonpositive`, `price.placeholder`, `price.below_plausible_floor`, `price.sale_not_lower`, `price.sale_nonpositive`, `price.variant_inversion`, `price.product_vs_variants`, `price.outlier` | Unreadable or badly formatted prices, zero or negative, typical placeholder values, a price under an **assumed** floor for its kind, a larger storage cheaper than a smaller one, and outliers by median/MAD on log-prices **only with at least 8 priced products in the group** (below that the check is skipped and reported as skipped) |
| Content | `desc.empty`, `desc.placeholder`, `desc.too_short`, `desc.same_as_name`, `desc.injection_like`, `desc.very_long`, `content.no_image`, `content.image_unusable`, `content.image_folder_mismatch`, `content.no_warranty`, `content.no_condition` | Placeholder or random text (Latin only: Sinhala and Tamil text is never called random typing), instruction-like text aimed at an AI system (flagged, never obeyed), images stored under another product's folder |
| Specifications | `spec.missing_required`, `spec.profile_unknown`, `spec.agent_unparseable`, `spec.value_out_of_range`, `spec.label_noncanonical`, `spec.value_placeholder`, `spec.from_description_only`, `spec.orphan_rows` | Coverage against the kind's required fields; a spec the Agent could not read (a number with no unit, so shoppers would be told "no details"); implausible numbers; numbers that exist only in the description; unknown kind is reported as **unknown, not zero** |
| Stock | `stock.inconsistent`, `stock.invalid_quantity`, `stock.product_variant_mismatch`, `stock.list_vs_variants`, `stock.at_erp_cap`, `stock.unknown_availability` | Quantity that contradicts availability, product against variants, the ERP's cap of 20 |
| Accessories | `acc.no_links_at_all`, `acc.no_link`, `acc.link_dangling`, `acc.link_self` | Only when the website's links are supplied; otherwise reported as "cannot be judged" |

Assumption-based findings (`price.placeholder`, `price.below_plausible_floor`) carry `assumption: true` and are marked in the report. The floors (for example 5,000 LKR for a phone) are **assumptions the owner can tune** (`options.priceFloors`); they are never presented as market facts, and they are not applied to another currency.

## 4. Readiness: separate dimensions, no blended score

Every product gets six **separate** dimensions (identity, classification, price, stock, specifications, content), each the share of its own listed checks that pass (so any number can be traced), and a verdict:

- **ready**: positive evidence on every dimension: a controlled category, a real description, measured specification coverage at or above the threshold, and no finding of medium or higher severity;
- **limited**: not blocked but not proven (for example specifications were not supplied, or the category is outside the tree);
- **not ready**: a blocking finding (the list is fixed and tested: unreadable or refused record, no or generic name, strong duplicate or variant conflict, category conflict or junk, unreadable, non-positive or placeholder or implausibly low price).

There is no overall score, grade or accuracy figure anywhere in the output (a test asserts the structure). This is deliberate: one number would hide which part is broken and could be mistaken for a model metric.

**Gates.** `recommendationGate(stats, shop, thresholds)` says which Agent features should be OFF for a category until its data passes the thresholds of `VOLTA_AI_DATA_READINESS_REPORT.md` (specification coverage 70%, prices 95% clean, category 95%, names 95%, accessory links 80%): specification-based advice, budget advice, comparison, accessory suggestions. It fails closed: a missing measurement (no specification content supplied, no links supplied, no in-stock products, one product only) means "off, not demonstrated", with the reason. **It is not wired into the Agent**; it informs the owner's decision.

## 5. Results on the 7-product snapshot (aggregate only; run from the scratchpad, the snapshot is not in the repository)

| Measure | Result |
|---|---|
| Findings | 6 high, 14 medium, 16 low, 7 info |
| Product verdicts | 0 ready, 1 limited, 6 not ready |
| Dimensions (products fully passing every check of the dimension) | identity 2 of 7; classification 1 of 7; price 4 of 7; stock 5 of 7; specifications 0 of 5 measurable; content 0 of 7 |
| Strong duplicate pairs | 1 (all three signals), with 2 conflicting variants and 2 shared variant SKUs |
| Category status | 1 exact; 3 brand used as category; 1 junk text; 1 conflict (a watch under Cables); 1 weak candidate |
| Names | 2 identify nothing; 1 probable typo |
| Prices | 3 under the assumed floor of their kind (all phones); 1 larger-storage-cheaper variant; outlier statistics skipped (every group under 8 products) |
| Descriptions | 3 empty, 4 placeholder, 0 real |
| Specifications | 5 products have a known kind and miss required fields; 2 have an unknown kind (coverage not computed) |
| Gates | every feature off in every category (and "comparison" off even where nothing else failed, because one product cannot be compared) |
| Checks that could not run | outlier statistics (sample too small); specification coverage and accessory links (content and links not supplied: the audit had no website data) |

### Comparison with the existing hand audit

| Existing statement | Tool | Verdict |
|---|---|---|
| Category: 1 of 7 correct | 1 exact | Agrees |
| Mapping table (1 exact, 6 human decisions; #5 a conflict; #4 nothing to propose) | Reproduces every row | Agrees |
| "11 pro" duplicate pair, shared variant keys and SKUs, conflicting variants | 1 strong pair, 2 shared SKUs, 2 variant conflicts | Agrees; the duplicate audit's summary row said "1 variant (Blue)" while its own table showed two, corrected there |
| Redmi: larger storage cheaper | 1 inversion | Agrees |
| Placeholder SKUs, "fdgdsg" descriptions, no images on 4, no `externalId` on any, images under another product's folder, `Lite` sub-category | All reproduced | Agrees |
| No specifications at all | 0 of 5 measurable pass; 2 unknown kinds | Agrees, with the extra point that unknown kind is not the same as zero |
| **"Six of seven prices are 1,000 to 1,200"** (`VOLTA_AI_DATA_READINESS_REPORT.md` D1; `AI_REAL_CATALOGUE_AUDIT.md`) | **Five** products are priced 1,000 to 1,200 (the 12,500 and 17,000 belong to the two watches) | **The existing statement is wrong**; those two documents are outside this task's ownership and need a one-word correction |
| Price "placeholder-looking" for the iPhones | Flagged for 3 products whose kind is known; the two whose kind is unknown ("12 prp", "13") are not flagged | The hand audit judged all five; the tool refuses to apply a kind-specific floor to a product of unknown kind. Both are consistent with "confirm the prices with the shop" |
| `watch2` name scores 0, `11 pro` and `redmi` "incomplete" | Not flagged: only `13` and `watch` identify nothing | A real difference of judgement: the tool flags only names with no product information at all |
| Total scores 23 to 50 out of 100, average 32.2 | No total | Intentionally different (section 4); the verdicts (6 not ready, 1 limited) point the same way |

## 6. How to run it (no server access needed)

The owner or an engineer provides **a file**: a JSON export of the catalogue (an array of products, or `{items}` or `{data:{items}}`, the shape the website relay and the ERP already return). The tool has no network code. Optional second and third files: the website's published specification rows (`{items:[{id, specs:[{name,value,unit}]}]}`, the relay's `/content` output) and the accessory links (`[{sourceItemId, accessoryItemId, kind}]`). Without them the report says specification coverage and accessory links are **not demonstrated**.

```
cd apps/agent
npx esbuild scripts/catalogue-audit.ts --bundle --platform=node --format=esm --target=node24 --outfile=catalogue-audit.mjs
node catalogue-audit.mjs export.json --content rows.json --links links.json --out report-dir
```

Options: `--format json|md|both`, `--min-sample N` (outlier sample size, 3 to 10,000, default 8), `--currency LKR`, `--fail-on high|medium|low` (exit code 1 when a finding reaches that level, for a scheduled check), `--force`. It writes `report.json` and `report.md` into the output directory, **refuses to overwrite** an existing report, and never deletes a file (even `--force` will not replace one: delete it yourself). Exit codes: 0 done, 1 findings at or above `--fail-on`, 2 input or usage error. Input files over 300 MB are refused without being read. Run it on a copy of the export: the tool reads, nothing else.

## 7. Tests (executed 2026-11-14)

| File | Tests | What it proves |
|---|---|---|
| `tests/unit/catalogue-intel-input.test.ts` | 11 | Money parsing; **parity with the Agent's real `RawProduct` schema** (hand cases and 600 randomly damaged products: it found one real discrepancy, unsafe integers, now fixed); parity of `isCardable` with the Agent's real `cardable` (over 80 id and name combinations); input shapes |
| `tests/unit/catalogue-intel-checks.test.ts` | 42 | Every check family on invented fixtures, including Sinhala, hidden characters, hostile descriptions, oversize duplicate blocks, outlier guard |
| `tests/unit/catalogue-intel-readiness.test.ts` | 18 | Verdict rules (ready needs positive evidence), the fixed blocking list, no blended score, gates that fail closed, determinism |
| `tests/unit/catalogue-intel-robust.test.ts` | 6 | 300 catalogues of random garbage (NaN, Infinity, unicode, nested junk, id collisions): no throw, always JSON-serialisable and deterministic; empty catalogue, one product; 3,000 products in seconds; 200,000-character hostile fields |
| `tests/unit/catalogue-intel-cli.test.ts` | 9 | Exit codes, option validation, refuses to overwrite or delete, oversize input, one run against a real temporary directory |
| **Total** | **86 passed, 0 failed** | |

Also: a deliberate-breakage check (a reversed price comparison and a changed duplicate threshold) made 3 tests fail, so the tests do detect regressions; the code was restored. Whole Agent suite after this work: 1,550 passed, 7 expected failures (the reviewer's open-defect markers), 3 skipped, 0 failed. `tsc --noEmit` reports nothing in the new files. The real snapshot was **not** put in the repository; all fixtures are invented. Frozen evaluation sets were not touched.

## 8. Limits and known weaknesses

- **7 products.** See section 1. Nothing about a real full catalogue is known.
- **Heuristics, not truth.** Keyboard-mash detection (Latin script only) can match a real word; the typo check is a short list of model words; transliteration folding covers a few brand misspellings; category inference reads English words. **There is no Sinhala or Tamil category dictionary**: a Sinhala category such as "දුරකථන" is reported as unmappable until staff supply the mapping, and Sinhala names are compared as written.
- **Price floors are assumptions** and apply only to LKR; there are none for kinds outside the tree.
- **Not checked:** SKU format policy across the catalogue, image content, whether a price is real, orders and reservations on duplicate records (the duplicate audit's step 6 still needs someone with order access), anything about customers.
- **A verdict is data quality, not assistant quality.** It does not predict answer accuracy.
- **Duplicate detection** skips very large comparison blocks (reported); a weak name collision is only ever a review item.
- The tool's replica of the Agent's schema and card rules is guarded by parity tests; if the Agent's wire schema changes, those tests fail first.

## 9. Not done, and approvals

- **Not wired into the Agent** (no gate is read by any code). Wiring it would be an Agent change needing review.
- **No full-catalogue run.** Needs the owner to provide an export (and say whether the specification rows and links may be included).
- **No correction is applied or can be applied** by this tool. Category tree decisions, duplicate resolution, price confirmation and specification entry stay with staff, as in the proposals.
- **Two documents need a one-word correction** outside this task's ownership: `VOLTA_AI_DATA_READINESS_REPORT.md` (D1) and `AI_REAL_CATALOGUE_AUDIT.md` (price row): "six" should read "five".
- **Cross-cutting finding for the integration agents:** one record that fails the Agent's strict schema makes the Agent refuse the whole page of products. The website relay should sanitise or skip bad records (an approved website change), and this tool's `agent.wire_rejected` finding should be run on every export before it is trusted.
