import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { HistoryList } from "@/components/history-list";
import { Kicker } from "@/components/ui/card";
import { Rule, Wordmark } from "@/components/ui/wordmark";
import { HISTORY_DAYS } from "@/lib/history";

export const metadata = { title: "اتفرجت عليه" };

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) redirect("/login?next=/history");

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-6">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link className="text-xs text-ivory-dim hover:text-ivory" href="/dashboard">
          ← لوحة التحكم
        </Link>
      </header>

      <section className="mt-10">
        <Kicker>السجل</Kicker>
        <h1 className="display mt-2 text-4xl text-ivory">اللي اتفرجت عليه.</h1>
        <Rule className="mt-4 max-w-xs" />
        <p className="mt-4 text-sm leading-7 text-ivory-dim">
          كل سهرة دخلتها بتتسجّل هنا وتفضل {HISTORY_DAYS} يوم، حتى لو البارتي نفسه اتمسح. تقدر تشيل أي حاجة بنفسك.
        </p>
      </section>

      <div className="mt-8">
        <HistoryList />
      </div>
    </main>
  );
}
