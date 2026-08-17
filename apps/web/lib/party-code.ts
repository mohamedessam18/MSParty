/** No I/O/0/1 — these get confused when a code is read aloud or retyped. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

export function generatePartyCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  // ALPHABET.length is 32, a divisor of 256, so the modulo introduces no bias.
  return Array.from(bytes, byte => ALPHABET[byte % ALPHABET.length]).join("");
}

/** Users type codes with spaces, dashes, and the wrong case. Accept all of it. */
export function normalizePartyCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
