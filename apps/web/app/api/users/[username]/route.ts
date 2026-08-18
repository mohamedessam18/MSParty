import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { areFriends, normalizeUsername, sharedPartyCount } from "@/lib/friends";

export const dynamic = "force-dynamic";

/** A friend's profile. Visible to friends only, and to yourself. */
export async function GET(_: Request, { params }: { params: { username: string } }) {
  let viewer;
  try {
    viewer = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const target = await prisma.user.findUnique({
    where: { username: normalizeUsername(params.username) },
    select: { id: true, name: true, username: true, avatarUrl: true, createdAt: true }
  });
  if (!target) return NextResponse.json({ message: "مفيش حد بالاسم ده." }, { status: 404 });

  // Answer 404 rather than 403 for a stranger: "forbidden" would confirm the
  // account exists to anyone guessing usernames.
  if (!(await areFriends(viewer.id, target.id))) {
    return NextResponse.json({ message: "مفيش حد بالاسم ده." }, { status: 404 });
  }

  const [shared, hosted] = await Promise.all([
    sharedPartyCount(viewer.id, target.id),
    prisma.party.count({ where: { hostId: target.id } })
  ]);

  return NextResponse.json({
    ...target,
    sharedParties: shared,
    hostedParties: hosted,
    isSelf: viewer.id === target.id
  });
}
