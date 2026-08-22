import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/current-user";
import { authError } from "@/lib/api-errors";
import { searchYouTube } from "@/lib/youtube";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Searching YouTube from inside the app, so making a party stops meaning
 * "leave, find the thing, copy the link, come back".
 *
 * Guarded harder than the title lookup next door, because it costs a hundred
 * times as much: the whole project gets ten thousand quota units a day and a
 * search spends a hundred of them. Left open, one bored person with a keyboard
 * exhausts the day's budget for everybody in about a minute — including the
 * link preview on the create page, which shares the key.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch (error) {
    return authError(error);
  }

  // Per person, not per address: this is a signed-in feature, and the limit is
  // about what one person can reasonably spend rather than where they are.
  const limit = await rateLimit(`ytsearch:user:${user.id}`, 25, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit, "بحثت كتير. استنى شوية.");

  const { query } = await request.json().catch(() => ({}));
  const results = await searchYouTube(String(query ?? ""));

  if (results === null) {
    return NextResponse.json(
      { message: "البحث مش متاح دلوقتي. الصق رابط اليوتيوب بدل كده." },
      { status: 503 }
    );
  }

  return NextResponse.json({ results });
}
