# VOLTA.LK product specification schema (proposal)

Date: 2026-11-14. Written for: the project owner, then engineers.
Status: design only. **No migration is written or run, no database is touched.** Measured facts and proposals are kept apart.

## 1. Measured facts: how specifications work today

| Fact | Evidence |
|---|---|
| The website stores presentation content per ERP product in table `ProductContent`: key `erpItemId`, JSON columns `draft` and `published` (null = not published), plus `version`, `publishedAt`, `updatedBy`. No history table exists. | `apps/web/prisma/schema.prisma` |
| Specifications are the JSON key `specs`: an array of rows `{ group, name, value, unit }`, at most 100 rows; name up to 60 characters (required), value up to 200 (required), unit up to 20, group up to 40. | `apps/web/src/lib/content/schema.ts` (`contentDocSchema.specs`) |
| The schema is a plain `z.object`, so **unknown keys are dropped** when a document is normalised. New keys cannot be added to rows without changing that schema. | same file, `normalizeDoc` |
| The storefront groups rows by `group` (default "General") and shows them under "Specifications"; ERP-supplied specs (such as Model, Warranty) are shown beside them. | `groupSpecs`; `apps/web/src/app/(store)/products/[slug]/page.tsx` |
| The Agent builds a product's specs from the ERP (Brand, Model, Condition, Warranty) and then appends website rows from `site.content[erpId].specs`. | `apps/agent/src/backend/catalogue.ts`, `mapProduct` |
| **The Agent keeps only `name` and `value`**; `group` and `unit` are lost (type `{ name; value }[]`). | `apps/agent/src/backend/site.ts`, `types.ts` |
| The Agent reads numbers from rows by **name pattern and unit text inside the value**: camera needs "MP" in the value, battery needs "mAh", RAM needs a row named "RAM" or "Memory" with "GB", storage a name containing "storage" or "rom" with GB or TB. If a row gives no number it stays missing; it falls back to description text and marks the source as "description". | `apps/agent/src/reasoning/facts.ts` |
| Storage and colour for the current products live in ERP **variants**, not in specs. Facts reads variant storage as a fallback. | snapshot `variants[]`; `facts.ts` |
| Counts: ProductContent 57 rows, 56 with published specs but for ids not in the current 7-product catalogue; 1 of the 7 has a row with empty specs. AccessoryLink 0 rows. | read-only measurement, earlier |
| **Gap, separate from empty data:** the real-data Agent path passes an empty SiteData, so even correct website specs would not reach it today. | `apps/agent/tests/real/preview-agent.ts`; `docs/AI_REAL_CATALOGUE_AUDIT.md` section 6 |

Two practical consequences of the above: a staff member who types "4.5" in the value and "inch" in the unit field would see it correctly on the website but the Agent would see only "4.5"; and row names must be spelled so the Agent's patterns find them ("Camera", "Battery", "RAM", "Storage").

## 2. Design principles

1. **Category-aware.** Each category leaf (see the category proposal) has a *profile*: the list of fields that make sense for it. A cable never gets "RAM".
2. **Required, recommended, optional.** Required fields decide the quality score; recommended and optional never block publishing.
3. **Unknown stays unknown.** An absent field is omitted, never filled with a guess, "N/A" or 0.
4. **Variant-varying values belong to variants.** Storage, colour and (where it differs) RAM are per variant in the ERP. Product-level specs hold what is the same for every variant.
5. **Machine-readable first.** Each field has a stable key and a canonical label so the Agent can compare products.

## 3. Row format

### Option A (recommended first step, no code change)

Keep today's row `{ group, name, value, unit }`. Conventions:

- `name` is the **canonical label** from the field tables below (exact spelling and capitalisation).
- `value` holds a clean value with its unit written in it for the fields the Agent parses numerically ("12 MP", "5000 mAh", "8 GB"). `unit` may repeat the unit for display.
- `group` is the group named in the tables.

Limitation: validation happens in a script and in staff guidance, not inside the app.

### Option B (needs a website code change and owner approval)

Add `key` (stable machine key) and `num` (number, canonical unit) to each row, and make the Agent read them. Requires: changing `contentDocSchema`, the admin editor, `site.ts`, `catalogue.ts`, `facts.ts`, plus tests. Recommended only after Option A has proved the field list.

Independent of A or B, one small Agent change is recommended: pass `unit` through (or join value and unit) so staff-entered units are not lost. This is a code change and is not made here.

## 4. Field profiles

Types: `text`, `int`, `decimal`, `enum`, `bool`, `list` (of enum or text). Units are canonical; a value entered in another unit must be converted before saving.

### 4.1 Mobile phones (profile `phone`)

