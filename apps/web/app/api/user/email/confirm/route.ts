import { NextResponse } from "next/server";
import { completeEmailChange } from "@/lib/account-recovery";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The far end of the address-change mail. A GET that changes state, because it
 * is reached by clicking a link in an email and there is nothing else it could
 * be; the token is single use and expires.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const to = (status: string) => NextResponse.redirect(new URL(`/profile?email=${status}`, request.url));

  if (!token) return to("invalid");
  const limit = await rateLimit(`email-confirm:ip:${clientIp(request)}`, 20, 15 * 60);
  if (!limit.ok) return to("throttled");

  const result = await completeEmailChange(token);
  return to(result.ok ? "changed" : result.reason);
}
