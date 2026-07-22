"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Party = { id: string; name: string; contentType: string; host: { name: string }; _count: { members: number } };
type UserProfile = { id: string; name: string; email: string; avatarUrl: string | null };

const contentLabel: Record<string, string> = { youtube: "YouTube", upload: "فيديو مرفوع", streaming: "إكستنشن" };
const initials = (name: string) => name ? name.split(/\s+/).slice(0, 2).map(part => part[0]).join("") : "U";

export default function Dashboard() {
  const [parties, setParties] = useState<Party[]>([]);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [editName, setEditName] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  useEffect(() => {
    fetch("/api/parties")
      .then(res => res.ok ? res.json() : [])
      .then(setParties)
      .finally(() => setReady(true));

    fetch("/api/user/profile")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setUser(data);
          setEditName(data.name || "");
          setEditAvatarUrl(data.avatarUrl || null);
        }
      });
  }, []);

  function handleFileSelected(file: File | null) {
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setEditAvatarUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg("");
    try {
      let finalAvatarUrl = editAvatarUrl;

      if (avatarFile) {
        try {
          const signed = await fetch("/api/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: `avatar-${avatarFile.name}`, contentType: avatarFile.type || "image/jpeg", fileSize: avatarFile.size })
          });
          if (signed.ok) {
            const data = await signed.json();
            const upload = await fetch(data.uploadUrl, { method: "PUT", headers: { "Content-Type": avatarFile.type || "image/jpeg" }, body: avatarFile });
            if (upload.ok) {
              finalAvatarUrl = data.fileUrl;
            }
          }
        } catch {
          // fallback
        }
      }

      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, avatarUrl: finalAvatarUrl })
      });

      if (!res.ok) throw new Error("تعذر حفظ التعديلات.");
      const updated = await res.json();
      setUser(updated);
      setProfileMsg("تم حفظ التعديلات بنجاح!");
      setTimeout(() => {
        setShowProfileModal(false);
        setProfileMsg("");
      }, 1200);
    } catch (err: any) {
      setProfileMsg(err.message || "حدث خطأ أثناء الحفظ.");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-7 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link className="display text-xl font-bold" href="/">MS<span className="text-[#90e4ff]">Party</span></Link>
          <nav className="hidden items-center gap-4 text-xs sm:flex">
            <Link className="text-[#d6e4ff] hover:text-[#90e4ff]" href="/dashboard">بارتياتي</Link>
            <Link className="text-[#d6e4ff] hover:text-[#90e4ff]" href="/join">انضمام بكود</Link>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <Link className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-[#d6e4ff] hover:bg-white/5 sm:px-4 sm:py-2 text-sm" href="/join">ادخل بكود</Link>
          <Link className="rounded-full bg-[#90e4ff] px-4 py-2 text-sm font-bold text-[#10172b]" href="/party/create">اعمل بارتي</Link>
          {user && (
            <button
              onClick={() => { setShowProfileModal(true); setEditName(user.name); setEditAvatarUrl(user.avatarUrl); }}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-[#131d35] px-3 py-1.5 transition hover:border-[#90e4ff]/50"
              title="تعديل البروفايل"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#d4b7ff] to-[#90e4ff] text-[10px] font-bold text-[#10172b]">
                  {initials(user.name)}
                </span>
              )}
              <span className="text-xs font-semibold text-[#e8dcff] max-w-24 truncate">{user.name}</span>
            </button>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-full border border-[#ff7b8d]/30 bg-[#ff7b8d]/10 px-3 py-1.5 text-xs font-semibold text-[#ffd6dd] hover:bg-[#ff7b8d]/20"
            title="تسجيل الخروج"
          >
            خروج
          </button>
        </div>
      </header>

      <section className="mt-14">
        <p className="mono text-xs text-[#90e4ff]">YOUR NIGHTS</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h1 className="display text-4xl font-semibold">بارتياتي</h1>
          <p className="text-sm text-[#aab9d7]">مكان واحد لكل ليلة حلوة.</p>
        </div>
        <div className="mt-8 grid gap-3">
          {parties.map((party, index) => (
            <Link className="group flex items-center gap-4 rounded-[20px] border border-white/10 bg-[#131d35]/80 p-4 transition hover:-translate-y-0.5 hover:border-[#90e4ff]/50 hover:bg-[#192543] sm:p-5" href={`/party/${party.id}`} key={party.id}>
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl ${index % 2 ? "bg-[#d4b7ff] text-[#10172b]" : "bg-[#90e4ff] text-[#10172b]"}`}>
                {party.contentType === "youtube" ? "▶" : party.contentType === "upload" ? "▣" : "◌"}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-base">{party.name}</b>
                <span className="mt-1 block text-sm text-[#aab9d7]">{contentLabel[party.contentType]} · {party._count.members} معك · {party.host.name}</span>
              </span>
              <span className="text-[#90e4ff] transition group-hover:-translate-x-1">←</span>
            </Link>
          ))}
          {ready && !parties.length && (
            <div className="rounded-[24px] border border-dashed border-[#90e4ff]/30 bg-[#131d35]/45 p-9 text-center">
              <span className="text-3xl">◌</span>
              <h2 className="display mt-3 text-xl">مفيش سهرة لسه.</h2>
              <p className="mt-2 text-sm text-[#aab9d7]">اختار فيديو، وادعُ الناس اللي بتحب تتفرج معاهم.</p>
              <Link className="mt-5 inline-block rounded-full bg-[#90e4ff] px-5 py-2 text-sm font-bold text-[#10172b]" href="/party/create">اعمل أول بارتي</Link>
            </div>
          )}
        </div>
      </section>

      {/* Modal Profile Edit */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-white/15 bg-[#10172b] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="display text-xl font-bold">تعديل البروفايل</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-lg text-[#aab9d7] hover:text-white">✕</button>
            </div>

            <form onSubmit={saveProfile} className="mt-5 space-y-5">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  {editAvatarUrl ? (
                    <img src={editAvatarUrl} alt="Avatar" className="h-24 w-24 rounded-full border-2 border-[#90e4ff] object-cover shadow-lg" />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#90e4ff] bg-gradient-to-br from-[#d4b7ff] to-[#90e4ff] text-2xl font-bold text-[#10172b]">
                      {initials(editName)}
                    </div>
                  )}
                  <label className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#90e4ff] text-xs font-bold text-[#10172b] shadow-md hover:bg-white">
                    📷
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleFileSelected(e.target.files?.[0] || null)} />
                  </label>
                </div>
                <p className="text-xs text-[#aab9d7]">اضغط على الأيقونة لاختيار صورة شخصية جديدة</p>
              </div>

              <div>
                <label className="block text-xs text-[#cbd8f1]">اسمك في البارتي</label>
                <input
                  required
                  type="text"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0d1629] px-4 py-3 text-sm text-white focus:border-[#90e4ff] focus:outline-none"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                />
              </div>

              {profileMsg && <p className="text-center text-xs font-semibold text-[#90e4ff]">{profileMsg}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="flex-1 rounded-xl bg-[#90e4ff] py-3 text-sm font-bold text-[#10172b] transition hover:bg-[#cff4ff] disabled:opacity-50"
                >
                  {savingProfile ? "جارٍ الحفظ..." : "حفظ التعديلات"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="rounded-xl border border-white/15 px-4 py-3 text-sm text-[#cbd8f1] hover:bg-white/5"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
