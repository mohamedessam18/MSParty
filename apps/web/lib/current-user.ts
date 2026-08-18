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

/**
 * The signed-in account, refusing one that is scheduled for erasure.
 *
 * "Hidden immediately" has to mean something: without this the account keeps
 * hosting, chatting and appearing in other people's rooms for a month after
 * being told it was gone. The deletion routes deliberately do not use this —
 * they are the only thing such an account still needs to reach.
 */
export async function requireDbUser() {
  const { id } = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (user.deletionRequestedAt) throw new Error("PENDING_DELETION");
  return user;
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
