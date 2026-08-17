"use client";
import { Avatar } from "@/components/ui/avatar";
import { Member } from "./types";

const VISIBLE = 6;

/**
 * The seat row. Wraps instead of stretching edge-to-edge so it survives a
 * 375px screen, and shows an overflow chip rather than silently dropping
 * everyone past the fifth person.
 */
export function MemberSeats({
  members,
  userId,
  stalledIds = []
}: {
  members: Member[];
  userId: string;
  stalledIds?: string[];
}) {
  const shown = members.slice(0, VISIBLE);
  const hidden = members.length - shown.length;

  return (
    <div className="-mt-3 flex flex-wrap items-start justify-center gap-x-3 gap-y-2 px-3">
      {shown.map(member => {
        const loading = stalledIds.includes(member.id);
        return (
          <div key={member.id} className="flex w-14 flex-col items-center">
            <span className="relative">
              <Avatar
                name={member.name}
                src={member.avatarUrl}
                size="lg"
                className={`border-2 border-ink ${loading ? "opacity-50" : ""}`}
              />
              {loading && (
                <span
                  title="لسه بيحمّل"
                  className="animate-soft-pulse absolute -bottom-0.5 -left-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink bg-curtain"
                />
              )}
            </span>
            <small className="mt-1 w-full truncate text-center text-[11px] text-ivory-dim">
              {member.id === userId ? "أنت" : member.name}
            </small>
            {member.role === "host" && <span className="mono text-[9px] tracking-wider text-gold">HOST</span>}
          </div>
        );
      })}
      {hidden > 0 && (
        <div className="flex w-14 flex-col items-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink bg-velvet-hi text-xs font-bold text-ivory-dim">
            +{hidden}
          </span>
          <small className="mt-1 text-[11px] text-ivory-dim">كمان</small>
        </div>
      )}
    </div>
  );
}
