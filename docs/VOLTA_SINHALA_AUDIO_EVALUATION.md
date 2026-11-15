# Speech-to-text evaluation (English smoke test; Sinhala and Singlish unevaluated)

Date: 2026-11-14. Written for: the project owner. **Headline: Sinhala and Singlish speech recognition quality is UNEVALUATED and BLOCKED on recordings of native speakers, which do not exist in this repository.** No word error rate for Sinhala or Singlish is claimed anywhere in this work. The only audio that was run through a speech engine was **synthetic English** made with Windows voices, and it proves only that the pipeline and a CPU engine work.

## 1. What was verified about Sinhala support (and how)

| Fact | Source / method | Verified or documented |
|---|---|---|
| Whisper models were trained with only **5.4 hours** of Sinhala speech (for comparison: English has hundreds of thousands of hours; Hindi 12, Tamil 136, Urdu 104) | OpenAI, "Robust Speech Recognition via Large-Scale Weak Supervision", arXiv 2212.04356, Appendix E "Training Dataset Statistics" (page 27), read from the PDF text on 2026-11-14 | **Verified** (extracted from the paper) |
| Sinhala (`si`) is an accepted language code in the Whisper family | The `faster-whisper` 1.2.1 language table, checked by running code | Verified |
| The released **Whisper large-v3** card declares an Apache-2.0 licence | `huggingface.co/openai/whisper-large-v3` README header, fetched 2026-11-14 (other sizes not individually checked; `faster-whisper` and CTranslate2 licences not re-checked) | Verified for large-v3 only |
| Meta **MMS** `mms-1b-all` (1B parameters, 2,396 language adapters) is licensed **CC-BY-NC 4.0, non-commercial**, and its file list contains **no Sinhala adapter** (`adapter.sin.safetensors` absent; English, Hindi and Tamil adapters present) | Hugging Face API file listing and licence tag, 2026-11-14 | Verified |
| Community Sinhala speech models exist: Whisper small and large-v3 fine-tunes (Apache-2.0 tags), XLS-R 300M fine-tunes (one with about 316,000 downloads), a w2v-BERT 2.0 30-hour model (MIT tag) | Hugging Face search API, metadata only | **Existence and declared licence only.** Not downloaded or run. Training-data origin and rights unknown; the licence tag is the uploader's declaration. No quality is claimed |
| Any WER for Sinhala from Whisper (any size) | Not extracted; **not claimed** | Unknown |

Reading: general-purpose Whisper is *very likely* weak on Sinhala given 5.4 hours of training audio, but "very likely" is an inference, not a measurement. Whether a community fine-tune is good enough, safe to ship, and legally clean is **unknown** and needs both the native-speaker test below and a data-rights review.

## 2. English smoke test (real run, synthetic speech)

**What was run.** Ten English clips (5 shopping sentences x 2 Windows voices: Zira en-US and Hazel en-GB), 16 kHz mono WAV, 2.5 to 4.5 s each, clean studio-like synthetic speech, no noise. Engine: `faster-whisper` 1.2.1 (CTranslate2, CPU, 8-bit weights, 4 threads, greedy decoding) with three small multilingual Whisper sizes (tiny, base, small), each run once with the language forced to English and once with automatic language detection. Error rate computed with `jiwer` after lower-casing and removing punctuation. All ten files were also accepted by the Agent's audio validator (WAV, exact durations 2,520 to 4,500 ms, not silent), the only real-file check of that code.

| Model | Mean WER, forced English | Mean WER, auto language | Auto-detected English | Median decode time per clip (forced / auto) | Real-time factor (decode time / audio time) | Peak process memory (cumulative over the run) |
|---|---|---|---|---|---|---|
| tiny | 0.0% | 0.0% | 10 of 10 | 1.1 s / 1.9 s | 0.31 / 0.56 | 262 MB |
| base | 1.3% (one clip: "in stock" heard as "and stock") | 1.3% | 10 of 10 | 2.5 s / 4.8 s | 0.69 / 1.38 | 399 MB |
| small | 0.0% | 0.0% | 10 of 10 | 7.1 s / 13.4 s | 2.66 / 3.99 | 811 MB |

**Read this correctly.**
- **Accuracy numbers are close to meaningless as a quality claim:** 10 clean, synthetic, short clips with common words. They show the pipeline and a CPU engine work for clear English, nothing more. Real shoppers, phones, noise and accents are untested.
- **Timings are NOT a benchmark.** They were taken while other heavy processes were running on the same desktop (including my own full test suites partway through and unrelated background load), so the slower figures, especially `small` (real-time factor above 2), are inflated and should be read as an upper bound. The "load" times in the raw log (137 s and 484 s) were model *downloads* and are not reported. **No measurement was taken on the 6-vCPU production-class server.**
- The memory column is the process's peak working set, which only rises across the three models run in one process: the `small` figure (811 MB) is the whole process, so it is an upper bound for `small` alone. It excludes the browser, the Agent and the language model.
- Language detection picked English for all clips because the clips were English; it says nothing about detecting Sinhala or Singlish.
- **No Sinhala test was possible**: the machine has no Sinhala Windows voice (installed voices: Zira en-US, Hazel en-GB), and synthetic speech would not be valid Sinhala evidence anyway.
- Models were downloaded into a scratch folder outside the repository (about 420 MB in total) and are not part of any deliverable; no model was approved or registered.


