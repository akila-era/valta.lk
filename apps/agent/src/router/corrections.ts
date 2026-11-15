/**
 * Correction recognition (R0). The shopper says the assistant misunderstood: "mama kiwwe eka nemei" ("that's not what I said"), "no, that's not what I asked",
 * "ehema nemei", "I meant a laptop", "mama kiwwe laptop ekak", Sinhala-script equivalents. This only FINDS the correction cue and returns what is left of the
 * message once the cue is taken out (the corrected request, when there is one). The original message is never altered: the caller decides what to do with the
 * remainder. What a correction DOES (drop the previous interpretation, acknowledge, route the corrected request or ask one short question) is in the pipeline.
 *
 * PROVISIONAL: the Singlish and Sinhala cues are engineer-written and not native-reviewed. The pattern is a structure ("said"-word + "not"-word, "not what I
 * asked", "I meant"), not a list of whole sentences, so spelling variants of the same structure also match.
 */
const SAID = String.raw`(?:kiw+e|kiyuwe|kiwa|kiyapu|ahuwe|ahuwa)`;
const NOT_WORD = String.raw`(?:nemei|nemey|nemeyi|neme|nemi|naha|nehe|na)`;
/** An apostrophe in any of its usual forms, or none ("that's", "thats", "that’s"). */
const APOS = "['’‘`]?";

const CUES: RegExp[] = [
  // "mama kiwwe eka nemei"
  new RegExp(String.raw`\b(?:mama\s+)?${SAID}\s+(?:eka\s+|ekak\s+|ewa\s+)?${NOT_WORD}\b`, "gi"),
  // "eka nemei", "ehema nemei", "meka nemei"
  new RegExp(String.raw`\b(?:eka|ehema|meka|ewa|ara eka|e eka)\s+(?:nemei|nemey|nemeyi|neme|nemi)\b`, "gi"),
  // "not what I asked / said / meant"
  new RegExp(String.raw`\b(?:that${APOS}?s\s+|that is\s+|it${APOS}?s\s+|it is\s+)?not what i\s+(?:asked|said|meant|wanted|was asking|was saying|am asking)\b`, "gi"),
  // "that's wrong"
  new RegExp(String.raw`\b(?:that${APOS}?s|that is|it${APOS}?s|it is)\s+(?:wrong|not right|not correct|incorrect|not it)\b`, "gi"),
  // "wrong answer", "that's the wrong one", "wrong again": only as a whole short message, never inside a sentence ("what is the wrong answer to this riddle")
  new RegExp(String.raw`^\s*(?:no\W+|nope\W+)?(?:that${APOS}?s\s+|that is\s+|it${APOS}?s\s+)?(?:the\s+)?(?:wrong|incorrect)\s+(?:answer|one|again)\W*$`, "gi"),
  new RegExp(String.raw`^\s*(?:no\W+|nope\W+)?(?:wrong|incorrect)\W*$`, "gi"),
  // "you misunderstood"
  new RegExp(String.raw`\b(?:you\s+)?(?:misunderstood|misunderstand|got (?:it|that) wrong|did not understand|didn${APOS}?t understand|understood (?:it )?wrong)\b`, "gi"),
  // "I meant X", "I said X", "I didn't ask for that"
  new RegExp(String.raw`\bi\s+(?:meant|mean|said|asked for|was asking (?:for|about))\b`, "gi"),
  // "sorry, I actually wanted phones", "no I wanted a phone": "wanted" in the PAST with a "no"/"actually", never the plain request "I want a phone"
  new RegExp(String.raw`\bi\s+(?:actually|really)\s+(?:wanted|needed|meant|asked for|said)\b`, "gi"),
  new RegExp(String.raw`^\s*(?:no|nope|naa)\W+i\s+(?:wanted|needed|asked for)\b`, "gi"),
  new RegExp(String.raw`\bi\s+(?:didn${APOS}?t|did not|never)\s+(?:ask|say|mean)\b`, "gi"),
  // "mama kiwwe laptop ekak": the shopper repeats what they said
  new RegExp(String.raw`\bmama\s+${SAID}\b`, "gi"),
  // Sinhala script: "මම කිව්වේ ඒක නෙමෙයි", "ඒක නෙමෙයි", "වැරදියි", "මම කිව්වේ ..."
  /මම\s*(?:කිව්වේ|කිවේ|කිව්ව|ඇහුවේ|ඇහුව)\s*(?:ඒක|එක|ඒවා)?\s*(?:නෙමෙයි|නෙමේ|නෙවෙයි|නොවේ)/g,
  /(?:ඒක|එහෙම|මේක|එක)\s*(?:නෙමෙයි|නෙමේ|නෙවෙයි)/g,
  /වැරදියි|වැරැදියි|වැරදි පිළිතුර/g,
  /මම\s*(?:කිව්වේ|ඇහුවේ)/g,
];

/** Leading fillers left once the cue is removed ("no, ...", "sorry, ...", "naa ..."). */
const LEADING_FILLER = /^(?:[\s,.;:!?\-–—]+|(?:no|nope|naa|na|nah|ow|hmm|well|ah|oh|sorry|please|pls|aiyo|aney|ane|but|and|then|eka|mama|i)\b)+/i;

export interface Correction {
  /** What is left of the message after the correction cue is removed ("a laptop" from "I meant a laptop"); "" when the message is only a correction. */
  remainder: string;
}

/** The correction in a message, or null. `raw` is the shopper's message exactly as sent. */
export function detectCorrection(raw: string): Correction | null {
  const text = raw.normalize("NFC");
  if (text.length > 400) return null;
  let rest = text;
  let found = false;
  for (const re of CUES) {
    re.lastIndex = 0;
    if (re.test(rest)) {
      found = true;
      re.lastIndex = 0;
      rest = rest.replace(re, " ");
    }
  }
  if (!found) return null;
  let remainder = rest.replace(/\s+/g, " ").trim();
  // Strip leading fillers repeatedly ("no, sorry, a laptop" -> "a laptop") and trailing punctuation.
  for (let i = 0; i < 6; i++) {
    const next = remainder.replace(LEADING_FILLER, "").trim();
    if (next === remainder) break;
    remainder = next;
  }
  remainder = remainder.replace(/[\s,.;:!?\-–—]+$/g, "").trim();
  // Anything without a letter or digit left is only punctuation.
  if (!/[\p{L}\p{N}]/u.test(remainder)) remainder = "";
  return { remainder };
}
