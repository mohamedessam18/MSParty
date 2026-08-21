import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { deleteR2Object, storageKeyFrom } from "@/lib/r2";
import { claimUsername } from "@/lib/username-claim";
import { authError } from "@/lib/api-errors";

// Per-user response; never let it sit in a shared cache.
export const dynamic = "force-dynamic";

const SELECT = { id: true, name: true, email: true, avatarUrl: true, isGuest: true, username: true, createdAt: true } as const;

export async function GET() {
  try {
    // requireDbUser, not requireUser: it is what enforces a revoked session and
    // a departing account, and it loads the row this route needs anyway.
    const { id } = await requireDbUser();
    const user = await prisma.user.findUnique({ where: { id }, select: SELECT });
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });
    return NextResponse.json(user);
  } catch (error) {
    return authError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { id } = await requireDbUser();
    const { name, avatarUrl, username } = await request.json();

    const data: { name?: string; avatarUrl?: string | null } = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim().slice(0, 50);

    if (username !== undefined && String(username).trim()) {
      // Claiming carries the cooldown and the hold on the old name, so it runs
      // as its own step rather than as a field on the update below.
      const claim = await claimUsername(id, String(username));
      if (!claim.ok) return NextResponse.json({ message: claim.message }, { status: claim.status });
    }

    if (avatarUrl !== undefined) {
      // Reject data: URIs outright. A failed upload used to fall back to an
      // inline base64 image, which put megabytes into this column and then
      // re-sent them with every chat message.
      const isStorableUrl =
        typeof avatarUrl === "string" && /^https?:\/\//.test(avatarUrl) && avatarUrl.length <= 512;
      if (avatarUrl !== null && !isStorableUrl) {
        return NextResponse.json({ message: "رابط الصورة غير صالح." }, { status: 400 });
      }
      data.avatarUrl = isStorableUrl ? avatarUrl : null;
    }

    const previous = data.avatarUrl !== undefined
      ? (await prisma.user.findUnique({ where: { id }, select: { avatarUrl: true } }))?.avatarUrl
      : null;

    const updated = await prisma.user.update({ where: { id }, data, select: SELECT });

    // Replaced avatars have no cleanup row of their own, so without this every
    // change leaves the old image in the bucket permanently. Scoped to this
    // user's own avatar folder — see storageKeyFrom.
    if (previous && previous !== updated.avatarUrl) {
      const key = storageKeyFrom(previous, `avatars/${id}/`);
      if (key) await deleteR2Object(key).catch(() => undefined);
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ message: "Unable to update profile" }, { status: 500 });
  }
}
