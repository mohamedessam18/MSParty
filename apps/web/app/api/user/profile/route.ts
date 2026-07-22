import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export async function GET() {
  try {
    const sessionUser = await requireUser();
    const user = await prisma.user.findUnique({
      where: { email: sessionUser.email! },
      select: { id: true, name: true, email: true, avatarUrl: true }
    });
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireUser();
    const body = await request.json();
    const { name, avatarUrl } = body;

    const dataToUpdate: { name?: string; avatarUrl?: string | null } = {};
    if (typeof name === "string" && name.trim()) {
      dataToUpdate.name = name.trim().slice(0, 50);
    }
    if (avatarUrl !== undefined) {
      dataToUpdate.avatarUrl = typeof avatarUrl === "string" ? avatarUrl : null;
    }

    const updatedUser = await prisma.user.update({
      where: { email: sessionUser.email! },
      data: dataToUpdate,
      select: { id: true, name: true, email: true, avatarUrl: true }
    });

    return NextResponse.json(updatedUser);
  } catch {
    return NextResponse.json({ message: "Unable to update profile" }, { status: 500 });
  }
}
