import { CreateMultipartUploadCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { r2Client } from "@/lib/r2";
import { PART_SIZE, expectedParts } from "@/lib/upload-config";

export const dynamic = "force-dynamic";

const MAX_VIDEO = 2 * 1024 ** 3;
const MAX_IMAGE = 5 * 1024 ** 2;
const MAX_SUBTITLE = 2 * 1024 ** 2;


export async function POST(request: Request) {
  try {
    const { fileName, contentType, fileSize } = await request.json();
    const isVideo = !!contentType?.startsWith("video/");
    const isImage = !!contentType?.startsWith("image/");
    // Subtitles are normalised to WebVTT in the browser before they get here.
    const isSubtitle = contentType === "text/vtt";

    if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ message: "بيانات الملف ناقصة." }, { status: 400 });
    }
    if (!isVideo && !isImage && !isSubtitle) {
      // Some containers (.mkv, .avi) come through with an empty type on certain
      // systems, so say what actually went wrong instead of "not allowed".
      return NextResponse.json(
        {
          message: contentType
            ? "الملف ده مش فيديو ولا صورة."
            : "المتصفح مش عارف نوع الملف ده. جرّب MP4 بترميز H.264."
        },
        { status: 400 }
      );
    }
    const limit = isVideo ? MAX_VIDEO : isImage ? MAX_IMAGE : MAX_SUBTITLE;
    if (fileSize > limit) {
      return NextResponse.json(
        { message: isVideo ? "أقصى حجم للفيديو 2GB" : isImage ? "أقصى حجم للصورة 5MB" : "ملف الترجمة كبير جدًا." },
        { status: 400 }
      );
    }

    const user = await requireDbUser();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const client = r2Client();

    // Avatars and subtitle tracks stay a single PUT: they are small, and they
    // get no library row — neither belongs to the video-reuse flow.
    if (isImage || isSubtitle) {
      const key = `${isImage ? "avatars" : "subtitles"}/${user.id}/${crypto.randomUUID()}-${safeName}`;
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, ContentType: contentType }),
        { expiresIn: 900 }
      );
      return NextResponse.json({ uploadUrl, fileUrl: `${process.env.R2_PUBLIC_URL}/${key}` });
    }

    // Guests sign up with nothing but a name, and they cannot host, so they can
    // never legitimately need a video slot — only an avatar.
    if (user.isGuest) {
      return NextResponse.json({ message: "لازم تعمل حساب عشان ترفع فيديو." }, { status: 403 });
    }

    const pending = await prisma.uploadedVideo.count({ where: { uploaderId: user.id, status: "pending" } });
    if (pending >= 3) {
      return NextResponse.json(
        { message: "عندك رفعات كتير معلّقة. كمّلها أو الغيها الأول." },
        { status: 429 }
      );
    }

    const key = `party-uploads/${user.id}/${crypto.randomUUID()}-${safeName}`;
    const multipart = await client.send(
      new CreateMultipartUploadCommand({ Bucket: process.env.R2_BUCKET, Key: key, ContentType: contentType })
    );
    if (!multipart.UploadId) throw new Error("R2 did not return an upload id");

    const video = await prisma.uploadedVideo.create({
      data: {
        uploaderId: user.id,
        fileUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
        storageKey: key,
        title: fileName.slice(0, 120),
        sizeBytes: fileSize,
        status: "pending",
        multipartId: multipart.UploadId,
        // An abandoned upload must not linger. Cleared once it is confirmed.
        cleanupAt: new Date(Date.now() + 6 * 60 * 60 * 1000)
      }
    });

    return NextResponse.json({
      videoId: video.id,
      fileUrl: video.fileUrl,
      partSize: PART_SIZE,
      partCount: expectedParts(fileSize)
    });
  } catch (err: any) {
    console.error("Upload init error:", err);
    return NextResponse.json(
      { message: err?.message || "تعذر تجهيز الرفع. راجع إعدادات Cloudflare R2." },
      { status: 500 }
    );
  }
}

/** Lists the caller's library — everything ready, newest first. */
export async function GET() {
  try {
    const user = await requireDbUser();
    const videos = await prisma.uploadedVideo.findMany({
      where: { uploaderId: user.id, status: "ready" },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, title: true, duration: true, sizeBytes: true, fileUrl: true, partyId: true, uploadedAt: true }
    });
    return NextResponse.json(videos);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
}
