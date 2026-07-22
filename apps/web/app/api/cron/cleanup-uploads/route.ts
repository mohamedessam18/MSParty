import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteR2Object } from "@/lib/r2";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.CRON_SECRET && request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const expired = await prisma.uploadedVideo.findMany({ where: { cleanupAt: { lte: new Date() } }, take: 100 });
  const deleted: string[] = [];
  for (const video of expired) { try { await deleteR2Object(video.storageKey); await prisma.uploadedVideo.delete({ where: { id: video.id } }); deleted.push(video.id); } catch {} }
  return NextResponse.json({ deleted: deleted.length });
}
