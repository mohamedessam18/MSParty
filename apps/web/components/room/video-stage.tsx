"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { YouTubePlayer, type PlayerHandle } from "@/components/youtube-player";
import { formatTime, videoId } from "./types";

export type StageProps = {
  contentType: string;
  contentUrl: string;
  isHost: boolean;
  playing: boolean;
  ytError: string | null;
  currentTime: number;
  duration: number;
  muted: boolean;
  /** Non-null while the room is holding playback for someone still loading. */
  waitingFor: string | null;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  playerRef: React.MutableRefObject<PlayerHandle | undefined>;
  onControl: (type: "play" | "pause" | "seek", timestamp: number) => void;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onUnmute: () => void;
  onYtError: (message: string | null) => void;
  onBuffering: (buffering: boolean) => void;
  /** Fires once a player can accept a seek, so a queued join position lands. */
  onPlayerReady: () => void;
  /** Rendered inside the stage, so it survives the fullscreen subtree. */
  overlay?: (chromeShown: boolean) => React.ReactNode;
  /** Given the current chrome state, so it can sit clear of the control bar. */
  subtitles?: (raised: boolean) => React.ReactNode;
  cameras?: React.ReactNode;
  subtitlesUrl: string | null;
  subtitlesOn: boolean;
  onToggleSubtitles: () => void;
  rate: number;
  onRateChange: (rate: number) => void;
};

/** Exposed so the room's keyboard shortcuts can drive fullscreen and mute. */
export type StageHandle = { toggleFullscreen: () => void; toggleMute: () => void };

const RATES = [0.75, 1, 1.25, 1.5, 2];

