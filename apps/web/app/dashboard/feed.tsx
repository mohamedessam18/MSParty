"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Kicker } from "@/components/ui/card";

type Person = { id: string; name: string; username: string | null; avatarUrl: string | null };
type Live = { id: string; name: string; isPlaying: boolean; members: number; host: Person };
type Invite = { id: string; party: { id: string; name: string; members: number }; from: Person };
type Party = { id: string; code: string; name: string; contentType: string; host: { name: string }; _count: { members: number } };
type Presence = { userId: string; online: boolean; partyId: string | null; partyName: string | null };

const contentIcon: Record<string, string> = { youtube: "▶", upload: "▣" };

export function Feed() {
  const [live, setLive] = useState<Live[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [friends, setFriends] = useState<Person[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [ready, setReady] = useState(false);
  const socket = useRef<Socket>();

  const load = useCallback(async () => {
    const response = await fetch("/api/feed");
    if (!response.ok) return setReady(true);
    const data = await response.json();
    setLive(data.live);
    setInvites(data.invites);
    setFriends(data.friends);
    setParties(data.parties);
    setReady(true);
  }, []);

  useEffect(() => {
    load();
    let active = true;
    fetch("/api/sync-token")
      .then(response => response.json())
      .then(({ token }) => {
        if (!active || !token) return;
        const client = io(process.env.NEXT_PUBLIC_SYNC_SERVER_URL || "http://localhost:4000", {
          auth: { userToken: token }
        });
        socket.current = client;
        client.on("connect", () => client.emit("friends:watch"));
        // A snapshot on connect, then deltas — presence changes too often to
        // belong in the HTTP payload.
        client.on("friends:presence", ({ friends: list }: { friends: Presence[] }) =>
          setPresence(Object.fromEntries(list.map(item => [item.userId, item])))
        );
        client.on("friend:presence", (item: Presence) =>
          setPresence(map => ({ ...map, [item.userId]: item }))
        );
        // A friend opening a room should appear without a refresh.
        client.on("notification", load);
      });
    return () => {
      active = false;
      socket.current?.disconnect();
    };
  }, [load]);

  const onlineFriends = friends.filter(friend => presence[friend.id]?.online);

  return (
    <div className="mt-10 space-y-8">
      {!!invites.length && (
        <section>
          <Kicker>دعوات وصلتك</Kicker>
          <div className="mt-3 space-y-2">
            {invites.map(invite => (
              <Card key={invite.id} className="flex flex-wrap items-center gap-3 border-gold/30 bg-gold/[.05] p-4">
                <Avatar name={invite.from.name} src={invite.from.avatarUrl} />
                <span className="min-w-0 flex-1 text-sm text-ivory">
                  <b className="text-gold">{invite.from.name}</b> دعاك لـ «{invite.party.name}»
                </span>
                <Link href={`/party/${invite.party.id}/join`}>
                  <Button size="sm">ادخل</Button>
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <Kicker>شغّال دلوقتي</Kicker>
        <div className="mt-3 space-y-2">
          {live.map(party => (
            <Card key={party.id} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar name={party.host.name} src={party.host.avatarUrl} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-ivory">{party.name}</b>
                <span className="text-xs text-ivory-dim">
                  {party.host.name} · {party.members} في الروم
                  {party.isPlaying && <span className="mr-1.5 text-curtain">● بيتفرجوا</span>}
                </span>
              </span>
              <Link href={`/party/${party.id}/join`}>
                <Button size="sm">انضم</Button>
              </Link>
            </Card>
          ))}
          {ready && !live.length && (
            <EmptyState icon="◌" title="مفيش حد من أصحابك فاتح سهرة.">
              لما صاحبك يفتح سهرة لأصدقائه، هتلاقيها هنا من غير ما تسأل على كود.
            </EmptyState>
          )}
        </div>
      </section>

      {!!friends.length && (
        <section>
          <Kicker>أصدقائي · {onlineFriends.length} متصل</Kicker>
          <div className="mt-3 flex flex-wrap gap-3">
            {friends.map(friend => {
              const state = presence[friend.id];
              return (
                <Link
                  key={friend.id}
                  href={friend.username ? `/u/${friend.username}` : "/profile"}
                  className="flex w-20 flex-col items-center"
                  title={state?.partyName ? `في «${state.partyName}»` : state?.online ? "متصل" : "مش متصل"}
                >
                  <span className="relative">
                    <Avatar name={friend.name} src={friend.avatarUrl} size="lg" className={state?.online ? "" : "opacity-40"} />
                    {state?.online && (
                      <span
                        className={`absolute -bottom-0.5 -left-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink ${
                          state.partyId ? "animate-soft-pulse bg-curtain" : "bg-gold"
                        }`}
                      />
                    )}
                  </span>
                  <small className="mt-1 w-full truncate text-center text-[11px] text-ivory-dim">{friend.name}</small>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <Kicker>سهراتي</Kicker>
        <div className="mt-3 grid gap-3">
          {parties.map(party => (
            <Link
              key={party.id}
              href={`/party/${party.id}`}
              className="group flex items-center gap-4 rounded-lg border border-velvet-hi bg-velvet/60 p-4 transition hover:border-gold/50 hover:bg-velvet"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-gold/30 bg-gold/10 text-lg text-gold">
                {contentIcon[party.contentType] ?? "◌"}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-base text-ivory">{party.name}</b>
                <span className="mt-1 block text-sm text-ivory-dim">
                  {party._count.members} معك · {party.host.name}
                </span>
              </span>
              <span className="mono hidden shrink-0 rounded border border-velvet-hi px-2 py-1 text-xs tracking-widest text-gold sm:block">
                {party.code}
              </span>
              <span aria-hidden className="text-gold transition group-hover:-translate-x-1">
                ←
              </span>
            </Link>
          ))}
          {ready && !parties.length && (
            <EmptyState
              icon="◌"
              title="مفيش سهرة لسه."
              action={
                <Link href="/party/create">
                  <Button>اعمل أول بارتي</Button>
                </Link>
              }
            >
              اختار فيديو، وادعُ اللي بتحب تتفرج معاهم.
            </EmptyState>
          )}
        </div>
      </section>
    </div>
  );
}
