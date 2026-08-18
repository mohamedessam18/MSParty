import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { abortMultipart, deleteR2Object } from "@/lib/r2";
import { pruneHistory } from "@/lib/history";
import { releaseExpiredHolds } from "@/lib/username-claim";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.CRON_SECRET && request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const expired = await prisma.uploadedVideo.findMany({ where: { cleanupAt: { lte: new Date() } }, take: 100 });
  const deleted: string[] = [];
  for (const video of expired) {
    try {
      // Unfinished uploads hold parts, not an object; only an abort frees those.
      if (video.multipartId) await abortMultipart(video.storageKey, video.multipartId);
      else await deleteR2Object(video.storageKey);
      if (video.posterUrl) await deleteR2Object(`posters/${video.uploaderId}/${video.id}.jpg`).catch(() => undefined);
      await prisma.uploadedVideo.delete({ where: { id: video.id } });
      deleted.push(video.id);
    } catch {}
  }

  // The other things that expire on a clock. Bundled here rather than given
  // their own schedules: all three are cheap, and one job is one thing to watch.
  const [history, holds] = await Promise.all([
    pruneHistory().catch(() => ({ count: 0 })),
    releaseExpiredHolds().catch(() => ({ count: 0 }))
  ]);

  return NextResponse.json({ deleted: deleted.length, history: history.count, holds: holds.count });
}
