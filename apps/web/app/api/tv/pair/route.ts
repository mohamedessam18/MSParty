import { NextResponse } from "next/server";
import { createSyncToken } from "@/lib/sync-token";
import { createPairing, deviceBySecret, hashSecret, touchDevice } from "@/lib/tv-pairing";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Asks for a code. Called by a television with no account and nothing to prove,
 * so it is rate limited by address and by nothing else.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(`tvpair:ip:${clientIp(request)}`, 20, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit, "محاولات كتير. استنى شوية.");

  const pairing = await createPairing();
  return NextResponse.json(pairing, { status: 201 });
}

/**
 * What the television polls.
 *
 * Answers one of three things: nobody has claimed this code yet, the set is
 * paired but has not been pointed at a party, or here is a sync token and the
 * party to play. The token is short-lived and reissued on every poll, so the
 * set never has to store one — only the secret it was handed at pairing.
 */
export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (!secret) return NextResponse.json({ status: "unknown" }, { status: 400 });

  // Keyed by the credential rather than the address. Polling is a loop — a set
  // asking every three seconds is 1200 requests an hour, and that is the
  // intended behaviour — so limiting by address would throttle the third
  // television in a house before it ever slowed an attacker down.
  const limit = await rateLimit(`tvpoll:${hashSecret(secret)}`, 2000, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit, "");

  const device = await deviceBySecret(secret);
  // Gone means the code expired unclaimed, or the phone revoked the set. Either
  // way the answer is the same: this credential is not a television any more,
  // and the set should ask for a new code.
  if (!device || device.expiresAt <= new Date()) {
    return NextResponse.json({ status: "unknown" }, { status: 404 });
  }

  if (!device.userId || !device.user) {
    return NextResponse.json({ status: "waiting", code: device.code });
  }

  // The account left. The set is a credential for it, so it goes quiet too.
  if (device.user.deletionRequestedAt) {
    return NextResponse.json({ status: "unknown" }, { status: 404 });
  }

  await touchDevice(device.id).catch(() => undefined);

  if (!device.partyId || !device.party) {
    return NextResponse.json({ status: "idle", code: device.code, owner: device.user.name });
  }

  // Membership is checked here rather than trusted from the claim: the person
  // may have left the party since, and the socket would refuse the set anyway —
  // better to say so on screen than to spin on a connection that cannot open.
  const member = await prisma.partyMember.findUnique({
    where: { partyId_userId: { partyId: device.partyId, userId: device.userId } },
    select: { role: true }
  });
  if (!member) {
    return NextResponse.json({ status: "idle", code: device.code, owner: device.user.name });
  }

  return NextResponse.json({
    status: "ready",
    code: device.code,
    owner: device.user.name,
    // Scoped: a television watches. Whoever is holding the remote — or the
    // secret out of its local storage — cannot use it to control the room.
    token: await createSyncToken({ id: device.user.id, name: device.user.name }, "tv"),
    party: device.party
  });
}
