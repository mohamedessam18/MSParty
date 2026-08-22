"use client";
import { useEffect, useRef } from "react";
declare global { interface Window { YT: any; onYouTubeIframeAPIReady: () => void; } }
export type PlayerHandle = {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  currentTime: () => number;
  /** 0 until the video's metadata has loaded. */
  duration: () => number;
  setVolume: (percent: number) => void;
  mute: (muted: boolean) => void;
  /** Used to drift back into sync gradually instead of seeking. */
  setRate: (rate: number) => void;
};
export function YouTubePlayer({ videoId, enabled, onReady, onControl, onError, onBuffering, onEnded }: { videoId: string; enabled: boolean; onReady: (player: PlayerHandle) => void; onControl: (type: "play" | "pause" | "seek", timestamp: number) => void; onError?: (errorMsg: string) => void; onBuffering?: (buffering: boolean) => void; onEnded?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>();
  const onReadyRef = useRef(onReady);
  const onControlRef = useRef(onControl);
  const onErrorRef = useRef(onError);
  const onBufferingRef = useRef(onBuffering);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onReadyRef.current = onReady;
    onControlRef.current = onControl;
    onErrorRef.current = onError;
    onBufferingRef.current = onBuffering;
    onEndedRef.current = onEnded;
  }, [onReady, onControl, onError, onBuffering]);

  useEffect(() => {
    if (!videoId) return;
    let playerInstance: any = null;
    let cancelled = false;

    const create = () => {
      if (cancelled || !containerRef.current) return;
      if (playerInstance) {
        try { playerInstance.destroy(); } catch (e) {}
      }
      containerRef.current.innerHTML = "";
      const targetDiv = document.createElement("div");
      targetDiv.className = "w-full h-full";
      containerRef.current.appendChild(targetDiv);

      try {
        playerInstance = new window.YT.Player(targetDiv, {
          videoId,
          playerVars: {
            // Nobody uses YouTube's own bar any more — the room draws its own
            // scrubber, volume, speed and fullscreen — and hiding it takes the
            // progress bar, share button, settings and logo with it.
            controls: 0,
            disablekb: 1,
            fs: 0,
            enablejsapi: 1,
            origin: typeof window !== "undefined" ? window.location.origin : "",
            // Since 2018 this only limits suggestions to the same channel; it
            // no longer removes them. The paused-state cover does that.
            rel: 0,
            iv_load_policy: 3,
            playsinline: 1,
            autoplay: 1,
            // Viewers start muted so the browser lets us autoplay at all.
            // Unmuted autoplay without a user gesture is blocked, and playVideo()
            // fails silently when it is — which left viewers on a frozen frame.
            mute: enabled ? 0 : 1,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = playerInstance;
              onReadyRef.current({
                seekTo: seconds => {
                  if (playerInstance && typeof playerInstance.seekTo === "function") {
                    playerInstance.seekTo(seconds, true);
                  }
                },
                play: () => {
                  if (playerInstance && typeof playerInstance.playVideo === "function") {
                    playerInstance.playVideo();
                  }
                },
                pause: () => {
                  if (playerInstance && typeof playerInstance.pauseVideo === "function") {
                    playerInstance.pauseVideo();
                  }
                },
                currentTime: () => {
                  if (playerInstance && typeof playerInstance.getCurrentTime === "function") {
                    return playerInstance.getCurrentTime();
                  }
                  return 0;
                },
                duration: () => {
                  if (playerInstance && typeof playerInstance.getDuration === "function") {
                    return playerInstance.getDuration() || 0;
                  }
                  return 0;
                },
                setVolume: percent => {
                  if (playerInstance && typeof playerInstance.setVolume === "function") {
                    playerInstance.setVolume(Math.max(0, Math.min(100, percent)));
                  }
                },
                mute: muted => {
                  if (!playerInstance) return;
                  if (muted && typeof playerInstance.mute === "function") playerInstance.mute();
                  if (!muted && typeof playerInstance.unMute === "function") playerInstance.unMute();
                },
                setRate: rate => {
                  if (playerInstance && typeof playerInstance.setPlaybackRate === "function") {
                    playerInstance.setPlaybackRate(rate);
                  }
                }
              });
            },
            onError: (event: any) => {
              if (cancelled) return;
              let errorMsg = "تعذر تشغيل هذا الفيديو على يوتيوب.";
              if (event.data === 2) errorMsg = "رابط فيديو YouTube غير صحيح.";
              else if (event.data === 5) errorMsg = "خطأ في مشغل HTML5 الخاص برابط يوتيوب.";
              else if (event.data === 100) errorMsg = "الفيديو غير موجود أو خاص (Private).";
              else if (event.data === 101 || event.data === 150) errorMsg = "صاحب الفيديو يمنع تشغيله خارج موقع YouTube رسميًا.";
              onErrorRef.current?.(errorMsg);
            },
            onStateChange: (event: any) => {
              if (cancelled) return;
              // Buffering is reported for everyone, not just the host — the
              // room needs to know who is still loading.
              if (event.data === window.YT.PlayerState.BUFFERING) onBufferingRef.current?.(true);
              if (event.data === window.YT.PlayerState.PLAYING) onBufferingRef.current?.(false);
              if (!enabled) return;
              if (event.data === window.YT.PlayerState.PLAYING) {
                if (playerInstance && typeof playerInstance.getCurrentTime === "function") {
                  onControlRef.current("play", playerInstance.getCurrentTime());
                }
              }
              if (event.data === window.YT.PlayerState.PAUSED) {
                if (playerInstance && typeof playerInstance.getCurrentTime === "function") {
                  onControlRef.current("pause", playerInstance.getCurrentTime());
                }
              }
              // Reaching the end has to be reported, or the party stays flagged
              // as playing and its live timestamp climbs past the runtime.
              if (event.data === window.YT.PlayerState.ENDED) {
                const end = typeof playerInstance?.getDuration === "function" ? playerInstance.getDuration() || 0 : 0;
                onControlRef.current("pause", end);
                // Reported separately from the pause it also sends. The server
                // cannot tell the two apart — it does not know the duration —
                // and guessing gives either a queue that never advances or one
                // that skips a film because somebody paused near the end.
                onEndedRef.current?.();
              }
            }
          }
        });
      } catch (err) {
        console.error("YouTube Player Init Error:", err);
      }
    };

    if (window.YT?.Player) {
      create();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        create();
      };
      if (!document.querySelector("script[src='https://www.youtube.com/iframe_api']")) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (playerInstance && typeof playerInstance.destroy === "function") {
        try { playerInstance.destroy(); } catch (e) {}
      }
      playerRef.current = null;
    };
  }, [videoId, enabled]);

  return (
    // Fills whatever the stage gives it: a 16:9 box on the page, the whole
    // screen in fullscreen. Its own aspect ratio here would fight that.
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
