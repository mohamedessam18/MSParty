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
