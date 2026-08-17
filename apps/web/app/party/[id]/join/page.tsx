"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/wordmark";

export default function JoinParty({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
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
          <p aria-live="polite" className="py-6 text-ivory-dim">
            <span className="animate-soft-pulse inline-block">جارٍ حجز مكانك في السهرة...</span>
          </p>
        )}
      </Card>
    </main>
  );
}
