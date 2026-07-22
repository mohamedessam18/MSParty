"use client";
import { useEffect, useRef } from "react";
declare global { interface Window { YT: any; onYouTubeIframeAPIReady: () => void; } }
export type PlayerHandle = { seekTo: (seconds: number) => void; play: () => void; pause: () => void; currentTime: () => number };
export function YouTubePlayer({ videoId, enabled, onReady, onControl, onError }: { videoId: string; enabled: boolean; onReady: (player: PlayerHandle) => void; onControl: (type: "play" | "pause" | "seek", timestamp: number) => void; onError?: (errorMsg: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>();
  const onReadyRef = useRef(onReady);
  const onControlRef = useRef(onControl);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onReadyRef.current = onReady;
    onControlRef.current = onControl;
    onErrorRef.current = onError;
  }, [onReady, onControl, onError]);

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
            controls: enabled ? 1 : 0,
            disablekb: enabled ? 0 : 1,
            enablejsapi: 1,
            origin: typeof window !== "undefined" ? window.location.origin : "",
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            playsinline: 1,
            autoplay: 1,
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
              if (cancelled || !enabled) return;
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
    <div className="relative aspect-video w-full bg-black overflow-hidden rounded-[18px]">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
