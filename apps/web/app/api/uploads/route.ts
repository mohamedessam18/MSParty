import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { r2Client } from "@/lib/r2";

const MAX_VIDEO = 2 * 1024 ** 3;
const MAX_IMAGE = 5 * 1024 ** 2;

export async function POST(request: Request) {
  try {
    const { fileName, contentType, fileSize } = await request.json();
    const isVideo = !!contentType?.startsWith("video/");
    const isImage = !!contentType?.startsWith("image/");

    if (!fileName || !Number.isFinite(fileSize)) {
      return NextResponse.json({ message: "بيانات الملف ناقصة." }, { status: 400 });
    }
    if (!isVideo && !isImage) {
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
    if (fileSize > (isVideo ? MAX_VIDEO : MAX_IMAGE)) {
      return NextResponse.json(
        { message: isVideo ? "أقصى حجم للفيديو 2GB" : "أقصى حجم للصورة 5MB" },
        { status: 400 }
      );
    }

    const user = await requireDbUser();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const prefix = isVideo ? "party-uploads" : "avatars";
    const key = `${prefix}/${user.id}/${crypto.randomUUID()}-${safeName}`;

    const uploadUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 900 }
    );
    const fileUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    // Only videos are tracked for cleanup. An avatar has no owning party and
    // must outlive it, so giving it an UploadedVideo row would schedule the
    // user's picture for deletion two hours later.
    if (!isVideo) return NextResponse.json({ uploadUrl, fileUrl });

    const video = await prisma.uploadedVideo.create({
      data: { uploaderId: user.id, fileUrl, storageKey: key, cleanupAt: new Date(Date.now() + 2 * 60 * 60 * 1000) }
    });
    return NextResponse.json({ uploadUrl, fileUrl, videoId: video.id });
  } catch (err: any) {
    console.error("R2 Upload Route Error:", err);
    return NextResponse.json(
      { message: err?.message || "تعذر تجهيز الرفع. راجع إعدادات Cloudflare R2." },
      { status: 500 }
    );
  }
}
