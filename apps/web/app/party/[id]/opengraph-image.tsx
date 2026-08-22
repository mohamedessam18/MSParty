import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { ACTIVE_USER } from "@/lib/account-lifecycle";
import { arabicFont } from "@/lib/og-font";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "سهرة على MSParty";

const FONT = "Cairo";

/**
 * The card a party link unfurls into.
 *
 * Every invite in this app travels as a pasted link, and until now all of them
 * unfurled into the same generic site image — so "شوف ده" looked identical
 * whichever film it was for. This is the one place where a little layout
 * measurably changes whether anyone clicks.
 *
 * Rendered per request rather than stored: the title, the poster and the number
 * of people all change while a party exists, and a cached picture of an empty
 * room is worse than no picture.
 *
 * Written flatter than ordinary JSX would be. The renderer is not a browser —
 * it wants an explicit `display` on every element with more than one child, and
 * it supports a subset of CSS — so this leans on plain flex boxes and does its
 * truncation in JavaScript rather than reaching for line-clamp.
 */
export default async function Image({ params }: { params: { id: string } }) {
  const party = await prisma.party
    .findFirst({
      // A party whose host is on their way out is hidden everywhere else; its
      // link should not keep advertising it either.
      where: { id: params.id, host: ACTIVE_USER },
      select: {
        name: true,
        posterUrl: true,
        videoTitle: true,
        host: { select: { name: true } },
        _count: { select: { members: true } }
      }
    })
    .catch(() => null);

  const raw = party?.videoTitle || party?.name || "سهرة على MSParty";
  const title = raw.length > 78 ? `${raw.slice(0, 78).trimEnd()}…` : raw;
  const members = party?._count.members ?? 0;
  const font = await arabicFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // The app is Arabic, so the card is too: rows run right to left and
          // columns hang off the right edge. Done with flex rather than
          // `direction: rtl`, which the renderer does not honour for layout —
          // it gets the words in the right order and the boxes in the wrong one.
          alignItems: "flex-end",
          position: "relative",
          background: "#140a0d",
          padding: 68,
          color: "#f2e8d5",
          fontFamily: FONT
        }}
      >
        {party?.posterUrl ? (
          // Behind everything and heavily dimmed. The poster is what makes the
          // card recognisable at a glance; text over an undimmed still is not
          // readable at any size.
          <img
            src={party.posterUrl}
            width={1200}
            height={630}
            style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover", opacity: 0.3 }}
          />
        ) : null}

        {/* The house lights from globals.css, so the card and the page it opens
            read as the same place. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            background: "linear-gradient(180deg, rgba(58,26,32,.72) 0%, rgba(20,10,13,.94) 68%)"
          }}
        />

        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center" }}>
          <div style={{ display: "flex", width: 14, height: 14, borderRadius: 99, background: "#d64545" }} />
          <div style={{ display: "flex", marginRight: 16, fontSize: 28, letterSpacing: 5, color: "#c9a227" }}>
            MSPARTY
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: "100%" }}>
          <div style={{ display: "flex", fontSize: title.length > 42 ? 56 : 74, lineHeight: 1.25, textAlign: "right" }}>
            {title}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row-reverse",
              alignItems: "center",
              marginTop: 32,
              fontSize: 28,
              color: "#a89684"
            }}
          >
            <div
              style={{
                display: "flex",
                padding: "12px 24px",
                borderRadius: 8,
                border: "1px solid rgba(201,162,39,.45)",
                color: "#c9a227"
              }}
            >
              {members > 0 ? (
                <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center" }}>
                  <div style={{ display: "flex" }}>{members}</div>
                  <div style={{ display: "flex", marginRight: 10 }}>في السهرة</div>
                </div>
              ) : (
                "السهرة مستنياك"
              )}
            </div>
            {party?.host?.name ? (
              <div
                style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", marginRight: 22 }}
              >
                <div style={{ display: "flex" }}>استضافة</div>
                <div style={{ display: "flex", marginRight: 10 }}>{party.host.name}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      // Empty only when the download failed. There is no second choice to fall
      // back to — the renderer cannot shape Arabic without a font it can read —
      // so the card comes out plainer rather than not at all.
      fonts: font ? [{ name: FONT, data: font, weight: 700 as const, style: "normal" as const }] : []
    }
  );
}
