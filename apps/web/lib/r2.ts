import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const R2_ENDPOINT = process.env.R2_ENDPOINT || "https://6fdc394cae6425f5dcd0e3c90622dde1.r2.cloudflarestorage.com";
export const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "98d28b1eb3331c2a06ce492307057aa8";
export const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "e54771b8a18252cbc89b34d7a9c7d026f778e8722aa722dd5a2190cf29c201b5";
export const R2_BUCKET = process.env.R2_BUCKET || "msparty-videos";
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "https://pub-946b9b3b9b5c47dbae65f8a9a730539e.r2.dev";

export function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });
}

export async function deleteR2Object(storageKey: string) {
  await r2Client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: storageKey }));
}
