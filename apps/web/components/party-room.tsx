"use client";

import { io, Socket } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { YouTubePlayer, type PlayerHandle } from "./youtube-player";

type Party = { id: string; name: string; contentType: string; contentUrl: string | null; hostId: string; isPlaying: boolean; members: { role: string; user: { id: string; name: string; avatarUrl?: string | null } }[] };
type Message = { userId: string; name: string; message: string; sentAt: string; avatarUrl?: string | null };
const videoId = (url: string) => {
  if (!url) return "";
  const trimmed = url.trim();
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = trimmed.match(regExp);
  if (match && match[2].length === 11) return match[2];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return trimmed;
};
const initials = (name: string) => name ? name.split(/\s+/).slice(0, 2).map(part => part[0]).join("") : "U";

export function PartyRoom({ party, userId }: { party: Party; userId: string }) {
  const isHost = party.hostId === userId;
  const socket = useRef<Socket>();
  const player = useRef<PlayerHandle>();
  const uploadedPlayer = useRef<HTMLVideoElement>(null);
  const [members, setMembers] = useState(party.members);
  const [messages, setMessages] = useState<Message[]>([]);
  const [playing, setPlaying] = useState(party.isPlaying);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<"chat" | "people" | "ideas">("chat");
  const [message, setMessage] = useState("");
  const [idea, setIdea] = useState("");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [reaction, setReaction] = useState("");
  const [controlRequested, setControlRequested] = useState(false);
  const [request, setRequest] = useState("");
  const [copied, setCopied] = useState(false);
  const [contentType, setContentType] = useState(party.contentType);
  const [contentUrl, setContentUrl] = useState(party.contentUrl || "");
  const [replacementUrl, setReplacementUrl] = useState("");
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [changingVideo, setChangingVideo] = useState(false);
  const [changeProgress, setChangeProgress] = useState<number | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [ytError, setYtError] = useState<string | null>(null);
  const [userInteracted, setUserInteracted] = useState(false);
  const hostName = members.find(member => member.role === "host")?.user.name || "الهوست";

  const applyState = useCallback(({ isPlaying, timestamp, serverTime, contentType: incomingType, contentUrl: incomingUrl }: { isPlaying: boolean; timestamp: number; serverTime: number; contentType?: string; contentUrl?: string }) => {
    setPlaying(isPlaying);
    if (incomingType && incomingUrl) { setContentType(incomingType); setContentUrl(incomingUrl); setYtError(null); }
    if (isHost) return;
    const corrected = isPlaying ? timestamp + (Date.now() - serverTime) / 1000 : timestamp;
    if (uploadedPlayer.current) {
      const currentLocal = uploadedPlayer.current.currentTime || 0;
      if (Math.abs(currentLocal - corrected) > 2) {
        uploadedPlayer.current.currentTime = corrected;
      }
      isPlaying ? uploadedPlayer.current.play().catch(() => undefined) : uploadedPlayer.current.pause();
    }
    if (player.current) {
      const currentLocal = player.current.currentTime() || 0;
      if (Math.abs(currentLocal - corrected) > 2) {
        player.current.seekTo(corrected);
      }
      isPlaying ? player.current.play() : player.current.pause();
    }
  }, [isHost]);

  useEffect(() => {
    let active = true;
    fetch("/api/sync-token").then(response => response.json()).then(({ token }) => {
      if (!active || !token) return;
      const client = io(process.env.NEXT_PUBLIC_SYNC_SERVER_URL || "http://localhost:4000", { auth: { userToken: token } });
      socket.current = client;
      client.on("connect", () => { setConnected(true); client.emit("join-party", { partyId: party.id, userToken: token }); });
      client.on("disconnect", () => setConnected(false));
      client.on("sync:state", applyState);
      client.on("sync:heartbeat", applyState);
      client.on("chat:message", (entry: Message) => { setMessages(items => [...items, entry]); setTab("chat"); });
      client.on("party:memberJoined", (member) => setMembers(items => [...items, { role: "viewer", user: { id: member.userId, name: member.name, avatarUrl: member.avatarUrl } }]));
      client.on("party:memberLeft", ({ userId: leftUserId }) => setMembers(items => items.filter(member => member.user.id !== leftUserId)));
    });
    fetch(`/api/parties/${party.id}/messages`).then(response => response.ok ? response.json() : []).then(items => active && setMessages(items.map((item: any) => ({ userId: item.userId, name: item.user.name, message: item.message, sentAt: item.sentAt }))));
    return () => { active = false; socket.current?.disconnect(); };
  }, [party.id, applyState]);

  function control(type: "play" | "pause" | "seek", timestamp: number) { if (isHost) socket.current?.emit(`control:${type}`, { partyId: party.id, timestamp }); }
  function togglePlayback() { const timestamp = player.current?.currentTime() || uploadedPlayer.current?.currentTime || 0; if (playing) { player.current?.pause(); uploadedPlayer.current?.pause(); control("pause", timestamp); } else { player.current?.play(); uploadedPlayer.current?.play().catch(() => undefined); control("play", timestamp); } }
  function sendMessage(event: React.FormEvent) { event.preventDefault(); if (!message.trim()) return; socket.current?.emit("chat:send", { partyId: party.id, message }); setMessage(""); }
  async function invite() { await navigator.clipboard.writeText(`${window.location.origin}/party/${party.id}/join`); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
  function react(emoji: string) { setReaction(emoji); window.setTimeout(() => setReaction(""), 1800); }
  async function changeVideo(event: React.FormEvent) {
    event.preventDefault();
    setChangingVideo(true);
    setChangeProgress(null);
    setChangeError(null);
    setYtError(null);
    try {
      let nextType = replacementFile ? "upload" : "youtube";
      let nextUrl = replacementUrl;
      let uploadedVideoId: string | undefined;

      if (replacementFile) {
        const signed = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: replacementFile.name, contentType: replacementFile.type, fileSize: replacementFile.size })
        });
        if (!signed.ok) {
          const errData = await signed.json().catch(() => ({}));
          throw new Error(errData.message || "تعذر تجهيز الرفع. تأكد من إعدادات Cloudflare R2.");
        }
        const data = await signed.json();

        setChangeProgress(0);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", data.uploadUrl);
          xhr.setRequestHeader("Content-Type", replacementFile.type || "video/mp4");
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              const percent = Math.round((evt.loaded / evt.total) * 100);
              setChangeProgress(percent);
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error("رفع الفيديو لم يكتمل. تحقق من سياسة CORS في R2."));
          };
          xhr.onerror = () => reject(new Error("حدث خطأ في الشبكة أثناء رفع الفيديو."));
          xhr.send(replacementFile);
        });

        nextUrl = data.fileUrl;
        uploadedVideoId = data.videoId;
      }

      if (!nextUrl) return;

      socket.current?.emit("control:changeVideo", { partyId: party.id, contentType: nextType, contentUrl: nextUrl, uploadedVideoId });
      setReplacementUrl("");
      setReplacementFile(null);
    } catch (err: any) {
      setChangeError(err.message || "حدث خطأ أثناء رفع وتبديل الفيديو.");
    } finally {
      setChangingVideo(false);
      setChangeProgress(null);
    }
  }

  const [extractedStreamUrl, setExtractedStreamUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Extract stream URL whenever contentUrl changes if type is YouTube
  useEffect(() => {
    if (contentType !== "youtube" || !contentUrl) {
      setExtractedStreamUrl(null);
      return;
    }
    let active = true;
    setExtracting(true);
    fetch("/api/youtube-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: contentUrl })
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (active && data?.streamUrl) {
          setExtractedStreamUrl(data.streamUrl);
        }
      })
      .catch(() => undefined)
      .finally(() => { if (active) setExtracting(false); });
    return () => { active = false; };
  }, [contentType, contentUrl]);

  // Sync current time from uploaded video or HTML5 video
  useEffect(() => {
    const interval = setInterval(() => {
      if (uploadedPlayer.current) {
        setCurrentTime(uploadedPlayer.current.currentTime || 0);
        setDuration(uploadedPlayer.current.duration || 0);
      } else if (player.current) {
        setCurrentTime(player.current.currentTime() || 0);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  function handleSeekChange(newSec: number) {
    setCurrentTime(newSec);
    if (uploadedPlayer.current) uploadedPlayer.current.currentTime = newSec;
    player.current?.seekTo(newSec);
    control("seek", newSec);
  }

  function formatTime(sec: number) {
    if (!sec || isNaN(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  return <main className="min-h-screen overflow-x-hidden px-4 py-4 sm:px-7 sm:py-6" onClick={() => !userInteracted && setUserInteracted(true)}>
    <header className="mx-auto flex max-w-[1280px] items-center justify-between gap-4">
      <a className="display text-xl font-bold" href="/dashboard">MS<span className="text-[#90e4ff]">Party</span></a>
      <div className="hidden items-center gap-2 text-sm text-[#aab9d7] sm:flex"><span className={`h-2 w-2 rounded-full ${connected ? "now-pulse bg-[#90e4ff]" : "bg-[#ff7b8d]"}`} />{connected ? "متصل بالسهرة" : "جارٍ إعادة الاتصال"}</div>
      <button onClick={invite} className="rounded-full border border-[#90e4ff]/30 bg-[#90e4ff]/10 px-4 py-2 text-sm font-semibold text-[#e9fbff]">{copied ? "تم نسخ الرابط" : "ادعُ صحابك"}</button>
    </header>
    <section className="mx-auto mt-7 max-w-[1180px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="mono text-xs text-[#90e4ff]">ROOM · {party.id.slice(-6).toUpperCase()}</p><h1 className="display mt-1 text-2xl sm:text-3xl">{party.name}</h1></div><span className="rounded-full bg-[#1e2a4a] px-3 py-2 text-sm text-[#d9e6ff]">◉ {members.length} معك الآن</span></div>
      <div className="glow-orbit rounded-[22px] bg-[#0a1020] p-2.5">
        <div className="relative overflow-hidden rounded-[18px]">
          {ytError && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0a1020]/95 p-6 text-center text-[#ff7b8d]"><span className="text-3xl">⚠️</span><p className="mt-2 text-base font-bold">{ytError}</p><p className="mt-1 text-xs text-[#aab9d7]">يمكن للهوست تغيير رابط الفيديو إلى فيديو آخر من YouTube أو رفع فيديو خاص.</p></div>}
          
          {contentType === "youtube" && extractedStreamUrl ? (
            <video
              ref={uploadedPlayer}
              src={extractedStreamUrl}
              className="aspect-video w-full bg-black object-contain"
              onPlay={() => isHost && control("play", uploadedPlayer.current?.currentTime || 0)}
              onPause={() => isHost && control("pause", uploadedPlayer.current?.currentTime || 0)}
              onSeeked={() => isHost && control("seek", uploadedPlayer.current?.currentTime || 0)}
            />
          ) : contentType === "youtube" ? (
            <div className="relative aspect-video w-full">
              {extracting && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 text-xs text-[#90e4ff]">
                  <span className="now-pulse">⚡ جارٍ تجهيز ستريم يوتيوب المباشر...</span>
                </div>
              )}
              <YouTubePlayer videoId={videoId(contentUrl)} enabled={isHost} onReady={readyPlayer => { player.current = readyPlayer; }} onControl={control} onError={msg => setYtError(msg)} />
              {!isHost && <div className="absolute inset-0 z-10 bg-transparent cursor-not-allowed" onClick={e => { e.preventDefault(); e.stopPropagation(); }} />}
            </div>
          ) : (
            <video ref={uploadedPlayer} src={contentUrl} controls={!isHost} className="aspect-video w-full bg-black object-contain" onPlay={() => isHost && control("play", uploadedPlayer.current?.currentTime || 0)} onPause={() => isHost && control("pause", uploadedPlayer.current?.currentTime || 0)} onSeeked={() => isHost && control("seek", uploadedPlayer.current?.currentTime || 0)} />
          )}

          {!userInteracted && playing && !isHost && <button onClick={() => setUserInteracted(true)} className="absolute inset-x-0 top-4 z-20 mx-auto w-max rounded-full border border-[#90e4ff]/40 bg-[#10172b]/90 px-4 py-2 text-xs font-bold text-[#90e4ff] shadow-lg hover:bg-[#90e4ff] hover:text-[#10172b]">🔊 اضغط هنا لتنشيط الصوت والمشاهدة الحية</button>}
          
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col bg-gradient-to-t from-[#07101f]/95 via-[#07101f]/60 to-transparent px-4 pb-3 pt-12 sm:px-6">
            {/* Custom Host Scrubber / Control Bar */}
            {isHost && (
              <div className="pointer-events-auto mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-[#10172b]/90 p-2 backdrop-blur-md">
                <button onClick={togglePlayback} className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#90e4ff] text-[#10172b] font-bold transition hover:scale-105">
                  {playing ? "❚❚" : "▶"}
                </button>
                <button onClick={() => handleSeekChange(Math.max(0, currentTime - 10))} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-[#d9e6ff] hover:bg-white/10" title="تأخير 10 ثوانٍ">
                  -10s
                </button>
                <button onClick={() => handleSeekChange(currentTime + 10)} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-[#d9e6ff] hover:bg-white/10" title="تقديم 10 ثوانٍ">
                  +10s
                </button>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.5}
                  value={currentTime}
                  onChange={e => handleSeekChange(Number(e.target.value))}
                  className="h-2 flex-1 cursor-pointer accent-[#90e4ff]"
                />
                <span className="mono text-xs text-[#90e4ff]">
                  {formatTime(currentTime)} {duration > 0 && `/ ${formatTime(duration)}`}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="pointer-events-auto rounded-full border border-white/10 bg-[#10172b]/85 px-3 py-1.5 text-xs sm:text-sm"><i className={`ml-2 inline-block h-2 w-2 rounded-full ${playing ? "now-pulse bg-[#ff7b8d]" : "bg-[#aab9d7]"}`} />{playing ? `${hostName} يشغّل الآن` : isHost ? "الفيديو جاهز — شغّله لما تكونوا مستعدين" : `${hostName} لم يبدأ التشغيل بعد`}</span>
              <span className="mono rounded-full bg-[#10172b]/85 px-3 py-1.5 text-xs text-[#90e4ff]">{playing ? "LIVE" : "PAUSED"}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="relative mx-auto -mt-4 flex max-w-[92%] justify-between px-2">
        {members.slice(0, 5).map((member, index) => (
          <div className={`member-orbit flex flex-col items-center ${index % 2 ? "translate-y-5" : ""}`} key={member.user.id}>
            {member.user.avatarUrl ? (
              <img src={member.user.avatarUrl} alt={member.user.name} className="h-10 w-10 rounded-full border-2 border-[#10172b] object-cover shadow-md" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#10172b] bg-gradient-to-br from-[#d4b7ff] to-[#90e4ff] text-xs font-bold text-[#10172b]">
                {initials(member.user.name)}
              </span>
            )}
            <small className="mt-1 max-w-16 truncate text-[#dce8ff]">{member.user.id === userId ? "أنت" : member.user.name}</small>
          </div>
        ))}
      </div>
      {isHost ? <div className="mx-auto mt-9 max-w-4xl rounded-[22px] border border-[#fff6de]/20 bg-[#fff6de]/[.07] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="mono text-xs text-[#fff6de]">HOST CONSOLE</p><h2 className="display mt-1 text-lg">أنت ماسك العرض الليلة.</h2></div><div className="flex flex-wrap gap-2"><button onClick={togglePlayback} className="rounded-xl bg-[#fff6de] px-4 py-2 text-sm font-bold text-[#10172b]">{playing ? "إيقاف العرض" : "شغّل الفيديو"}</button><button onClick={() => handleSeekChange(0)} className="rounded-xl border border-[#fff6de]/25 px-4 py-2 text-sm">ابدأ من الأول</button><button onClick={invite} className="rounded-xl border border-[#fff6de]/25 px-4 py-2 text-sm">ادعُ صحابك</button></div></div>
      <form onSubmit={changeVideo} className="mt-4 space-y-2 rounded-xl bg-[#10172b]/70 p-3">
        <p className="text-sm text-[#fff6de]">غيّر العرض — الفيديو المرفوع القديم يُحذف بعد 30 دقيقة.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="min-w-0 flex-1 rounded-lg bg-[#0d1629] px-3 py-2 text-sm" placeholder="رابط YouTube جديد" value={replacementUrl} onChange={event => { setReplacementUrl(event.target.value); setReplacementFile(null); setChangeError(null); }} />
          <input type="file" accept="video/*" className="text-xs" onChange={event => { setReplacementFile(event.target.files?.[0] || null); setReplacementUrl(""); setChangeError(null); }} />
          <button disabled={changingVideo} className="rounded-lg bg-[#90e4ff] px-3 py-2 text-sm font-bold text-[#10172b] disabled:opacity-60">
            {changingVideo ? (changeProgress !== null ? `جارٍ الرفع (${changeProgress}%)...` : "جارٍ التبديل...") : "غيّر الفيديو"}
          </button>
        </div>
        {changeProgress !== null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0d1629]">
            <div className="h-full bg-gradient-to-r from-[#90e4ff] to-[#d4b7ff] transition-all duration-200" style={{ width: `${changeProgress}%` }} />
          </div>
        )}
        {changeError && <p className="rounded-lg bg-[#ff7b8d]/20 px-3 py-1.5 text-xs text-[#ffd6dd]">{changeError}</p>}
      </form>
      {request && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#10172b]/70 p-3 text-sm"><span>{request}</span><span className="flex gap-2"><button onClick={() => setRequest("")} className="rounded-lg bg-[#90e4ff] px-3 py-1.5 text-[#10172b]">اسمح</button><button onClick={() => setRequest("")} className="rounded-lg border border-white/15 px-3 py-1.5">مش دلوقتي</button></span></div>}</div> : <div className="mt-9 flex flex-col items-center gap-3 text-center text-sm text-[#d4b7ff]"><span>✦ أنت Viewer — {hostName} ماسك التحكم.</span><button onClick={() => setControlRequested(true)} className="rounded-full border border-[#d4b7ff]/35 px-4 py-2">{controlRequested ? "تم إرسال طلب التحكم" : "اطلب التحكم"}</button></div>}
    </section>
    {!isHost && <><div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-24 z-20 flex justify-center">{reaction && <span className="slide-in rounded-full border border-[#90e4ff]/30 bg-[#10172b]/90 px-5 py-3 text-2xl shadow-xl">{reaction} <small className="text-xs text-[#d9e6ff]">وصلت للشلة</small></span>}</div><div className="mx-auto mt-7 flex max-w-md justify-center gap-2"><span className="self-center text-xs text-[#8091b4]">شارك لحظتك:</span>{["😂", "😮", "❤️", "🔥"].map(emoji => <button onClick={() => react(emoji)} className="rounded-full bg-[#1e2a4a] px-3 py-2 text-lg transition hover:-translate-y-1 hover:bg-[#d4b7ff]" key={emoji}>{emoji}</button>)}</div></>}
    <section className="mx-auto mt-8 max-w-[960px] rounded-[22px] border border-[#90e4ff]/15 bg-[#131d35]/75 p-2"><div className="flex gap-1 border-b border-white/10 px-1 pb-2"><button onClick={() => setTab("chat")} className={`flex-1 rounded-xl px-3 py-2 text-sm ${tab === "chat" ? "bg-[#90e4ff] text-[#10172b]" : "text-[#c7d5ef]"}`}>◌ الدردشة</button><button onClick={() => setTab("people")} className={`flex-1 rounded-xl px-3 py-2 text-sm ${tab === "people" ? "bg-[#d4b7ff] text-[#10172b]" : "text-[#c7d5ef]"}`}>◉ معك {members.length}</button><button onClick={() => setTab("ideas")} className={`flex-1 rounded-xl px-3 py-2 text-sm ${tab === "ideas" ? "bg-[#fff6de] text-[#10172b]" : "text-[#c7d5ef]"}`}>✦ اقتراحات</button></div>
      {tab === "chat" && <div className="p-3 sm:p-4"><div aria-live="polite" className="max-h-52 min-h-24 space-y-3 overflow-y-auto">{messages.length ? messages.map((entry, index) => <article className="slide-in flex gap-2 text-sm" key={`${entry.sentAt}-${index}`}>{entry.avatarUrl ? <img src={entry.avatarUrl} alt={entry.name} className="h-7 w-7 shrink-0 rounded-full object-cover" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1e2a4a] text-[10px] text-[#90e4ff]">{initials(entry.name)}</span>}<p className="rounded-2xl rounded-tr-sm bg-[#1e2a4a] px-3 py-2"><b className="ml-1 text-[#90e4ff]">{entry.name}</b>{entry.message}</p></article>) : <p className="flex min-h-24 items-center justify-center text-center text-sm text-[#aab9d7]">لسه محدش كتب حاجة.<br />ابدأوا بسؤال عن أحلى مشهد.</p>}</div><form className="mt-3 flex gap-2" onSubmit={sendMessage}><input className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0d1629] px-4 py-3 text-sm text-white" placeholder="اكتب رسالة للسهرة" value={message} onChange={event => setMessage(event.target.value)} /><button className="rounded-xl bg-[#90e4ff] px-4 py-3 text-sm font-bold text-[#10172b]">إرسال</button></form></div>}
      {tab === "people" && <div className="grid gap-2 p-3 sm:grid-cols-2">{members.map(member => <div className="flex items-center gap-3 rounded-xl bg-[#1e2a4a]/55 p-3" key={member.user.id}>{member.user.avatarUrl ? <img src={member.user.avatarUrl} alt={member.user.name} className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d4b7ff] text-xs font-bold text-[#10172b]">{initials(member.user.name)}</span>}<span className="flex-1 text-sm">{member.user.id === userId ? "أنت" : member.user.name}</span><span className={`rounded-full px-2 py-1 text-xs ${member.role === "host" ? "bg-[#fff6de] text-[#10172b]" : "bg-[#10172b] text-[#aab9d7]"}`}>{member.role === "host" ? "Host" : "Viewer"}</span></div>)}</div>}
      {tab === "ideas" && <div className="p-4"><p className="text-sm text-[#aab9d7]">{isHost ? "اختار اقتراحًا لما تخلصوا الفيديو الحالي." : "رشّحوا حاجة للسهرة الجاية."}</p><div className="mt-3 space-y-2">{ideas.map((item, index) => <div className="flex items-center justify-between rounded-xl bg-[#1e2a4a]/60 p-3 text-sm" key={`${item}-${index}`}><span>{item}</span>{isHost && <button className="rounded-lg bg-[#90e4ff] px-3 py-1 text-xs font-bold text-[#10172b]">بعد الفيلم</button>}</div>)}</div>{!isHost && <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (idea.trim()) { setIdeas(items => [...items, idea.trim()]); setIdea(""); } }}><input className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0d1629] px-4 py-3 text-sm text-white" placeholder="اسم الفيلم أو رابط YouTube" value={idea} onChange={event => setIdea(event.target.value)} /><button className="rounded-xl bg-[#fff6de] px-4 py-3 text-sm font-bold text-[#10172b]">اقترح</button></form>}{!ideas.length && <p className="mt-3 rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-[#8091b4]">مفيش اقتراحات لسه.</p>}</div>}
    </section>
  </main>;
}
