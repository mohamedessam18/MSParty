"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Kicker } from "@/components/ui/card";
import { FormError, Input } from "@/components/ui/input";

type Person = { id: string; name: string; username: string | null; avatarUrl: string | null };
type Edge = { id: string; user: Person };
type Book = { friends: Edge[]; incoming: Edge[]; outgoing: Edge[] };

export function FriendsPanel({ canUseFriends }: { canUseFriends: boolean }) {
  const [book, setBook] = useState<Book>({ friends: [], incoming: [], outgoing: [] });
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/friends");
    if (response.ok) setBook(await response.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر إرسال الطلب.");
      setUsername("");
      // Sending to someone who already asked you settles it immediately.
      setNotice(data.status === "accepted" ? "بقيتوا أصدقاء!" : "الطلب اتبعت.");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, method: "POST" | "DELETE") {
    await fetch(`/api/friends/${id}`, { method });
    load();
  }

  if (!canUseFriends) {
    return (
      <Card className="p-5">
        <Kicker>الأصدقاء</Kicker>
        <p className="mt-3 text-sm leading-7 text-ivory-dim">
          محتاج تختار اسم مستخدم الأول عشان أصحابك يلاقوك.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <Kicker>ضيف صاحب</Kicker>
        <form onSubmit={add} className="mt-3 flex gap-2">
          <Input
            dir="ltr"
            placeholder="@username"
            value={username}
            onChange={event => setUsername(event.target.value)}
            aria-label="اسم المستخدم"
          />
          <Button type="submit" disabled={busy || !username.trim()}>
            ابعت طلب
          </Button>
        </form>
        {error && <div className="mt-3"><FormError>{error}</FormError></div>}
        {notice && <p className="mt-3 text-sm text-gold">{notice}</p>}
      </Card>

      {!!book.incoming.length && (
        <Card className="p-5">
          <Kicker>طلبات وصلتك</Kicker>
          <div className="mt-3 space-y-2">
            {book.incoming.map(edge => (
              <Row key={edge.id} person={edge.user}>
                <Button size="sm" onClick={() => act(edge.id, "POST")}>
                  اقبل
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act(edge.id, "DELETE")}>
                  ارفض
                </Button>
              </Row>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <Kicker>أصدقائي · {book.friends.length}</Kicker>
        <div className="mt-3 space-y-2">
          {book.friends.map(edge => (
            <Row key={edge.id} person={edge.user}>
              {edge.user.username && (
                <Link href={`/u/${edge.user.username}`}>
                  <Button size="sm" variant="ghost">
                    البروفايل
                  </Button>
                </Link>
              )}
              <Button size="sm" variant="danger" onClick={() => act(edge.id, "DELETE")} title="شيله">
                ✕
              </Button>
            </Row>
          ))}
          {!book.friends.length && (
            <EmptyState icon="✦" title="مفيش أصدقاء لسه.">
              ابعت طلب باسم المستخدم بتاع صاحبك، ولما يقبل هتقدر تدعوه لأي سهرة بضغطة.
            </EmptyState>
          )}
        </div>
      </Card>

      {!!book.outgoing.length && (
        <Card className="p-5">
          <Kicker>طلبات مستنية الرد</Kicker>
          <div className="mt-3 space-y-2">
            {book.outgoing.map(edge => (
              <Row key={edge.id} person={edge.user}>
                <Button size="sm" variant="ghost" onClick={() => act(edge.id, "DELETE")}>
                  الغِ الطلب
                </Button>
              </Row>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ person, children }: { person: Person; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-velvet-hi/50 p-3">
      <Avatar name={person.name} src={person.avatarUrl} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm text-ivory">{person.name}</b>
        {person.username && <span className="mono text-xs text-ivory-dim">@{person.username}</span>}
      </span>
      <span className="flex shrink-0 gap-1">{children}</span>
    </div>
  );
}
