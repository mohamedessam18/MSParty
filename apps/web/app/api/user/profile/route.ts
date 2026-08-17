import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

// Per-user response; never let it sit in a shared cache.
export const dynamic = "force-dynamic";

const SELECT = { id: true, name: true, email: true, avatarUrl: true, isGuest: true } as const;

export async function GET() {
  try {
    const { id } = await requireUser();
    const user = await prisma.user.findUnique({ where: { id }, select: SELECT });
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { id } = await requireUser();
    const { name, avatarUrl } = await request.json();

    const data: { name?: string; avatarUrl?: string | null } = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim().slice(0, 50);

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

    const updated = await prisma.user.update({ where: { id }, data, select: SELECT });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ message: "Unable to update profile" }, { status: 500 });
  }
}
