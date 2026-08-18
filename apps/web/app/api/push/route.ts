import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

/** Registers this browser. Re-subscribing just refreshes the existing row. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { endpoint, keys } = await request.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ message: "اشتراك غير صالح." }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    // The endpoint is the identity. Re-registering on a shared device has to
    // move the row to whoever is signed in now, not leave it with the last user.
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, lastUsedAt: new Date() },
    create: {
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: request.headers.get("user-agent")?.slice(0, 200)
    }
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Removes this browser, when the user turns device notifications off. */
export async function DELETE(request: Request) {
  try {
    await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { endpoint } = await request.json();
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return new NextResponse(null, { status: 204 });
}
