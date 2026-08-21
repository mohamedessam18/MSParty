import { NextResponse } from "next/server";
import { consumeVerificationToken } from "@/lib/email-verification";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The far end of the confirmation mail.
 *
 * A GET that changes state, because it is opened by clicking a link in an email
 * and there is nothing else it could be. The token is single-use and expires,
 * so the usual objection — that something may fetch the link ahead of the
 * person — costs them only the link, not the account.
 *
 * Always redirects, never returns JSON: whoever follows this is looking at a
 * mail client, and a page is the only useful answer.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const to = (status: string) => NextResponse.redirect(new URL(`/login?verify=${status}`, request.url));

  if (!token) return to("invalid");

  // Guessing a 256-bit token is not a real threat; hammering the endpoint is.
  const limit = await rateLimit(`verify:ip:${clientIp(request)}`, 20, 15 * 60);
  if (!limit.ok) return to("throttled");

  const result = await consumeVerificationToken(token);
  if (!result.ok) return to(result.reason);
  return to(result.alreadyVerified ? "already" : "done");
}
