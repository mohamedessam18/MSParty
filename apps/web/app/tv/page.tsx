import { TvClient } from "./tv-client";

export const metadata = {
  title: "MSParty على التليفزيون",
  robots: { index: false, follow: false }
};

/**
 * The television.
 *
 * A client component with no session of its own: the set is not signed in and
 * cannot be made to sign in with a four-way remote. What identifies it is a
 * secret it was handed at pairing and keeps in local storage — see
 * lib/tv-pairing.ts for why that is the trade every television makes.
 */
export default function TvPage() {
  return <TvClient />;
}
