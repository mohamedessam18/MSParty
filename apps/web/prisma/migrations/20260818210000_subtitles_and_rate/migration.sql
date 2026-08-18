-- Subtitles and playback speed belong to the party, not to each viewer:
-- everyone has to read the same cues at the same moment.
ALTER TABLE "Party" ADD COLUMN "subtitlesUrl" TEXT;
ALTER TABLE "Party" ADD COLUMN "playbackRate" DOUBLE PRECISION NOT NULL DEFAULT 1;
