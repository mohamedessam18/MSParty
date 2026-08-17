import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

/**
 * Claims a guest account by attaching an email and password to the row that
 * already holds their memberships, messages, and queue votes. Upgrading in
 * place is the whole point: creating a second account would strand their
 * history behind the old one.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!user.isGuest) {
    return NextResponse.json({ message: "حسابك دائم بالفعل." }, { status: 400 });
  }

  const { email, password } = await request.json();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || String(password || "").length < 8) {
    return NextResponse.json({ message: "ادخل بريد صحيح وكلمة مرور من 8 أحرف على الأقل." }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { email: cleanEmail, passwordHash: await bcrypt.hash(password, 12), isGuest: false },
      select: { id: true, name: true, email: true, avatarUrl: true, isGuest: true }
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "البريد ده مستخدم بالفعل." }, { status: 409 });
    }
    return NextResponse.json({ message: "تعذر تحويل الحساب." }, { status: 500 });
  }
}
