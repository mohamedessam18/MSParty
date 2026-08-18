"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CallPeer } from "./use-call";

type Tile = { key: string; name: string; stream: MediaStream; speaking: boolean; self: boolean };

/**
 * Scatters live cameras around the page rather than lining them up, so the room
 * feels like people sitting around you rather than a meeting grid. Positions
 * start in the margins beside the video and can be dragged anywhere.
 */
export function CameraBubbles({
  peers,
  localStream,
  cameraOn,
  speakingIds,
  userId,
  compact = false
}: {
  peers: CallPeer[];
  localStream: MediaStream | null;
  cameraOn: boolean;
  speakingIds: string[];
  userId: string;
  compact?: boolean;
}) {
  const tiles = useMemo<Tile[]>(() => {
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

  if (!tiles.length) return null;

  // In fullscreen the stage is the only thing on screen, so the bubbles tuck
  // into a corner column instead of floating over the film.
  if (compact) {
    return (
      <div className="pointer-events-none absolute right-3 top-3 z-30 flex flex-col gap-2">
        {tiles.map(tile => (
          <Bubble key={tile.key} tile={tile} size={72} />
        ))}
      </div>
    );
  }

  return (
    <>
      {tiles.map((tile, index) => (
        <FloatingBubble key={tile.key} tile={tile} index={index} />
      ))}
    </>
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
      // Hidden on small screens: a phone has no margins to float into.
      className="fixed z-30 hidden touch-none lg:block"
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
    <div className={`pointer-events-auto flex flex-col items-center ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}>
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
      <span className="mt-1 max-w-[6rem] truncate rounded bg-ink-deep/80 px-1.5 text-[10px] text-ivory">{tile.name}</span>
    </div>
  );
}
