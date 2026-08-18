import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, ListPartsCommand, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { deleteR2Object, r2Client } from "@/lib/r2";
import { expectedParts } from "@/lib/upload-config";

export const dynamic = "force-dynamic";

/** Only ever act on an upload the caller started. */
async function ownedUpload(id: string) {
  const user = await requireDbUser();
  const video = await prisma.uploadedVideo.findFirst({ where: { id, uploaderId: user.id } });
  if (!video) throw new Error("NOT_FOUND");
  return video;
}

/**
 * Hands back presigned URLs for the parts still missing, and reports which parts
 * R2 already holds so they are not sent twice.
 *
 * Note this only skips parts within one upload session — the client starts a
 * fresh multipart upload on every attempt, so a page reload still begins again.
 * Surviving a reload would mean remembering the upload id in the browser.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let video;
  try {
    video = await ownedUpload(params.id);
  } catch (error) {
    const missing = error instanceof Error && error.message === "NOT_FOUND";
    return NextResponse.json({ message: missing ? "Not found" : "Unauthorized" }, { status: missing ? 404 : 401 });
  }
  if (!video.multipartId) return NextResponse.json({ message: "Not a multipart upload" }, { status: 400 });

  const { partNumbers } = await request.json();
  if (!Array.isArray(partNumbers) || !partNumbers.length) {
    return NextResponse.json({ message: "partNumbers required" }, { status: 400 });
  }

  const client = r2Client();
  const listed = await client.send(
    new ListPartsCommand({ Bucket: process.env.R2_BUCKET, Key: video.storageKey, UploadId: video.multipartId })
  );
  const uploaded = (listed.Parts || []).map(part => ({ partNumber: part.PartNumber!, eTag: part.ETag! }));
  const have = new Set(uploaded.map(part => part.partNumber));

  const urls = await Promise.all(
    partNumbers
      .filter((number: number) => Number.isInteger(number) && number > 0 && !have.has(number))
      .slice(0, 200)
      .map(async (partNumber: number) => ({
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

  return NextResponse.json({ urls, uploaded });
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

  const { duration, title } = await request.json().catch(() => ({}));
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

    const ready = await prisma.uploadedVideo.update({
      where: { id: video.id },
      data: {
        status: "ready",
        multipartId: null,
        // Library items are kept until the owner deletes them.
        cleanupAt: null,
        duration: Number.isFinite(duration) && duration > 0 ? duration : null,
        ...(typeof title === "string" && title.trim() ? { title: title.trim().slice(0, 120) } : {})
      },
      select: { id: true, title: true, duration: true, sizeBytes: true, fileUrl: true, uploadedAt: true }
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

  await prisma.uploadedVideo.delete({ where: { id: video.id } });
  return new NextResponse(null, { status: 204 });
}
