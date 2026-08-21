import { siteUrl } from "./mail";

/**
 * The mails this app sends, as one small set of Arabic RTL templates.
 *
 * Inline styles only, and a table for the button: mail clients strip <style>
 * blocks, ignore most modern CSS, and Outlook renders a styled <a> as plain
 * text. What survives everywhere is 2003-era HTML, so that is what is written.
 */
const INK = "#140a0d";
const VELVET = "#2d1418";
const GOLD = "#c9a227";
const IVORY = "#f2e8d5";
const DIM = "#a89684";

function layout(title: string, body: string) {
  return `<!doctype html>
<html dir="rtl" lang="ar"><body style="margin:0;padding:24px;background:${INK};font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;color:${IVORY}">
  <div style="max-width:520px;margin:0 auto;background:${VELVET};border:1px solid #3d1c22;border-radius:8px;padding:28px">
    <div style="color:${GOLD};font-size:12px;letter-spacing:2px;text-transform:uppercase">MSParty</div>
    <h1 style="margin:12px 0 0;font-size:22px;color:${IVORY}">${title}</h1>
    <div style="margin-top:16px;font-size:15px;line-height:1.9;color:${IVORY}">${body}</div>
    <p style="margin-top:28px;font-size:12px;line-height:1.8;color:${DIM}">
      لو مش إنت اللي طلبت ده، تجاهل الرسالة دي.
    </p>
  </div>
</body></html>`;
}

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr>
    <td style="background:${GOLD};border-radius:4px">
      <a href="${href}" style="display:inline-block;padding:12px 22px;color:${INK};font-weight:bold;text-decoration:none;font-size:15px">${label}</a>
    </td></tr></table>
    <p style="font-size:12px;color:${DIM};word-break:break-all">أو افتح الرابط ده: ${href}</p>`;
}

export function verifyEmailTemplate(name: string, token: string) {
  const href = `${siteUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: "أكّد بريدك في MSParty",
    html: layout(
      `أهلاً ${escapeHtml(name)} 👋`,
      `<p style="margin:0">فاضل خطوة واحدة: أكّد إن البريد ده بتاعك عشان نقدر نوصلك لو حصل حاجة في حسابك.</p>
       ${button(href, "أكّد البريد")}
       <p style="margin:0;font-size:13px;color:${DIM}">الرابط بيقف بعد 24 ساعة.</p>`
    )
  };
}

export function deletionScheduledTemplate(name: string, daysLeft: number, erasesAt: Date) {
  const href = `${siteUrl()}/login`;
  return {
    subject: "حسابك في MSParty متجدول للحذف",
    html: layout(
      `اتسجّل طلب حذف حسابك`,
      `<p style="margin:0">أهلاً ${escapeHtml(name)}، حسابك اتخفى من دلوقتي، وهيتمسح نهائيًا يوم
       <b>${formatDate(erasesAt)}</b> — يعني فاضل <b>${daysLeft} يوم</b>.</p>
       <p style="margin:14px 0 0">لو غيّرت رأيك، سجّل الدخول في أي وقت قبل الميعاد ده وهنسألك لو عايز ترجّعه.</p>
       ${button(href, "رجّع حسابي")}`
    )
  };
}

export function deletionReminderTemplate(name: string, daysLeft: number, erasesAt: Date) {
  const href = `${siteUrl()}/login`;
  return {
    subject: `فاضل ${daysLeft} يوم على حذف حسابك في MSParty`,
    html: layout(
      "آخر فرصة ترجّع حسابك",
      `<p style="margin:0">أهلاً ${escapeHtml(name)}، حسابك هيتمسح نهائيًا يوم <b>${formatDate(erasesAt)}</b>.</p>
       <p style="margin:14px 0 0">بعد الميعاد ده مش هينفع نرجّعه — سهراتك وفيديوهاتك وصورك بيتمسحوا خلاص.</p>
       ${button(href, "رجّع حسابي دلوقتي")}`
    )
  };
}

export function deletionDoneTemplate(name: string) {
  return {
    subject: "اتمسح حسابك في MSParty",
    html: layout(
      "تم الحذف",
      `<p style="margin:0">أهلاً ${escapeHtml(name)}، حسابك وكل اللي عليه اتمسحوا نهائيًا زي ما طلبت.</p>
       <p style="margin:14px 0 0">شكرًا إنك كنت معانا. لو حبيت ترجع في أي وقت، تقدر تعمل حساب جديد من الأول.</p>`
    )
  };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

/** A name goes straight into the markup, so it cannot be allowed to be markup. */
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!
  );
}
