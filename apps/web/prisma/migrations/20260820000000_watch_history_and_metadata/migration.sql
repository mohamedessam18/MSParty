-- What is actually playing, resolved once at creation.
ALTER TABLE "Party" ADD COLUMN "posterUrl" TEXT;
ALTER TABLE "Party" ADD COLUMN "videoTitle" TEXT;
ALTER TABLE "Party" ADD COLUMN "videoChannel" TEXT;
ALTER TABLE "Party" ADD COLUMN "videoDescription" TEXT;
ALTER TABLE "Party" ADD COLUMN "videoDuration" DOUBLE PRECISION;

-- A frame lifted from the file in the browser before upload.
ALTER TABLE "UploadedVideo" ADD COLUMN "posterUrl" TEXT;

CREATE TABLE "WatchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partyId" TEXT,
    "partyName" TEXT NOT NULL,
    "hostName" TEXT,
    "contentType" TEXT NOT NULL,
    "contentUrl" TEXT,
    "title" TEXT NOT NULL,
    "posterUrl" TEXT,
    "channel" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "positionSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchHistory_pkey" PRIMARY KEY ("id")
);

-- Postgres treats NULLs as distinct here, so rows whose party has been deleted
-- stop colliding with each other rather than fighting over one slot.
CREATE UNIQUE INDEX "WatchHistory_userId_partyId_key" ON "WatchHistory"("userId", "partyId");
CREATE INDEX "WatchHistory_userId_watchedAt_idx" ON "WatchHistory"("userId", "watchedAt");
CREATE INDEX "WatchHistory_watchedAt_idx" ON "WatchHistory"("watchedAt");

ALTER TABLE "WatchHistory" ADD CONSTRAINT "WatchHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: deleting the room must not delete the memory of it.
ALTER TABLE "WatchHistory" ADD CONSTRAINT "WatchHistory_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed from existing memberships, so the feature does not launch empty for
-- people who have been using the site all along. The video title is unknown for
-- these rows, so the party's own name stands in for it.
INSERT INTO "WatchHistory" ("id", "userId", "partyId", "partyName", "hostName", "contentType", "contentUrl", "title", "watchedAt")
SELECT
  gen_random_uuid()::text,
  m."userId",
  p."id",
  p."name",
  h."name",
  p."contentType",
  p."contentUrl",
  p."name",
  m."joinedAt"
FROM "PartyMember" m
JOIN "Party" p ON p."id" = m."partyId"
JOIN "User" h ON h."id" = p."hostId";
