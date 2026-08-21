import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { areFriends, normalizeUsername, sharedPartyCount } from "@/lib/friends";
import { ACTIVE_USER } from "@/lib/account-lifecycle";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, Kicker } from "@/components/ui/card";
import { Rule, Wordmark } from "@/components/ui/wordmark";

export default async function FriendProfile({ params }: { params: { username: string } }) {
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  if (!viewerId) redirect(`/login?next=/u/${params.username}`);

  // ACTIVE_USER is part of the lookup, so a page for an account in its grace
  // period is not found rather than found and empty.
  const target = await prisma.user.findFirst({
    where: { username: normalizeUsername(params.username), ...ACTIVE_USER },
    select: { id: true, name: true, username: true, avatarUrl: true, createdAt: true }
  });

  // Not found rather than forbidden for a stranger: a "forbidden" would confirm
  // the account exists to anyone guessing usernames.
  if (!target || !(await areFriends(viewerId, target.id))) notFound();

  const [shared, hosted] = await Promise.all([
    sharedPartyCount(viewerId, target.id),
    prisma.party.count({ where: { hostId: target.id } })
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-6">
      <header className="flex items-center justify-between">
        <Wordmark href="/dashboard" />
        <Link href="/profile">
          <Button variant="ghost" size="sm">
            ← بروفايلي
          </Button>
        </Link>
      </header>

      <section className="mt-12 flex flex-col items-center text-center">
        <Avatar name={target.name} src={target.avatarUrl} size="xl" ring />
        <h1 className="display mt-4 text-3xl text-ivory">{target.name}</h1>
        <p className="mono mt-1 text-sm text-gold">@{target.username}</p>
        <Rule className="mt-5 w-40" />
      </section>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <Card className="p-5 text-center">
          <b className="display block text-3xl text-gold">{shared}</b>
          <span className="mt-1 block text-xs text-ivory-dim">
            {target.id === viewerId ? "سهرات حضرتها" : "سهرات اتفرجتوا فيها سوا"}
          </span>
        </Card>
        <Card className="p-5 text-center">
          <b className="display block text-3xl text-gold">{hosted}</b>
          <span className="mt-1 block text-xs text-ivory-dim">سهرات استضافها</span>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <Kicker>عضو منذ</Kicker>
        <p className="mt-2 text-ivory">
          {new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "long" }).format(target.createdAt)}
        </p>
      </Card>

      <div className="mt-6 flex justify-center">
        <Link href="/party/create">
          <Button>اعمل سهرة وادعيه</Button>
        </Link>
      </div>
    </main>
  );
}
