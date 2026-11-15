import { anyPhrase, type Haystack } from "./cues";

/**
 * Password and sign-in trouble ("I forgot my password", "my password is wrong for the website", "login wenna ba"). It is a request for HELP with the site's
 * own account recovery, never a request to see or set a password: the assistant answers with a fixed text that points to the "Forgot password?" link and asks
 * the shopper NOT to type the password. The message is checked by the safety filter first (a message that actually contains a password value is refused
 * there), so by the time this runs it holds a problem description, not a secret. PROVISIONAL Sinhala/Singlish cues, not native-reviewed.
 */
const CREDENTIAL = ["password", "passwords", "passcode", "pass word", "login", "log in", "logging in", "sign in", "signin", "මුරපදය", "මුරපදයක්", "මුරපද", "පාස්වර්ඩ්", "ලොගින්", "log wenna", "login wenna"];
const TROUBLE = [
  "forgot", "forget", "forgotten", "reset", "wrong", "incorrect", "cant", "can t", "cannot", "unable", "not working", "doesn t work", "didn t work", "locked", "problem", "issue", "trouble", "stuck",
  "marala", "amathaka", "amathaku", "wada karanne naha", "wada karanne na", "wada naha", "waradi", "waradiyi", "wenna ba", "wenna baha", "wenna bari",
  "අමතක", "වැරදි", "වැරදියි", "වැරැදියි", "බැහැ", "නැහැ", "ප්‍රශ්නයක්", "වැඩ කරන්නේ නැහැ",
];

export function isAccountTrouble(h: Haystack): boolean {
  return h.tokens.length <= 20 && anyPhrase(h, CREDENTIAL) && anyPhrase(h, TROUBLE);
}
