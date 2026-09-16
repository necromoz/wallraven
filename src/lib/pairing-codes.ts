// Code generation and normalisation for device pairing.
//
// Both codes are generated here, on the server. The old flow let the *caller*
// choose the pairing code, which is what made a one-click account takeover
// possible: an attacker picked a code, registered it, sent the victim a link
// carrying it, and collected the victim's tokens the moment they pressed the
// button. A code the attacker cannot choose, combined with a code the user has
// to read off their own screen, removes both halves of that.
//
// Two codes, doing different jobs:
//
//   user_code    short, typed by a human, shown in the desktop app and entered
//                on the website. Never secret enough to protect anything on its
//                own; its job is to prove that the person approving is looking
//                at the device that asked.
//   device_code  long, random, never shown to anyone and never in a URL. The
//                desktop app holds it and presents it when collecting the
//                session. Only its hash is stored.

/**
 * Crockford-style alphabet with the characters people mistype removed: no 0/O,
 * no 1/I/L, no U. Someone reading a code off one screen and typing it into
 * another should not be able to get it wrong.
 */
export const USER_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Characters per user code, before formatting. */
export const USER_CODE_LENGTH = 8;

/**
 * 30^8 is about 6.6e11. That matters more than it looks: the rate limiter in
 * this app is per-instance and in-memory, and on Cloudflare Workers that means
 * per-isolate, so an attacker spreading guesses around gets a fresh allowance
 * each time. The code therefore has to be long enough to survive brute force
 * on its own, without leaning on the limiter. At a sustained ten thousand
 * guesses a second, an even chance of hitting one live code takes over a year;
 * codes live for ten minutes.
 *
 * Shortening this to six characters would drop that to a few hours. Don't.
 */
export function generateUserCode(randomBytes: (n: number) => Uint8Array): string {
  // Rejection sampling: 256 is not a multiple of 30, so taking a raw byte
  // modulo 30 would make the first 16 characters of the alphabet slightly more
  // likely than the rest. Discarding the top of the range keeps it uniform.
  const limit = 256 - (256 % USER_CODE_ALPHABET.length);
  let out = "";
  while (out.length < USER_CODE_LENGTH) {
    for (const byte of randomBytes(USER_CODE_LENGTH)) {
      if (byte >= limit) continue;
      out += USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length];
      if (out.length === USER_CODE_LENGTH) break;
    }
  }
  return out;
}

/**
 * How the code is shown to a human: FDJ4-K29M. The dash is presentation only
 * and is stripped before anything is compared.
 */
export function formatUserCode(code: string): string {
  const half = Math.floor(USER_CODE_LENGTH / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

/**
 * Accept what a human plausibly types: lower case, stray spaces, and the dash
 * from the displayed form. Nothing else.
 *
 * Deliberately no "helpful" repair of confusable characters. Mapping a typed O
 * onto some nearby letter would mean one thing the user typed could match more
 * than one real code, which widens the guess space rather than narrowing it.
 * The alphabet already has the confusable characters removed, so a 0, 1, I, L,
 * O or U in the input is simply a typo and is treated as one.
 *
 * Returns an empty string when the input is not a well-formed code, so callers
 * can treat "unparseable" and "no such code" identically and reveal nothing
 * about which codes exist.
 */
export function normaliseUserCode(input: string): string {
  const cleaned = String(input ?? "")
    .toUpperCase()
    .replace(/[\s\-_]+/g, "");

  if (cleaned.length !== USER_CODE_LENGTH) return "";
  for (const ch of cleaned) {
    if (!USER_CODE_ALPHABET.includes(ch)) return "";
  }
  return cleaned;
}
