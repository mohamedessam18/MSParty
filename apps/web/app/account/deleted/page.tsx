import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { GRACE_DAYS } from "@/lib/account-lifecycle";

export const metadata = { title: "اتجدول حذف حسابك" };

/**
 * Where leaving ends.
 *
 * A confirmation screen rather than a bounce to the landing page, because the
 * grace period is only useful to someone who knows it is there — and the moment
 * they are most likely to read it is the moment they just pressed the button.
 * Nothing here needs a session; by this point there isn't one.
 */
export default function AccountDeletedPage() {
  return (
    <AuthShell
      kicker="تم"
      title="حسابك اتخفى دلوقتي."
      lede={
        <>
          من اللحظة دي إنت مش ظاهر لحد: لا في قوايم الأصحاب، ولا في البحث، ولا في أي سهرة.
          وبعد <b className="text-ivory">{GRACE_DAYS} يوم</b> بيتمسح كل حاجة نهائيًا.
        </>
      }
    >
      <div className="rounded-lg border border-velvet-hi bg-ink-deep/60 p-4 text-sm leading-7 text-ivory-dim">
        غيّرت رأيك؟ سجّل الدخول بنفس البيانات في أي وقت خلال المدة دي، وهنسألك لو عايز ترجّع الحساب.
        بعد كده مفيش رجوع.
      </div>

      <div className="mt-6 space-y-2">
        <Link href="/login" className="block">
          <Button size="lg" variant="ghost" className="w-full">
            رجّع حسابي
          </Button>
        </Link>
        <Link href="/" className="block">
          <Button size="lg" variant="subtle" className="w-full">
            للصفحة الرئيسية
          </Button>
        </Link>
      </div>
    </AuthShell>
  );
}
