"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { YouTubePlayer, type PlayerHandle } from "@/components/youtube-player";
import { correctionFor, roomPosition } from "@/components/room/drift";
import { videoId, type Member, type Message } from "@/components/room/types";
import { Avatar } from "@/components/ui/avatar";
import { useRemote } from "./use-remote";

export type TvParty = {
  id: string;
  name: string;
  contentType: string;
  contentUrl: string | null;
  videoTitle?: string | null;
  posterUrl?: string | null;
};

/**
 * The party, on a television.
 *
 * A strict viewer: it never emits a control event, whoever it is signed in as.
 * A set left on in a living room should not be able to pause a film for
 * everyone because a cat sat on the remote — and the phone that paired it is
 * already a better remote than the remote is.
 *
 * It also never renders a platform party. Netflix and the rest are driven by
 * the browser extension, and a television has no extensions; a set pointed at
 * one says so rather than showing a black rectangle forever.
 */
export function TvPlayer({ token, party, onLeave }: { token: string; party: TvParty; onLeave: () => void }) {
  const socket = useRef<Socket>();
  const video = useRef<HTMLVideoElement | null>(null);
  const player = useRef<PlayerHandle>();
  const rate = useRef(1);
  const baseRate = useRef(1);
  /** Where to land once a player finally reports itself ready. */
  const pendingSeek = useRef<{ at: number; play: boolean } | null>(null);

  const [connected, setConnected] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState({ type: party.contentType, url: party.contentUrl || "" });
  const [panel, setPanel] = useState(false);
  /** Nothing plays until someone presses OK — see the gate below. */
  const [started, setStarted] = useState(false);

  const applyRate = useCallback((factor: number) => {
    const next = Number((baseRate.current * factor).toFixed(3));
    if (rate.current === next) return;
    rate.current = next;
    if (video.current) video.current.playbackRate = next;
    try {
      player.current?.setRate(next);
    } catch {
      player.current = undefined;
    }
  }, []);

  const seekTo = useCallback((at: number) => {
    if (video.current) video.current.currentTime = at;
    try {
      player.current?.seekTo(at);
    } catch {
      player.current = undefined;
    }
  }, []);

  /**
   * The room said something. Unlike the browser room there is no host branch
   * and no local control to reconcile — the television only ever obeys.
   */
  const applyState = useCallback(
    (state: any) => {
      const { isPlaying, contentType: incomingType, contentUrl: incomingUrl, rate: incomingRate } = state;
      setPlaying(isPlaying);
      if (typeof incomingRate === "number") baseRate.current = incomingRate;
      if (incomingType && incomingUrl) setContent({ type: incomingType, url: incomingUrl });

      const runtime = video.current?.duration || 0;
      const target = roomPosition(state, runtime);

      if (!video.current && !player.current) {
        pendingSeek.current = { at: target, play: isPlaying };
        return;
      }

      const local = video.current ? video.current.currentTime || 0 : player.current?.currentTime() || 0;
      const correction = correctionFor(target - local, isPlaying, target);
      if (correction.kind === "seek") {
        applyRate(1);
        seekTo(correction.to);
      } else if (correction.kind === "rate") {
        applyRate(correction.factor);
      }

      if (video.current) {
        if (isPlaying) video.current.play().catch(() => undefined);
        else video.current.pause();
      }
      try {
        if (player.current) {
          if (isPlaying) player.current.play();
          else player.current.pause();
        }
      } catch {
        player.current = undefined;
      }
    },
    [applyRate, seekTo]
  );

  useEffect(() => {
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
    client.on("party:presence", ({ members: present }: { members: Member[] }) => setMembers(present));
    // Kept short on purpose: this is a wall of text read from a sofa, not a
    // transcript. The last handful is all anyone can follow at that distance.
    client.on("chat:message", (entry: Message) => setMessages(items => [...items, entry].slice(-6)));
    client.on("party:kicked", onLeave);

    return () => {
      client.disconnect();
    };
  }, [token, party.id, applyState, onLeave]);

  /** OK toggles the panel; Back closes it. That is the entire control surface. */
  const { index } = useRemote({
    count: 0,
    onSelect: () => setPanel(open => !open),
    onBack: () => setPanel(false)
  });
  void index;

  const onPlayerReady = useCallback(() => {
    const queued = pendingSeek.current;
    if (!queued) return;
    pendingSeek.current = null;
    seekTo(queued.at);
    if (!queued.play) return;
    if (video.current) video.current.play().catch(() => undefined);
    try {
      player.current?.play();
    } catch {
      player.current = undefined;
    }
  }, [seekTo]);

  if (content.type === "platform") {
    return (
      <TvNotice
        title="السهرة دي على منصة"
        body="السهرات اللي على نتفليكس وشاهد وديزني+ محتاجة إضافة المتصفح، والتليفزيون مابيشغّلش إضافات. اتفرج عليها من الكمبيوتر، أو اختار سهرة يوتيوب أو فيديو مرفوع."
        action="اختار سهرة تانية من الموبايل"
      />
    );
  }

  // Autoplay with sound is refused everywhere until someone has interacted with
  // the page, and a television has no pointer to interact with — so the press
  // of OK is both the consent and the gesture that buys audio.
  if (!started) {
    return (
      <TvStart
        title={party.videoTitle || party.name}
        poster={party.posterUrl}
        // Pressing OK is what unlocks audio, and it does so for the whole
        // document — the player does not exist yet at this point, so there is
        // nothing to call play() on. What matters is that the activation has
        // happened before one is mounted.
        onStart={() => setStarted(true)}
      />
    );
  }

  return (
    <div className="tv relative h-screen w-screen overflow-hidden bg-black">
      {content.type === "youtube" ? (
        <YouTubePlayer
          videoId={videoId(content.url)}
          // `enabled` marks the player that drives the room, so it is false
          // here — a television never reports a control event. It also starts
          // the embed muted, which is the safe default everywhere else; the
          // unmute below is earned by the OK press that got us to this screen.
          enabled={false}
          onReady={handle => {
            player.current = handle;
            handle.mute(false);
            onPlayerReady();
          }}
          onControl={() => undefined}
        />
      ) : (
        <video
          ref={video}
          src={content.url}
          playsInline
          onLoadedMetadata={onPlayerReady}
          className="h-full w-full object-contain"
        />
      )}

      {/* Everything below is chrome, and all of it is optional: the picture is
          the point, and a television that permanently covers a tenth of it with
          a chat panel is a worse television. */}
      <div className="tv-safe pointer-events-none absolute inset-0 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="rounded-lg bg-ink-deep/70 px-5 py-3">
            <p className="text-[0.7em] text-ivory-dim">{party.name}</p>
            <p className="display text-[1.1em] leading-tight text-ivory">{party.videoTitle || "بيتفرجوا دلوقتي"}</p>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-ink-deep/70 px-5 py-3">
            <span
              className={`h-3 w-3 rounded-full ${connected ? "bg-gold" : "animate-soft-pulse bg-curtain"}`}
              aria-hidden
            />
            <span className="text-[0.7em] text-ivory-dim">
              {connected ? `${members.length} في السهرة` : "بيعيد الاتصال"}
            </span>
          </div>
        </div>

        {panel ? (
          <div className="flex items-end justify-between gap-6">
            <div className="max-w-[55%] space-y-2">
              {messages.map((message, position) => (
                <p
                  key={`${message.sentAt}-${position}`}
                  className="animate-message-in rounded-lg bg-ink-deep/80 px-5 py-3 text-[0.8em] leading-relaxed text-ivory"
                >
                  <b className="text-gold">{message.name}: </b>
                  {message.message}
                </p>
              ))}
              {!messages.length && (
                <p className="rounded-lg bg-ink-deep/80 px-5 py-3 text-[0.75em] text-ivory-dim">
                  لسه محدش كتب حاجة.
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              {members.slice(0, 8).map(member => (
                <div key={member.id} className="flex items-center gap-2 rounded-full bg-ink-deep/80 px-4 py-2">
                  <Avatar name={member.name} src={member.avatarUrl} size="md" />
                  <span className="text-[0.65em] text-ivory">{member.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="self-center rounded-full bg-ink-deep/70 px-6 py-2 text-[0.65em] text-ivory-dim">
            اضغط OK تشوف الشات والحاضرين
          </p>
        )}
      </div>

      {!playing && connected && (
        <div className="tv absolute inset-0 flex items-center justify-center bg-ink-deep/60">
          <p className="display text-[2em] text-ivory">متوقّف — مستنيين الهوست</p>
        </div>
      )}
    </div>
  );
}

function TvStart({ title, poster, onStart }: { title: string; poster?: string | null; onStart: () => void }) {
  const { index } = useRemote({ count: 1, onSelect: onStart });

  return (
    <div className="tv tv-safe flex h-screen w-screen flex-col items-center justify-center bg-ink text-center">
      {poster && (
        <img src={poster} alt="" className="mb-8 max-h-[35vh] rounded-lg object-contain shadow-lift" />
      )}
      <h1 className="display max-w-[80%] text-[2em] leading-tight text-ivory">{title}</h1>
      <button
        data-focused={index === 0}
        onClick={onStart}
        className="mt-10 rounded-lg border-2 border-gold px-12 py-5 text-[1.1em] font-bold text-gold"
      >
        اضغط OK للتشغيل
      </button>
      <p className="mt-6 text-[0.7em] text-ivory-dim">
        الصوت مايشتغلش من نفسه على التليفزيون — الضغطة دي هي اللي بتفتحه.
      </p>
    </div>
  );
}

export function TvNotice({ title, body, action }: { title: string; body: string; action?: string }) {
  return (
    <div className="tv tv-safe flex h-screen w-screen flex-col items-center justify-center bg-ink text-center">
      <h1 className="display max-w-[70%] text-[1.8em] leading-tight text-ivory">{title}</h1>
      <p className="mt-6 max-w-[60%] text-[0.85em] leading-relaxed text-ivory-dim">{body}</p>
      {action && <p className="mt-8 rounded-lg border border-gold/40 px-8 py-4 text-[0.8em] text-gold">{action}</p>}
    </div>
  );
}
