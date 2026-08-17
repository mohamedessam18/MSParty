import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("UNAUTHORIZED");
  return session.user;
}

/** The session carries an email; most routes need the actual row. */
export async function requireDbUser() {
  const sessionUser = await requireUser();
  return prisma.user.findUniqueOrThrow({ where: { email: sessionUser.email! } });
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
