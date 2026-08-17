"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/wordmark";

export default function JoinParty({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [me, setMe] = useState<{ name: string; email: string; avatarUrl: string | null } | null>(null);

  useEffect(() => {
    let active = true;

    // Show who the browser is already signed in as. Without this the app
    // silently reuses whatever session is on the device, so an invite link
    // opened on a friend's laptop joins as the friend with no hint that it did.
    fetch("/api/user/profile")
      .then(response => (response.ok ? response.json() : null))
      .then(data => active && data && setMe(data));

    fetch(`/api/parties/${params.id}/join`, { method: "POST" })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "سجّل دخولك أولًا للانضمام إلى البارتي.");
        if (active) router.replace(`/party/${params.id}`);
      })
      .catch(err => active && setError(err.message));

    return () => {
      active = false;
    };
  }, [params.id, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Wordmark className="mb-8 self-start" />
      <Card className="p-8 text-center shadow-lift">
        {error ? (
          <>
            <span aria-hidden className="text-3xl">
              🚪
            </span>
            <h1 className="display mt-3 text-2xl text-ivory">مش قادرين ندخّلك</h1>
            <p className="mt-2 text-sm leading-7 text-ivory-dim">{error}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Link href="/login">
                <Button>سجّل دخول</Button>
              </Link>
              <Link href="/join">
                <Button variant="ghost">ادخل بكود</Button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <p aria-live="polite" className="text-ivory-dim">
              <span className="animate-soft-pulse inline-block">جارٍ حجز مكانك في السهرة...</span>
            </p>
            {me && (
              <div className="mt-6 border-t border-velvet-hi pt-5">
                <div className="flex items-center justify-center gap-2">
                  <Avatar name={me.name} src={me.avatarUrl} size="sm" />
                  <span className="text-sm text-ivory">
                    داخل باسم <b className="text-gold">{me.name}</b>
                  </span>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: `/login?next=/party/${params.id}/join` })}
                  className="mt-2 text-xs text-ivory-dim underline hover:text-ivory"
                >
                  مش إنت؟ ادخل بحساب تاني
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </main>
  );
}
