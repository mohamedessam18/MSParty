-- The sync server derives live playback position from how long ago the party row
-- last changed, so Party needs an updatedAt column. Existing rows are backfilled
-- with CURRENT_TIMESTAMP; Prisma's own generator would emit a bare NOT NULL column,
-- which fails on a table that already has rows.
ALTER TABLE "Party" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
