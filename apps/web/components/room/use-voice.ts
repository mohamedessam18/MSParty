"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

const ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

export type VoicePeer = { socketId: string; userId: string; name: string; stream: MediaStream };

/**
 * Full-mesh voice: every participant holds one peer connection per other
 * participant, and the sync server only relays SDP and ICE. Fine for the
 * handful of people a watch party actually has; it would need an SFU beyond
 * roughly six.
 */
export function useVoice(
  socket: React.MutableRefObject<Socket | undefined>,
  partyId: string,
  /** Signals that socket.current exists, so the listeners can be attached. */
  ready: boolean
) {
  const [joined, setJoined] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const localStream = useRef<MediaStream | null>(null);
  const connections = useRef(new Map<string, RTCPeerConnection>());
  const audioContext = useRef<AudioContext | null>(null);

  const closePeer = useCallback((socketId: string) => {
    connections.current.get(socketId)?.close();
    connections.current.delete(socketId);
    setPeers(items => items.filter(peer => peer.socketId !== socketId));
  }, []);

  const createConnection = useCallback(
    (socketId: string, userId: string, name: string) => {
      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      connections.current.set(socketId, connection);

      localStream.current?.getTracks().forEach(track => connection.addTrack(track, localStream.current!));

      connection.onicecandidate = event => {
        if (event.candidate) {
          socket.current?.emit("voice:signal", { toSocketId: socketId, data: { candidate: event.candidate } });
        }
      };
      connection.ontrack = event => {
        const stream = event.streams[0];
        setPeers(items => [...items.filter(peer => peer.socketId !== socketId), { socketId, userId, name, stream }]);
      };
      connection.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(connection.connectionState)) closePeer(socketId);
      };
      return connection;
    },
    [socket, closePeer]
  );

  const leave = useCallback(() => {
    socket.current?.emit("voice:leave", { partyId });
    connections.current.forEach(connection => connection.close());
    connections.current.clear();
    localStream.current?.getTracks().forEach(track => track.stop());
    localStream.current = null;
    audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
    setPeers([]);
    setJoined(false);
    setSpeakingIds([]);
  }, [partyId, socket]);

  const join = useCallback(async () => {
    setError(null);
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch {
      setError("مش قادرين نوصل للمايك. اسمح بالإذن من المتصفح وجرّب تاني.");
      return;
    }

    // Watch our own level so others can see who is talking.
    try {
      const context = new AudioContext();
      audioContext.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(localStream.current).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let wasSpeaking = false;
      const timer = window.setInterval(() => {
        analyser.getByteFrequencyData(data);
        const level = data.reduce((sum, value) => sum + value, 0) / data.length;
        const speaking = level > 18 && !localStream.current?.getAudioTracks()[0]?.muted;
        if (speaking !== wasSpeaking) {
          wasSpeaking = speaking;
          socket.current?.emit("voice:speaking", { partyId, speaking });
        }
      }, 300);
      context.addEventListener("statechange", () => context.state === "closed" && window.clearInterval(timer));
    } catch {
      // Level metering is a nicety; voice still works without it.
    }

    setJoined(true);
    socket.current?.emit("voice:join", { partyId });
  }, [partyId, socket]);

  function toggleMic() {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicMuted(!track.enabled);
  }

  useEffect(() => {
    const client = socket.current;
    if (!client) return;

    // The newcomer offers to everyone already in the call; existing peers only
    // answer. Without that rule both sides would offer and glare.
    const onPeers = async ({ peers: existing }: { peers: { socketId: string; userId: string; name: string }[] }) => {
      for (const peer of existing) {
        const connection = createConnection(peer.socketId, peer.userId, peer.name);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        client.emit("voice:signal", { toSocketId: peer.socketId, data: { sdp: connection.localDescription } });
      }
    };

    const onSignal = async ({ fromSocketId, data }: { fromSocketId: string; data: any }) => {
      let connection = connections.current.get(fromSocketId);
      if (data.sdp) {
        if (!connection) connection = createConnection(fromSocketId, data.userId || "", data.name || "");
        await connection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === "offer") {
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          client.emit("voice:signal", { toSocketId: fromSocketId, data: { sdp: connection.localDescription } });
        }
      } else if (data.candidate && connection) {
        await connection.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => undefined);
      }
    };

    const onPeerJoined = ({ socketId, userId, name }: { socketId: string; userId: string; name: string }) => {
      // Register the identity now; the offer arrives right after.
      if (!connections.current.has(socketId)) createConnection(socketId, userId, name);
    };

    const onPeerLeft = ({ socketId }: { socketId: string }) => closePeer(socketId);
    const onSpeaking = ({ userId, speaking }: { userId: string; speaking: boolean }) =>
      setSpeakingIds(items => (speaking ? [...new Set([...items, userId])] : items.filter(id => id !== userId)));

    client.on("voice:peers", onPeers);
    client.on("voice:signal", onSignal);
    client.on("voice:peerJoined", onPeerJoined);
    client.on("voice:peerLeft", onPeerLeft);
    client.on("voice:speaking", onSpeaking);

    return () => {
      client.off("voice:peers", onPeers);
      client.off("voice:signal", onSignal);
      client.off("voice:peerJoined", onPeerJoined);
      client.off("voice:peerLeft", onPeerLeft);
      client.off("voice:speaking", onSpeaking);
    };
    // Keyed on `ready`, not on `joined`: the handlers must already be attached
    // when join() emits, or the peer list reply arrives with nothing listening.
  }, [socket, ready, createConnection, closePeer]);

  useEffect(() => () => leave(), [leave]);

  return { joined, micMuted, peers, speakingIds, error, join, leave, toggleMic };
}
