import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { authError } from "@/lib/api-errors";
import { checkPassword, normalizeEmail } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email-verification";

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
  } catch (error) {
    return authError(error);
  }

  if (!user.isGuest) {
    return NextResponse.json({ message: "حسابك دائم بالفعل." }, { status: 400 });
  }

  const { email, password } = await request.json();
  // The same address and password rules registration uses. A guest becoming a
  // permanent account is registration by another door, and a door with weaker
  // rules on it is the one an attacker uses.
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return NextResponse.json({ message: "البريد الإلكتروني مش مظبوط." }, { status: 400 });

  const strength = checkPassword(String(password ?? ""), { email: cleanEmail, name: user.name });
  if (!strength.ok) return NextResponse.json({ message: strength.message }, { status: 400 });

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { email: cleanEmail, passwordHash: await bcrypt.hash(password, 12), isGuest: false },
      select: { id: true, name: true, email: true, avatarUrl: true, isGuest: true }
    });
    await sendVerificationEmail({ name: updated.name, email: cleanEmail }).catch(() => undefined);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "البريد ده مستخدم بالفعل." }, { status: 409 });
    }
    return NextResponse.json({ message: "تعذر تحويل الحساب." }, { status: 500 });
  }
}
