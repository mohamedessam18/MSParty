import { AbortMultipartUploadCommand, DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export function r2Client() {
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET) {
    throw new Error("R2 is not configured");
  }
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function deleteR2Object(storageKey: string) {
  await r2Client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: storageKey }));
}

/**
 * Frees the parts an unfinished upload is holding. Those are invisible to
 * DeleteObject — there is no object yet — but R2 stores and bills for them.
 */
export async function abortMultipart(storageKey: string, uploadId: string) {
  await r2Client().send(
    new AbortMultipartUploadCommand({ Bucket: process.env.R2_BUCKET, Key: storageKey, UploadId: uploadId })
  );
}

/** A poster is a few tens of kilobytes; anything larger is not a thumbnail. */
const MAX_POSTER_BYTES = 400 * 1024;

/**
 * Stores a thumbnail the browser produced from the video file. It arrives as a
 * data URI rather than a presigned upload because it is small enough that a
 * second round trip would cost more than the bytes do — but that also means the
 * size has to be checked here, since nothing else stands between it and R2.
 */
export async function putPoster(dataUri: string, key: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUri.trim());
  if (!match) return null;

  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_POSTER_BYTES) return null;

  await r2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: `image/${match[1]}`,
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

/**
 * Turns one of our public URLs back into its storage key, but only when the key
 * sits under `expectedPrefix`. Callers pass a prefix scoped to the acting user:
 * avatarUrl is user-supplied, so without that check someone could point it at
 * another person's upload and have us delete it on their next profile save.
 */
export function storageKeyFrom(url: string | null | undefined, expectedPrefix: string) {
  const base = process.env.R2_PUBLIC_URL;
  if (!base || !url || !url.startsWith(`${base}/`)) return null;
  const key = url.slice(base.length + 1);
  return key.startsWith(expectedPrefix) && !key.includes("..") ? key : null;
}
