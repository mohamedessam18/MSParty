/**
 * Outgoing mail, over Resend's HTTP API.
 *
 * Written against fetch rather than a client library so the whole feature is
 * one file and no dependency: the API is a single POST, and pulling in an SDK
 * to make it would be more code, not less.
 *
 * Every send is optional. With RESEND_API_KEY unset — which is the state this
 * ships in — send() reports that nothing was sent and callers carry on. That is
 * deliberate: registration, deletion and restore must all work on an install
 * that has no mail provider at all, so mail can only ever be an addition to a
 * flow, never a step inside one.
 */
export type MailResult = { sent: boolean; reason?: string };

const ENDPOINT = "https://api.resend.com/emails";

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail({
  to,
  subject,
  html
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<MailResult> {
  if (!mailConfigured()) return { sent: false, reason: "not_configured" };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html })
    });

    if (!response.ok) {
      // The body carries the actual reason (unverified domain, bad key). Logged
      // rather than surfaced: the person who typed their email can do nothing
      // with it, and it would tell a stranger whether the address exists.
      console.error("Mail send failed:", response.status, await response.text().catch(() => ""));
      return { sent: false, reason: `http_${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error("Mail send error:", error);
    return { sent: false, reason: "network" };
  }
}

/** Where links in mail point. Shared with the auth callbacks, which need the
 *  same absolute origin for the same reason — see lib/site-url.ts. */
export { siteUrl } from "./site-url";
