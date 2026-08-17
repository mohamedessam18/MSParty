"use client";
import { io, Socket } from "socket.io-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerHandle } from "./youtube-player";
import { Button } from "./ui/button";
import { Tabs } from "./ui/tabs";
import { Wordmark } from "./ui/wordmark";
import { ChatPanel } from "./room/chat-panel";
import { HostConsole } from "./room/host-console";
import { InviteModal } from "./room/invite-modal";
import { MemberSeats } from "./room/member-seats";
import { PeoplePanel } from "./room/people-panel";
import { QueuePanel } from "./room/queue-panel";
import { ReactionBar, ReactionLayer } from "./room/reaction-layer";
import { StageOverlay } from "./room/stage-overlay";
import { useVoice } from "./room/use-voice";
import { VideoStage } from "./room/video-stage";
import { VoiceBar } from "./room/voice-bar";
import type { ControlRequest, FlyingReaction, Member, Message, QueueItem } from "./room/types";

type Party = {
  id: string;
  code: string;
  name: string;
  contentType: string;
  contentUrl: string | null;
  hostId: string;
  isPlaying: boolean;
  isLocked: boolean;
  members: { role: string; user: { id: string; name: string; avatarUrl?: string | null } }[];
};

/** Drift thresholds, in seconds. */
const HARD_SEEK = 5; // beyond this, catching up gradually would take too long
const NUDGE = 0.35; // beyond this, lean on playback rate
const SETTLED = 0.15; // inside this, run at normal speed

