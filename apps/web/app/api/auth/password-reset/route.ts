import { NextResponse } from "next/server";
import { completePasswordReset, requestPasswordReset } from "@/lib/account-recovery";
import { normalizeEmail } from "@/lib/password";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Asks for a reset link.
 *
 * Always answers the same thing. Whether an address has an account here is not
 * this endpoint's to disclose, and a different response — or a noticeably
 * different response *time* — is a disclosure.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(`reset:ip:${clientIp(request)}`, 10, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit, "محاولات كتير. استنى شوية.");

  const { email } = await request.json().catch(() => ({}));
  const address = normalizeEmail(email);

  if (address) {
    // Per address as well, so one mailbox cannot be buried under reset mail by
    // somebody who merely knows it exists.
    const perAddress = await rateLimit(`reset:email:${address}`, 5, 60 * 60);
    if (perAddress.ok) await requestPasswordReset(address).catch(() => undefined);
  }

  return NextResponse.json({ sent: true });
}

/** Spends the link and sets the new password. */
export async function PUT(request: Request) {
  const limit = await rateLimit(`reset-confirm:ip:${clientIp(request)}`, 20, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit, "محاولات كتير. استنى شوية.");

  const { token, password } = await request.json().catch(() => ({}));
  const result = await completePasswordReset(String(token ?? ""), String(password ?? ""));
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.reason === "weak" ? 400 : 410 });

  return NextResponse.json({ ok: true });
}