## 3. Singlish and mixed speech

Singlish is Sinhala written (and, by speakers, partly spoken) with Latin letters and English loan words; it has no standard spelling. A recogniser tuned for English will return English-looking text that may be wrong; a Sinhala recogniser will return Sinhala script that must still be understood by the router. The script check in the Agent can only say "Latin letters", so a Singlish transcript is labelled `en`. **Nothing was measured.** The pipeline's safeguard is the editable transcript preview: the shopper sees and fixes the text before it reaches the assistant, and the assistant's existing Singlish handling then applies as for typed text.

## 4. Resource implications (from the measurements above and documentation, not from the server)

Measurements were taken on a developer desktop (8 logical cores, 15.7 GB RAM, models in 8-bit CPU mode with 4 threads), **not on the 6-vCPU, 12 GB production-class server**, which also runs the language model, the Agent and, in the live setup, serves shoppers. On that server a speech engine would compete for the same CPU and memory as the language model. The practical rule for now: **do not run speech recognition on the live shopper-serving server beside the 4B/9B experiments**; use the small models only after a measured test on the real server (command set to be approved separately), or put speech on its own machine. See the resource report written by the orchestrator.

## 5. What blocks a Sinhala claim

1. **Native recordings** (none exist). 2. A named recognition engine whose licence and training-data provenance have been reviewed. 3. A held-out test that was not used for tuning (this project's standing rule for evaluation sets). 4. Real browser recordings from real phones (the container files that MediaRecorder produces).

## 6. Recording protocol for the owner (to arrange; nothing was recorded)

**People.** At least 20 adult native Sinhala speakers (18 and over; at least 8 of each gender; spread over 18 to 60; at least three regions or accents, for example Colombo, Kandy, and a southern or northern speaker); at least 5 who habitually code-switch with English. No minors. Voluntary, paid or acknowledged participation.

**Consent and privacy.** Written consent that states the purpose (testing a shop assistant), who hears the audio, how long it is kept, and the right to withdraw at any time with deletion. Store recordings encrypted, outside the shop systems and outside the repository; no names with the audio (use participant numbers); delete on the agreed date. Do not record real customers for this test.

**Devices and conditions.** Each speaker records on their own phone (at least a mix of Android and iPhone), through the actual website voice button so the real browser file format is captured (webm/opus, ogg/opus or mp4/aac), in three conditions: quiet room, a busy shop or street, and moving vehicle or fan noise. Include short (2 s) and long (20 to 25 s) utterances and at least 5% deliberate bad takes (silence, cough, cut-off).

**Material per speaker (about 60 utterances, scripted plus free).**
- 20 Sinhala-script sentences read aloud: shopping requests, budgets spoken in Sinhala ("ලක්ෂ දෙකක්"), warranty and delivery questions, complaints.
- 20 **Singlish** utterances as people really say them ("mata laptop ekak oni", "laksha dekak wage budget ekak"), read from a Latin-letter prompt and also spoken freely from a picture or scenario prompt (not read), because read speech is easier than natural speech.
- 20 mixed Sinhala and English utterances with product vocabulary: "iPhone 15 Pro", "8GB RAM", "gaming laptop", model numbers, prices in digits and in words, brand names.
- 5 free answers to "what are you looking for today?" without a script.

**References.** Two native annotators transcribe every clip independently (Sinhala script for Sinhala and mixed; for Singlish a normalised Latin form agreed in a short style guide); disagreements resolved by a third. Keep the audio, the transcript and the annotator ids.

**Split.** Random by **speaker** (not by clip): a development set used to choose settings, and a **held-out set that is never used for tuning** and is opened once per engine, consistent with this project's rules for its other frozen evaluation sets.

**Metrics (report separately; never merge them into one score).** WER and CER on Sinhala-script clips; for Singlish, because spelling varies, an **intent-and-entity success rate** (does the assistant extract the right product kind and budget from the transcript) and a human "usable without editing" rate; latency and peak memory on the actual server; the rate of invented text on silent and noise-only clips; results broken down by speaker, device, noise condition and length.

**Decision rule.** Thresholds are the owner's to set *before* the held-out set is opened; none are proposed here.

## Update 2026-11-14 (voice review follow-up)

Sinhala and Singlish speech recognition remain **unevaluated and blocked on native-speaker recordings**. The 2026-11-14 follow-up work (duration bounds, pre-authentication limits, metrics hooks) produced **no new Sinhala evidence** and changes none of the conclusions above.
