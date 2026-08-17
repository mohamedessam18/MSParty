-- Party gets a short shareable join code and a lock flag.
-- "code" is added nullable, backfilled, and only then constrained: adding it as
-- NOT NULL UNIQUE in one step fails on a table that already has rows.
ALTER TABLE "Party" ADD COLUMN "code" TEXT;
ALTER TABLE "Party" ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false;

-- Derive each existing party's code from its id so the backfill is deterministic
-- and collision-free in practice. 0 and 1 are mapped away because they are too
-- easy to confuse with O and I when a code is read aloud or retyped.
UPDATE "Party" SET "code" = upper(translate(substr(md5("id"), 1, 6), '01', 'XY')) WHERE "code" IS NULL;

ALTER TABLE "Party" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Party_code_key" ON "Party"("code");

CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentUrl" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueueItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QueueVote" (
    "id" TEXT NOT NULL,
    "queueItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "QueueVote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QueueItem_partyId_position_idx" ON "QueueItem"("partyId", "position");
CREATE UNIQUE INDEX "QueueVote_queueItemId_userId_key" ON "QueueVote"("queueItemId", "userId");

ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QueueVote" ADD CONSTRAINT "QueueVote_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "QueueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QueueVote" ADD CONSTRAINT "QueueVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
