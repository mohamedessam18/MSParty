import Link from "next/link";
import { Kicker } from "@/components/ui/card";
import { Rule, Wordmark } from "@/components/ui/wordmark";

export const metadata = {
  title: "سياسة الخصوصية",
  description: "إيه اللي MSParty بيحفظه، وإيه اللي إضافة المتصفح بتعمله بالظبط."
};

/**
 * Required before the Chrome Web Store will accept an extension that asks for
 * host permissions, and it has to be reachable without signing in — the
 * reviewer is not a user of ours.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="display text-xl text-ivory">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-8 text-ivory-dim">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-6">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link className="text-xs text-ivory-dim hover:text-ivory" href="/">
          ← الرئيسية
        </Link>
      </header>

      <section className="mt-10">
        <Kicker>الخصوصية</Kicker>
        <h1 className="display mt-2 text-4xl text-ivory">إيه اللي بنحفظه.</h1>
        <Rule className="mt-4 max-w-xs" />
      </section>

      <Section title="إضافة المتصفح">
        <p>
          الإضافة بتشتغل على صفحات المنصات المدعومة بس (نتفليكس، شاهد، ديزني+، OSN+، برايم فيديو، Watch iT!، Viu)،
          وعلى موقع MSParty نفسه.
        </p>
        <p className="text-ivory">
          الإضافة <b>مابتقراش ومابتسجّلش ومابتنقلش</b> أي صورة أو صوت من الفيديو اللي بتتفرج عليه. مافيش في كودها حاجة
          تقدر تعمل ده.
        </p>
        <p>اللي بتعمله بالظبط:</p>
        <ul className="list-inside list-disc space-y-2">
          <li>بتقرا وبتغيّر <b>موضع التشغيل</b> (رقم بالثواني) وحالة تشغيل/إيقاف، عشان الكل يبقى على نفس اللحظة.</li>
          <li>بتحط لوحة الشات بتاعت MSParty في إطار جانب الصفحة. اللوحة دي من سيرفرنا، مش من المنصة.</li>
          <li>
            بتحفظ في متصفحك بس: رقم السهرة، ورمز جلسة مؤقت. الاتنين بيتمسحوا لما تدوس «اقطع الاتصال» أو تشيل الإضافة.
          </li>
        </ul>
        <p>
          الإضافة مابتشوفش كلمة سرك على أي منصة، ومابتتعاملش مع حسابك عندهم. كل واحد بيتفرج باشتراكه هو، والإضافة
          مابتشارك ولا بتنقل المحتوى بين الناس.
        </p>
      </Section>

      <Section title="الموقع">
        <p>بنحفظ اللي محتاجينه عشان السهرة تشتغل: اسمك، اسم المستخدم، بريدك لو عملت حساب دائم، وصورة البروفايل لو رفعت واحدة.</p>
        <p>وكمان: السهرات اللي عملتها أو دخلتها، رسايل الشات فيها، والفيديوهات اللي رفعتها.</p>
        <p>
          سجل المشاهدة بيفضل ٩٠ يوم وبعدين بيتمسح لوحده، وتقدر تشيل أي حاجة منه بنفسك في أي وقت من صفحة{" "}
          <Link className="text-gold hover:underline" href="/history">
            السجل
          </Link>
          .
        </p>
      </Section>

      <Section title="الكاميرا والميكروفون">
        <p>
          الصوت والصورة بيتنقلوا <b className="text-ivory">مباشرة بين المتفرجين</b> عن طريق WebRTC. مابيعدّوش على
          سيرفراتنا ومابيتسجّلوش ولا بيتخزنوا في أي مكان.
        </p>
      </Section>

      <Section title="الإشعارات">
        <p>
          لو سمحت بإشعارات الجهاز، بنحفظ عنوان الاشتراك اللي متصفحك بيدّيه عشان نبعتلك. مابنستخدمهوش في أي حاجة تانية،
          وبيتمسح أول ما تلغي الإذن.
        </p>
      </Section>

      <Section title="مابنعملهوش">
        <ul className="list-inside list-disc space-y-2">
          <li>مابنبيعش بياناتك ولا بنشاركها مع معلنين</li>
          <li>مافيش تتبّع إعلاني ولا كوكيز طرف تالت</li>
          <li>مابنقراش ولا بنخزّن أي محتوى فيديو من المنصات</li>
        </ul>
      </Section>

      <Section title="حذف حسابك">
        <p>
          لو عايز تمسح حسابك وكل اللي عليه، ابعتلنا من نفس البريد المسجّل على{" "}
          <a className="text-gold hover:underline" href="mailto:mohvmedesam@gmail.com">
            mohvmedesam@gmail.com
          </a>{" "}
          وهنمسحه.
        </p>
      </Section>

      <p className="mt-12 border-t border-velvet-hi pt-6 text-xs text-ivory-dim">
        آخر تحديث: أغسطس 2026 · لو حاجة في الصفحة دي مش واضحة، اسأل على البريد فوق.
      </p>
    </main>
  );
}
