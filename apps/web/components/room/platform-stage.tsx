"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { platformBySlug } from "@/lib/platforms";

/** The extension announces itself on the document element when it loads. */
const EXTENSION_MARKER = "mspartyExtension";

function useExtension() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setVersion(document.documentElement.dataset[EXTENSION_MARKER] ?? null);
    read();
    // The content script may land after React does, so watch for it rather than
    // deciding once and being wrong for the rest of the session.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-msparty-extension"] });
    return () => observer.disconnect();
  }, []);

  return version;
}

/**
 * What the room shows when the party is being held on a streaming service.
 *
 * There is no player here and there cannot be one: these services refuse to be
 * framed, and their video is encrypted against their own origin. Everyone
 * watches on the service's own site — this panel is the doorway to it, and the
 * chat and voice around it keep working for people who are not watching at all.
 */
export function PlatformStage({
  platform,
  contentUrl,
  title,
  isHost,
  memberCount
}: {
  platform: string | null;
  contentUrl: string;
  title: string;
  isHost: boolean;
  memberCount: number;
}) {
  const service = platformBySlug(platform);
  const extension = useExtension();

  return (
    <div className="marquee-frame">
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-ink-deep p-6 text-center">
        <span
          aria-hidden
          className="mono flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-lg text-gold"
        >
          {service?.mark ?? "◈"}
        </span>

        <div>
          <p className="mono text-xs tracking-[.2em] text-gold">{service?.label ?? "منصة"}</p>
          <h2 className="display mt-1 text-xl text-ivory sm:text-2xl">{title}</h2>
        </div>

        <a href={contentUrl} target="_blank" rel="noopener noreferrer">
          <Button size="lg">افتح على {service?.label ?? "المنصة"} ↗</Button>
        </a>

        {extension ? (
          <p className="text-xs text-gold">الإضافة متصلة (v{extension}) — التشغيل هيتزامن مع الشلة تلقائيًا.</p>
        ) : (
          <p className="max-w-md text-xs leading-6 text-ivory-dim">
            {isHost
              ? "التزامن التلقائي محتاج إضافة المتصفح، وهي لسه تحت التنفيذ. لحد ما تجهز، اتفقوا على وقت البداية في الشات."
              : "التزامن التلقائي محتاج إضافة المتصفح، وهي لسه تحت التنفيذ. تابع الشات — الهوست هيقول امتى تدوسوا تشغيل."}
          </p>
        )}

        <p className="text-[11px] text-ivory-dim/70">
          {memberCount} في الروم · الشات والصوت شغّالين هنا حتى لو مش متفرج
        </p>
      </div>
    </div>
  );
}