| Key | Label (name) | Group | Type | Unit | Required | Validation |
|---|---|---|---|---|---|---|
| ram | RAM | Performance | int | GB | yes | 1 to 32. Per variant if variants differ |
| storage | Storage | Performance | int | GB | yes | one of 8,16,32,64,128,256,512,1024. Per variant (ERP) |
| display | Display | Display | text | inch plus type | yes | size 3.0 to 8.0 inch; type from LCD, IPS, AMOLED, OLED, LTPO; resolution optional |
| processor | Processor | Performance | text | none | yes | non-empty, max 80 chars (chipset name) |
| camera | Camera | Camera | text | MP | yes | at least one "<n> MP" with n 1 to 300; Agent uses the largest |
| battery | Battery | Battery | int | mAh | yes | 500 to 10000 |
| connectivity | Connectivity | Connectivity | list | none | yes | from 4G, 5G, Wi-Fi 5, Wi-Fi 6, Wi-Fi 7, Bluetooth, NFC, dual SIM, eSIM |
| os | Operating system | Software | text | none | yes | name and version, e.g. "Android 14" |
| charging | Charging | Battery | text | W | no | wattage 5 to 240 |
| network_bands | Network bands | Connectivity | list | none | no | |
| dimensions_weight | Weight | Body | decimal | g | no | 50 to 600 |

### 4.2 Laptops (profile `laptop`)

| Key | Label | Group | Type | Unit | Required | Validation |
|---|---|---|---|---|---|---|
| processor | Processor | Performance | text | none | yes | model and generation |
| ram | RAM | Performance | int | GB | yes | 4 to 128 |
| storage | Storage | Performance | text | GB or TB | yes | capacity and type (SSD, HDD, eMMC), e.g. "512 GB SSD" |
| gpu | Graphics | Performance | text | none | yes | "Integrated" or a model name |
| display | Display | Display | text | inch plus resolution | yes | size 10 to 20 inch |
| battery | Battery | Battery | decimal | Wh | yes | 10 to 120 (or hours, if Wh unknown: then label "Battery life", unit h) |
| os | Operating system | Software | text | none | yes | e.g. "Windows 11 Home", "No OS" |
| ports | Ports | Connectivity | list | none | no | |
| weight | Weight | Body | decimal | kg | no | 0.5 to 5 |

### 4.3 Tablets (profile `tablet`)

Same as phone minus network bands, with `display` size 6 to 15 inch, plus optional `cellular` (bool). Required: RAM, Storage, Display, Processor, Battery, OS, Connectivity.

### 4.4 Smart watches (profile `watch`)

| Key | Label | Group | Type | Unit | Required | Validation |
|---|---|---|---|---|---|---|
| display | Display | Display | text | inch plus type | yes | size 0.9 to 2.5 inch |
| battery | Battery | Battery | text | mAh or days | yes | either "<n> mAh" or "<n> days" |
| connectivity | Connectivity | Connectivity | list | none | yes | Bluetooth, Wi-Fi, LTE, GPS, NFC |
| compatibility | Compatibility | Compatibility | list | none | yes | phone systems it works with (iOS, Android), minimum version optional |
| water_resistance | Water resistance | Body | text | none | no | rating such as "5 ATM" or "IP68" |
| sensors | Sensors | Health | list | none | no | |

### 4.5 Accessories (profiles `charger`, `power-bank`, `cable`, `audio`, `computer-accessory`, `phone-accessory`)

Only the fields that fit each profile are listed; a field not listed is not offered for that profile.

| Key | Label | Group | Type | Unit | charger | power-bank | cable | audio | computer-acc. | phone-acc. |
|---|---|---|---|---|---|---|---|---|---|---|
| compatibility | Compatibility | Compatibility | list of text | none | req | rec | req | req | req | req |
| connector | Connector type | Connectivity | enum | none | req | req | req | opt | req | no |
| power_output | Power output | Power | decimal | W | req | req | opt | no | no | no |
| capacity | Capacity | Power | int | mAh | no | req | no | no | no | no |
| standards | Supported standards | Power | list | none | req | req | req | rec | opt | no |
| length | Length | Body | decimal | m | no | no | req | no | no | no |
| audio_type | Audio type | General | enum | none | no | no | no | req | no | no |
| wireless | Wireless | Connectivity | list | none | no | no | no | req | opt | no |
| battery | Battery | Battery | int | mAh | no | no | no | rec | no | no |
| fits_models | Fits models | Compatibility | list of text | none | no | no | no | no | no | req |

Enums: `connector` from USB-A, USB-C, Lightning, micro-USB, HDMI, DisplayPort, 3.5 mm, 2-pin, 3-pin; `standards` from PD, QC 3.0, QC 4+, PPS, MagSafe, Qi, Qi2; `audio_type` from earbuds, headphones, speaker, headset.

