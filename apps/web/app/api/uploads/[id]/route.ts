import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, ListPartsCommand, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { deleteR2Object, putPoster, r2Client } from "@/lib/r2";
import { cleanVideoTitle } from "@/lib/video-title";
import { PART_SIZE, expectedParts } from "@/lib/upload-config";

/** URLs are cheap but not free to sign; the client asks again for the rest. */
const PRESIGN_BATCH = 200;

export const dynamic = "force-dynamic";

/** Only ever act on an upload the caller started. */
async function ownedUpload(id: string) {
  const user = await requireDbUser();
  const video = await prisma.uploadedVideo.findFirst({ where: { id, uploaderId: user.id } });
  if (!video) throw new Error("NOT_FOUND");
  return video;
}

/**
 * Reports what is still missing and signs URLs for it. R2 is the source of
 * truth for progress, so a browser that has just been reloaded can pick an
 * upload back up knowing only its id.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let video;
  try {
    video = await ownedUpload(params.id);
  } catch (error) {
    const missing = error instanceof Error && error.message === "NOT_FOUND";
    return NextResponse.json({ message: missing ? "Not found" : "Unauthorized" }, { status: missing ? 404 : 401 });
  }
  if (!video.multipartId || video.status !== "pending") {
    return NextResponse.json({ message: "الرفعة دي خلصت أو اتلغت." }, { status: 410 });
  }

  const client = r2Client();
  const listed = await client.send(
    new ListPartsCommand({ Bucket: process.env.R2_BUCKET, Key: video.storageKey, UploadId: video.multipartId })
  );
  const have = new Set((listed.Parts || []).map(part => part.PartNumber!));

  // The server works out what is missing from the recorded size, so a client
  // that has just been reloaded needs to know nothing about its own progress.
  const partCount = video.sizeBytes ? expectedParts(video.sizeBytes) : have.size;
  const missing = Array.from({ length: partCount }, (_, index) => index + 1).filter(number => !have.has(number));

  const urls = await Promise.all(
    missing.slice(0, PRESIGN_BATCH).map(async partNumber => ({
      partNumber,
      url: await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: process.env.R2_BUCKET,
          Key: video.storageKey,
          UploadId: video.multipartId!,
          PartNumber: partNumber
        }),
        { expiresIn: 3600 }
      )
    }))
  );

  return NextResponse.json({
    partSize: PART_SIZE,
    partCount,
    uploadedCount: have.size,
    remaining: missing.length,
    urls
  });
}

/** Confirms the upload: stitches the parts and moves the row into the library. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  let video;
  try {
    video = await ownedUpload(params.id);
  } catch (error) {
    const missing = error instanceof Error && error.message === "NOT_FOUND";
    return NextResponse.json({ message: missing ? "Not found" : "Unauthorized" }, { status: missing ? 404 : 401 });
  }
  if (!video.multipartId) return NextResponse.json({ message: "Not a multipart upload" }, { status: 400 });

  const { duration, title, poster } = await request.json().catch(() => ({}));
  const client = r2Client();

  try {
    // Ask R2 what it actually has rather than trusting a client-supplied list.
    const listed = await client.send(
      new ListPartsCommand({ Bucket: process.env.R2_BUCKET, Key: video.storageKey, UploadId: video.multipartId })
    );
    const parts = (listed.Parts || [])
      .map(part => ({ PartNumber: part.PartNumber!, ETag: part.ETag! }))
      .sort((a, b) => a.PartNumber - b.PartNumber);
    if (!parts.length) return NextResponse.json({ message: "مفيش أجزاء مرفوعة." }, { status: 400 });

    // Completing with a gap produces a file that plays and then simply stops
    // partway, which is far worse than a failed upload. Refuse instead.
    const needed = video.sizeBytes ? expectedParts(video.sizeBytes) : parts.length;
    if (parts.length < needed) {
      return NextResponse.json(
        { message: `الرفع ناقص (${parts.length} من ${needed} أجزاء). جرّب تاني.` },
        { status: 409 }
      );
    }

    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: process.env.R2_BUCKET,
        Key: video.storageKey,
        UploadId: video.multipartId,
        MultipartUpload: { Parts: parts }
      })
    );

    // A missing thumbnail is not a failed upload — some codecs never fire the
    // seek it is captured from — so this never throws out of the confirm.
    const posterUrl =
      typeof poster === "string" && poster.startsWith("data:image/")
        ? await putPoster(poster, `posters/${video.uploaderId}/${video.id}.jpg`).catch(() => null)
        : null;

    const ready = await prisma.uploadedVideo.update({
      where: { id: video.id },
      data: {
        status: "ready",
        multipartId: null,
        // Library items are kept until the owner deletes them.
        cleanupAt: null,
        duration: Number.isFinite(duration) && duration > 0 ? duration : null,
        ...(posterUrl ? { posterUrl } : {}),
        // The row was created with the raw filename so a resumed upload has
        // something to show; this is where it becomes a readable name.
        ...(typeof title === "string" && title.trim() ? { title: cleanVideoTitle(title.trim()) } : {})
      },
      select: { id: true, title: true, duration: true, posterUrl: true, sizeBytes: true, fileUrl: true, uploadedAt: true }
    });
    return NextResponse.json(ready);
  } catch (err: any) {
    console.error("Upload complete error:", err);
    return NextResponse.json({ message: "تعذر إنهاء الرفع. جرّب تاني." }, { status: 500 });
  }
}

/** Cancels an upload in progress, or removes a finished one from the library. */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  let video;
  try {
    video = await ownedUpload(params.id);
  } catch (error) {
    const missing = error instanceof Error && error.message === "NOT_FOUND";
    return NextResponse.json({ message: missing ? "Not found" : "Unauthorized" }, { status: missing ? 404 : 401 });
  }

  if (video.partyId) {
    return NextResponse.json({ message: "الفيديو ده مستخدم في بارتي دلوقتي." }, { status: 409 });
  }

  try {
    if (video.multipartId) {
      // Abort so R2 stops billing for the parts already stored.
      await r2Client().send(
        new AbortMultipartUploadCommand({
          Bucket: process.env.R2_BUCKET,
          Key: video.storageKey,
          UploadId: video.multipartId
        })
      );
    } else {
      await deleteR2Object(video.storageKey);
    }
  } catch {
    // The object may already be gone; the row should still go.
  }

  if (video.posterUrl) {
    // Derived from the video's own id, so there is nothing user-supplied to
    // point it somewhere else.
    await deleteR2Object(`posters/${video.uploaderId}/${video.id}.jpg`).catch(() => undefined);
  }

  await prisma.uploadedVideo.delete({ where: { id: video.id } });
  return new NextResponse(null, { status: 204 });
}
