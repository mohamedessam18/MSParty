/**
 * What counts as a usable password here.
 *
 * Length carries almost all of the strength, so that is what is enforced, plus
 * a short list of refusals for the passwords that are guessed first. No symbol
 * or digit requirement: it pushes people towards "Password1!" and away from the
 * long ordinary phrases that are actually harder to guess.
 */
export const PASSWORD_MIN = 8;

/**
 * bcrypt hashes the first 72 *bytes* and silently ignores the rest, so anything
 * past that is not part of the password at all. Arabic runs two bytes per
 * character, which puts a 36-character phrase right on the edge — this is a
 * real limit here, not a theoretical one.
 */
export const PASSWORD_MAX_BYTES = 72;

const TOO_COMMON = new Set([
  "password", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123",
  "11111111", "00000000", "iloveyou", "princess", "admin123", "welcome1",
  "password1", "abc12345", "football", "baseball", "sunshine", "letmein1",
  "monkey12", "trustno1", "passw0rd", "msparty1", "msparty123"
]);

export type PasswordCheck = { ok: true } | { ok: false; message: string };

export function checkPassword(password: string, context: { email?: string; name?: string } = {}): PasswordCheck {
  if (password.length < PASSWORD_MIN) {
    return { ok: false, message: `كلمة المرور لازم تكون ${PASSWORD_MIN} أحرف على الأقل.` };
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return { ok: false, message: "كلمة المرور طويلة أوي. خليها أقصر شوية." };
  }
  if (TOO_COMMON.has(password.toLowerCase())) {
    return { ok: false, message: "كلمة المرور دي متوقعة جدًا. اختار واحدة تانية." };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, message: "حرف واحد متكرر مش كلمة مرور." };
  }

  // Anything the account already announces is public, so it protects nothing.
  const local = context.email?.split("@")[0]?.toLowerCase();
  const lowered = password.toLowerCase();
  if (local && local.length >= 4 && lowered.includes(local)) {
    return { ok: false, message: "متخليش كلمة المرور جزء من بريدك." };
  }
  if (context.name && context.name.length >= 4 && lowered.includes(context.name.toLowerCase())) {
    return { ok: false, message: "متخليش كلمة المرور اسمك." };
  }

  return { ok: true };
}

/**
 * A 0–4 score for the meter on the registration screen. Advisory only: nothing
 * is refused on the strength of it, so it can be generous where the rules above
 * are strict.
 */
export function passwordStrength(password: string) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[^a-zA-Z0-9]/.test(password) || (/[a-zA-Z]/.test(password) && /[0-9]/.test(password))) score++;
  if (TOO_COMMON.has(password.toLowerCase())) return 0;
  return Math.min(4, score);
}

/** Trims and lowercases, and says whether what is left could be an address. */
export function normalizeEmail(raw: unknown) {
  const email = String(raw ?? "").trim().toLowerCase();
  // Deliberately loose. The only address shape worth rejecting here is one that
  // cannot be an address at all; everything past that is decided by whether the
  // confirmation mail arrives.
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  return email;
}