export function PartyRoom({ party, userId }: { party: Party; userId: string }) {
  const router = useRouter();
  const socket = useRef<Socket>();
  const player = useRef<PlayerHandle>();
  const video = useRef<HTMLVideoElement | null>(null);
  const rate = useRef(1);
  /** Set once the viewer clicks to unmute — the browser's price for audio. */
  const hasGesture = useRef(false);

  const [members, setMembers] = useState<Member[]>(() =>
    party.members.map(member => ({ ...member.user, role: member.role }))
  );
  const [role, setRole] = useState(() => party.members.find(member => member.user.id === userId)?.role ?? "viewer");
  const isHost = role === "host";
  // applyState runs inside socket callbacks registered once, so it needs the
  // current role rather than the one captured when the listener was attached.
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  const [messages, setMessages] = useState<Message[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reactions, setReactions] = useState<FlyingReaction[]>([]);
  const [typing, setTyping] = useState<{ name: string; at: number }[]>([]);
  const [requests, setRequests] = useState<ControlRequest[]>([]);
  const [stalled, setStalled] = useState<{ userId: string; name: string }[]>([]);

  const [playing, setPlaying] = useState(party.isPlaying);
  const [isLocked, setIsLocked] = useState(party.isLocked);
  const [waitForAll, setWaitForAll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [tab, setTab] = useState<"chat" | "people" | "queue">("chat");
  const [unread, setUnread] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [contentType, setContentType] = useState(party.contentType);
  const [contentUrl, setContentUrl] = useState(party.contentUrl || "");
  const [ytError, setYtError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const voice = useVoice(socket, party.id, connected);
  const hostName = members.find(member => member.role === "host")?.name || "الهوست";

  /** Nudges playback speed toward the host's position instead of jumping. */
  const setRate = useCallback((next: number) => {
    if (rate.current === next) return;
    rate.current = next;
    if (video.current) video.current.playbackRate = next;
    player.current?.setRate(next);
  }, []);

  const applyState = useCallback(
    ({ isPlaying, timestamp, serverTime, contentType: incomingType, contentUrl: incomingUrl, role: incomingRole, isLocked: incomingLock }: any) => {
      setPlaying(isPlaying);
      if (incomingRole) setRole(incomingRole);
      if (typeof incomingLock === "boolean") setIsLocked(incomingLock);
      if (incomingType && incomingUrl) {
        setContentType(incomingType);
        setContentUrl(incomingUrl);
        setYtError(null);
      }
      if (isHostRef.current) return;

      const corrected = isPlaying ? timestamp + (Date.now() - serverTime) / 1000 : timestamp;
      const local = video.current ? video.current.currentTime || 0 : player.current?.currentTime() || 0;
      const drift = corrected - local;

      if (!isPlaying) {
        setRate(1);
      } else if (Math.abs(drift) > HARD_SEEK) {
        setRate(1);
        if (video.current) video.current.currentTime = corrected;
        player.current?.seekTo(corrected);
      } else if (Math.abs(drift) > NUDGE) {
        // Behind the host: run slightly fast. Ahead: run slightly slow.
        setRate(drift > 0 ? 1.05 : 0.95);
      } else if (Math.abs(drift) < SETTLED) {
        setRate(1);
      }

      if (video.current) {
        if (isPlaying) {
          video.current.play().catch(() => {
            // Browsers block unmuted autoplay until the user interacts. Fall back
            // to muted playback and surface a control that genuinely unmutes.
            if (!video.current) return;
            video.current.muted = true;
            setMuted(true);
            video.current.play().catch(() => undefined);
          });
        } else {
          video.current.pause();
        }
      }
      if (player.current) {
        if (isPlaying) {
          // The IFrame player gives us no failure signal, so we cannot retry the
          // way the <video> path does. Stay muted until the viewer clicks the
          // unmute button — that click is the gesture that earns us sound.
          if (!hasGesture.current) {
            player.current.mute(true);
            setMuted(true);
          }
          player.current.play();
        } else {
          player.current.pause();
        }
      }
    },
    [setRate]
  );

  useEffect(() => {
    let active = true;
    fetch("/api/sync-token")
      .then(response => response.json())
      .then(({ token }) => {
        if (!active || !token) return;
        const client = io(process.env.NEXT_PUBLIC_SYNC_SERVER_URL || "http://localhost:4000", {
          auth: { userToken: token }
        });
        socket.current = client;

        client.on("connect", () => {
          setConnected(true);
          client.emit("join-party", { partyId: party.id });
        });
        client.on("disconnect", () => setConnected(false));
        client.on("sync:state", applyState);
        client.on("sync:heartbeat", applyState);

        client.on("chat:message", (entry: Message) => {
          setMessages(items => [...items, entry]);
          // Never yank the user off the tab they are reading; badge it instead.
          setUnread(count => (entry.userId === userId ? count : count + 1));
        });
        client.on("chat:typing", ({ name }: { name: string }) =>
          setTyping(items => [...items.filter(item => item.name !== name), { name, at: Date.now() }])
        );

        // Members are keyed by id so a reconnect or a second tab cannot
        // duplicate a person in the seat row.
        client.on("party:memberJoined", (member: any) =>
          setMembers(items => [
            ...items.filter(item => item.id !== member.userId),
            { id: member.userId, name: member.name, avatarUrl: member.avatarUrl, role: member.role || "viewer" }
          ])
        );
        client.on("party:memberLeft", ({ userId: gone }: { userId: string }) =>
          setMembers(items => items.filter(item => item.id !== gone))
        );
        client.on("party:hostChanged", ({ hostId, name }: { hostId: string; name: string }) => {
          setMembers(items => items.map(item => ({ ...item, role: item.id === hostId ? "host" : "viewer" })));
          setRole(hostId === userId ? "host" : "viewer");
          setRequests([]);
          setNotice(hostId === userId ? "بقيت أنت الهوست." : `${name} بقى الهوست.`);
        });
        client.on("party:lockChanged", ({ isLocked: locked }: { isLocked: boolean }) => setIsLocked(locked));
        client.on("party:kicked", () => router.replace("/dashboard"));
        client.on("party:readiness", ({ buffering }: { buffering: { userId: string; name: string }[] }) =>
          setStalled(buffering)
        );

        client.on("queue:updated", ({ items }: { items: QueueItem[] }) => setQueue(items));
        client.on("reaction:received", ({ emoji, name }: { emoji: string; name: string }) => {
          const key = `${Date.now()}-${Math.random()}`;
          setReactions(items => [...items, { key, emoji, name, offset: 10 + Math.random() * 75 }]);
          window.setTimeout(() => setReactions(items => items.filter(item => item.key !== key)), 1800);
        });

        client.on("control:requested", (request: ControlRequest) =>
          setRequests(items => [...items.filter(item => item.userId !== request.userId), request])
        );
        client.on("control:denied", () => setNotice("الهوست مش قادر يسلّمك التحكم دلوقتي."));
        client.on("error:unauthorized", ({ message }: { message: string }) => setNotice(message));
      });

    fetch(`/api/parties/${party.id}/messages`)
      .then(response => (response.ok ? response.json() : []))
      .then(items =>
        active &&
        setMessages(
          items.map((item: any) => ({
            userId: item.userId,
            name: item.user.name,
            // The API returns this; the old mapping dropped it, so historical
            // messages lost their avatars while live ones kept them.
            avatarUrl: item.user.avatarUrl,
            message: item.message,
            sentAt: item.sentAt
          }))
        )
      );

    return () => {
      active = false;
      socket.current?.disconnect();
    };
  }, [party.id, userId, applyState, router]);

  // Expire "is typing" chips that stop being refreshed.
  useEffect(() => {
    const timer = setInterval(() => setTyping(items => items.filter(item => Date.now() - item.at < 3000)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Poll both players so the host scrubber has a real range. The IFrame path
  // previously reported no duration at all, pinning the slider's max at 100.
  useEffect(() => {
    const timer = setInterval(() => {
      if (video.current) {
        setCurrentTime(video.current.currentTime || 0);
        setDuration(video.current.duration || 0);
      } else if (player.current) {
        setCurrentTime(player.current.currentTime() || 0);
        setDuration(player.current.duration() || 0);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const emit = useCallback(
    (event: string, payload: object = {}) => {
      socket.current?.emit(event, { partyId: party.id, ...payload });
    },
    [party.id]
  );

  const control = useCallback(
    (type: "play" | "pause" | "seek", timestamp: number) => {
      if (isHostRef.current) emit(`control:${type}`, { timestamp });
    },
    [emit]
  );

  const togglePlayback = useCallback(() => {
    const timestamp = player.current?.currentTime() || video.current?.currentTime || 0;
    if (playing) {
      player.current?.pause();
      video.current?.pause();
      control("pause", timestamp);
    } else {
      player.current?.play();
      video.current?.play().catch(() => undefined);
      control("play", timestamp);
    }
  }, [playing, control]);

  // Hold the room for anyone still loading, then let it go again by itself.
  const autoPaused = useRef(false);
  useEffect(() => {
    if (!isHost || !waitForAll) return;
    if (playing && stalled.length && !autoPaused.current) {
      autoPaused.current = true;
      togglePlayback();
    } else if (!playing && !stalled.length && autoPaused.current) {
      autoPaused.current = false;
      togglePlayback();
    }
  }, [isHost, waitForAll, playing, stalled, togglePlayback]);

  function seek(seconds: number) {
    setCurrentTime(seconds);
    if (video.current) video.current.currentTime = seconds;
    player.current?.seekTo(seconds);
    control("seek", seconds);
  }

  function unmute() {
    hasGesture.current = true;
    setMuted(false);
    if (video.current) {
      video.current.muted = false;
      video.current.volume = 1;
      video.current.play().catch(() => undefined);
    }
    player.current?.mute(false);
    player.current?.setVolume(100);
  }

  const typingNames = useMemo(() => typing.map(item => item.name), [typing]);
  const waitingFor = waitForAll && stalled.length ? stalled.map(item => item.name).join("، ") : null;

  async function changeVideo({ url, file }: { url: string; file: File | null }) {
    let nextUrl = url;
    let uploadedVideoId: string | undefined;

    if (file) {
      const signed = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size })
      });
      const data = await signed.json().catch(() => ({}));
      if (!signed.ok) throw new Error(data.message || "تعذر تجهيز الرفع.");

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", data.uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("رفع الفيديو لم يكتمل.")));
        xhr.onerror = () => reject(new Error("خطأ في الشبكة أثناء الرفع."));
        xhr.send(file);
      });

      nextUrl = data.fileUrl;
      uploadedVideoId = data.videoId;
    }

    if (!nextUrl) throw new Error("اكتب رابط أو اختار ملف.");
    emit("control:changeVideo", { contentType: file ? "upload" : "youtube", contentUrl: nextUrl, uploadedVideoId });
  }

  const sendMessage = (message: string) => emit("chat:send", { message });
  const react = (emoji: string) => emit("reaction:send", { emoji });

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <Wordmark href="/dashboard" />
        <div className="flex items-center gap-2 text-sm text-ivory-dim">
          <span className={`h-2 w-2 rounded-full ${connected ? "animate-soft-pulse bg-gold" : "bg-curtain"}`} />
          <span className="hidden sm:inline">{connected ? "متصل بالسهرة" : "جارٍ إعادة الاتصال"}</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setInviteOpen(true)}>
          ادعُ صحابك
        </Button>
      </header>

      {notice && (
        <p role="status" className="mx-auto mt-3 max-w-6xl rounded border border-gold/30 bg-gold/10 px-3 py-2 text-center text-sm text-gold">
          {notice}
        </p>
      )}

      <section className="mx-auto mt-6 max-w-5xl">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="mono text-xs tracking-[.2em] text-gold">
              ROOM · {party.code} {isLocked && "· 🔒"}
            </p>
            <h1 className="display mt-1 text-2xl text-ivory sm:text-3xl">{party.name}</h1>
          </div>
          <span className="rounded border border-velvet-hi bg-velvet px-3 py-1.5 text-sm text-ivory-dim">
            ◉ {members.length} معك الآن
          </span>
        </div>

        <div className="relative">
          <VideoStage
            contentType={contentType}
            contentUrl={contentUrl}
            isHost={isHost}
            playing={playing}
            ytError={ytError}
            currentTime={currentTime}
            duration={duration}
            muted={muted}
            waitingFor={waitingFor}
            videoRef={video}
            playerRef={player}
            onControl={control}
            onTogglePlay={togglePlayback}
            onSeek={seek}
            onUnmute={unmute}
            onYtError={setYtError}
            onBuffering={isBuffering => emit("viewer:buffering", { isBuffering })}
            overlay={<StageOverlay messages={messages} onSend={sendMessage} onReact={react} />}
          />
          <ReactionLayer reactions={reactions} />
        </div>

        <p className="mt-3 text-center text-xs text-ivory-dim">
          {playing ? `${hostName} يشغّل الآن` : isHost ? "الفيديو جاهز — شغّله لما تكونوا مستعدين" : `${hostName} لم يبدأ التشغيل بعد`}
        </p>

        <MemberSeats members={members} userId={userId} stalledIds={stalled.map(item => item.userId)} />

        <div className="mt-6">
          <VoiceBar
            joined={voice.joined}
            micMuted={voice.micMuted}
            peers={voice.peers}
            speakingIds={voice.speakingIds}
            error={voice.error}
            onJoin={voice.join}
            onLeave={voice.leave}
            onToggleMic={voice.toggleMic}
          />
        </div>

        {isHost ? (
          <HostConsole
            playing={playing}
            isLocked={isLocked}
            waitForAll={waitForAll}
            stalled={stalled}
            requests={requests}
            onTogglePlay={togglePlayback}
            onRestart={() => seek(0)}
            onInvite={() => setInviteOpen(true)}
            onToggleLock={() => emit("party:lock", { isLocked: !isLocked })}
            onToggleWaitForAll={() => setWaitForAll(value => !value)}
            onChangeVideo={changeVideo}
            onGrant={targetId => {
              emit("control:grant", { userId: targetId });
              setRequests(items => items.filter(item => item.userId !== targetId));
            }}
            onDeny={targetId => {
              emit("control:deny", { userId: targetId });
              setRequests(items => items.filter(item => item.userId !== targetId));
            }}
          />
        ) : (
          <div className="mt-8 flex flex-col items-center gap-3 text-center text-sm text-ivory-dim">
            <span>✦ أنت Viewer — {hostName} ماسك التحكم.</span>
            <Button variant="ghost" size="sm" onClick={() => emit("control:request")}>
              اطلب التحكم
            </Button>
          </div>
        )}

        <div className="mt-6">
          <ReactionBar onReact={react} />
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-3xl rounded-lg border border-velvet-hi bg-velvet/60 p-2">
        <Tabs
          value={tab}
          onChange={next => {
            setTab(next);
            if (next === "chat") setUnread(0);
          }}
          items={[
            { value: "chat", label: "الدردشة", badge: unread },
            { value: "people", label: `معك ${members.length}` },
            { value: "queue", label: "القائمة", badge: queue.length }
          ]}
        />
        {tab === "chat" && (
          <ChatPanel
            messages={messages}
            userId={userId}
            typing={typingNames}
            onSend={sendMessage}
            onTyping={() => emit("chat:typing")}
          />
        )}
        {tab === "people" && (
          <PeoplePanel
            members={members}
            userId={userId}
            isHost={isHost}
            stalledIds={stalled.map(item => item.userId)}
            speakingIds={voice.speakingIds}
            onTransfer={targetId => emit("host:transfer", { userId: targetId })}
            onKick={targetId => emit("member:kick", { userId: targetId })}
          />
        )}
        {tab === "queue" && (
          <QueuePanel
            items={queue}
            userId={userId}
            isHost={isHost}
            onAdd={(title, url) => emit("queue:add", { title, contentType: "youtube", contentUrl: url })}
            onVote={id => emit("queue:vote", { itemId: id })}
            onRemove={id => emit("queue:remove", { itemId: id })}
            onPlayNext={id => emit("queue:playNext", { itemId: id })}
          />
        )}
      </section>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} code={party.code} partyId={party.id} />
    </main>
  );
}
