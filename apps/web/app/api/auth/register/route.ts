import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
  const { email, password, name } = await request.json();
  if (!email || !password || !name || password.length < 8) {
    return NextResponse.json({ message: "Invalid registration details" }, { status: 400 });
  }
  try {
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash: await bcrypt.hash(password, 12)
      }
    });
    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ message: "Email already registered" }, { status: 409 });
  }
}

