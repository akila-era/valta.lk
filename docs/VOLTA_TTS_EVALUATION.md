# Text-to-speech evaluation (English and Sinhala)

Date: 2026-11-14. Written for: the project owner. **No Sinhala speech output was generated, heard or evaluated in this work, and no TTS engine was installed or run.** This document separates what was *checked* (with the source) from what is only *documented by others* and from what is *unknown*. Nothing here approves an engine.

## 1. What the product needs

Spoken replies are the **verified text reply read aloud** (never a different answer). Requirements: English and Sinhala, natural enough that a shopper is not put off, runs on CPU on a 12 GB shared server without starving the language model (or runs elsewhere), a licence that allows commercial use, voice data of known origin.

## 2. Verified in this work (with sources)

| Fact | How it was checked |
|---|---|
| **Piper has no Sinhala voice.** The official voice catalogue `voices.json` lists 182 voices in 58 language codes; none is Sinhala (`sl_SI` is Slovenian). English voices exist (`en_US`, `en_GB`). | Downloaded `https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json` on 2026-11-14 and counted the codes locally. |
| **Meta's MMS-TTS has no `mms-tts-sin` model on Hugging Face.** `facebook/mms-tts-hin` exists and carries the tag `license:cc-by-nc-4.0` (**non-commercial**); a search for `mms-tts-sin` returned no Meta model, and the direct address answers 401 (what Hugging Face returns for a missing repository). | Hugging Face API, 2026-11-14. A 401 can also mean "gated"; the search result is the stronger evidence. Treat as "not found", not as a proof of non-existence. |
| **The Windows speech voices on the development machine are English only** (Microsoft Hazel en-GB, Microsoft Zira en-US). | Listed with `System.Speech` on this machine. They were used only to *make test input* for speech recognition, not as a candidate engine. |
| **Community Sinhala TTS models exist on Hugging Face**, for example `chan4lk/piper-tts-sinhala` (licence tag MIT), `intellisr/sinhala-tts-piper-v1` (GPL-3.0), `deathlegionteam/sinhala-tts-vits` (Apache-2.0), with very low download counts (tens to hundreds). | Hugging Face search API, metadata only. **Not downloaded, not run, not listened to.** The licence tag is what the uploader declared; it says nothing about the licence of the voice recordings it was trained on. |

## 3. Documented by others, not checked here

- Mobile browsers' built-in speech synthesis: many Android phones expose a Sinhala (`si-LK`) voice through the system text-to-speech service; iPhones and most desktop browsers vary. Availability and quality differ by device. **Not tested.**
- Hosted cloud TTS services may offer Sinhala. They would send reply text to a third party, which conflicts with the self-hosted design; **not evaluated** and not proposed.
- Other open engines (VITS-family, Coqui models, eSpeak-style formant synthesis) may cover Sinhala at differing quality and licences. **Not evaluated.**

## 4. Conclusions (honest)

1. **English** is straightforward: Piper voices exist (catalogue verified); quality and per-voice licence must still be listened to and read before choosing. Not run in this work.
2. **Sinhala server-side TTS: no suitable, vetted engine has been identified.** The two obvious candidates fail on facts checked here: Piper has no Sinhala voice; Meta's MMS Sinhala TTS was not found and the MMS TTS family is non-commercial anyway. Community models are unvetted (quality, training-data rights).
3. Therefore **the pipeline is built so that Sinhala TTS is optional and degrades gracefully**: the Agent reports "no voice for this language" (501 with a `fallback: browser` hint) and the browser may use its own speech synthesis if the device has a Sinhala voice, otherwise the reply stays text. **Sinhala spoken replies must not be advertised** until a voice has passed a native-listener test.

## 5. What is built

`TtsProvider` interface; `none` default (501); `http` provider for a loopback OpenAI-compatible `/v1/audio/speech` server where a language is "supported" **only if the operator configured a voice for it** (so Sinhala stays off by default even if an English engine is running); returned bytes are validated by content (WAV exact, MP3 header), capped at 5,000,000 bytes and 60 s, whatever the engine calls them; text input is cleaned and capped at 1,600 characters. Tested with fake engines only (`tests/unit/voice-service.test.ts`, `tests/integration/voice-http.test.ts`).

## 6. How Sinhala TTS should be judged (for the owner to arrange)

- 10 native Sinhala listeners (mixed gender and age), at least two with retail or customer-service experience.
- 40 reply sentences taken from the assistant's own fixed templates and typical answers (prices read in Sinhala and with digits, brand and model names such as iPhone, "RAM 8GB", currency "රු." and "ලක්ෂ").
- Rate each 1 to 5 for intelligibility, naturalness and pronunciation of English product names; record "would you trust this voice to read a price".
- Check number and price reading separately: a mispronounced price is a trust and safety problem, not a style problem.
- Licence review of the voice data by someone qualified before any engine is shipped.
- Acceptance thresholds are the owner's decision; none are proposed or implied here.

## Update 2026-11-14 (voice review follow-up)

No text-to-speech engine or voice was run for Sinhala; Sinhala TTS remains **unevaluated and without a vetted engine**. The 2026-11-14 follow-up work (queue deadline, metrics hooks) added no TTS evidence and changes none of the conclusions above.
