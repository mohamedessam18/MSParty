"use client";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { CallPeer } from "./use-call";

/** Peer audio lives in real <audio> elements so the browser mixes it for us. */
function PeerAudio({ peer }: { peer: CallPeer }) {
  const element = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (element.current && element.current.srcObject !== peer.stream) {
      element.current.srcObject = peer.stream;
      element.current.play().catch(() => undefined);
    }
  }, [peer.stream]);
  return <audio ref={element} autoPlay playsInline />;
}

export function VoiceBar({
  joined,
  micMuted,
  cameraOn,
  peers,
  speakingIds,
  error,
  onJoin,
  onLeave,
  onToggleMic,
  onToggleCamera
}: {
  joined: boolean;
  micMuted: boolean;
  cameraOn: boolean;
  peers: CallPeer[];
  speakingIds: string[];
  error: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-velvet-hi bg-velvet/50 p-2">
      {peers.map(peer => (
        <PeerAudio key={peer.socketId} peer={peer} />
      ))}

      {!joined ? (
        <Button size="sm" variant="ghost" onClick={onJoin}>
          🎙️ ادخل الدردشة الصوتية
        </Button>
      ) : (
        <>
          <Button size="sm" variant={micMuted ? "danger" : "primary"} onClick={onToggleMic}>
            {micMuted ? "🎙️ المايك مقفول" : "🎙️ المايك شغال"}
          </Button>
          <Button size="sm" variant={cameraOn ? "primary" : "ghost"} onClick={onToggleCamera}>
            {cameraOn ? "📷 الكاميرا مفتوحة" : "📷 افتح الكاميرا"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onLeave}>
            اخرج
          </Button>
          <span className="text-xs text-ivory-dim">
            {peers.length ? `${peers.length + 1} في المكالمة` : "مستنيين حد يدخل"}
          </span>
          {peers
            .filter(peer => speakingIds.includes(peer.userId))
            .map(peer => (
              <span key={peer.socketId} className="animate-soft-pulse rounded bg-gold/20 px-2 py-1 text-xs text-gold">
                🔊 {peer.name}
              </span>
            ))}
        </>
      )}

      {error && <p className="w-full text-center text-xs text-curtain">{error}</p>}
    </div>
  );
}
