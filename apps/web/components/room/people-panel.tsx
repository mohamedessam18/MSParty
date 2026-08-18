"use client";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Member } from "./types";

export function PeoplePanel({
  members,
  userId,
  isHost,
  stalledIds = [],
  speakingIds = [],
  cameraIds = [],
  onTransfer,
  onKick,
  onDisableCamera
}: {
  members: Member[];
  userId: string;
  isHost: boolean;
  stalledIds?: string[];
  speakingIds?: string[];
  cameraIds?: string[];
  onTransfer: (userId: string) => void;
  onKick: (userId: string) => void;
  onDisableCamera?: (userId: string) => void;
}) {
  return (
    <div className="grid gap-2 p-3 sm:grid-cols-2">
      {members.map(member => {
        const isSelf = member.id === userId;
        return (
          <div key={member.id} className="flex items-center gap-3 rounded-lg bg-velvet-hi/50 p-3">
            <Avatar name={member.name} src={member.avatarUrl} />
            <span className="min-w-0 flex-1 truncate text-sm text-ivory">
              {isSelf ? "أنت" : member.name}
              {stalledIds.includes(member.id) && <span className="mr-1.5 text-xs text-curtain">· بيحمّل</span>}
              {speakingIds.includes(member.id) && <span className="mr-1.5 text-xs text-gold">· 🔊</span>}
            </span>
            <span
              className={`mono shrink-0 rounded px-2 py-1 text-[10px] tracking-wider ${
                member.role === "host" ? "bg-gold text-ink" : "bg-ink text-ivory-dim"
              }`}
            >
              {member.role === "host" ? "HOST" : "VIEWER"}
            </span>
            {isHost && !isSelf && (
              <span className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  // A guest session cannot be signed back into, so handing them
                  // the room would strand it with an unreachable host.
                  disabled={member.isGuest}
                  onClick={() => onTransfer(member.id)}
                  title={member.isGuest ? "الضيف لازم يعمل حساب الأول" : "سلّمه الاستضافة"}
                >
                  ★
                </Button>
                {cameraIds.includes(member.id) && onDisableCamera && (
                  <Button size="sm" variant="ghost" onClick={() => onDisableCamera(member.id)} title="اقفل كاميرته">
                    📷
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => onKick(member.id)} title="اطرده من البارتي">
                  ✕
                </Button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
