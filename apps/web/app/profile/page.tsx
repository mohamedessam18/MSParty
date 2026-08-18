import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileClient } from "./profile-client";

export const metadata = { title: "البروفايل" };

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) redirect("/login?next=/profile");

  const [user, parties, hosted] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, username: true, avatarUrl: true, isGuest: true, createdAt: true }
    }),
    prisma.partyMember.count({ where: { userId: id } }),
    prisma.party.count({ where: { hostId: id } })
  ]);
  if (!user) redirect("/login");

  return (
    <ProfileClient
      initial={{ ...user, createdAt: user.createdAt.toISOString() }}
      stats={{ parties, hosted }}
    />
  );
}
