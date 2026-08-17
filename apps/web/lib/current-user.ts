import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

/**
 * Identity comes from the session's user id, not its email. Guests have no
 * email at all, and the id is what every table actually keys on.
 */
export async function requireUser() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new Error("UNAUTHORIZED");
  return { id, ...session!.user };
}

export async function requireDbUser() {
  const { id } = await requireUser();
  return prisma.user.findUniqueOrThrow({ where: { id } });
}

/**
 * Being signed in is not the same as belonging to a party. The socket server
 * already checks this on every event (memberFor); the REST routes need it too,
 * otherwise any account with a party id can read its chat and content URL.
 */
export async function requireMembership(partyId: string) {
  const user = await requireDbUser();
  const member = await prisma.partyMember.findUnique({
    where: { partyId_userId: { partyId, userId: user.id } }
  });
  if (!member) throw new Error("FORBIDDEN");
  return { user, member };
}
