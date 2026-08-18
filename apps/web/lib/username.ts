/**
 * Instagram's rules: 1–30 characters, lowercase letters, digits, dots and
 * underscores, with no dot at either end and no two dots in a row.
 */
export const USERNAME_MAX = 30;
const SHAPE = /^[a-z0-9._]{1,30}$/;

/** Days a released name stays parked before anyone else can take it. */
export const HOLD_DAYS = 30;
/** How long a person must wait between changes. */
export const CHANGE_COOLDOWN_DAYS = 30;

/**
 * Names that must never belong to a person, because seeing them next to a
 * message would imply the message came from us.
 */
const RESERVED = new Set([
  "admin", "administrator", "root", "system", "support", "help", "helpdesk",
  "moderator", "mod", "staff", "team", "official", "msparty", "ms_party",
  "msparty_official", "security", "billing", "payments", "abuse", "legal",
  "privacy", "terms", "about", "contact", "info", "noreply", "no_reply",
  "api", "www", "app", "web", "cdn", "assets", "static", "login", "logout",
  "signin", "signup", "register", "auth", "oauth", "session", "profile",
  "settings", "dashboard", "party", "parties", "join", "invite", "friends",
  "notifications", "u", "user", "users", "me", "you", "null", "undefined",
  "anonymous", "guest", "everyone", "here", "all"
]);

/**
 * Characters people substitute to impersonate someone: a zero for an o, a one
 * for an i. Dots and underscores go too, since Instagram treats them as
 * decoration and an impersonator relies on exactly that.
 */
const CONFUSABLES: Record<string, string> = {
  "0": "o", "1": "i", "l": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g"
};

export function normalizeUsername(input: string) {
  return input.trim().toLowerCase().replace(/^@+/, "");
}

/**
 * The form two names share when one is impersonating the other. Stored with a
 * unique index, so the database rejects a collision atomically — a check-then-
 * insert would lose the race between two people claiming the same shape.
 */
export function canonicalUsername(username: string) {
  return normalizeUsername(username)
    .replace(/[._]/g, "")
    .split("")
    .map(character => CONFUSABLES[character] ?? character)
    .join("");
}

export type UsernameProblem =
  | "empty" | "too_long" | "charset" | "dot_edge" | "dot_run" | "reserved" | "canonical_empty";

const MESSAGES: Record<UsernameProblem, string> = {
  empty: "اكتب اسم مستخدم.",
  too_long: `أقصى طول ${USERNAME_MAX} حرف.`,
  charset: "حروف إنجليزي صغيرة وأرقام و . و _ بس.",
  dot_edge: "الاسم مايبدأش ومايخلصش بنقطة.",
  dot_run: "مينفعش نقطتين ورا بعض.",
  reserved: "الاسم ده محجوز.",
  canonical_empty: "لازم يكون فيه حروف أو أرقام، مش نقط وشرطات بس."
};

export function validateUsername(raw: string): { ok: true; username: string; canonical: string } | { ok: false; problem: UsernameProblem; message: string } {
  const username = normalizeUsername(raw);
  const fail = (problem: UsernameProblem) => ({ ok: false as const, problem, message: MESSAGES[problem] });

  if (!username) return fail("empty");
  if (username.length > USERNAME_MAX) return fail("too_long");
  if (!SHAPE.test(username)) return fail("charset");
  if (username.startsWith(".") || username.endsWith(".")) return fail("dot_edge");
  if (username.includes("..")) return fail("dot_run");

  const canonical = canonicalUsername(username);
  if (!canonical) return fail("canonical_empty");
  // Reserved is checked on the canonical form so "adm1n" and "a.d.m.i.n" are
  // caught alongside "admin".
  if (RESERVED.has(canonical)) return fail("reserved");

  return { ok: true, username, canonical };
}

/** Offers something close when the name someone wanted is gone. */
export function suggestUsernames(base: string) {
  const seed = normalizeUsername(base).replace(/[^a-z0-9._]/g, "").replace(/^\.+|\.+$/g, "") || "user";
  const trimmed = seed.slice(0, USERNAME_MAX - 4);
  return [
    `${trimmed}_${Math.floor(10 + Math.random() * 89)}`,
    `${trimmed}.${Math.floor(100 + Math.random() * 899)}`,
    `${trimmed}${Math.floor(1000 + Math.random() * 8999)}`
  ];
}
