# Model selection report (Phase 8)

Date: 2026-11-14. Written for: the project owner. **No model is approved or changed by this report.** The production default stays Qwen3-1.7B (`qwen3:1.7b-q4_K_M`); the registry entries for the candidates stay `experimental`.

## 1. Candidates and what is actually known

| | Qwen3.5-4B | Gemma 4 E4B | Qwen3.5-9B | Qwen3-1.7B (production) |
|---|---|---|---|---|
| Licence | Apache-2.0 (package layer and Hugging Face card) | Apache-2.0 (same checks) | Apache-2.0 | Apache-2.0 |
| Download | 3.3 GB | 6.6 GB | 6.6 GB | 1.4 GB |
| Capabilities reported by the runtime | completion, vision, tools, thinking | completion, vision, **audio**, tools, thinking | completion, vision, tools, thinking | completion, tools |
| Host RAM above idle | about 3.5 GB | about 6.6 GB | about 6.6 GB | about 1.4 GB |
| Generation speed on this CPU | 4.4 to 6.8 tokens/s | 2.0 to 3.1 | 2.8 | about 5 |
| Cold load | 17 s | 34 s | 31 s | seconds |
| Tool-choice benchmark (70 messages, simplified harness) | **54.3%**, 70/70 done, median call **32 s** | **stopped after 3/70** (load limit) | **not completed** (stopped to protect live traffic) | not run on this harness |
| Sinhala, Singlish, English, mixed quality | tool choice only: 46.7, 52.9, 61.9, 52.9% | unmeasured | unmeasured | unmeasured here |
| General reasoning, coding | **not measured** | not measured | not measured | not measured |
| Vision | **not tested** | **not tested** | not tested | n/a |
| Audio (Sinhala audio especially) | n/a | **not tested**; needs native Sinhala audio samples | n/a | n/a |
| Stability | 70 calls, 0 errors | stopped by the safety limit | n/a | in production |

Sources: the runtime's model information and the basic-check output (`docs/migration-raw/three-model-basic-check.txt`), the licence verification (`AI_MODEL_LICENCE_VERIFICATION.md`), and the benchmark run of 2026-11-13 whose log stayed on the AI server (its numbers are quoted in `VOLTA_STAGING_PERFORMANCE_REPORT.md`).

## 2. What this means

- **No candidate can be selected.** The brief asks for Sinhala, Singlish, English, mixed, reasoning, coding, tool planning, vision, audio, latency, RAM and stability, and tool-choice accuracy alone must not decide. Only RAM, speed, load time and one tool-choice number exist, and the tool-choice number is low and slow.
- **Speed is the first blocker on this hardware.** A 32-second median call is unusable in a chat; the 9B and Gemma leave little memory for anything else and cannot run next to the browser worker, retrieval or speech. The 1.7B plus the deterministic router answers most messages in milliseconds without the model.
- The honest comparison of model quality on Sinhala needs **native speakers** (not available in this work) and a new independent set; the frozen HOLDOUT and EVAL sets were not used for model comparison here.

## 3. Recommendation

1. Keep Qwen3-1.7B as the production default. Do not change registry approvals.
2. The most promising next test is a **4B-class model** (the already-approved experimental Qwen3-4B-Instruct-2507, and Qwen3.5-4B with thinking switched off) on the private staging Agent, one model at a time, in a quiet window, with a quality set that includes Sinhala and Singlish **reviewed by native speakers**, plus a latency budget (for example under 10 s at the 95th percentile for a model-backed reply) that the 4B must meet or be dropped.
3. Treat Gemma 4 E4B as the only vision-and-audio candidate; evaluate it separately, for audio only if native Sinhala samples exist, and not as a general chat model on this CPU.
4. Treat Qwen3.5-9B as not fitting this host together with the other planned services.

## 4. Blocked

Running any of this needs the staging Agent (approval) and native reviewers (people).
