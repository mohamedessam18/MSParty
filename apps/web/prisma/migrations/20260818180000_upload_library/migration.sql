-- Uploads become a library: a row survives its party so the same film can be
-- reused, and carries enough metadata to be listed without opening the file.
ALTER TABLE "UploadedVideo" ADD COLUMN "title" TEXT;
ALTER TABLE "UploadedVideo" ADD COLUMN "sizeBytes" DOUBLE PRECISION;
ALTER TABLE "UploadedVideo" ADD COLUMN "multipartId" TEXT;
ALTER TABLE "UploadedVideo" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';

-- Everything that already exists finished uploading, so it belongs in the
-- library rather than being treated as an abandoned upload.
UPDATE "UploadedVideo" SET "status" = 'ready';

-- Rows already scheduled for deletion keep their cleanupAt; the rest are kept.
CREATE INDEX "UploadedVideo_uploaderId_status_idx" ON "UploadedVideo"("uploaderId", "status");
