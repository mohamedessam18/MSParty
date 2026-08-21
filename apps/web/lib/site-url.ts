/**
 * This app's own origin, as an absolute URL.
 *
 * Needed wherever a URL leaves the server and is parsed by something stricter
 * than a browser address bar. `new URL(relative)` — with no base — throws, and
 * both next-auth's client and every mail client do exactly that with what we
 * hand them, so a path that works when the browser resolves it against the
 * current page fails the moment anything else looks at it.
 *
 * NEXTAUTH_URL first because it is the one a deployment sets deliberately.
 * VERCEL_URL is the per-deployment hostname and covers a preview build where
 * nobody set the former; it carries no scheme, hence the prefix.
 */
export function siteUrl() {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
