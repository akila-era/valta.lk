# Sinhala router: first-run record (developer-authored sets, NOT an evaluation)

Recorded 2026-11-12, BEFORE any tuning of the lexicon or rules against each set. Intent accuracy is exact-match on the router's `intent`.

| Set | Written | First-run intent accuracy | Abstained | Entity cases fully correct | Notes |
|---|---|---|---|---|---|
| SET_B | Labels fixed before the router existed | **39 / 40 (98 %)** | 3 | 22 / 22 | **Optimistic.** The lexicon was written afterwards by the same author, who had these phrasings in view. |
| SET_A | Development set, used while building | 53 / 54 (98 %) | 3 | 32 / 32 | In-sample by construction. |
| SET_C | Fresh colloquial paraphrases, written after A and B had run, without consulting the lexicon | **30 / 48 (63 %)** | 16 | 19 / 22 | The least biased number here, still by the same author. 18 misses: 12 abstained (safe), 6 mapped to another read-only or hand-off intent. None mapped a read request to a write-like cart action. |

How to read this:

- The 98 % figures say the router reproduces what its author had in mind. They say nothing about real shoppers.
- The 63 % figure is a better, still biased, hint of how brittle a hand-written lexicon is on unseen phrasing. It is why the design abstains and asks (`clarify_what`) instead of guessing, and why a held-out set from independent native speakers is required (blocker B5).
- After this record was written, SET_C's misses were used to extend the lexicon, so SET_C is now development data. Any later number on it is in-sample.
- Mock vocabulary only (invented brands). Nothing here measures coverage of the real catalogue (blocker B2).
