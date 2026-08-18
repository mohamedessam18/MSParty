"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

const ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

/**
 * Deliberately tiny. In a full mesh each person uploads one copy per other
 * person, so a 720p tile would saturate a phone at four participants and starve
 * the film itself. Thumbnails keep the mesh viable.
 */
const CAMERA: MediaTrackConstraints = {
  width: { ideal: 160 },
  height: { ideal: 120 },
  frameRate: { ideal: 15, max: 15 }
};

export type CallPeer = { socketId: string; userId: string; name: string; stream: MediaStream; hasVideo: boolean };

type PeerState = {
  connection: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
};

export function useCall(socket: React.MutableRefObject<Socket | undefined>, partyId: string, ready: boolean) {
  const [joined, setJoined] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [peers, setPeers] = useState<CallPeer[]>([]);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  /**
   * Who has a camera open, straight from the server. Derived from peers alone
   * this would be empty for a host who never joined the call, leaving them
   * unable to moderate cameras at all.
   */
  const [cameraUserIds, setCameraUserIds] = useState<string[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stream = useRef<MediaStream | null>(null);
  const videoTrack = useRef<MediaStreamTrack | null>(null);
  const states = useRef(new Map<string, PeerState>());
  const context = useRef<AudioContext | null>(null);
  const selfId = useRef<string>("");

  const closePeer = useCallback((socketId: string) => {
    states.current.get(socketId)?.connection.close();
    states.current.delete(socketId);
    setPeers(items => items.filter(peer => peer.socketId !== socketId));
  }, []);

  const createPeer = useCallback(
    (socketId: string, userId: string, name: string) => {
      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      // Perfect negotiation needs one side willing to yield on a collision.
      // Comparing socket ids gives both ends the same answer without a round trip.
      const state: PeerState = { connection, polite: selfId.current < socketId, makingOffer: false, ignoreOffer: false };
      states.current.set(socketId, state);

      stream.current?.getTracks().forEach(track => connection.addTrack(track, stream.current!));

      connection.onicecandidate = event => {
        if (event.candidate) socket.current?.emit("voice:signal", { toSocketId: socketId, data: { candidate: event.candidate } });
      };
      // Turning a camera on mid-call adds a track, which needs a fresh offer.
      connection.onnegotiationneeded = async () => {
        try {
          state.makingOffer = true;
          await connection.setLocalDescription();
          socket.current?.emit("voice:signal", { toSocketId: socketId, data: { sdp: connection.localDescription } });
        } catch {
          // A parallel negotiation already handled it.
        } finally {
          state.makingOffer = false;
        }
      };
      connection.ontrack = event => {
        const remote = event.streams[0];
        const live = () => remote.getVideoTracks().some(track => track.readyState === "live" && !track.muted);
        const sync = () =>
          setPeers(items => {
            const rest = items.filter(peer => peer.socketId !== socketId);
            return [...rest, { socketId, userId, name, stream: remote, hasVideo: live() }];
          });

        // removetrack alone is not dependable across browsers when a sender is
        // removed, so follow the track's own lifecycle as well. Whichever
        // fires first, the bubble disappears instead of freezing on a still.
        if (event.track.kind === "video") {
          event.track.onended = sync;
          event.track.onmute = sync;
          event.track.onunmute = sync;
        }
        remote.onremovetrack = sync;
        sync();
      };
      connection.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(connection.connectionState)) closePeer(socketId);
      };
      return state;
    },
    [socket, closePeer]
  );

  const leave = useCallback(() => {
    socket.current?.emit("voice:leave", { partyId });
    states.current.forEach(state => state.connection.close());
    states.current.clear();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    videoTrack.current = null;
    context.current?.close().catch(() => undefined);
    context.current = null;
    setLocalStream(null);
    setPeers([]);
    setJoined(false);
    setCameraOn(false);
    setSpeakingIds([]);
  }, [partyId, socket]);

  const join = useCallback(async () => {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      setLocalStream(stream.current);
    } catch {
      setError("مش قادرين نوصل للمايك. اسمح بالإذن من المتصفح وجرّب تاني.");
      return;
    }

    try {
      const audio = new AudioContext();
      context.current = audio;
      const analyser = audio.createAnalyser();
      analyser.fftSize = 512;
      audio.createMediaStreamSource(stream.current).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let was = false;
      const timer = window.setInterval(() => {
        analyser.getByteFrequencyData(data);
        const level = data.reduce((sum, value) => sum + value, 0) / data.length;
        const speaking = level > 18 && !!stream.current?.getAudioTracks()[0]?.enabled;
        if (speaking !== was) {
          was = speaking;
          socket.current?.emit("voice:speaking", { partyId, speaking });
        }
      }, 300);
      audio.addEventListener("statechange", () => audio.state === "closed" && window.clearInterval(timer));
    } catch {
      // Level metering is a nicety; the call works without it.
    }

    selfId.current = socket.current?.id || "";
    setJoined(true);
    socket.current?.emit("voice:join", { partyId });
  }, [partyId, socket]);

  const stopCamera = useCallback(() => {
    const track = videoTrack.current;
    if (!track) return;
    track.stop();
    stream.current?.removeTrack(track);
    states.current.forEach(state => {
      const sender = state.connection.getSenders().find(item => item.track === track);
      if (sender) state.connection.removeTrack(sender);
    });
    videoTrack.current = null;
    setCameraOn(false);
    socket.current?.emit("camera:off", { partyId });
  }, [partyId, socket]);

  const startCamera = useCallback(async () => {
    if (!stream.current) return;
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: CAMERA });
      const track = media.getVideoTracks()[0];
      videoTrack.current = track;
      stream.current.addTrack(track);
      // addTrack fires onnegotiationneeded on each connection, which is what
      // actually pushes the new stream to everyone already in the call.
      states.current.forEach(state => state.connection.addTrack(track, stream.current!));
      setCameraOn(true);
      setLocalStream(stream.current);
      socket.current?.emit("camera:on", { partyId });
    } catch {
      setError("مش قادرين نفتح الكاميرا. اسمح بالإذن وجرّب تاني.");
    }
  }, [partyId, socket]);

  function toggleMic() {
    const track = stream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicMuted(!track.enabled);
  }

  useEffect(() => {
    const client = socket.current;
    if (!client) return;

    const onPeers = ({ peers: existing }: { peers: { socketId: string; userId: string; name: string }[] }) => {
      selfId.current = client.id || selfId.current;
      // The newcomer offers to everyone already here; existing peers answer.
      existing.forEach(peer => createPeer(peer.socketId, peer.userId, peer.name));
    };

    const onSignal = async ({ fromSocketId, data }: { fromSocketId: string; data: any }) => {
      const state = states.current.get(fromSocketId) ?? createPeer(fromSocketId, data.userId || "", data.name || "");
      const { connection } = state;
      try {
        if (data.sdp) {
          const collision = data.sdp.type === "offer" && (state.makingOffer || connection.signalingState !== "stable");
          state.ignoreOffer = !state.polite && collision;
          if (state.ignoreOffer) return;
          await connection.setRemoteDescription(new RTCSessionDescription(data.sdp));
          if (data.sdp.type === "offer") {
            await connection.setLocalDescription();
            client.emit("voice:signal", { toSocketId: fromSocketId, data: { sdp: connection.localDescription } });
          }
        } else if (data.candidate) {
          await connection.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => undefined);
        }
      } catch {
        // A dropped negotiation recovers on the next one.
      }
    };

    const onPeerJoined = ({ socketId, userId, name }: { socketId: string; userId: string; name: string }) => {
      if (!states.current.has(socketId)) createPeer(socketId, userId, name);
    };
    const onPeerLeft = ({ socketId }: { socketId: string }) => closePeer(socketId);
    const onSpeaking = ({ userId, speaking }: { userId: string; speaking: boolean }) =>
      setSpeakingIds(items => (speaking ? [...new Set([...items, userId])] : items.filter(id => id !== userId)));
    const onCameraList = ({ userIds }: { userIds: string[] }) => setCameraUserIds(userIds);
    const onCameraBlocked = ({ message }: { message: string }) => {
      setError(message);
      stopCamera();
    };

    client.on("voice:peers", onPeers);
    client.on("voice:signal", onSignal);
    client.on("voice:peerJoined", onPeerJoined);
    client.on("voice:peerLeft", onPeerLeft);
    client.on("voice:speaking", onSpeaking);
    client.on("camera:list", onCameraList);
    client.on("camera:blocked", onCameraBlocked);

    return () => {
      client.off("voice:peers", onPeers);
      client.off("voice:signal", onSignal);
      client.off("voice:peerJoined", onPeerJoined);
      client.off("voice:peerLeft", onPeerLeft);
      client.off("voice:speaking", onSpeaking);
      client.off("camera:list", onCameraList);
      client.off("camera:blocked", onCameraBlocked);
    };
  }, [socket, ready, createPeer, closePeer, stopCamera]);

  useEffect(() => () => leave(), [leave]);

  return {
    joined,
    micMuted,
    cameraOn,
    peers,
    speakingIds,
    cameraUserIds,
    localStream,
    error,
    join,
    leave,
    toggleMic,
    toggleCamera: () => (cameraOn ? stopCamera() : startCamera())
  };
}