export const VideoStage = forwardRef<StageHandle, StageProps>(function VideoStage(props, ref) {
  const { contentType, contentUrl, isHost, playing, ytError, muted, waitingFor } = props;
  const shell = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(100);
  const [fullscreen, setFullscreen] = useState(false);
  const [chromeShown, setChromeShown] = useState(true);
  const hideTimer = useRef<number>();

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /** Show the bar, then fade it out again once the film is running undisturbed. */
  const revealChrome = useCallback(() => {
    setChromeShown(true);
    window.clearTimeout(hideTimer.current);
    // A paused video has nothing to get out of the way of, so the bar stays.
    if (!playing) return;
    hideTimer.current = window.setTimeout(() => setChromeShown(false), 2600);
  }, [playing]);

  useEffect(() => {
    revealChrome();
    return () => window.clearTimeout(hideTimer.current);
  }, [revealChrome]);

  const applyVolume = useCallback(
    (next: number) => {
      setVolume(next);
      if (props.videoRef.current) {
        props.videoRef.current.volume = next / 100;
        if (next > 0) props.videoRef.current.muted = false;
      }
      props.playerRef.current?.setVolume(next);
      if (next > 0) props.playerRef.current?.mute(false);
    },
    [props.videoRef, props.playerRef]
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else shell.current?.requestFullscreen().catch(() => undefined);
  }, []);

  const toggleMute = useCallback(() => applyVolume(volume === 0 ? 100 : 0), [applyVolume, volume]);

  useImperativeHandle(ref, () => ({ toggleFullscreen, toggleMute }), [toggleFullscreen, toggleMute]);

  /** Picture-in-Picture only exists for real <video>; an iframe cannot pop out. */
  function togglePip() {
    const element = props.videoRef.current;
    if (!element) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => undefined);
    else element.requestPictureInPicture?.().catch(() => undefined);
  }

  const isUpload = contentType !== "youtube";

  // React nulls videoRef by itself when the <video> unmounts, but playerRef is
  // assigned by hand in onReady and nothing ever cleared it. After a swap from
  // YouTube to an upload it still pointed at a destroyed player, whose methods
  // throw — which aborted play/pause before it ever reached the <video>.
  useEffect(() => {
    if (isUpload) props.playerRef.current = undefined;
  }, [isUpload, props.playerRef]);

  return (
    <div className="marquee-frame">
      <div
        ref={shell}
        className={`relative overflow-hidden bg-ink-deep ${chromeShown ? "" : "cursor-none"} ${
          // Fullscreen makes this element the whole screen; without centring,
          // the picture sits against the top edge with black below it.
          fullscreen ? "flex h-full w-full items-center justify-center" : ""
        }`}
        onMouseMove={revealChrome}
        onMouseEnter={revealChrome}
        onMouseLeave={() => playing && setChromeShown(false)}
        // Touch has no hover, so a tap toggles the bar the way phone players do.
        onTouchStart={() => (chromeShown ? setChromeShown(false) : revealChrome())}
      >
        {ytError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink/95 p-6 text-center">
            <span aria-hidden className="text-3xl">
              ⚠️
            </span>
            <p className="mt-2 text-base font-bold text-curtain">{ytError}</p>
            <p className="mt-1 text-xs text-ivory-dim">الهوست يقدر يغيّر الرابط لفيديو تاني أو يرفع فيديو خاص.</p>
          </div>
        )}

        {isUpload ? (
          <video
            ref={props.videoRef}
            src={contentUrl}
            autoPlay
            playsInline
            preload="auto"
            controls={false}
            className={`pointer-events-none select-none bg-black object-contain ${
              fullscreen ? "h-full w-full" : "aspect-video w-full"
            }`}
            onWaiting={() => props.onBuffering(true)}
            onPlaying={() => props.onBuffering(false)}
            onCanPlay={() => props.onBuffering(false)}
            onLoadedMetadata={props.onPlayerReady}
            onPlay={() => isHost && props.onControl("play", props.videoRef.current?.currentTime || 0)}
            onPause={() => isHost && props.onControl("pause", props.videoRef.current?.currentTime || 0)}
            onSeeked={() => isHost && props.onControl("seek", props.videoRef.current?.currentTime || 0)}
            // Without this the party stays "playing" past the end forever, and
            // the server's live timestamp keeps growing past the runtime.
            onEnded={() => isHost && props.onControl("pause", props.videoRef.current?.duration || 0)}
          />
        ) : (
          <div className={`relative ${fullscreen ? "h-full max-h-full w-full" : "aspect-video w-full"}`}>
            <YouTubePlayer
              videoId={videoId(contentUrl)}
              enabled={isHost}
              onReady={player => {
                props.playerRef.current = player;
                props.onPlayerReady();
              }}
              onControl={props.onControl}
              onError={props.onYtError}
              onBuffering={props.onBuffering}
            />
            {/* Nobody drives the embed directly — the host uses our bar, and a
                stray click on the iframe would desync the room. */}
            <div className="absolute inset-0 z-10" onClick={event => event.preventDefault()} />

            {/* Paused, YouTube covers itself in a title bar and a grid of other
                videos, and no player parameter turns those off. Our own cover
                does, and it doubles as the room's paused state. */}
            {!playing && !ytError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-ink-deep">
                <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-2xl text-gold">
                  ❚❚
                </span>
                <p className="text-sm text-ivory-dim">{isHost ? "متوقف — شغّله لما تكونوا جاهزين" : "الهوست وقّف العرض"}</p>
              </div>
            )}

            <YouTubeBadge videoId={videoId(contentUrl)} />
          </div>
        )}

        {waitingFor && (
          <div className="absolute inset-x-0 top-4 z-20 mx-auto w-max rounded border border-gold/40 bg-ink/90 px-4 py-2 text-xs text-gold">
            <span className="animate-soft-pulse">⏳ مستنيين {waitingFor}</span>
          </div>
        )}

        {muted && !waitingFor && (
          <button
            onClick={props.onUnmute}
            className="absolute inset-x-0 top-4 z-20 mx-auto w-max rounded border border-gold/50 bg-ink/90 px-4 py-2 text-xs font-bold text-gold shadow-lift hover:bg-gold hover:text-ink"
          >
            🔊 اضغط لتشغيل الصوت
          </button>
        )}

        {props.subtitles?.(chromeShown)}
        {fullscreen && props.cameras}

        {/* Only mounted in fullscreen: outside it, the page's own panels are
            visible and a second copy would just duplicate them. Anchored above
            the control bar — at z-30 over the bar's z-20 it used to cover the
            transport buttons outright. */}
        {fullscreen && !!props.overlay && (
          <div className="pointer-events-none absolute bottom-24 left-3 z-30 sm:bottom-28">
            <div className="pointer-events-auto">{props.overlay(chromeShown)}</div>
          </div>
        )}

        <div
          onMouseEnter={() => window.clearTimeout(hideTimer.current)}
          onMouseLeave={revealChrome}
          className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-ink-deep via-ink-deep/70 to-transparent px-3 pb-3 pt-10 transition-opacity duration-300 sm:px-4 ${
            chromeShown ? "opacity-100" : "pointer-events-none opacity-0"
          } ${fullscreen ? "pb-6 sm:px-8" : ""}`}
        >
          {isHost ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-velvet-hi bg-ink/90 p-2">
              <button
                onClick={props.onTogglePlay}
                aria-label={playing ? "إيقاف" : "تشغيل"}
                className="flex h-9 w-9 items-center justify-center rounded bg-gold font-bold text-ink transition hover:bg-gold-lit"
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <button onClick={() => props.onSeek(Math.max(0, props.currentTime - 10))} className="rounded border border-velvet-hi px-2 py-1 text-xs text-ivory hover:bg-velvet-hi">
                -10s
              </button>
              <button onClick={() => props.onSeek(props.currentTime + 10)} className="rounded border border-velvet-hi px-2 py-1 text-xs text-ivory hover:bg-velvet-hi">
                +10s
              </button>
              <input
                type="range"
                aria-label="موضع التشغيل"
                min={0}
                max={props.duration || 100}
                step={0.5}
                value={props.currentTime}
                onChange={event => props.onSeek(Number(event.target.value))}
                className="h-1.5 min-w-24 flex-1 cursor-pointer accent-gold"
              />
              <span className="mono shrink-0 text-xs text-gold">
                {formatTime(props.currentTime)}
                {props.duration > 0 && ` / ${formatTime(props.duration)}`}
              </span>
              <StageVolume volume={volume} onChange={applyVolume} />
              <select
                aria-label="سرعة التشغيل"
                value={props.rate}
                onChange={event => props.onRateChange(Number(event.target.value))}
                className="mono rounded border border-velvet-hi bg-ink px-1.5 py-1 text-xs text-ivory"
              >
                {RATES.map(value => (
                  <option key={value} value={value}>
                    {value}x
                  </option>
                ))}
              </select>
              {props.subtitlesUrl && <SubtitleButton on={props.subtitlesOn} onClick={props.onToggleSubtitles} />}
              {isUpload && <PipButton onClick={togglePip} />}
              <FullscreenButton active={fullscreen} onClick={toggleFullscreen} />
            </div>
          ) : (
            // Viewers get sound and fullscreen, but never transport controls —
            // playback position stays the host's to decide.
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-velvet-hi bg-ink/90 p-2">
              <StageVolume volume={volume} onChange={applyVolume} />
              <span className="mono flex-1 text-xs text-ivory-dim">
                {formatTime(props.currentTime)}
                {props.rate !== 1 && <span className="mr-1.5 text-gold">{props.rate}x</span>}
              </span>
              {props.subtitlesUrl && <SubtitleButton on={props.subtitlesOn} onClick={props.onToggleSubtitles} />}
              {isUpload && <PipButton onClick={togglePip} />}
              <FullscreenButton active={fullscreen} onClick={toggleFullscreen} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function StageVolume({ volume, onChange }: { volume: number; onChange: (next: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(volume === 0 ? 100 : 0)}
        aria-label={volume === 0 ? "تشغيل الصوت" : "كتم الصوت"}
        className="text-sm text-ivory-dim hover:text-ivory"
      >
        {volume === 0 ? "🔇" : "🔊"}
      </button>
      <input
        type="range"
        aria-label="مستوى الصوت"
        min={0}
        max={100}
        value={volume}
        onChange={event => onChange(Number(event.target.value))}
        className="h-1.5 w-16 cursor-pointer accent-gold"
      />
    </div>
  );
}

/**
 * YouTube's own logo lives inside its control bar, which we hide, and the API
 * has no way to keep just that one piece. So the attribution is ours: the mark
 * plus a link back to the source, always visible rather than only on hover.
 */
function YouTubeBadge({ videoId }: { videoId: string }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      title="اتفرج عليه على YouTube"
      className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded bg-ink-deep/70 px-2 py-1 opacity-80 transition hover:opacity-100"
    >
      <svg viewBox="0 0 28 20" className="h-4 w-[22px]" aria-hidden>
        <path
          fill="#FF0000"
          d="M27.4 3.1A3.5 3.5 0 0 0 24.9.6C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5c.6-2.2.6-6.9.6-6.9s0-4.7-.6-6.9Z"
        />
        <path fill="#fff" d="M11.2 14.3 18.4 10l-7.2-4.3v8.6Z" />
      </svg>
      <span className="text-[10px] font-semibold text-ivory">YouTube</span>
    </a>
  );
}

function SubtitleButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label="الترجمة"
      title="الترجمة (C)"
      className={`rounded border px-2 py-1 text-xs ${on ? "border-gold bg-gold/15 text-gold" : "border-velvet-hi text-ivory-dim hover:bg-velvet-hi"}`}
    >
      CC
    </button>
  );
}

function PipButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="صورة داخل صورة"
      title="صورة داخل صورة"
      className="rounded border border-velvet-hi px-2 py-1 text-xs text-ivory hover:bg-velvet-hi"
    >
      ⧉
    </button>
  );
}

function FullscreenButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={active ? "خروج من ملء الشاشة" : "ملء الشاشة"}
      className="rounded border border-velvet-hi px-2 py-1 text-xs text-ivory hover:bg-velvet-hi"
    >
      {active ? "⤡" : "⤢"}
    </button>
  );
}
