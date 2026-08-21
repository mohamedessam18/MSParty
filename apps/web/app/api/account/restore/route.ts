import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelDeletion, deletionState } from "@/lib/account-deletion";
import { readRestoreTicket } from "@/lib/restore-ticket";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Brings an account back inside its grace period.
 *
 * Reached without a session, on purpose: sign-in for a departing account is
 * refused, so there is none to hold. What stands in for it is the ticket, which
 * is issued only at the moment such a sign-in succeeds and says nothing except
 * which account it was — see lib/restore-ticket.ts.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(`restore:ip:${clientIp(request)}`, 20, 15 * 60);
  if (!limit.ok) return tooManyRequests(limit, "محاولات كتير. استنى شوية.");

  const { ticket } = await request.json().catch(() => ({ ticket: "" }));
  const userId = await readRestoreTicket(ticket);
  if (!userId) {
    return NextResponse.json(
      { code: "TICKET_EXPIRED", message: "الرابط ده انتهت صلاحيته. سجّل الدخول تاني." },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, deletionRequestedAt: true }
  });
  // Gone means erased: the grace period ran out between the ticket being issued
  // and this request. There is nothing left to bring back, and saying so is
  // kinder than a generic failure.
  if (!user) {
    return NextResponse.json(
      { code: "ERASED", message: "الحساب ده اتمسح خلاص ومش هينفع يرجع." },
      { status: 410 }
    );
  }

  // Already restored — a second tab, or a link opened twice. Not an error.
  if (!user.deletionRequestedAt) return NextResponse.json({ restored: true, name: user.name });

  await cancelDeletion(user.id);
  return NextResponse.json({ restored: true, name: user.name });
}

/** What the restore screen shows before anyone presses anything. */
export async function GET(request: Request) {
  const userId = await readRestoreTicket(new URL(request.url).searchParams.get("t"));
  if (!userId) return NextResponse.json({ code: "TICKET_EXPIRED" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, avatarUrl: true, email: true, deletionRequestedAt: true }
  });
  if (!user) return NextResponse.json({ code: "ERASED" }, { status: 410 });

  return NextResponse.json({
    name: user.name,
    avatarUrl: user.avatarUrl,
    // Enough to recognise the account, not enough to be a way of reading
    // someone's address off a stolen ticket.
    emailHint: user.email ? maskEmail(user.email) : null,
    deletion: deletionState(user.deletionRequestedAt)
  });
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
