import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
