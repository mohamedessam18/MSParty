"use client";
import { Button } from "@/components/ui/button";
import { FlyingReaction, REACTIONS } from "./types";

/**
 * Reactions now arrive from the server, so everyone in the room sees the same
 * ones. Previously this was local state and only the sender ever saw anything.
 */
export function ReactionLayer({ reactions }: { reactions: FlyingReaction[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-16 z-20 h-40 overflow-hidden">
      {reactions.map(reaction => (
        <span
          key={reaction.key}
          className="animate-reaction-float absolute bottom-0 text-3xl drop-shadow"
          style={{ insetInlineStart: `${reaction.offset}%` }}
        >
          {reaction.emoji}
        </span>
      ))}
    </div>
  );
}

export function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs text-ivory-dim">شارك لحظتك:</span>
      {REACTIONS.map(emoji => (
        <Button
          key={emoji}
          variant="subtle"
          size="sm"
          aria-label={`ابعت ${emoji}`}
          onClick={() => onReact(emoji)}
          className="text-lg leading-none transition hover:-translate-y-0.5"
        >
          {emoji}
        </Button>
      ))}
    </div>
  );
}
