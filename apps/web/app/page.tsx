import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Kicker } from "@/components/ui/card";
import { Rule, Wordmark } from "@/components/ui/wordmark";

const steps = [
  { number: "01", title: "الهوست يفتح السهرة", copy: "يختار فيديو YouTube أو يرفع واحد، وياخد مكانه قدام الشاشة." },
  { number: "02", title: "صحابك يدخلوا", copy: "بكود من ٦ حروف أو برابط — كل واحد يظهر في صف المقاعد." },
  { number: "03", title: "تتفرجوا في نفس اللحظة", copy: "الهوست بس اللي يتحكم، والباقي يعيشوا الفيلم سوا." }
];

function Header() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
      <Wordmark />
      <nav className="flex items-center gap-2 sm:gap-3">
        <Link href="/join" className="px-2 text-sm text-ivory-dim transition hover:text-ivory">
          ادخل بكود
        </Link>
        <Link href="/login">
          <Button variant="ghost" size="sm">
            تسجيل الدخول
          </Button>
        </Link>
      </nav>
    </header>
  );
}

function ScreenPreview() {
  return (
    <div className="marquee-frame mx-auto w-full max-w-lg">
      <div className="relative aspect-video overflow-hidden border border-gold/25 bg-gradient-to-b from-velvet to-ink-deep">
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 text-xs">
          <span className="rounded border border-gold/25 bg-ink/70 px-2.5 py-1.5 text-gold">ليلة فيلم الجمعة</span>
          <span className="mono flex items-center gap-1.5 rounded bg-curtain/20 px-2.5 py-1.5 text-curtain">
            <i className="animate-soft-pulse h-1.5 w-1.5 rounded-full bg-curtain" />
            LIVE · 04
          </span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-2xl text-gold">
            ▶
          </span>
        </div>
      </div>
      {/* The seat row: the whole point of the product, shown as the poster's subject. */}
      <div className="-mt-4 flex justify-center gap-2 px-4">
        {[
          { label: "أنت · Host", tone: "bg-gold text-ink" },
          { label: "سارة", tone: "bg-ivory text-ink" },
          { label: "عمر", tone: "bg-velvet-hi text-ivory" }
        ].map(seat => (
          <span key={seat.label} className={`rounded border-2 border-ink px-2.5 py-1.5 text-xs font-bold ${seat.tone}`}>
            {seat.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-6 lg:grid-cols-[1.05fr_.95fr] lg:pt-12">
        <div>
          <div className="inline-flex items-center gap-2 rounded border border-gold/25 bg-gold/5 px-3 py-1.5 text-xs text-gold">
            <span className="animate-soft-pulse h-1.5 w-1.5 rounded-full bg-curtain" />
            السينما بتاعتكم، حتى لو بعيدين
          </div>
          <h1 className="display mt-6 text-5xl leading-tight text-ivory sm:text-6xl">
            مشاهدة واحدة.
            <br />
            <span className="text-gold">شلة كاملة.</span>
          </h1>
          <Rule className="mt-6 max-w-sm" />
          <p className="mt-6 max-w-xl text-lg leading-8 text-ivory-dim">
            MSParty يخلي كل واحد فيكم قدام شاشته، بس كأنكم قاعدين في نفس الصف. الهوست يقود العرض، وأنتم تعيشوا كل لحظة مع بعض.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/party/create">
              <Button size="lg">أنشئ بارتي</Button>
            </Link>
            <Link href="/join">
              <Button variant="ghost" size="lg">
                انضمام بكود
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-ivory-dim/70">عندك رابط؟ افتحه وادخل مباشرة.</p>
        </div>

        <ScreenPreview />
      </section>

      <section className="border-t border-velvet-hi bg-ink-deep/50">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <Kicker>إزاي بيحصل</Kicker>
          <h2 className="display mt-2 text-3xl text-ivory">ثلاث خطوات، ومفيش حد برا المشهد.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map(step => (
              <article key={step.number} className="rounded-lg border border-velvet-hi bg-velvet/60 p-5">
                <span className="mono text-xs tracking-[.2em] text-gold">{step.number}</span>
                <h3 className="display mt-4 text-lg text-ivory">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-ivory-dim">{step.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 py-10 text-center text-xs text-ivory-dim/60">
        MSParty — اتفرجوا سوا
      </footer>
    </main>
  );
}
