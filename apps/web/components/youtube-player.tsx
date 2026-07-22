"use client";
import { useEffect, useRef } from "react";
declare global { interface Window { YT: any; onYouTubeIframeAPIReady: () => void; } }
export type PlayerHandle = { seekTo: (seconds: number) => void; play: () => void; pause: () => void; currentTime: () => number };
export function YouTubePlayer({ videoId, enabled, onReady, onControl }: { videoId: string; enabled: boolean; onReady: (player: PlayerHandle) => void; onControl: (type: "play" | "pause" | "seek", timestamp: number) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>();
  const onReadyRef = useRef(onReady);
  const onControlRef = useRef(onControl);

  useEffect(() => {
    onReadyRef.current = onReady;
    onControlRef.current = onControl;
  }, [onReady, onControl]);

  useEffect(() => {
    let playerInstance: any = null;
    const create = () => {
      if (playerInstance) {
        try { playerInstance.destroy(); } catch (e) {}
      }
      playerInstance = new window.YT.Player(element.current!, {
        videoId,
        playerVars: { controls: enabled ? 1 : 0, disablekb: enabled ? 0 : 1 },
        events: {
          onReady: () => {
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
          onStateChange: (event: any) => {
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
          }
        }
      });
    };

    if (window.YT?.Player) create();
    else {
      window.onYouTubeIframeAPIReady = create;
      if (!document.querySelector("script[src='https://www.youtube.com/iframe_api']")) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      if (playerInstance && typeof playerInstance.destroy === "function") {
        try { playerInstance.destroy(); } catch (e) {}
      }
      playerRef.current = null;
    };
  }, [videoId, enabled]);

  return <div ref={element} className="aspect-video w-full" />;
}
