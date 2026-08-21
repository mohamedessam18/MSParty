import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAvailability } from "@/lib/username-claim";
import { canonicalUsername } from "@/lib/username";
import { checkPassword, normalizeEmail } from "@/lib/password";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/email-verification";
import { mailConfigured } from "@/lib/mail";

export const dynamic = "force-dynamic";

/** New accounts allowed from one address per hour. */
const SIGNUPS = 5;
const WINDOW_SECONDS = 60 * 60;

export async function POST(request: Request) {
  const limit = await rateLimit(`register:ip:${clientIp(request)}`, SIGNUPS, WINDOW_SECONDS);
  if (!limit.ok) return tooManyRequests(limit, "حسابات كتير من نفس الجهاز. استنى شوية.");

  const { email: rawEmail, password, name: rawName, username } = await request.json().catch(() => ({}));

  const email = normalizeEmail(rawEmail);
  const name = String(rawName ?? "").trim().slice(0, 50);
  if (!email) return NextResponse.json({ message: "البريد الإلكتروني مش مظبوط." }, { status: 400 });
  if (!name) return NextResponse.json({ message: "اكتب اسمك." }, { status: 400 });

  const strength = checkPassword(String(password ?? ""), { email, name });
  if (!strength.ok) return NextResponse.json({ message: strength.message }, { status: 400 });

  // Chosen at registration so every account is findable from its first day;
  // an optional field here is one most people never come back to fill in.
  const claim = await checkAvailability(String(username || ""));
  if (!claim.available) return NextResponse.json({ message: claim.message }, { status: 409 });

  try {
    const user = await prisma.user.create({
      data: {
        email,
        name,
        username: claim.username,
        usernameCanonical: canonicalUsername(claim.username),
        passwordHash: await bcrypt.hash(String(password), 12)
      }
    });

    // After the account exists, and allowed to fail: an address that cannot be
    // mailed today is still an address, and the account works without it. With
    // no mail provider configured this does nothing at all — see lib/mail.ts.
    await sendVerificationEmail({ name: user.name, email }).catch(() => undefined);

    return NextResponse.json({ id: user.id, verificationSent: mailConfigured() }, { status: 201 });
  } catch (error) {
    // Deliberately one message for both collisions. Saying which one was taken
    // turns this endpoint into a way to ask "does this person have an account
    // here", which for an app people leave to get away from someone matters.
    console.error("Registration error:", error);
    return NextResponse.json({ message: "البريد أو اسم المستخدم مستخدم بالفعل." }, { status: 409 });
  }
}
