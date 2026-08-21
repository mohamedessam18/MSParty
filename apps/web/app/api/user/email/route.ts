import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/current-user";
import { authError } from "@/lib/api-errors";
import { requestEmailChange } from "@/lib/account-recovery";
import { normalizeEmail } from "@/lib/password";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Starts an address change. Nothing moves until the new address is proven. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch (error) {
    return authError(error);
  }

  if (user.isGuest) {
    return NextResponse.json({ message: "لازم تعمل حساب دائم الأول." }, { status: 403 });
  }

  const limit = await rateLimit(`email-change:user:${user.id}`, 5, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit, "محاولات كتير. استنى شوية.");

  const { email } = await request.json().catch(() => ({}));
  const address = normalizeEmail(email);
  if (!address) return NextResponse.json({ message: "البريد الإلكتروني مش مظبوط." }, { status: 400 });
  if (address === user.email) return NextResponse.json({ message: "ده بريدك الحالي." }, { status: 400 });

  const result = await requestEmailChange(user, address);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 409 });

  return NextResponse.json({ sent: true, to: address });
}
