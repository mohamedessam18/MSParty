import { OverlayClient } from "./overlay-client";

export const metadata = { title: "MSParty", robots: { index: false, follow: false } };

/**
 * The room, as a narrow panel meant to be framed over a streaming service.
 *
 * Deliberately not a server component with a session: it is loaded cross-origin
 * from netflix.com and the like, where a SameSite=Lax cookie is never sent.
 * Identity comes from a signed sync token the extension was handed on our own
 * site, which is also the only thing the socket needs.
 */
export default function OverlayPage({ params }: { params: { id: string } }) {
  return <OverlayClient partyId={params.id} />;
}
