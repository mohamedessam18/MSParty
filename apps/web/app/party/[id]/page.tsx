import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PartyRoom } from "@/components/party-room";

export default async function PartyPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  // Guests have no email, so identity has to come from the session's user id.
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(`/login?next=/party/${params.id}/join`);

  const [user, party] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.party.findUnique({
      where: { id: params.id },
      include: { members: { include: { user: { select: { id: true, name: true, avatarUrl: true, isGuest: true } } } } }
    })
  ]);

  if (!party || !user || !party.members.some(member => member.userId === user.id)) notFound();
  return <PartyRoom party={party} userId={user.id} />;
}
