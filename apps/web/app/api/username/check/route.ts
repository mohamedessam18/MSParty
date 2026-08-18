import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkAvailability } from "@/lib/username-claim";
import { suggestUsernames } from "@/lib/username";

export const dynamic = "force-dynamic";

/**
 * Live availability for the registration and profile forms. Open to signed-out
 * callers because registration needs it, and it only ever reveals whether a
 * name is free — which trying to register would reveal anyway.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("u") || "";
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;

  const result = await checkAvailability(raw, viewerId);
  if (result.available) return NextResponse.json({ available: true, username: result.username });

  return NextResponse.json({
    available: false,
    message: result.message,
    // Only worth suggesting alternatives when the name was valid but taken.
    suggestions: result.message.includes("مأخوذ") || result.message.includes("محجوز") ? suggestUsernames(raw) : []
  });
}
