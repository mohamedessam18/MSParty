/**
 * This app's own origin, as an absolute URL.
 *
 * Needed wherever a URL leaves the server and is parsed by something stricter
 * than a browser address bar. `new URL(relative)` — with no base — throws, and
 * both next-auth's client and every mail client do exactly that with what we
 * hand them, so a path that works when the browser resolves it against the
 * current page fails the moment anything else looks at it.
 *
 * The order matters more than it looks:
 *
 * - NEXTAUTH_URL first, because it is the one a deployment sets deliberately.
 *   It is also the only one that can name a custom domain, which is what makes
 *   the links in an email match the address the email was sent from — a
 *   message from your-domain.com whose every link points somewhere else has the
 *   shape of a phishing attempt, and filters score it that way.
 *
 * - VERCEL_PROJECT_PRODUCTION_URL next: the project's stable production domain.
 *
 * - VERCEL_URL only as a last resort, and it is a poor one for anything durable
 *   — it is the *per-deployment* hostname, so it carries a build-specific
 *   subdomain and changes on every deploy. A password-reset link built on it
 *   points at a different random host every time, which is both fragile and
 *   about as suspicious as a link can look.
 */
export function siteUrl() {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
