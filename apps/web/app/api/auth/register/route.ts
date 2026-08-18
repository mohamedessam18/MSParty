import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAvailability } from "@/lib/username-claim";
import { canonicalUsername } from "@/lib/username";
export async function POST(request: Request) {
  const { email, password, name, username } = await request.json();
  if (!email || !password || !name || password.length < 8) {
    return NextResponse.json({ message: "بيانات ناقصة أو كلمة مرور أقصر من 8 أحرف." }, { status: 400 });
  }

  // Chosen at registration so every account is findable from its first day;
  // an optional field here is one most people never come back to fill in.
  const claim = await checkAvailability(String(username || ""));
  if (!claim.available) return NextResponse.json({ message: claim.message }, { status: 409 });
  try {
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        username: claim.username,
        usernameCanonical: canonicalUsername(claim.username),
        passwordHash: await bcrypt.hash(password, 12)
      }
    });
    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ message: "البريد أو اسم المستخدم مستخدم بالفعل." }, { status: 409 });
  }
}

