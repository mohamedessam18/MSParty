"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { YouTubePlayer, type PlayerHandle } from "@/components/youtube-player";
import { formatTime, videoId } from "./types";

export type StageProps = {
  contentType: string;
  contentUrl: string;
  extractedStreamUrl: string | null;
  extracting: boolean;
  isHost: boolean;
  playing: boolean;
  ytError: string | null;
  currentTime: number;
  duration: number;
  muted: boolean;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  playerRef: React.MutableRefObject<PlayerHandle | undefined>;
  onControl: (type: "play" | "pause" | "seek", timestamp: number) => void;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onUnmute: () => void;
  onYtError: (message: string | null) => void;
};

export function VideoStage(props: StageProps) {
  const { contentType, contentUrl, extractedStreamUrl, extracting, isHost, playing, ytError, muted } = props;
  const shell = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(100);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

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

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else shell.current?.requestFullscreen().catch(() => undefined);
  }

  const usesVideoElement = contentType !== "youtube" || !!extractedStreamUrl;
  const source = contentType === "youtube" ? extractedStreamUrl! : contentUrl;

  return (
    <div className="marquee-frame">
      <div ref={shell} className="relative overflow-hidden bg-ink-deep">
        {ytError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink/95 p-6 text-center">
            <span aria-hidden className="text-3xl">
              ⚠️
            </span>
            <p className="mt-2 text-base font-bold text-curtain">{ytError}</p>
            <p className="mt-1 text-xs text-ivory-dim">
              الهوست يقدر يغيّر الرابط لفيديو تاني أو يرفع فيديو خاص.
            </p>
          </div>
        )}

        {usesVideoElement ? (
          <video
            ref={props.videoRef}
            src={source}
            autoPlay
            playsInline
            preload="auto"
            controls={false}
            className="pointer-events-none aspect-video w-full select-none bg-black object-contain"
            onPlay={() => isHost && props.onControl("play", props.videoRef.current?.currentTime || 0)}
            onPause={() => isHost && props.onControl("pause", props.videoRef.current?.currentTime || 0)}
            onSeeked={() => isHost && props.onControl("seek", props.videoRef.current?.currentTime || 0)}
          />
        ) : (
          <div className="relative aspect-video w-full">
            {extracting && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink-deep/70 text-xs text-gold">
                <span className="animate-soft-pulse">جارٍ تجهيز الستريم...</span>
              </div>
            )}
            <YouTubePlayer
              videoId={videoId(contentUrl)}
              enabled={isHost}
              onReady={player => {
                props.playerRef.current = player;
              }}
              onControl={props.onControl}
              onError={props.onYtError}
            />
            {/* Viewers must not be able to drive the embedded player itself. */}
            {!isHost && <div className="absolute inset-0 z-10" onClick={event => event.preventDefault()} />}
          </div>
        )}

        {muted && (
          <button
            onClick={props.onUnmute}
            className="absolute inset-x-0 top-4 z-20 mx-auto w-max rounded border border-gold/50 bg-ink/90 px-4 py-2 text-xs font-bold text-gold shadow-lift hover:bg-gold hover:text-ink"
          >
            🔊 اضغط لتشغيل الصوت
          </button>
        )}

        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-ink-deep via-ink-deep/70 to-transparent px-3 pb-3 pt-10 sm:px-4">
          {isHost ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-velvet-hi bg-ink/90 p-2">
              <button
                onClick={props.onTogglePlay}
                aria-label={playing ? "إيقاف" : "تشغيل"}
                className="flex h-9 w-9 items-center justify-center rounded bg-gold font-bold text-ink transition hover:bg-gold-lit"
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <button
                onClick={() => props.onSeek(Math.max(0, props.currentTime - 10))}
                className="rounded border border-velvet-hi px-2 py-1 text-xs text-ivory hover:bg-velvet-hi"
              >
                -10s
              </button>
              <button
                onClick={() => props.onSeek(props.currentTime + 10)}
                className="rounded border border-velvet-hi px-2 py-1 text-xs text-ivory hover:bg-velvet-hi"
              >
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
              <FullscreenButton active={fullscreen} onClick={toggleFullscreen} />
            </div>
          ) : (
            // Viewers get sound and fullscreen, but never transport controls —
            // playback position stays the host's to decide.
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-velvet-hi bg-ink/90 p-2">
              <StageVolume volume={volume} onChange={applyVolume} />
              <span className="mono flex-1 text-xs text-ivory-dim">{formatTime(props.currentTime)}</span>
              <FullscreenButton active={fullscreen} onClick={toggleFullscreen} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
