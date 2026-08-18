"use client";
import { useEffect, useState } from "react";

import { Button } from "../ui/button";
import { platformBySlug } from "@/lib/platforms";

/** The extension announces itself on the document element when it loads. */
const EXTENSION_MARKER = "data-msparty-extension";

function useExtension() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    // getAttribute, not dataset: the dataset key for a hyphenated attribute is
    // camel-cased, so looking it up by the attribute name silently misses.
    const read = () => setVersion(document.documentElement.getAttribute(EXTENSION_MARKER));
    read();
    // The content script may land after React does, so watch for it rather than
    // deciding once and being wrong for the rest of the session.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [EXTENSION_MARKER] });
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
  partyId,
  platform,
  contentUrl,
  title,
  isHost,
  memberCount
}: {
  partyId: string;
  platform: string | null;
  contentUrl: string;
  title: string;
  isHost: boolean;
  memberCount: number;
}) {
  const service = platformBySlug(platform);
  const extension = useExtension();
  const [starting, setStarting] = useState(false);

  /**
   * Hands the extension a session and lets it open the tab. Sent by
   * postMessage to a content script rather than straight to the extension: a
   * direct call would need the extension's id baked into the site, which
   * changes between an unpacked build and a published one.
   */
  async function openWithExtension() {
    setStarting(true);
    try {
      const response = await fetch("/api/sync-token");
      const { token } = await response.json();
      if (!token) throw new Error("no token");
      window.postMessage(
        { source: "msparty-site", type: "start-platform-party", partyId, token, url: contentUrl },
        window.location.origin
      );
    } catch {
      // Falling back to a plain tab still gets them watching, just unsynced.
      window.open(contentUrl, "_blank", "noopener");
    } finally {
      setStarting(false);
    }
  }

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

        {extension ? (
          <>
            <Button size="lg" disabled={starting} onClick={openWithExtension}>
              {starting ? "بنجهّز..." : `افتح على ${service?.label ?? "المنصة"} ↗`}
            </Button>
            <p className="text-xs text-gold">الإضافة متصلة (v{extension}) — الشات والتزامن هيبانوا فوق الصفحة.</p>
          </>
        ) : (
          <>
            <a href={contentUrl} target="_blank" rel="noopener noreferrer">
              <Button size="lg">افتح على {service?.label ?? "المنصة"} ↗</Button>
            </a>
            <p className="max-w-md text-xs leading-6 text-ivory-dim">
              {isHost
                ? "من غير الإضافة مافيش تزامن تلقائي — اتفقوا على وقت البداية في الشات."
                : "من غير الإضافة مافيش تزامن تلقائي — تابع الشات، الهوست هيقول امتى تدوسوا تشغيل."}
            </p>
          </>
        )}

        <p className="text-[11px] text-ivory-dim/70">
          {memberCount} في الروم · الشات والصوت شغّالين هنا حتى لو مش متفرج
        </p>
      </div>
    </div>
  );
}