Validation examples: `capacity` 1000 to 100000 mAh; `power_output` 1 to 300 W; `length` 0.1 to 10 m; a cable that lists `standards` PD must have `connector` USB-C on at least one end (warn, do not block).

Explicit accessory links (which phone a case fits) stay in the existing `AccessoryLink` table, which is set by staff and never inferred from names. `compatibility` rows in specs are descriptive text; they do not replace the links.

## 5. Where the Agent reads each field

| Field | Reads today? | How |
|---|---|---|
| Camera, Battery, RAM, Storage | yes | `facts.ts` name patterns; unit must be in the value |
| Display, processor, OS, connectivity, GPU, compatibility, connector, power output, capacity, standards | **no** | only displayed in cards and comparison tables (the first 24 rows), not used for ranking |
| Brand, Model, Condition, Warranty | yes | from the ERP in `mapProduct` |

So the new fields do not change recommendation behaviour until `facts.ts` is extended with tests. That work is out of scope here and listed in section 8.

## 6. Migration and validation plan (plan only)

1. **Agree the profile list** and the category tree (owner decisions). Resolve the catalogue size question first.
2. **Back up**: export every `ProductContent` row (id, draft, published, version) to a file stored outside the repository. This is the only rollback source, because the table keeps no history.
3. **Dry-run validator** (read-only): reads the export and the catalogue, reports per product: which profile applies (by approved category), required fields missing, values failing the rules in section 4, row names not matching canonical labels. It writes nothing.
4. **Orphan review**: 56 rows hold published specs for ids that no longer exist in the catalogue. Do not delete. Report them to staff; they may belong to a previous catalogue and are evidence of where the real data once lived.
5. **Staff entry**: enter specs into `draft` through the existing admin editor (it already protects against overwriting through `version`). Review the preview, then publish. Specs for products whose kind is undecided are not entered until the category decision exists.
6. **Re-measure**: re-run the quality report; the Specifications dimension should rise.
7. **Wire to the Agent**: pass website content to the real-data Agent path, pass `unit`, extend `facts.ts` if ranking by new fields is wanted. Each is a code change needing tests and approval.
8. **Option B** only after steps 1 to 7 prove stable.

Additive rule: no step overwrites a published spec value. The validator proposes; staff decide.

### Rollback

| What went wrong | Rollback |
|---|---|
| Wrong specs saved to a draft | restore that row's `draft` from the step 2 export (or discard the draft); published copy is unaffected |
| Wrong specs published | republish the previous `published` JSON from the export for that `erpItemId`; or set `published` to null to return to the plain ERP product page |
| A schema change (Option B) misbehaves | revert the code change; stored rows with old shape still parse because `normalizeDoc` never throws and falls back to an empty document, so **keep the export**: a row that fails to parse silently normalises to empty and the export is the only copy |
| Agent change misreads a field | revert the code change; data is untouched |

Verification before any publish batch: validator reports zero failures on that batch; counts in the export equal counts before and after for rows not in the batch.

## 7. Risks

- `normalizeDoc` returns an empty document for anything that fails validation, so a bad write could appear as lost content. That is why the export in step 2 is mandatory.
- Name-pattern matching in `facts.ts` is substring based (the storage pattern matches any name containing "rom"). Keep canonical labels exactly as above to avoid surprises.
- Entering specs for only a few products creates uneven comparison; the Agent already reports "cannot rank" for missing data, which is the correct behaviour.

## 8. Decisions and follow-up code work (not done)

| # | Item | Owner |
|---|---|---|
| S1 | Approve profiles and required fields | owner |
| S2 | Option A or B | owner and engineering |
| S3 | Pass website content and `unit` to the real-data Agent path | engineering |
| S4 | Extend `facts.ts` for new fields only if ranking on them is wanted, with tests using invented products | engineering |
| S5 | Who enters specs (catalogue staff) and who reviews | owner |

## 9. Executable form (added 2026-11-14)

The profiles of section 4 (required fields, row-name recognition, the Agent's own readers, the plausibility ranges) are encoded in `apps/agent/src/catalogue-intel/profiles.ts` and applied by the audit tool as the "dry-run validator" of section 6 step 3: it reads a catalogue snapshot plus the published specification rows (the relay's `/content` output) and writes a report. It never writes to any catalogue. Findings include missing required fields per product, a value the Agent could not read (a number without its unit), an implausible number, a non-canonical row name, numbers that exist only in the description, and orphan row sets. See `VOLTA_CATALOGUE_INTELLIGENCE_REPORT.md`.
