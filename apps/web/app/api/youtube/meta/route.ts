import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { fetchYouTubeMeta } from "@/lib/youtube";

export const dynamic = "force-dynamic";

/**
 * Looks up a pasted link so the create page can show what it is before anyone
 * commits to it. Behind auth: the key is ours, and an open endpoint would let
 * anyone spend our daily quota.
 */
export async function GET(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url).searchParams.get("url") || "";
  const meta = await fetchYouTubeMeta(url);
  if (!meta) return NextResponse.json({ message: "الرابط ده مش رابط يوتيوب." }, { status: 400 });

  return NextResponse.json(meta, {
    // Video titles do not change often, and a host retyping a link should not
    // cost a second unit of quota.
    headers: { "Cache-Control": "private, max-age=3600" }
  });
}
