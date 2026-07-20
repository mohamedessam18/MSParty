import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PartyRoom } from "@/components/party-room";
export default async function PartyPage({ params }: { params: { id: string } }) { const session = await getServerSession(authOptions); if (!session?.user?.email) redirect("/login"); const user = await prisma.user.findUnique({ where: { email: session.user.email } }); const party = await prisma.party.findUnique({ where: { id: params.id }, include: { members: { include: { user: { select: { id: true, name: true } } } } } }); if (!party || !user || !party.members.some(member => member.userId === user.id)) notFound(); return <PartyRoom party={party} userId={user.id} />; }
