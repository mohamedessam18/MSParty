import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { GRACE_DAYS, cancelDeletion, confirmIdentity, deletionState, scheduleDeletion } from "@/lib/account-deletion";
import { rateLimit, releaseAttempt, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Reads directly rather than through requireDbUser, which refuses an account
 * that is on its way out — the whole point of these routes is to be reachable
 * by exactly that account.
 */
async function caller() {
  const { id } = await requireUser();
  return prisma.user.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      invisible: true,
      passwordHash: true,
      isGuest: true,
      deletionRequestedAt: true
    }
  });
}

/** Where this account stands. */
export async function GET() {
  try {
    const user = await caller();
    return NextResponse.json({
      graceDays: GRACE_DAYS,
      // Tells the confirmation dialog what to ask for. Guests have no password.
      confirmWith: user.passwordHash ? "password" : "name",
      name: user.name,
      deletion: deletionState(user.deletionRequestedAt)
    });
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
}

/** Schedules erasure. */
export async function POST(request: Request) {
  let user;
  try {
    user = await caller();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (user.deletionRequestedAt) {
    return NextResponse.json({ deletion: deletionState(user.deletionRequestedAt) });
  }

  // The confirmation is a password prompt, so it can be guessed at like one —
  // and this is the prompt whose reward is deleting the account. Keyed by user
  // rather than by address: the attacker here is someone holding an unlocked
  // phone, and they are on the owner's own network.
  const attemptKey = `deletion:user:${user.id}`;
  const limit = await rateLimit(attemptKey, 5, 15 * 60);
  if (!limit.ok) return tooManyRequests(limit, "محاولات كتير. استنى شوية وجرّب تاني.");

  const { confirm } = await request.json().catch(() => ({ confirm: "" }));
  if (!(await confirmIdentity(user, confirm))) {
    return NextResponse.json(
      { message: user.passwordHash ? "كلمة المرور مش مظبوطة." : "اكتب اسمك زي ما هو بالظبط." },
      { status: 403 }
    );
  }
  await releaseAttempt(attemptKey);

  const { deletionRequestedAt } = await scheduleDeletion(user);
  return NextResponse.json({ deletion: deletionState(deletionRequestedAt) });
}

/**
 * Takes it back, for a session that was already open when the deletion was
 * scheduled from somewhere else. The signed-out path is /api/account/restore,
 * which has no session to work from and uses a ticket instead.
 */
export async function DELETE() {
  try {
    const user = await caller();
    if (user.deletionRequestedAt) await cancelDeletion(user.id);
    return NextResponse.json({ deletion: null });
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
}
