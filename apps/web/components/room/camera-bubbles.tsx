"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CallPeer } from "./use-call";

type Tile = { key: string; name: string; stream: MediaStream; speaking: boolean; self: boolean };

/**
 * Only one layout is ever mounted. Rendering both and hiding one with CSS would
 * keep decoding every stream twice, which is exactly the cost a phone cannot
 * afford while it is also decoding the film.
 */
function useIsWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

function useTiles(
  peers: CallPeer[],
  localStream: MediaStream | null,
  cameraOn: boolean,
  speakingIds: string[],
  userId: string
) {
  return useMemo<Tile[]>(() => {
    const list: Tile[] = peers
      .filter(peer => peer.hasVideo)
      .map(peer => ({
        key: peer.socketId,
        name: peer.name,
        stream: peer.stream,
        speaking: speakingIds.includes(peer.userId),
        self: false
      }));
    if (cameraOn && localStream) {
      list.push({ key: "self", name: "أنت", stream: localStream, speaking: speakingIds.includes(userId), self: true });
    }
    return list;
  }, [peers, localStream, cameraOn, speakingIds, userId]);
}

type CameraProps = {
  peers: CallPeer[];
  localStream: MediaStream | null;
  cameraOn: boolean;
  speakingIds: string[];
  userId: string;
};

/**
 * Desktop: cameras scatter into the margins beside the video and can be dragged
 * anywhere. A phone has no margins, so this renders nothing there — CameraStrip
 * covers that case instead.
 */
export function CameraBubbles(props: CameraProps) {
  const wide = useIsWide();
  const tiles = useTiles(props.peers, props.localStream, props.cameraOn, props.speakingIds, props.userId);
  if (!wide || !tiles.length) return null;
  return (
    <>
      {tiles.map((tile, index) => (
        <FloatingBubble key={tile.key} tile={tile} index={index} />
      ))}
    </>
  );
}

/** Phone layout: a row under the video that scrolls sideways if it overflows. */
export function CameraStrip(props: CameraProps) {
  const wide = useIsWide();
  const tiles = useTiles(props.peers, props.localStream, props.cameraOn, props.speakingIds, props.userId);
  if (wide || !tiles.length) return null;
  return (
    <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tiles.map(tile => (
        <Bubble key={tile.key} tile={tile} size={64} />
      ))}
    </div>
  );
}

/** Fullscreen: the stage is the whole screen, so the tiles tuck into a corner. */
export function CameraCorner(props: CameraProps) {
  const wide = useIsWide();
  const tiles = useTiles(props.peers, props.localStream, props.cameraOn, props.speakingIds, props.userId);
  if (!tiles.length) return null;
  return (
    <div
      className={`pointer-events-none absolute z-30 flex gap-2 ${
        // Landscape phones are short: a column would run off the bottom, so the
        // tiles lie along the top edge instead.
        wide ? "right-3 top-3 flex-col" : "inset-x-3 top-3 flex-row overflow-x-auto"
      }`}
    >
      {tiles.map(tile => (
        <Bubble key={tile.key} tile={tile} size={wide ? 72 : 52} />
      ))}
    </div>
  );
}

/** Keeps clear of the centre column, where the video and panels live. */
function initialSpot(index: number) {
  const leftSide = index % 2 === 0;
  const band = Math.floor(index / 2);
  const top = 18 + band * 22 + (index % 3) * 4;
  const inset = 2 + ((index * 7) % 8);
  return leftSide ? { top: `${top}%`, left: `${inset}%` } : { top: `${top}%`, right: `${inset}%` };
}

function FloatingBubble({ tile, index }: { tile: Tile; index: number }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  function onPointerDown(event: React.PointerEvent) {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragging.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!dragging.current) return;
    setOffset({ x: event.clientX - dragging.current.x, y: event.clientY - dragging.current.y });
  }
  function onPointerUp() {
    dragging.current = null;
  }

  return (
    <div
      className="fixed z-30 touch-none"
      style={{ ...initialSpot(index), transform: `translate(${offset.x}px, ${offset.y}px)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Bubble tile={tile} size={104} draggable />
    </div>
  );
}

function Bubble({ tile, size, draggable = false }: { tile: Tile; size: number; draggable?: boolean }) {
  const element = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (element.current && element.current.srcObject !== tile.stream) {
      element.current.srcObject = tile.stream;
      element.current.play().catch(() => undefined);
    }
  }, [tile.stream]);

  return (
    <div
      className={`pointer-events-auto flex shrink-0 flex-col items-center ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <div
        className={`overflow-hidden rounded-full border-2 shadow-lift transition-colors ${
          tile.speaking ? "border-gold" : "border-velvet-hi"
        }`}
        style={{ width: size, height: size }}
      >
        <video
          ref={element}
          autoPlay
          playsInline
          // Never play your own microphone back at you.
          muted={tile.self}
          className="h-full w-full scale-x-[-1] object-cover"
        />
      </div>
      <span className="mt-1 max-w-[5.5rem] truncate rounded bg-ink-deep/80 px-1.5 text-[10px] text-ivory">
        {tile.name}
      </span>
    </div>
  );
}
