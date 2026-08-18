import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { CHANGE_COOLDOWN_DAYS, HOLD_DAYS, canonicalUsername, validateUsername } from "./username";

export type ClaimFailure = { message: string; status: number };

/** Is this name free for this person right now? */
export async function checkAvailability(raw: string, forUserId?: string) {
  const check = validateUsername(raw);
  if (!check.ok) return { available: false as const, message: check.message };

  const [owner, hold] = await Promise.all([
    prisma.user.findFirst({
      where: { OR: [{ username: check.username }, { usernameCanonical: check.canonical }] },
      select: { id: true }
    }),
    prisma.usernameHold.findFirst({
      where: { OR: [{ username: check.username }, { canonical: check.canonical }] },
      select: { userId: true, heldUntil: true }
    })
  ]);

  if (owner && owner.id !== forUserId) return { available: false as const, message: "الاسم ده مأخوذ." };
  // A hold belongs to whoever released the name: they can always take it back,
  // which is the point of parking it rather than deleting it.
  if (hold && hold.heldUntil > new Date() && hold.userId !== forUserId) {
    return { available: false as const, message: "الاسم ده محجوز مؤقتًا." };
  }

  return { available: true as const, username: check.username, canonical: check.canonical };
}

/**
 * Assigns a username, enforcing the cooldown and parking whatever it replaces.
 * The uniqueness itself is left to the database: two people submitting the same
 * name in the same instant both pass any check we could run beforehand.
 */
export async function claimUsername(userId: string, raw: string): Promise<{ ok: true; username: string } | { ok: false } & ClaimFailure> {
  const check = validateUsername(raw);
  if (!check.ok) return { ok: false, message: check.message, status: 400 };

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, usernameChangedAt: true, isGuest: true }
  });

  if (user.isGuest) {
    return { ok: false, message: "لازم تعمل حساب دائم الأول.", status: 403 };
  }
  if (user.username === check.username) return { ok: true, username: check.username };

  if (user.username && user.usernameChangedAt) {
    const nextAllowed = new Date(user.usernameChangedAt.getTime() + CHANGE_COOLDOWN_DAYS * 86400_000);
    if (nextAllowed > new Date()) {
      const days = Math.ceil((nextAllowed.getTime() - Date.now()) / 86400_000);
      return { ok: false, message: `تقدر تغيّر الاسم كمان ${days} يوم.`, status: 429 };
    }
  }

  const availability = await checkAvailability(check.username, userId);
  if (!availability.available) return { ok: false, message: availability.message, status: 409 };

  const previous = user.username;

  try {
    await prisma.$transaction(async transaction => {
      // Taking back a name you parked releases your own hold on it.
      await transaction.usernameHold.deleteMany({
        where: { userId, OR: [{ username: check.username }, { canonical: check.canonical }] }
      });

      if (previous) {
        await transaction.usernameHold.create({
          data: {
            username: previous,
            canonical: canonicalUsername(previous),
            userId,
            heldUntil: new Date(Date.now() + HOLD_DAYS * 86400_000)
          }
        });
      }

      await transaction.user.update({
        where: { id: userId },
        data: {
          username: check.username,
          usernameCanonical: check.canonical,
          usernameChangedAt: new Date()
        }
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "الاسم ده اتأخد للتو. جرّب غيره.", status: 409 };
    }
    throw error;
  }

  return { ok: true, username: check.username };
}

/** Drops holds that have run out, so parked names come back into circulation. */
export function releaseExpiredHolds() {
  return prisma.usernameHold.deleteMany({ where: { heldUntil: { lte: new Date() } } });
}
