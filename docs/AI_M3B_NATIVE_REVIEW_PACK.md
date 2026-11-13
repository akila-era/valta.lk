# Native Sinhala review: process and readiness (M3-B)

Purpose: no statement about the quality of VOLTA AI's Sinhala, Singlish or mixed-language understanding may be made until native speakers have reviewed the test data and the Sinhala texts, and an independently written set has been scored. This document is the process. **No review has happened yet; the owner is arranging reviewers.**

Written for: the project owner (who recruits the reviewers) and the engineers who will score the results.

## 1. What is ready

| Item | Location | State |
|---|---|---|
| The 318 messages (DEV 124, TEST 124, HOLDOUT 70) with labels and blank review columns | `docs/m3b-raw/native-review/review-messages.csv` | Ready |
| Every Sinhala reply the assistant can give (for wording review) | `docs/m3b-raw/native-review/review-sinhala-templates.csv` | Ready |
| Reviewer guide in plain language (hand to reviewers as is; consider a Sinhala version) | `docs/AI_M3B_REVIEWER_GUIDE.md` | Ready (English) |
| Scoring tool: parses reviewer files, agreement and kappa, per-group naturalness, adjudication sheet | `docs/m3b-raw/native-review/aggregate-reviews.mjs` (source `apps/agent/tests/bench/m3b/review-aggregate.ts`, 6 tests) | Ready, tested on synthetic data only |
| Freeze guard for TEST and HOLDOUT | `apps/agent/tests/bench/m3b/frozen-hashes.json` and a test | Ready |

The messages are engineer-written test text, not customer messages, and must stay separate from customer data.

## 2. Reviewers

- At least **two independent** native speakers who write everyday Sri Lankan Sinhala, Singlish and Sinhala-English mixed text; a third person acts as adjudicator (they can be a reviewer who did not take part in that disagreement). A younger shopper-type voice is valuable.
- Not the engineers who wrote the data. Reviewers work alone and are not shown the router's results, rules or other reviewers' answers.
- Identified in the files by an id (initials or a code). No personal data is collected. No access to systems, the codebase or customer data.
- Rough effort per reviewer (estimate): Task A 2 to 3 hours, Task B about 1 hour, Task C about 3 hours.

## 3. The tasks

**A.** Review the 318 messages: natural or not, is the label right, a better label or wording.
**B.** Review the Sinhala templates: meaning, naturalness, register, suggested wording.
**C.** Write fresh messages for the independent test set: at least 15 per label for each of four forms (Sinhala script, Singlish, mixed, English), done **before** seeing anyone else's work or the sample file.
Reviewer-facing instructions: `AI_M3B_REVIEWER_GUIDE.md`.

## 4. Scoring criteria (independent of the router)

Review quality (Tasks A and B):
- **Label correctness agreement:** Cohen's kappa between each pair of reviewers on "is the label correct", reported as the mean; target **at least 0.7**. Percent agreement is reported next to it.
- **Naturalness:** the share of "yes", "awkward" and "no" **per language group**, reported separately for Sinhala script, Singlish and mixed. A group where fewer than 80% of messages are judged natural needs its messages rewritten before it is used as a benchmark.
- **Label challenge rate** per group: the share of rows where any reviewer says the label is wrong.
- **Templates:** every Sinhala template judged correct in meaning and acceptable in naturalness and register by both reviewers, or corrected, before the `needsNativeReview` flag is lifted for that text.

Independent set (Task C), used to measure the assistant:
- Frozen by hash before it is run; run **once**; never used for tuning.
- At least **50 messages per language group** after de-duplication, spread over the labels; results reported **per group** with the count and a confidence interval, never a single blended number.
- Scored with the same evaluator as the author sets (`tests/bench/m3b/eval.ts`) and, separately, by the real model benchmark.

## 5. Process

1. **Send** the two CSVs and the reviewer guide. Ask for Task C in a separate file, produced first.
2. **Collect** the files, named by reviewer id. Do not open the router or its rules while reviewing.
3. **Score** the reviews: `node aggregate-reviews.mjs --out <dir> RV1_review-messages.csv RV2_review-messages.csv [RV3...]`. It writes `review-report.json` and `adjudication.csv`.
4. **Adjudicate** every row listed in `adjudication.csv` (reviewers disagree on the label or on naturalness, or any reviewer challenged the label). Rules: with three or more reviewers the majority decides; with two, a third native adjudicator decides; the decision and reason are written in the `FINAL_label`, `FINAL_wording` and notes columns. Anything still unclear is labelled `ambiguous` or removed, with the reason recorded.
5. **Correct the data without rewriting history.** Changed labels or wording go into a **new versioned file** (for example `dev-v2`), not over the old one. TEST and HOLDOUT are frozen: a correction to either is made as a new file and the old results stay as recorded; the hash file is updated only in the same commit, with the reason.
6. **Build the independent set** from Task C: normalise, remove duplicates and any message that copies the existing sets, freeze it (record its hash), and only then run the router and the model benchmark.
7. **Report** the results as in section 7.

## 6. Rules that protect the measurement

- **TEST and HOLDOUT stay frozen** and are never used to write or tune rules. Their historical results (`docs/m3b-raw/`) are not rewritten.
- **Future tuning uses DEV only**, and evaluation uses the **new independent holdout**.
- Do not tune the router on the same author-created sets as the primary quality measure. After native review, the corrected DEV set may be used for tuning; the reviewers' Task C set is evaluation only.
- Router changes made after review are measured on the independent set once per round, and each round needs a new holdout (a holdout that has been used to decide anything is spent).

## 7. What will be reported, and what may be claimed

After the review, a separate section for **each** of Sinhala script, Singlish and mixed (and English for comparison): the number of messages, the review findings (naturalness, label challenge rate, agreement), the router accuracy and false-tool-call rate on the independent set with intervals, and the real model's tool-choice accuracy (benchmark kit). The Sinhala templates are reported with each reviewer's verdict.

Claims are allowed only per group and only with their numbers and how the set was made. Sinhala output stays flagged `needsNativeReview` until the templates are signed off, and no document may call Sinhala support production-ready until the criteria in section 4 are met **and** you decide it is.

## 8. Privacy and handling

Reviewers receive engineer-written test text only and are told not to include personal information. Returned files may be stored in the repository's `docs/` area or privately, as you decide; they contain no customer data. Reviewer ids stay pseudonymous.
