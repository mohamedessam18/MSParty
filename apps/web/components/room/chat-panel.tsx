"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Message } from "./types";

export function ChatPanel({
  messages,
  userId,
  typing,
  onSend,
  onTyping
}: {
  messages: Message[];
  userId: string;
  typing: string[];
  onSend: (text: string) => void;
  onTyping: () => void;
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Follow new messages, but not while the user is reading further up.
  useEffect(() => {
    const element = scroller.current;
    if (element && pinnedToBottom.current) element.scrollTop = element.scrollHeight;
  }, [messages, typing]);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    pinnedToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
    pinnedToBottom.current = true;
  }

  return (
    <div className="p-3 sm:p-4">
      <div
        ref={scroller}
        onScroll={onScroll}
        aria-live="polite"
        className="h-56 space-y-3 overflow-y-auto pl-1 sm:h-64"
      >
        {messages.length ? (
          messages.map((entry, index) => (
            <article key={`${entry.sentAt}-${index}`} className="animate-message-in flex gap-2 text-sm">
              <Avatar name={entry.name} src={entry.avatarUrl} size="sm" />
              <p className="rounded-lg rounded-tr-sm bg-velvet-hi px-3 py-2 text-ivory">
                <b className="ml-1.5 text-gold">{entry.userId === userId ? "أنت" : entry.name}</b>
                {entry.message}
              </p>
            </article>
          ))
        ) : (
          <p className="flex h-full items-center justify-center text-center text-sm text-ivory-dim">
            لسه محدش كتب حاجة.
            <br />
            ابدأوا بسؤال عن أحلى مشهد.
          </p>
        )}
      </div>

      <p className="mt-1 h-4 text-xs text-ivory-dim" aria-live="polite">
        {typing.length === 1 && `${typing[0]} بيكتب...`}
        {typing.length > 1 && `${typing.length} بيكتبوا...`}
      </p>

      <form className="mt-2 flex gap-2" onSubmit={submit}>
        <Input
          placeholder="اكتب رسالة للسهرة"
          value={draft}
          onChange={event => {
            setDraft(event.target.value);
            onTyping();
          }}
        />
        <Button type="submit" aria-label="إرسال">
          إرسال
        </Button>
      </form>
    </div>
  );
}
